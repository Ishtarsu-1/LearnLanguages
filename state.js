// ============================================================
//  Mochi — application d'apprentissage des langues
//  Règles pédagogiques : voir PEDAGOGIE.md
//  Boucle quotidienne : INPUT → CAPTURE → RÉVISION (FSRS) → PRODUCTION
// ============================================================

// ---------- Configuration des langues ----------
const LANGUAGES = {
  en: { name: "Anglais", native: "English", flag: "🇬🇧", hello: "Hello!", deco: "Hi", speechLang: "en-GB", tagline: "Des dialogues du quotidien, et beaucoup d'écoute" },
  ko: { name: "Coréen", native: "한국어", flag: "🇰🇷", hello: "안녕하세요!", deco: "한", speechLang: "ko-KR", tagline: "Hangul d'abord, puis les briques de la phrase" },
  zh: { name: "Chinois", native: "中文", flag: "🇨🇳", hello: "你好！", deco: "中", speechLang: "zh-CN", tagline: "Les tons et le pinyin d'abord, puis des phrases du quotidien" },
};

// Langues en préparation : montrées sur l'accueil, mais verrouillées (pas dans LANGUAGES,
// pour qu'aucune autre partie du site ne les traite comme des langues actives)
const COMING_SOON = [
  { id: "fr", name: "Français", native: "Français", flag: "🇫🇷", hello: "Bonjour !", lang: "fr" },
  { id: "ja", name: "Japonais", native: "日本語", flag: "🇯🇵", hello: "こんにちは！", lang: "ja" },
  { id: "it", name: "Italien", native: "Italiano", flag: "🇮🇹", hello: "Ciao!", lang: "it" },
];

const GOALS = [{ min: 5, label: "Tranquille" }, { min: 10, label: "Régulier" }, { min: 15, label: "Sérieux" }, { min: 20, label: "Intense" }];
// "mochi" : la mascotte elle-même (avec ses accessoires), avatar par défaut
const AVATARS = ["mochi", "🐰", "🐱", "🐻", "🐼", "🦊", "🐥", "🐸", "🐨"];
const KNOWN_STABILITY = 7; // jours : au-delà, un mot en révision compte comme « connu » (§3)
const HAS_FSRS = typeof FSRS !== "undefined";

// ---------- État (sauvegardé dans le navigateur) ----------
const STORE_KEY = "mochi-state-v2";
const langDefaults = () => ({
  xp: 0, streak: 0, lastStreakDay: null, seconds: 0, todayDate: null, todaySec: 0, started: false,
  known: {}, unknown: {}, readTexts: {}, fullDays: {}, catchUp: false, session: {}, introduced: { date: null, count: 0 },
  hangulDone: false, hangulDays: {}, pinyinDays: {}, grammarDone: {}, grammarMiss: {}, earStats: {}, errors: {}, prodDone: {}, quests: {}, books: {},
});
const defaultState = () => ({
  name: "", avatar: "mochi", goal: 10, lastLang: null,
  settings: { retention: 0.9, newPerDay: 12, cognateWeight: 0.8, particleColors: true, pinyin: true, speed: 1, textScale: 1, zen: false, theme: "auto", voices: {}, themes: [], look: {}, lookSeen: [], tourDone: false },
  langs: Object.fromEntries(Object.keys(LANGUAGES).map((k) => [k, langDefaults()])),
  cards: [], logs: [],
  history: {}, // { "AAAA-MM-JJ": { en: { sec, rev, prod, read } } } : suivi d'activité
});

function normalizeState(saved) {
  const base = defaultState();
  if (!saved || typeof saved !== "object") return base;
  const langs = {};
  for (const k of Object.keys(LANGUAGES)) {
    const L = (langs[k] = { ...langDefaults(), ...(saved.langs?.[k] || {}) });
    // Ancienne série quotidienne → jours de séance complète (pour la série hebdomadaire)
    if (L.lastStreakDay && !Object.keys(L.fullDays).length) {
      const d = new Date(`${L.lastStreakDay}T12:00:00`);
      for (let i = 0; i < Math.min(L.streak, 400); i++) { L.fullDays[today(d)] = true; d.setDate(d.getDate() - 1); }
    }
  }
  return { ...base, ...saved, settings: { ...base.settings, ...saved.settings }, langs, cards: saved.cards || [], logs: saved.logs || [], history: saved.history || {} };
}
function loadState(key = STORE_KEY) {
  try {
    let saved = JSON.parse(localStorage.getItem(key));
    if (!saved && key === STORE_KEY) {
      const v1 = JSON.parse(localStorage.getItem("mochi-state-v1"));
      if (v1) saved = { name: v1.name, avatar: v1.avatar, goal: v1.goal, lastLang: v1.lastLang };
    }
    return normalizeState(saved);
  } catch {}
  return defaultState();
}
let state = loadState();

// ---------- Compte (nécessite server.js ; sinon mode invité) ----------
let account = null;   // utilisateur connecté, ou null (invité : tout reste dans ce navigateur)
let serverOn = false; // l'API répond-elle ?
let features = { llm: false }; // fonctionnalités activées côté serveur
const storeKey = () => (account ? `mochi-user-${account.id}` : STORE_KEY);

async function api(method, url, body, raw) {
  const opts = { method, credentials: "same-origin", headers: { "X-Mochi": "1" } };
  if (raw) { opts.body = raw; opts.headers["Content-Type"] = raw.type || "application/octet-stream"; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Erreur ${r.status}`), { status: r.status });
  return data;
}
