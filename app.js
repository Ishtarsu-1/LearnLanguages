// ============================================================
//  Mochi — application d'apprentissage des langues
//  Règles pédagogiques : voir PEDAGOGIE.md
//  Boucle quotidienne : INPUT → CAPTURE → RÉVISION (FSRS) → PRODUCTION
// ============================================================

// ---------- Configuration des langues ----------
const LANGUAGES = {
  en: { name: "Anglais", native: "English", flag: "🇬🇧", hello: "Hello!", deco: "Hi", speechLang: "en-GB", tagline: "Des dialogues du quotidien, et beaucoup d'écoute" },
  ko: { name: "Coréen", native: "한국어", flag: "🇰🇷", hello: "안녕하세요!", deco: "한", speechLang: "ko-KR", tagline: "Hangul d'abord, puis les briques de la phrase" },
};

const GOALS = [{ min: 5, label: "Tranquille" }, { min: 10, label: "Régulier" }, { min: 15, label: "Sérieux" }, { min: 20, label: "Intense" }];
const AVATARS = ["🐰", "🐱", "🐻", "🐼", "🦊", "🐥", "🐸", "🐨"];
const KNOWN_STABILITY = 7; // jours : au-delà, un mot en révision compte comme « connu » (§3)
const HAS_FSRS = typeof FSRS !== "undefined";

// ---------- État (sauvegardé dans le navigateur) ----------
const STORE_KEY = "mochi-state-v2";
const langDefaults = () => ({
  xp: 0, streak: 0, lastStreakDay: null, seconds: 0, todayDate: null, todaySec: 0, started: false,
  known: {}, unknown: {}, readTexts: {}, session: {}, introduced: { date: null, count: 0 },
  hangulDone: false, hangulDays: {}, grammarDone: {}, errors: {}, prodDone: {},
});
const defaultState = () => ({
  name: "", avatar: "🐰", goal: 10, lastLang: null,
  settings: { retention: 0.9, newPerDay: 12, cognateWeight: 0.8, particleColors: true, speed: 1 },
  langs: Object.fromEntries(Object.keys(LANGUAGES).map((k) => [k, langDefaults()])),
  cards: [], logs: [],
  history: {}, // { "AAAA-MM-JJ": { en: { sec, rev, prod, read } } } : suivi d'activité
});

function normalizeState(saved) {
  const base = defaultState();
  if (!saved || typeof saved !== "object") return base;
  const langs = {};
  for (const k of Object.keys(LANGUAGES)) langs[k] = { ...langDefaults(), ...(saved.langs?.[k] || {}) };
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
const sync = { status: "idle", timer: null, at: null };
const storeKey = () => (account ? `mochi-user-${account.id}` : STORE_KEY);

function save() {
  try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch {}
  if (account) { sync.status = "pending"; clearTimeout(sync.timer); sync.timer = setTimeout(pushState, 3000); }
}
async function api(method, url, body, raw) {
  const opts = { method, credentials: "same-origin", headers: { "X-Mochi": "1" } };
  if (raw) { opts.body = raw; opts.headers["Content-Type"] = raw.type || "application/octet-stream"; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Erreur ${r.status}`), { status: r.status });
  return data;
}
async function pushState() {
  if (!account) return;
  clearTimeout(sync.timer);
  sync.status = "saving"; updateSyncBadge();
  try { await api("PUT", "/api/state", { state }); sync.status = "saved"; sync.at = new Date(); }
  catch (e) {
    sync.status = "error";
    if (e.status === 401) { toast("Session expirée : reconnecte-toi"); account = null; state = loadState(); route(); }
  }
  updateSyncBadge();
}
function updateSyncBadge() {
  const el = document.getElementById("sync-badge");
  if (el) el.outerHTML = syncBadge();
}
function syncBadge() {
  const t = { idle: "☁️ Synchronisé", saved: "☁️ Synchronisé", pending: "⏳ Modifications en attente", saving: "⏳ Synchronisation…", error: "⚠️ Hors ligne : réessai bientôt" }[sync.status];
  return `<span class="tag" id="sync-badge">${t}</span>`;
}
document.addEventListener("visibilitychange", () => { if (document.hidden && account && sync.status === "pending") pushState(); });
setInterval(() => { if (account && sync.status === "error") pushState(); }, 30000);

// Après connexion / inscription : le compte devient la source de vérité
async function applyAuth(data, { isNew } = {}) {
  account = data.user;
  if (data.state) state = normalizeState(data.state);
  else if (isNew) {
    // Nouveau compte : on rattache la progression faite en invité
    if (state.avatar !== account.avatar_emoji) { try { account = (await api("PATCH", "/api/me", { avatar_emoji: state.avatar })).user; } catch {} }
  } else state = loadState(storeKey());
  state.name = account.name; state.avatar = account.avatar_emoji;
  save(); await pushState();
}
const displayAvatar = (cls = "") => (account?.avatar_url
  ? `<img class="avatar-img ${cls}" src="${esc(account.avatar_url)}" alt="Photo de profil" />`
  : `<span class="${cls}">${state.avatar}</span>`);

// Suivi d'activité par jour
function track(lang, key, n = 1) {
  const day = (state.history[today()] ||= {});
  const x = (day[lang] ||= { sec: 0, rev: 0, prod: 0, read: 0 });
  x[key] += n;
}

// État d'interface (non sauvegardé)
const ui = { review: null, quiz: null, prod: null, reader: null, ear: null, recordings: {}, lastHash: null };

// ---------- Utilitaires ----------
const $app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterday = () => today(new Date(Date.now() - 864e5));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (x) => Math.round(x * 100);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const isKo = (lang) => lang === "ko";
const koCls = (lang) => (isKo(lang) ? "ko" : "");

function mochi(cls = "", mood = "happy") {
  const mouth = mood === "sleepy"
    ? '<path d="M62 78 q8 4 16 0" stroke="#3b2f3a" stroke-width="3" fill="none" stroke-linecap="round"/>'
    : '<path d="M62 74 q8 10 16 0" stroke="#3b2f3a" stroke-width="3" fill="#ff6b8b" stroke-linecap="round"/>';
  const eyes = mood === "sleepy"
    ? '<path d="M48 62 q6 5 12 0 M80 62 q6 5 12 0" stroke="#3b2f3a" stroke-width="3" fill="none" stroke-linecap="round"/>'
    : '<circle cx="54" cy="62" r="6" fill="#3b2f3a"/><circle cx="86" cy="62" r="6" fill="#3b2f3a"/><circle cx="56" cy="60" r="2" fill="#fff"/><circle cx="88" cy="60" r="2" fill="#fff"/>';
  return `<svg class="mochi ${cls}" viewBox="0 0 140 120" aria-hidden="true">
    <ellipse cx="70" cy="112" rx="44" ry="6" fill="#000" opacity=".08"/>
    <path d="M14 82 C14 36 40 18 70 18 C100 18 126 36 126 82 C126 104 104 108 70 108 C36 108 14 104 14 82 Z" fill="var(--accent)"/>
    <path d="M30 50 C38 34 52 28 64 28" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".45"/>
    <ellipse cx="40" cy="78" rx="9" ry="5" fill="#fff" opacity=".45"/>
    <ellipse cx="100" cy="78" rx="9" ry="5" fill="#fff" opacity=".45"/>
    ${eyes}${mouth}
  </svg>`;
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

// ---------- Audio : synthèse vocale (§5) ----------
let voices = [];
function loadVoices() { if ("speechSynthesis" in window) voices = speechSynthesis.getVoices(); }
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice(code) {
  const mine = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(code.slice(0, 2)));
  return mine.find((v) => /natural|neural|online|premium|enhanced|google/i.test(v.name)) || mine.find((v) => v.lang === code) || mine[0];
}
function speak(text, lang, speed = state.settings.speed) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) { toast("L'audio n'est pas disponible sur ce navigateur"); return resolve(); }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGUAGES[lang].speechLang;
    const v = pickVoice(u.lang);
    if (v) u.voice = v;
    u.rate = 0.9 * speed;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
function stopAudio() { if ("speechSynthesis" in window) speechSynthesis.cancel(); if (ui.reader) ui.reader.playing = false; }

// ---------- Phrases annotées (voir content.js) ----------
const PUNCT_RE = /^([«"“(¿¡]*)(.*?)([.,!?…:;»"”)]*)$/;
function parseSentence(src, lang) {
  return src.split(" ").map((word) => {
    const [, pre, core, post] = word.match(PUNCT_RE);
    const segs = core.split("|").map((raw, i) => {
      const proper = raw.startsWith("@");
      const [surface, lem] = (proper ? raw.slice(1) : raw).split("=");
      const lemmas = proper ? [] : lem ? lem.split("+") : [lang === "en" ? surface.toLowerCase() : surface];
      const particle = isKo(lang) && i > 0 && lemmas.length === 1 && KO_PARTICLES.has(lemmas[0]);
      return { surface, lemmas, proper, particle };
    });
    return { pre, segs, post };
  });
}
const wordText = (w) => w.pre + w.segs.map((s) => s.surface).join("") + w.post;
const plain = (words) => words.map(wordText).join(" ");
const toSentence = (src, lang, fr = "") => { const words = parseSentence(src, lang); return { words, text: plain(words), fr }; };

// Texte avant / après un morceau donné (pour les cartes en contexte, §2)
function splitAround(words, w, g) {
  const word = words[w];
  const before = [...words.slice(0, w).map(wordText), word.pre + word.segs.slice(0, g).map((s) => s.surface).join("")].join(" ");
  const after = [word.segs.slice(g + 1).map((s) => s.surface).join("") + word.post, ...words.slice(w + 1).map(wordText)].join(" ");
  return { before: w === 0 ? before.trimStart() : before, after };
}

for (const lang of Object.keys(TEXTS)) for (const t of TEXTS[lang]) t.parsed = t.sentences.map(([src, fr]) => toSentence(src, lang, fr));
const textById = (lang, id) => TEXTS[lang].find((t) => t.id === id);

// ---------- Modèle du vocabulaire connu & couverture (§3) ----------
function stabilityMap(lang) {
  const m = {};
  for (const c of state.cards) {
    if (c.lang !== lang) continue;
    for (const l of c.lemma.split(" + ")) m[l] = Math.max(m[l] || 0, c.fsrs.stability || 0);
  }
  return m;
}
function knownWeight(lang, lemma, stab) {
  const L = state.langs[lang];
  if (L.known[lemma]) return 1;
  if (L.unknown[lemma]) return 0;
  if ((stab[lemma] || 0) >= KNOWN_STABILITY) return 1;
  const lex = LEXICON[lang][lemma];
  if (lang === "en" && lex?.cog && !lex.faux) return state.settings.cognateWeight;
  return 0;
}
function lemmaStatus(lang, lemma, stab) {
  const L = state.langs[lang];
  if (L.known[lemma] || (stab[lemma] || 0) >= KNOWN_STABILITY) return "known";
  if (stab[lemma] !== undefined) return "learning";
  if (L.unknown[lemma]) return "new";
  const lex = LEXICON[lang][lemma];
  if (lang === "en" && lex?.cog && !lex.faux) return "cognate";
  return "new";
}
function coverage(lang, sentences, stab = stabilityMap(lang)) {
  let total = 0, known = 0;
  for (const s of sentences) for (const w of s.words) for (const g of w.segs) for (const l of g.lemmas) { total++; known += knownWeight(lang, l, stab); }
  return total ? known / total : 0;
}
function unknownLemmas(lang, sentences, stab = stabilityMap(lang)) {
  const out = new Map();
  sentences.forEach((s, si) => s.words.forEach((w, wi) => w.segs.forEach((g, gi) => g.lemmas.forEach((l) => {
    if (knownWeight(lang, l, stab) < 1 && !out.has(l)) out.set(l, { si, wi, gi });
  }))));
  return out;
}
function zone(c) {
  if (c >= 0.92 && c <= 0.98) return { k: "ideal", label: "🎯 Zone idéale", order: 0 };
  if (c > 0.98) return { k: "easy", label: "😌 Fluidité", order: 2 };
  if (c >= 0.9) return { k: "hard", label: "💪 Un peu dur", order: 1 };
  return { k: "gloss", label: "📖 Avec glossaire", order: 3 };
}
function rankedTexts(lang) {
  const stab = stabilityMap(lang);
  return TEXTS[lang].map((t) => { const c = coverage(lang, t.parsed, stab); return { t, c, z: zone(c) }; })
    .sort((a, b) => a.z.order - b.z.order || (a.z.k === "gloss" ? b.c - a.c : Math.abs(a.c - 0.95) - Math.abs(b.c - 0.95)));
}
function knownCount(lang) {
  const stab = stabilityMap(lang);
  const lemmas = new Set([...Object.keys(LEXICON[lang]), ...Object.keys(stab), ...Object.keys(state.langs[lang].known)]);
  return [...lemmas].filter((l) => knownWeight(lang, l, stab) === 1).length;
}
const lexFr = (lang, lemma) => lemma.split(" + ").map((l) => LEXICON[lang][l]?.fr || "?").join(" + ");

// ---------- Cartes & FSRS (§1, §2) ----------
const serialize = (c) => ({ ...c, due: new Date(c.due).toISOString(), last_review: c.last_review ? new Date(c.last_review).toISOString() : null });
const revive = (c) => ({ ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined });
const scheduler = () => FSRS.fsrs({ request_retention: state.settings.retention, enable_fuzz: true });

function addCard(lang, { type = "recog", lemma, before, surface, after, contextFr, fr, source, note }) {
  if (!HAS_FSRS) { toast("FSRS n'a pas pu être chargé (connexion ?)"); return null; }
  const context = before + surface + after;
  const dup = state.cards.find((c) => c.lang === lang && c.type === type && c.lemma === lemma && (type !== "cloze" || c.context === context));
  if (dup) return null;
  const card = {
    id: uid(), lang, type, lemma, before, surface, after, context, contextFr, fr, source, note: note || "",
    audio_url: null, // audio : synthèse vocale de la phrase de contexte
    created: new Date().toISOString(), successes: 0, fsrs: serialize(FSRS.createEmptyCard(new Date())),
  };
  state.cards.push(card);
  return card;
}
function captureSeg(lang, sentence, w, g, source) {
  const seg = sentence.words[w].segs[g];
  const lemma = seg.lemmas.join(" + ");
  const { before, after } = splitAround(sentence.words, w, g);
  const card = addCard(lang, { lemma, before, surface: seg.surface, after, contextFr: sentence.fr, fr: lexFr(lang, lemma), source });
  if (card) bumpSession(lang, "captured");
  return card;
}
function findContext(lang, lemma) {
  // Préférer un morceau qui ne porte que ce lemme (évite « that's » pour « be »)
  for (const exact of [true, false]) for (const t of TEXTS[lang]) for (const s of t.parsed) for (let w = 0; w < s.words.length; w++) {
    const g = s.words[w].segs.findIndex((x) => (exact ? x.lemmas.length === 1 : true) && x.lemmas.includes(lemma));
    if (g >= 0) return { s, w, g, source: t.id };
  }
  return null;
}
function unlockSiblings(c) {
  let n = 0;
  for (const type of ["prod", "listen"]) if (addCard(c.lang, { ...c, type })) n++;
  if (n) toast("🔓 Nouvelles cartes : production + écoute");
}

function dueCards(lang, now = new Date()) {
  return state.cards.filter((c) => c.lang === lang && c.fsrs.state !== 0 && new Date(c.fsrs.due) <= now).sort((a, b) => new Date(a.fsrs.due) - new Date(b.fsrs.due));
}
function newAllowance(lang) {
  const I = state.langs[lang].introduced;
  return Math.max(0, state.settings.newPerDay - (I.date === today() ? I.count : 0));
}
function newCards(lang) { return state.cards.filter((c) => c.lang === lang && c.fsrs.state === 0).slice(0, newAllowance(lang)); }
function reviewCount(lang) { return dueCards(lang).length + newCards(lang).length; }

function fmtInterval(due, now) {
  const m = (due - now) / 6e4;
  if (m < 60) return `${Math.max(1, Math.round(m))} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  const d = m / 1440;
  return d < 31 ? `${Math.round(d)} j` : d < 365 ? `${Math.round(d / 30)} mois` : `${(d / 365).toFixed(1)} an`;
}

function rateCard(cardId, rating) {
  const c = state.cards.find((x) => x.id === cardId);
  const L = state.langs[c.lang];
  const now = new Date();
  const prevState = c.fsrs.state, wasNew = prevState === 0;
  const { card, log } = scheduler().next(revive(c.fsrs), now, rating);
  c.fsrs = serialize(card);
  state.logs.push({
    id: uid(), card_id: c.id, user_id: "local", lang: c.lang, rating, reviewed_at: now.toISOString(),
    elapsed_days: log.elapsed_days, scheduled_days: log.scheduled_days, state: log.state,
  });
  if (wasNew) { if (L.introduced.date !== today()) L.introduced = { date: today(), count: 0 }; L.introduced.count++; }
  // Production/écoute débloquées après 2 réussites sur des révisions espacées (pas les étapes du jour 1)
  if (c.type === "recog" && rating >= 3 && prevState === 2 && ++c.successes >= 2) unlockSiblings(c);
  L.xp += 2;
  track(c.lang, "rev");
  save();
  return card;
}

// ---------- Session du jour, série, temps (§0, §8) ----------
function session(lang) {
  const L = state.langs[lang];
  if (L.session.date !== today()) L.session = { date: today(), input: false, review: false, production: false, captured: 0 };
  return L.session;
}
function bumpSession(lang, key) {
  const s = session(lang);
  if (key === "captured") s.captured++; else s[key] = true;
  const reviewOk = s.review || reviewCount(lang) === 0;
  const L = state.langs[lang];
  if (s.input && reviewOk && s.production && L.lastStreakDay !== today()) {
    L.streak = L.lastStreakDay === yesterday() ? L.streak + 1 : 1;
    L.lastStreakDay = today();
    toast("🔥 Session complète ! Série : " + L.streak);
  }
  save();
}
const currentStreak = (L) => (L.lastStreakDay === today() || L.lastStreakDay === yesterday() ? L.streak : 0);
const todayMin = (L) => (L.todayDate === today() ? Math.floor(L.todaySec / 60) : 0);

let lastActivity = 0;
["click", "keydown", "pointerdown"].forEach((ev) => addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));
setInterval(() => {
  const lang = currentLang();
  const listening = "speechSynthesis" in window && speechSynthesis.speaking;
  if (!lang || document.hidden || (Date.now() - lastActivity > 60000 && !listening)) return;
  const L = state.langs[lang];
  if (L.todayDate !== today()) { L.todayDate = today(); L.todaySec = 0; }
  L.seconds += 15; L.todaySec += 15;
  track(lang, "sec", 15);
  save();
}, 15000);
function currentLang() { const p = location.hash.split("/"); return p[1] === "lang" && LANGUAGES[p[2]] ? p[2] : null; }

// ---------- Diff & recast (§4) ----------
function lcs(a, b, key = (x) => x) {
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = key(a[i]) === key(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Array(n).fill(false), keepB = new Array(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (key(a[i]) === key(b[j])) { keepA[i] = keepB[j] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return { len: dp[0][0], keepA, keepB };
}
const normEn = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[.,!?;:"«»]/g, "").replace(/\s+/g, " ").trim();
const normKo = (s) => s.replace(/[.,!?;:"«»~\s]/g, "");
// Renvoie {html de la version correcte, html de la phrase de l'utilisateur, similarité}
function recast(user, target, lang) {
  if (isKo(lang)) {
    const a = [...normKo(user)], b = [...normKo(target)];
    const r = lcs(a, b);
    let j = 0;
    const tHtml = [...target].map((ch) => (/\s|[.,!?]/.test(ch) ? esc(ch) : r.keepB[j++] ? esc(ch) : `<ins>${esc(ch)}</ins>`)).join("");
    let i = 0;
    const uHtml = [...user].map((ch) => (/\s|[.,!?]/.test(ch) ? esc(ch) : r.keepA[i++] ? esc(ch) : `<del>${esc(ch)}</del>`)).join("");
    return { tHtml, uHtml, sim: r.len / Math.max(a.length, b.length, 1) };
  }
  const a = user.trim().split(/\s+/), b = target.trim().split(/\s+/);
  const r = lcs(a, b, normEn);
  const tHtml = b.map((w, j) => (r.keepB[j] ? esc(w) : `<ins>${esc(w)}</ins>`)).join(" ");
  const uHtml = a.map((w, i) => (r.keepA[i] ? esc(w) : `<del>${esc(w)}</del>`)).join(" ");
  return { tHtml, uHtml, sim: r.len / Math.max(a.length, b.length, 1) };
}

// Analyse coréenne : registre + particules (heuristique ; un LLM pourra prendre le relais)
function koChecks(ex, user, targetWords) {
  const issues = { register: [], particles: [] };
  const words = user.replace(/[.,!?~]/g, " ").trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || "";
  if (ex.register === "haeyo") {
    if (/(니다|니까)$/.test(last)) issues.register.push({ ok: true, msg: "C'est du 합니다체 (formel) : correct, mais plus formel que nécessaire ici. Le registre attendu est le poli en -요." });
    else if (!last.endsWith("요")) issues.register.push({ msg: `${ex.who} : on termine par -요 (registre poli 해요체). Sans -요, c'est du 반말, réservé aux proches.` });
  }
  for (const tw of targetWords) {
    const pIdx = tw.segs.findIndex((s, i) => i > 0 && s.particle);
    if (pIdx < 1) continue;
    const stem = tw.segs.slice(0, pIdx).map((s) => s.surface).join("");
    const tail = tw.segs.slice(pIdx).map((s) => s.surface).join("");
    if (!tw.segs.slice(pIdx).every((s) => s.particle)) continue;
    const uw = words.find((w) => w.startsWith(stem));
    if (!uw) continue;
    const uTail = uw.slice(stem.length);
    if (uTail && uTail !== tail) issues.particles.push({ stem, got: uTail, want: tail, lemma: tw.segs[pIdx].lemmas[0], explain: LEXICON.ko[tw.segs[pIdx].lemmas[0]]?.fr });
  }
  return issues;
}

// ---------- Sélection de contenu ----------
function recentLemmas(lang) {
  return new Set(state.cards.filter((c) => c.lang === lang).sort((a, b) => b.created.localeCompare(a.created)).slice(0, 30).flatMap((c) => c.lemma.split(" + ")));
}
function currentExercise(lang) {
  if (!ui.prod || ui.prod.lang !== lang) ui.prod = { lang, ex: pickExercise(lang), text: "", result: null, why: false };
  return ui.prod.ex;
}
function pickExercise(lang, skipId) {
  const recent = recentLemmas(lang), done = state.langs[lang].prodDone;
  const score = (ex) => ex.words.filter((w) => recent.has(w)).length * 10 - (done[ex.id] === today() ? 100 : 0) - (done[ex.id] ? 5 : 0) + Math.random();
  return [...PRODUCTION[lang]].filter((e) => e.id !== skipId).sort((a, b) => score(b) - score(a))[0];
}

// ============================================================
//  VUES
// ============================================================
function greeting() {
  const h = new Date().getHours();
  const base = h < 6 ? "Bonne nuit" : h < 18 ? "Bonjour" : "Bonsoir";
  return state.name ? `${base}, ${esc(state.name)}` : base;
}
const fsrsWarning = () => (HAS_FSRS ? "" : `<div class="card warn">⚠️ L'algorithme FSRS n'a pas pu être chargé (connexion internet ?). Les révisions sont désactivées.</div>`);

function viewHome() {
  const cont = state.lastLang && LANGUAGES[state.lastLang];
  return `
  <section class="view">
    <div class="hero">
      ${mochi()}
      <div>
        <span class="bubble">${greeting()} ! Je suis Mochi 🍡</span>
        <h1 style="margin-top:14px">Quelle langue veux-tu <em>apprendre</em> aujourd'hui ?</h1>
        <p class="muted">Lire, réviser au bon moment, parler. Quelques minutes par jour.</p>
        ${cont ? `<a class="btn" style="margin-top:18px" href="#/lang/${state.lastLang}">Continuer ${cont.flag} ${cont.name}</a>` : ""}
      </div>
    </div>

    <h2 class="section-title">Choisis ta langue</h2>
    <div class="lang-grid">
      ${Object.entries(LANGUAGES).map(([id, l]) => {
        const L = state.langs[id];
        return `
        <a class="lang-card ${id}" href="#/lang/${id}">
          <span class="deco">${l.deco}</span>
          <span class="flag">${l.flag}</span>
          <div><h2>${l.name}</h2><div class="hello ${koCls(id)}">${l.hello}</div></div>
          <p class="muted" style="margin:0">${l.tagline}</p>
          <div class="meta">
            <span class="tag c">${knownCount(id)} mots connus</span>
            <span class="tag">${L.started ? `⏱️ ${(L.seconds / 3600).toFixed(1)} h` : "Débutant"}</span>
          </div>
        </a>`;
      }).join("")}
    </div>

    <h2 class="section-title">La boucle de chaque jour</h2>
    <div class="features">
      ${[
        ["📖", "1 · Lire & écouter", "Des textes dont tu connais déjà ~95 % des mots."],
        ["🫳", "2 · Capturer", "Un tap sur un mot inconnu : il devient une carte, avec sa phrase et l'audio."],
        ["🧠", "3 · Réviser", "Rappel actif, planifié par FSRS juste avant l'oubli."],
        ["💬", "4 · Produire", "Tu écris une phrase, on te renvoie la version naturelle."],
      ].map(([i, t, d]) => `<div class="card feature"><div class="ico">${i}</div><div><h3>${t}</h3><p class="muted">${d}</p></div></div>`).join("")}
    </div>
    <p style="margin-top:20px"><a class="btn ghost small" href="#/pourquoi">Pourquoi ça marche ? →</a></p>
  </section>`;
}

// ---------- Tableau de bord d'une langue ----------
const TABS = {
  en: [["aujourdhui", "☀️ Aujourd'hui"], ["lire", "📖 Lire"], ["revisions", "🧠 Réviser"], ["produire", "💬 Produire"], ["mots", "📒 Mots"], ["oreille", "🎧 Oreille"], ["fauxamis", "🎭 Faux amis"]],
  ko: [["aujourdhui", "☀️ Aujourd'hui"], ["parcours", "🗺️ Parcours"], ["lire", "📖 Lire"], ["revisions", "🧠 Réviser"], ["produire", "💬 Produire"], ["mots", "📒 Mots"], ["oreille", "🎧 Oreille"]],
};
const hangulGate = (lang) => isKo(lang) && !state.langs.ko.hangulDone;
function gateCard() {
  const n = Object.keys(state.langs.ko.hangulDays).length;
  return `<div class="card empty">${mochi("small", "sleepy")}
    <h2>D'abord, le Hangul</h2>
    <p class="muted">L'alphabet coréen s'apprend en une semaine environ. Ensuite, plus aucune romanisation : tout se lit en Hangul.</p>
    <a class="btn" href="#/lang/ko/hangul/${Math.min(n + 1, HANGUL_DAYS.length)}">Jour ${Math.min(n + 1, HANGUL_DAYS.length)} du Hangul</a>
    <p><button class="linkish" data-act="skip-hangul">Je lis déjà le Hangul</button></p></div>`;
}

function viewLanguage(lang, tab) {
  const l = LANGUAGES[lang];
  const L = state.langs[lang];
  const p = Math.min(100, Math.round((todayMin(L) / state.goal) * 100));
  const gated = hangulGate(lang) && ["lire", "revisions", "produire", "mots"].includes(tab);
  const body = gated ? gateCard() : ({
    aujourdhui: tabToday, parcours: tabPath, lire: tabLibrary, revisions: tabReviews, produire: tabProduce,
    mots: tabWords, oreille: tabEar, fauxamis: tabFauxAmis,
  }[tab] || tabToday)(lang);
  const hours = L.seconds / 3600;
  const lvl = LEVEL_HOURS[lang].steps[0];

  return `
  <section class="view">
    <div class="lang-header">
      <span class="flag">${l.flag}</span>
      <div><h1>${l.name}</h1><div class="muted ${koCls(lang)}" style="font-weight:800">${l.native}</div></div>
      <div class="right"><a class="btn ghost small" href="#/">Changer de langue</a></div>
    </div>
    <div class="dash-grid">
      <div>
        <div class="tabs">${TABS[lang].map(([k, label]) => `<a class="tab ${k === tab ? "active" : ""}" href="#/lang/${lang}/${k}">${label}</a>`).join("")}</div>
        ${fsrsWarning()}
        ${body}
      </div>
      <aside class="side">
        <div class="card goal">
          <div class="ring" style="--p:${p}" data-label="${todayMin(L)}/${state.goal}"></div>
          <div><h3>Objectif du jour</h3><p class="muted" style="margin:4px 0 0">${state.goal} min · <a href="#/profil" class="lnk">modifier</a></p></div>
        </div>
        <div class="card">
          <div class="stat-grid">
            <div class="stat"><span class="ico">⏱️</span><div><b>${hours.toFixed(1)} h</b><small>d'apprentissage</small></div></div>
            <div class="stat"><span class="ico">📒</span><div><b>${knownCount(lang)}</b><small>mots connus</small></div></div>
            <div class="stat"><span class="ico">🔥</span><div><b>${currentStreak(L)}</b><small>sessions complètes d'affilée</small></div></div>
            <div class="stat"><span class="ico">⭐</span><div><b>${L.xp}</b><small>XP</small></div></div>
          </div>
        </div>
        <div class="card">
          <h3>Vers le ${lvl[0]}</h3>
          <div class="bar" style="margin:10px 0 6px"><span style="width:${Math.min(100, (hours / lvl[1]) * 100)}%"></span></div>
          <small class="muted">${hours.toFixed(1)} h sur ${lvl[2]} estimées. C'est un marathon : chaque session compte.</small>
        </div>
      </aside>
    </div>
  </section>`;
}

function stepCard(n, icon, title, done, desc, action) {
  return `<div class="card step ${done ? "done" : ""}">
    <div class="step-n">${done ? "✓" : n}</div>
    <div style="flex:1"><h3>${icon} ${title}</h3><p class="muted">${desc}</p></div>
    ${action || ""}
  </div>`;
}

function tabToday(lang) {
  if (hangulGate(lang)) {
    const n = Object.keys(state.langs.ko.hangulDays).length;
    return `<div class="card phase"><b>Phase 1 · Le Hangul</b><div class="bar"><span style="width:${(n / HANGUL_DAYS.length) * 100}%"></span></div><small class="muted">${n} / ${HANGUL_DAYS.length} jours</small></div>${gateCard()}`;
  }
  const s = session(lang);
  const best = rankedTexts(lang)[0];
  const due = dueCards(lang).length, fresh = newCards(lang).length;
  const reviewDone = s.review || due + fresh === 0;
  const ex = currentExercise(lang);
  const all = s.input && reviewDone && s.production;
  return `
    ${all ? `<div class="card celebrate">${mochi("small")}<div><h3>Session du jour bouclée 🎉</h3><p class="muted">Tu peux continuer, mais l'essentiel est fait. Reviens demain : tes révisions t'attendront au bon moment.</p></div></div>` : ""}
    ${stepCard(1, "📖", "Lire & écouter", s.input,
      `${esc(best.t.title)} · tu connais ~${pct(best.c)} % des mots${best.z.k === "gloss" ? " (avec glossaire)" : ""}.`,
      `<a class="btn small" href="#/lang/${lang}/lire/${best.t.id}">Lire</a>`)}
    ${stepCard(2, "🫳", "Capturer", s.captured > 0, s.captured ? `${s.captured} mot(s) capturé(s) aujourd'hui.` : "Pendant la lecture, touche un mot inconnu pour l'ajouter.", "")}
    ${stepCard(3, "🧠", "Réviser", reviewDone, due + fresh ? `${due} carte(s) à revoir, ${fresh} nouvelle(s).` : "Rien à réviser pour l'instant.",
      due + fresh ? `<a class="btn small" href="#/lang/${lang}/revisions/go">Réviser</a>` : "")}
    ${stepCard(4, "💬", "Produire", s.production, `« ${esc(ex.prompt)} »`, `<a class="btn small" href="#/lang/${lang}/produire">Écrire</a>`)}
  `;
}

// ---------- Parcours coréen (§6) ----------
function tabPath(lang) {
  const K = state.langs.ko;
  const hDone = Object.keys(K.hangulDays).length;
  const gDone = KO_GRAMMAR.filter((g) => K.grammarDone[g.id]).length;
  const phase2Done = gDone === KO_GRAMMAR.length;
  return `
    <div class="card phase ${K.hangulDone ? "done" : ""}">
      <div class="phase-head"><b>Phase 1 · Le Hangul</b><span class="tag">${K.hangulDone ? "Terminé ✓" : `${hDone} / ${HANGUL_DAYS.length} jours`}</span></div>
      <div class="bar"><span style="width:${K.hangulDone ? 100 : (hDone / HANGUL_DAYS.length) * 100}%"></span></div>
      <div class="day-grid">
        ${HANGUL_DAYS.map((d, i) => {
          const done = K.hangulDays[i + 1], open = i === 0 || K.hangulDays[i] || K.hangulDone;
          return `<a class="day ${done ? "done" : ""} ${open ? "" : "locked"}" href="#/lang/ko/hangul/${i + 1}" data-act="${open ? "" : "locked"}">
            <small>Jour ${i + 1}</small><b>${d.title}</b><span class="ko">${d.sub}</span></a>`;
        }).join("")}
      </div>
    </div>

    <div class="card phase" style="margin-top:18px">
      <div class="phase-head"><b>Phase 2 · Les briques de la phrase</b><span class="tag">${gDone} / ${KO_GRAMMAR.length}</span></div>
      <div class="bar"><span style="width:${(gDone / KO_GRAMMAR.length) * 100}%"></span></div>
      <p class="muted" style="margin:10px 0 14px">Particules, terminaisons, niveaux de politesse : c'est la phase où presque tout le monde trouve ça dur. C'est normal. On avance <b>un point à la fois</b>, avec beaucoup d'exemples avant de produire.</p>
      <div class="gram-list">
        ${KO_GRAMMAR.map((g, i) => {
          const done = K.grammarDone[g.id], open = K.hangulDone && (i === 0 || K.grammarDone[KO_GRAMMAR[i - 1].id]);
          return `<a class="gram ${done ? "done" : ""} ${open ? "" : "locked"}" href="#/lang/ko/grammaire/${g.id}" data-act="${open ? "" : "locked"}">
            <span class="gram-n">${done ? "✓" : open ? i + 1 : "🔒"}</span><span class="ko">${g.title}</span></a>`;
        }).join("")}
      </div>
    </div>

    <div class="card phase ${phase2Done ? "" : "dim"}" style="margin-top:18px">
      <div class="phase-head"><b>Phase 3 · Les autres registres</b><span class="tag">${phase2Done ? "Bientôt" : "🔒 Après la phase 2"}</span></div>
      <ul class="muted ko">${KO_PHASE3.map((x) => `<li>${x}</li>`).join("")}</ul>
    </div>

    <h2 class="section-title">À qui parles-tu ? Le même message, quatre registres</h2>
    ${registerSwitcher()}`;
}

function registerSwitcher() {
  const who = ui.registerWho || "inconnu";
  return `<div class="card">
    <div class="choice-row">${REGISTERS.who.map(([k, label, reg]) => `<button class="choice ${k === who ? "active" : ""}" data-act="register" data-k="${k}">${label}<br/><small class="muted ko">${reg}</small></button>`).join("")}</div>
    <div class="reg-list">
      ${REGISTERS.phrases.map((p) => `<div class="reg-row">
        <span class="muted">${esc(p.fr)}</span>
        <button class="reg-ko ko" data-act="say" data-text="${esc(p[who])}" data-lang="ko">${esc(p[who])} 🔊</button>
        <small class="muted">${esc(p.note)}</small></div>`).join("")}
    </div>
    <p class="muted" style="margin:12px 0 0"><small>Dans le parcours, on reste au registre poli (해요체), le plus utile au quotidien.</small></p>
  </div>`;
}

// ---------- Bibliothèque (§3) ----------
function tabLibrary(lang) {
  const list = rankedTexts(lang);
  return `
    <div class="card" style="margin-bottom:16px"><p style="margin:0">Classés selon <b>ton</b> vocabulaire (${knownCount(lang)} mots connus). La zone idéale : <b>92–98 %</b> de mots connus.</p></div>
    <div class="text-list">
      ${list.map(({ t, c, z }) => `
        <a class="card text-item" href="#/lang/${lang}/lire/${t.id}">
          <span class="ti-icon">${t.icon}</span>
          <div style="flex:1">
            <h3>${esc(t.title)} ${state.langs[lang].readTexts[t.id] ? '<small class="muted">· lu ✓</small>' : ""}</h3>
            <small class="muted">${t.kind} · ${t.sentences.length} phrases · 🔊 audio</small>
            <div class="cov"><div class="bar"><span style="width:${pct(c)}%"></span></div><b>${pct(c)} %</b></div>
          </div>
          <span class="zone ${z.k}">${z.label}</span>
        </a>`).join("")}
    </div>`;
}

function viewReader(lang, textId) {
  const t = textById(lang, textId);
  if (!t) return viewNotFound();
  if (hangulGate(lang)) return `<section class="view">${gateCard()}</section>`;
  if (!ui.reader || ui.reader.id !== textId) ui.reader = { id: textId, hide: false, shadow: false, fr: {}, sel: null, playing: false, cur: -1 };
  const R = ui.reader;
  const stab = stabilityMap(lang);
  const c = coverage(lang, t.parsed, stab), z = zone(c);
  const unknown = unknownLemmas(lang, t.parsed, stab);
  const sp = state.settings.speed;

  const segHtml = (seg, si, wi, gi) => {
    if (seg.proper) return `<span class="w proper">${esc(seg.surface)}</span>`;
    const st = seg.lemmas.map((l) => lemmaStatus(lang, l, stab));
    const cls = st.includes("new") ? "new" : st.includes("learning") ? "learning" : st.includes("cognate") ? "cognate" : "known";
    const sel = R.sel && R.sel.s === si && R.sel.w === wi && R.sel.g === gi ? "sel" : "";
    return `<span class="w ${cls} ${seg.particle ? "pt" : ""} ${sel}" data-act="word" data-s="${si}" data-w="${wi}" data-g="${gi}">${esc(seg.surface)}</span>`;
  };

  let panel = "";
  if (R.sel) {
    const s = t.parsed[R.sel.s], seg = s.words[R.sel.w].segs[R.sel.g];
    const lemma = seg.lemmas.join(" + ");
    const has = state.cards.some((x) => x.lang === lang && x.lemma === lemma);
    const st = seg.lemmas.map((l) => lemmaStatus(lang, l, stab));
    panel = `<div class="wordpanel card">
      <button class="close-x" data-act="unsel" aria-label="Fermer">✕</button>
      <div class="wp-word ${koCls(lang)}">${esc(seg.surface)} ${seg.surface !== lemma ? `<small class="muted">← ${esc(lemma)}</small>` : ""}</div>
      <div class="wp-fr">${esc(lexFr(lang, lemma))}</div>
      ${seg.particle ? `<small class="muted">Particule : elle se colle au mot précédent.</small>` : ""}
      <div class="wp-actions">
        <button class="btn ghost small" data-act="say" data-text="${esc(seg.surface)}" data-lang="${lang}">🔊</button>
        ${has ? `<span class="tag">Déjà en révision ✓</span>` : `<button class="btn small" data-act="capture">+ Ajouter aux révisions</button>`}
        ${st.every((x) => x === "known") && !st.includes("cognate") ? `<button class="btn ghost small" data-act="mark-unknown">Je ne le connais pas</button>` : `<button class="btn ghost small" data-act="mark-known">Je le connais</button>`}
      </div>
    </div>`;
  }

  return `
  <section class="view reader ${R.hide ? "hide-text" : ""}">
    <div class="lesson-top">
      <a class="close" href="#/lang/${lang}/lire" aria-label="Retour" data-act="stop">←</a>
      <div style="flex:1"><h1 style="font-size:1.4rem">${t.icon} ${esc(t.title)}</h1></div>
      <span class="zone ${z.k}">${z.label}</span>
    </div>
    <p class="cov-line">Tu connais <b>~${pct(c)} %</b> des mots de ce texte.${c < 0.9 ? " C'est beaucoup de mots nouveaux : le glossaire ci-dessous va t'aider." : c > 0.98 ? " Parfait pour gagner en fluidité." : ""}</p>

    ${c < 0.9 && unknown.size ? `<details class="card gloss" ${R.glossOpen ? "open" : ""}>
      <summary><b>📖 Glossaire</b> · ${unknown.size} mots inconnus</summary>
      <div class="gloss-grid">${[...unknown.keys()].map((l) => `<div><b class="${koCls(lang)}">${esc(l)}</b> <span class="muted">${esc(lexFr(lang, l))}</span></div>`).join("")}</div>
      <button class="btn small" data-act="capture-all" style="margin-top:12px">+ Ajouter les ${unknown.size} mots aux révisions</button>
    </details>` : ""}

    <div class="player card">
      <button class="btn small" data-act="${R.playing ? "stop" : "play-all"}">${R.playing ? "⏸ Stop" : "▶ Tout écouter"}</button>
      <div class="seg-ctl">${[0.75, 1, 1.25].map((v) => `<button class="${v === sp ? "on" : ""}" data-act="speed" data-v="${v}">${v}×</button>`).join("")}</div>
      <button class="choice small-choice ${R.hide ? "active" : ""}" data-act="toggle-hide">${R.hide ? "🙈 Texte masqué" : "👀 Texte affiché"}</button>
      <button class="choice small-choice ${R.shadow ? "active" : ""}" data-act="toggle-shadow">🎙️ Shadowing</button>
      ${isKo(lang) ? `<button class="choice small-choice ${state.settings.particleColors ? "active" : ""}" data-act="toggle-particles">🎨 Particules</button>` : ""}
    </div>
    ${R.shadow ? `<div class="card tip">🎙️ <b>Shadowing</b> : appuie sur 🎙️, répète <b>en même temps</b> que la voix, puis réécoute les deux. Vise le <b>rythme et l'intonation</b>, pas la perfection de chaque son.</div>` : ""}

    <div class="sentences">
      ${t.parsed.map((s, si) => `
        <div class="sentence ${R.cur === si ? "playing" : ""}" id="s-${si}">
          <div class="s-tools">
            <button data-act="play-s" data-s="${si}" title="Écouter cette phrase">🔊</button>
            <button data-act="fr" data-s="${si}" title="Traduction">🇫🇷</button>
            ${R.shadow ? `<button data-act="shadow" data-s="${si}" title="S'enregistrer">🎙️</button>` : ""}
          </div>
          <div class="s-body">
            <p class="s-text ${koCls(lang)}">${s.words.map((w, wi) => esc(w.pre) + w.segs.map((g, gi) => segHtml(g, si, wi, gi)).join("") + esc(w.post)).join(" ")}</p>
            ${R.fr[si] ? `<p class="s-fr">${esc(s.fr)}</p>` : ""}
            ${ui.recordings[`${textId}:${si}`] ? `<div class="rec-row"><button class="choice small-choice" data-act="play-s" data-s="${si}">▶ Modèle</button><button class="choice small-choice" data-act="play-rec" data-s="${si}">▶ Moi</button><button class="choice small-choice" data-act="play-both" data-s="${si}">▶ Les deux</button></div>` : ""}
          </div>
        </div>`).join("")}
    </div>

    <div class="legend muted"><span class="w new">nouveau</span><span class="w learning">en révision</span>${lang === "en" ? '<span class="w cognate">transparent</span>' : '<span class="w pt">particule</span>'}<span>Touche un mot pour sa traduction.</span></div>

    ${panel}

    <div style="text-align:center;margin-top:28px">
      <button class="btn" data-act="finish-read">J'ai fini ✓</button>
    </div>
  </section>`;
}

// ---------- Révisions (§1, §2) ----------
function tabReviews(lang) {
  const due = dueCards(lang).length, fresh = newCards(lang).length;
  const total = state.cards.filter((c) => c.lang === lang).length;
  const byType = (t) => state.cards.filter((c) => c.lang === lang && c.type === t).length;
  return `
    <div class="card empty">
      ${mochi("small", due + fresh ? "happy" : "sleepy")}
      <h2>${due + fresh ? `${due + fresh} carte(s) à réviser` : "Tout est à jour"}</h2>
      <p class="muted">${due} à revoir · ${fresh} nouvelle(s) (max ${state.settings.newPerDay} / jour)<br/>Rétention visée : ${pct(state.settings.retention)} %</p>
      ${due + fresh && HAS_FSRS ? `<a class="btn" href="#/lang/${lang}/revisions/go">Commencer</a>` : `<a class="btn ghost" href="#/lang/${lang}/lire">Lire un texte pour capturer des mots</a>`}
    </div>
    <div class="stat-grid card" style="margin-top:16px">
      <div class="stat"><span class="ico">🃏</span><div><b>${total}</b><small>cartes au total</small></div></div>
      <div class="stat"><span class="ico">👁️</span><div><b>${byType("recog")}</b><small>reconnaissance</small></div></div>
      <div class="stat"><span class="ico">✍️</span><div><b>${byType("prod") + byType("cloze")}</b><small>production</small></div></div>
      <div class="stat"><span class="ico">🎧</span><div><b>${byType("listen")}</b><small>écoute</small></div></div>
    </div>
    <p class="muted"><small>Les cartes de production et d'écoute se débloquent après 2 bonnes réponses en reconnaissance.</small></p>`;
}

function startReview(lang) {
  ui.review = { lang, queue: [...dueCards(lang), ...newCards(lang)].map((c) => c.id), revealed: false, typed: "", done: 0 };
}
function blank(c) { return `${esc(c.before)}<span class="blank">${"＿".repeat(Math.max(2, [...c.surface].length))}</span>${esc(c.after)}`; }
function marked(c) { return `${esc(c.before)}<mark>${esc(c.surface)}</mark>${esc(c.after)}`; }

function viewReviewSession(lang) {
  if (!HAS_FSRS) return `<section class="view">${fsrsWarning()}</section>`;
  if (!ui.review || ui.review.lang !== lang) startReview(lang);
  const R = ui.review;
  const progress = R.done / (R.done + R.queue.length || 1);
  const top = `<div class="lesson-top"><a class="close" href="#/lang/${lang}/revisions" aria-label="Quitter">✕</a><div class="progress"><span style="width:${pct(progress)}%"></span></div><span class="chip">${R.queue.length}</span></div>`;
  if (!R.queue.length) {
    if (R.done) bumpSession(lang, "review");
    const ex = currentExercise(lang);
    return `<section class="view lesson-shell">${top}<div class="card empty" style="margin-top:30px">${mochi()}
      <h2>Révisions terminées !</h2><p class="muted">${R.done} carte(s) revue(s). FSRS a planifié les prochaines juste avant que tu les oublies.</p>
      <a class="btn" href="#/lang/${lang}/produire">Maintenant, produis une phrase 💬</a>
      <p class="muted" style="margin-top:14px"><small>Prochain exercice : « ${esc(ex.prompt)} »</small></p></div></section>`;
  }
  const c = state.cards.find((x) => x.id === R.queue[0]);
  const k = koCls(lang);
  let front = "", back = "", input = "";
  const sayCtx = `<button class="btn ghost small" data-act="say" data-text="${esc(c.context)}" data-lang="${lang}">🔊 Phrase</button>`;
  if (c.type === "recog") {
    front = `<p class="q-label">Que veut dire le mot surligné ?</p><p class="q-sentence ${k}">${marked(c)}</p>${sayCtx}`;
    back = `<p class="a-word">${esc(c.fr)}</p>${c.note ? `<p class="note">⚠️ ${esc(c.note)}</p>` : ""}<p class="muted">${esc(c.contextFr)}</p>`;
  } else if (c.type === "listen") {
    front = `<p class="q-label">Écoute. Que veut dire cette phrase ?</p><button class="big-audio" data-act="say" data-text="${esc(c.context)}" data-lang="${lang}">🔊</button>`;
    back = `<p class="q-sentence ${k}">${marked(c)}</p><p class="muted">${esc(c.contextFr)}</p><p><b class="${k}">${esc(c.surface)}</b> = ${esc(c.fr)}</p>`;
  } else {
    // prod / cloze : rappel actif écrit
    front = `<p class="q-label">${c.type === "cloze" ? "Quelle particule manque ?" : `Écris le mot pour « ${esc(c.fr)} »`}</p>
      <p class="q-sentence ${k}">${blank(c)}</p><p class="muted">${esc(c.contextFr)}</p>`;
    if (!R.revealed) input = `<input class="input answer ${k}" id="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ta réponse…" value="${esc(R.typed)}" />`;
    else {
      const ok = (isKo(lang) ? normKo(R.typed) === normKo(c.surface) : normEn(R.typed) === normEn(c.surface));
      const r = recast(R.typed || "—", c.surface, lang);
      back = `<p class="a-word ${k}">${ok ? "✅ " : ""}${r.tHtml}</p>${ok ? "" : `<p class="muted">Ta réponse : <span class="${k}">${r.uHtml}</span></p>`}<p class="q-sentence ${k}">${marked(c)}</p><p class="muted"><small>${esc(c.fr)}</small></p>${sayCtx}`;
    }
  }
  let buttons;
  if (!R.revealed) buttons = `<button class="btn" data-act="reveal">${input ? "Vérifier" : "Afficher la réponse"}</button>`;
  else {
    const prev = scheduler().repeat(revive(c.fsrs), new Date());
    const labels = [[1, "À revoir", "again"], [2, "Difficile", "hard"], [3, "Bien", "good"], [4, "Facile", "easy"]];
    buttons = `<div class="rate">${labels.map(([g, l, cls]) => `<button class="rate-btn ${cls}" data-act="rate" data-g="${g}"><b>${l}</b><small>${fmtInterval(prev[g].card.due, new Date())}</small></button>`).join("")}</div>`;
  }
  const typeLabel = { recog: "👁️ Reconnaissance", listen: "🎧 Écoute", prod: "✍️ Production", cloze: "🎯 Point faible" }[c.type];
  return `<section class="view lesson-shell still">${top}
    <div class="card review-card">
      <span class="tag">${typeLabel}</span>
      ${front}${input}
      ${R.revealed ? `<hr/>${back}` : ""}
    </div>
    <div class="review-actions">${buttons}</div>
    <p class="muted center"><small>${R.revealed ? "Sois honnête : FSRS s'adapte à ta mémoire." : "Essaie de te souvenir <b>avant</b> de regarder."}</small></p>
  </section>`;
}

// ---------- Production + recast (§4) ----------
function tabProduce(lang) {
  currentExercise(lang);
  const P = ui.prod, ex = P.ex, k = koCls(lang);
  const recent = [...recentLemmas(lang)].slice(0, 8);
  let fb = "";
  if (P.result) {
    const r = P.result;
    fb = `<div class="card feedback">
      ${r.perfect ? `<h3>✅ C'est naturel, bravo !</h3>${r.alt ? `<p class="muted">On dit aussi : <span class="${k}">${esc(r.alt)}</span></p>` : ""}`
        : `<h3>Version naturelle</h3>
           <p class="recast ${k}">${r.tHtml}</p>
           <p class="muted">Ta phrase : <span class="${k}">${r.uHtml}</span></p>`}
      ${r.issues.register.map((i) => `<div class="issue ${i.ok ? "soft" : ""}"><b>Registre</b> ${esc(i.msg)}</div>`).join("")}
      ${r.issues.particles.map((i) => `<div class="issue"><b>Particule</b> <span class="ko">${esc(i.stem)}<del>${esc(i.got)}</del> → ${esc(i.stem)}<ins>${esc(i.want)}</ins></span> · ${esc(i.explain || "")}</div>`).join("")}
      <div class="wp-actions">
        <button class="btn ghost small" data-act="say" data-text="${esc(r.target)}" data-lang="${lang}">🔊 Écouter</button>
        <button class="btn ghost small" data-act="why">${P.why ? "Masquer" : "Pourquoi ?"}</button>
        <button class="btn small" data-act="next-ex">Exercice suivant →</button>
      </div>
      ${P.why ? `<p class="why">💡 ${esc(ex.why)}</p>` : ""}
    </div>`;
  }
  return `
    <div class="card prod">
      ${ex.who ? `<div class="who"><span class="tag">👤 ${esc(ex.who)}</span><span class="tag">Registre : poli en -요</span></div>` : ""}
      <h2 style="margin:10px 0 14px">${esc(ex.prompt)}</h2>
      <textarea id="prod-text" class="input ${k}" rows="2" placeholder="${isKo(lang) ? "한국어로 써 보세요…" : "Write in English…"}" ${P.result ? "disabled" : ""}>${esc(P.text)}</textarea>
      ${recent.length ? `<p class="muted" style="margin:10px 0 0"><small>Tes mots récents : ${recent.map((w) => `<span class="tag ${k}">${esc(w)}</span>`).join(" ")}</small></p>` : ""}
      ${P.result ? "" : `<div class="wp-actions"><button class="btn" data-act="check-prod">Vérifier</button><button class="btn ghost small" data-act="next-ex">Autre phrase</button></div>`}
    </div>
    ${fb}
    <p class="muted"><small>On te renvoie la phrase reformulée plutôt qu'un simple « faux ». ${isKo(lang) ? "Le registre est vérifié selon l'interlocuteur." : ""} Les variantes correctes sont acceptées.</small></p>`;
}

function checkProduction(lang, text) {
  const P = ui.prod, ex = P.ex;
  const tWords = parseSentence(ex.target, lang);
  const target = plain(tWords);
  const norm = isKo(lang) ? normKo : normEn;
  const cands = [target, ...ex.accept];
  const match = cands.find((c) => norm(c) === norm(text));
  const issues = isKo(lang) ? koChecks(ex, text, tWords) : { register: [], particles: [] };
  if (match) {
    issues.particles = [];
    P.result = { perfect: true, alt: norm(match) === norm(target) ? (ex.accept[0] || "") : target, target, issues };
  } else {
    const best = cands.map((c) => ({ c, r: recast(text, c, lang) })).sort((a, b) => b.r.sim - a.r.sim)[0];
    P.result = { perfect: false, ...best.r, target: best.c, issues };
  }
  // Erreurs récurrentes → cartes ciblées (§4)
  const L = state.langs[lang];
  for (const i of issues.particles) {
    L.errors[i.want] = (L.errors[i.want] || 0) + 1;
    if (L.errors[i.want] >= 2) {
      const wi = tWords.findIndex((w) => w.segs.map((s) => s.surface).join("").startsWith(i.stem) && w.segs.some((s) => s.particle));
      const gi = wi >= 0 ? tWords[wi].segs.findIndex((s) => s.particle) : -1;
      if (gi > 0 && tWords[wi].segs.length === gi + 1) {
        const { before, after } = splitAround(tWords, wi, gi);
        if (addCard(lang, { type: "cloze", lemma: i.lemma, before, surface: i.want, after, contextFr: ex.prompt, fr: i.explain || i.want, source: ex.id })) toast(`🎯 Carte ciblée créée pour la particule ${i.want}`);
      }
    }
  }
  L.prodDone[ex.id] = today();
  L.xp += 5;
  track(lang, "prod");
  P.text = text;
  bumpSession(lang, "production");
}

// ---------- Mots (§3 : modèle du vocabulaire, fréquence) ----------
function tabWords(lang) {
  const stab = stabilityMap(lang);
  const lemmas = Object.keys(LEXICON[lang]);
  const next = lemmas.filter((l) => lemmaStatus(lang, l, stab) === "new" && findContext(lang, l)).slice(0, 5);
  const label = { known: "Connu", learning: "En révision", cognate: "Transparent", new: "Nouveau" };
  const counts = { known: 0, learning: 0, cognate: 0, new: 0 };
  lemmas.forEach((l) => counts[lemmaStatus(lang, l, stab)]++);
  return `
    <div class="card" style="margin-bottom:16px">
      <div class="stat-grid">
        <div class="stat"><span class="ico">✅</span><div><b>${counts.known}</b><small>connus</small></div></div>
        <div class="stat"><span class="ico">🔄</span><div><b>${counts.learning}</b><small>en révision</small></div></div>
        ${lang === "en" ? `<div class="stat"><span class="ico">🤝</span><div><b>${counts.cognate}</b><small>transparents</small></div></div>` : ""}
      </div>
      <p class="muted" style="margin:12px 0"><small>Un mot devient « connu » quand FSRS estime que tu le retiens au moins ${KNOWN_STABILITY} jours, ou si tu le marques toi-même. Les mots sont classés par fréquence : on apprend d'abord les plus utiles.</small></p>
      ${next.length ? `<button class="btn small" data-act="add-frequent">+ Apprendre les ${next.length} prochains mots fréquents</button>` : ""}
    </div>
    <div class="word-list">
      ${lemmas.map((l) => { const s = lemmaStatus(lang, l, stab); return `
        <div class="word-row">
          <button class="w-say ${koCls(lang)}" data-act="say" data-text="${esc(l)}" data-lang="${lang}">${esc(l)}</button>
          <span class="muted w-fr">${esc(LEXICON[lang][l].fr)}</span>
          <span class="st ${s}">${label[s]}</span>
          <button class="mini" data-act="${s === "known" || s === "cognate" ? "toggle-unknown" : "toggle-known"}" data-l="${esc(l)}">${s === "known" || s === "cognate" ? "Pas connu" : "Je connais"}</button>
        </div>`; }).join("")}
    </div>`;
}

// ---------- Oreille : paires minimales, formes faibles, liaison (§5, §6, §7) ----------
function tabEar(lang) {
  const E = EAR[lang];
  if (!ui.ear || ui.ear.lang !== lang) ui.ear = { lang, i: Math.floor(Math.random() * E.pairs.length), target: null, picked: null, score: 0, n: 0 };
  const G = ui.ear, pair = E.pairs[G.i], k = koCls(lang);
  return `
    <div class="card">
      <h3>Qu'est-ce que tu entends ?</h3>
      <p class="muted" style="margin:4px 0 14px">${esc(pair.label)} · score ${G.score}/${G.n}</p>
      <button class="big-audio" data-act="ear-play">🔊</button>
      <div class="choice-row center" style="margin-top:16px">
        ${pair.items.map((w) => {
          const cls = G.picked ? (w === G.target ? "right" : w === G.picked ? "wrong" : "") : "";
          return `<button class="choice ${k} ${cls}" data-act="ear-pick" data-w="${esc(w)}" ${G.target ? "" : "disabled"}>${esc(w)}</button>`;
        }).join("")}
      </div>
      ${G.picked ? `<div class="wp-actions center"><button class="btn small" data-act="ear-next">Suivant →</button></div>` : !G.target ? `<p class="muted center"><small>Appuie sur 🔊 pour commencer.</small></p>` : ""}
    </div>
    ${E.notes.map((n) => `<h2 class="section-title">${esc(n.t)}</h2><div class="card">${n.lines.map(([a, b]) => `
      <div class="reg-row"><button class="reg-ko ${k}" data-act="say" data-text="${esc(a.replace(/[A-Z]{2,}/g, (m) => m.toLowerCase()))}" data-lang="${lang}">${esc(a)} 🔊</button><small class="muted">${esc(b)}</small></div>`).join("")}</div>`).join("")}
    <div class="card tip" style="margin-top:18px">🎙️ Pour le <b>shadowing</b>, ouvre un texte dans « Lire » et active le mode 🎙️.</div>`;
}

// ---------- Faux amis (§7) ----------
function tabFauxAmis(lang) {
  const has = (l) => state.cards.some((c) => c.lang === "en" && c.lemma === l);
  const missing = FAUX_AMIS.filter((f) => !has(f.lemma)).length;
  return `
    <div class="card" style="margin-bottom:16px"><p style="margin:0">Ils ressemblent au français mais ne veulent pas dire la même chose. Chaque carte garde sa phrase d'exemple et son audio.</p>
    ${missing ? `<button class="btn small" style="margin-top:12px" data-act="add-faux">+ Ajouter les ${missing} faux amis aux révisions</button>` : `<p class="muted"><small>Tous les faux amis sont dans tes révisions ✓</small></p>`}</div>
    <div class="word-list">${FAUX_AMIS.map((f) => `
      <div class="word-row faux">
        <button class="w-say" data-act="say" data-text="${esc(f.s)}" data-lang="en">${esc(f.lemma)} 🔊</button>
        <span class="w-fr">${esc(f.fr)}<br/><small class="muted">${esc(f.s)} — ${esc(f.sfr)}</small></span>
        ${has(f.lemma) ? '<span class="st learning">En révision</span>' : ""}
      </div>`).join("")}</div>`;
}

// ---------- Quiz générique (Hangul, grammaire) ----------
function startQuiz(key, questions, onDone) {
  ui.quiz = { key, qs: questions, queue: questions.map((_, i) => i), failed: new Set(), answer: null, onDone, total: questions.length, build: { l: null, v: null } };
}
function viewQuiz(backHref, title) {
  const Q = ui.quiz;
  const done = Q.total - new Set(Q.queue).size;
  const top = `<div class="lesson-top"><a class="close" href="${backHref}" aria-label="Quitter">✕</a><div class="progress"><span style="width:${pct(done / Q.total)}%"></span></div></div>`;
  if (!Q.queue.length) {
    const score = Q.total - Q.failed.size;
    if (!Q.finished) { Q.finished = true; Q.onDone(score); }
    return `<section class="view lesson-shell">${top}<div class="card empty" style="margin-top:30px">${mochi()}
      <h2>${esc(title)} : terminé !</h2><p class="muted">${score} / ${Q.total} du premier coup. Les erreurs ont été reposées jusqu'à la bonne réponse.</p>
      <a class="btn" href="${backHref}">Continuer</a></div></section>`;
  }
  const q = Q.qs[Q.queue[0]];
  const A = Q.answer;
  let body;
  if (q.build) {
    const comp = Q.build.l && Q.build.v ? composeHangul(Q.build.l, Q.build.v) : "?";
    body = `<p class="q-label">Construis la syllabe que tu entends <span class="muted">(${esc(q.rom)})</span></p>
      <button class="big-audio" data-act="say" data-text="${q.target}" data-lang="ko">🔊</button>
      <div class="build-preview ko ${A ? (A.ok ? "right" : "wrong") : ""}">${comp}</div>
      <div class="choice-row center">${q.leads.map((x) => `<button class="choice ko ${Q.build.l === x ? "active" : ""}" data-act="build-l" data-x="${x}" ${A ? "disabled" : ""}>${x}</button>`).join("")}</div>
      <div class="choice-row center" style="margin-top:10px">${q.vowels.map((x) => `<button class="choice ko ${Q.build.v === x ? "active" : ""}" data-act="build-v" data-x="${x}" ${A ? "disabled" : ""}>${x}</button>`).join("")}</div>
      ${A ? (A.ok ? `<p class="ok-msg">Bien joué !</p>` : `<p class="ko-msg">C'était <b class="ko">${q.target}</b> = ${q.target_l} + ${q.target_v}</p>`) : `<div class="center" style="margin-top:16px"><button class="btn" data-act="build-check" ${Q.build.l && Q.build.v ? "" : "disabled"}>Vérifier</button></div>`}`;
  } else {
    body = `<p class="q-label">${q.ask}</p>${q.prompt}
      <div class="choice-row center" style="margin-top:16px">${q.options.map((o) => {
        const cls = A ? (o === q.answer ? "right" : o === A.picked ? "wrong" : "") : "";
        return `<button class="choice ${q.optCls || ""} ${cls}" data-act="quiz-pick" data-o="${esc(o)}" ${A ? "disabled" : ""}>${esc(o)}</button>`;
      }).join("")}</div>
      ${A ? `<p class="${A.ok ? "ok-msg" : "ko-msg"}">${A.ok ? "Bien joué !" : `Réponse : <b class="${q.optCls || ""}">${esc(q.answer)}</b>`}${q.after ? ` · ${q.after}` : ""}</p>` : ""}`;
  }
  return `<section class="view lesson-shell still">${top}<div class="card review-card center">${body}</div>
    ${A ? `<div class="review-actions"><button class="btn" data-act="quiz-next">Continuer</button></div>` : ""}</section>`;
}
function answerQuiz(ok, picked) {
  const Q = ui.quiz, q = Q.qs[Q.queue[0]];
  Q.answer = { ok, picked };
  if (!ok) Q.failed.add(Q.queue[0]);
  if (q.audio && (ok || q.build)) speak(q.audio, "ko");
}
function nextQuiz() {
  const Q = ui.quiz, i = Q.queue.shift();
  if (!Q.answer.ok) Q.queue.push(i); // on repose l'erreur plus tard (rappel actif)
  Q.answer = null; Q.build = { l: null, v: null };
  const q = Q.qs[Q.queue[0]];
  if (q?.autoplay) setTimeout(() => speak(q.audio, "ko"), 250);
}

// ---------- Module Hangul (§6) ----------
const LEADS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ", VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const BASIC_C = [..."ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ"], BASIC_V = [..."ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ"];
const composeHangul = (l, v) => String.fromCharCode(0xac00 + (LEADS.indexOf(l) * 21 + VOWELS.indexOf(v)) * 28);
function decomposeHangul(s) { const c = s.charCodeAt(0) - 0xac00; return [LEADS[Math.floor(c / 588)], VOWELS[Math.floor((c % 588) / 28)]]; }
const distractors = (pool, right, n = 3) => shuffle([right, ...shuffle(pool.filter((x) => x !== right)).slice(0, n)]);

function hangulQuestions(day) {
  const d = HANGUL_DAYS[day - 1];
  if (d.kind === "jamo") {
    // Distracteurs de la même famille (voyelles avec voyelles…) pour que l'audio reste sans ambiguïté
    const isV = (c) => BASIC_V.includes(c);
    const seenAll = HANGUL_DAYS.slice(0, day).filter((x) => x.kind === "jamo").flatMap((x) => x.items);
    return shuffle(d.items.flatMap(([ch, rom, say]) => { const seen = seenAll.filter((x) => isV(x[0]) === isV(ch)); return [
      { ask: "Quel son fait cette lettre ?", prompt: `<div class="big-char ko">${ch}</div>`, options: distractors([...new Set(seen.map((x) => x[1]))], rom), answer: rom, audio: say },
      ch === "ㅇ" ? null : { ask: "Quelle lettre entends-tu ?", prompt: `<button class="big-audio" data-act="say" data-text="${say}" data-lang="ko">🔊</button>`, options: distractors(seen.map((x) => x[0]), ch), answer: ch, optCls: "ko", audio: say, autoplay: true, after: `<span class="ko">${say}</span>` },
    ].filter(Boolean); }));
  }
  if (d.kind === "build") {
    return shuffle(d.items.map(([syl, rom]) => {
      const [l, v] = decomposeHangul(syl);
      return { build: true, target: syl, rom, target_l: l, target_v: v, leads: distractors(BASIC_C, l, 3), vowels: distractors(BASIC_V, v, 3), audio: syl };
    }));
  }
  return shuffle(d.items.map(([w, rom]) => ({ ask: "Comment se lit ce mot ?", prompt: `<div class="big-char ko">${w}</div>`, options: distractors(d.items.map((x) => x[1]), rom), answer: rom, audio: w })));
}

function viewHangul(day) {
  const d = HANGUL_DAYS[day - 1];
  const K = state.langs.ko;
  if (!d) return viewNotFound();
  if (day > 1 && !K.hangulDays[day - 1] && !K.hangulDone) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "sleepy")}<h2>Un jour à la fois</h2><p class="muted">Termine d'abord le jour ${day - 1}.</p><a class="btn" href="#/lang/ko/hangul/${day - 1}">Jour ${day - 1}</a></div></section>`;
  const key = `hangul-${day}`;
  if (ui.quiz?.key === key && ui.quiz.started) return viewQuiz("#/lang/ko/parcours", `Jour ${day}`);
  const intro = d.kind === "jamo"
    ? `<div class="alpha-grid">${d.items.map(([ch, rom, say]) => `<button class="alpha ko" data-act="say" data-text="${say}" data-lang="ko"><span>${ch}<small>${K.hangulDone ? "" : rom}</small></span></button>`).join("")}</div>
       <p class="muted"><small>Touche une lettre pour l'entendre (dans une syllabe : ${d.items[0][2]}).</small></p>`
    : d.kind === "build"
    ? `<p>Une syllabe coréenne = un bloc. Consonne à gauche ou en haut, voyelle à droite ou en dessous :</p>
       <div class="build-demo ko"><span>ㄴ + ㅏ = <b>나</b></span><span>ㅁ + ㅗ = <b>모</b></span><span>ㅅ + ㅜ = <b>수</b></span></div>
       <p class="muted"><small>ㅇ en début de syllabe est muet : 아 = « a ».</small></p>`
    : `<p>Une consonne peut se placer <b>sous</b> le bloc : c'est le 받침 (consonne finale).</p>
       <div class="build-demo ko"><span>하 + ㄴ = <b>한</b></span><span>구 + ㄱ = <b>국</b></span><span>바 + ㅂ = <b>밥</b></span></div>`;
  return `<section class="view lesson-shell">
    <div class="lesson-top"><a class="close" href="#/lang/ko/parcours" aria-label="Quitter">✕</a><div style="flex:1"><small class="muted">Hangul · jour ${day} / ${HANGUL_DAYS.length}</small><h1 style="font-size:1.4rem">${d.title}</h1></div></div>
    <div class="card" style="margin-top:18px">${intro}</div>
    <p class="muted"><small>💡 La romanisation n'est qu'une aide temporaire pendant ce module. Elle disparaîtra ensuite.</small></p>
    <div class="center"><button class="btn" data-act="start-hangul" data-day="${day}">Je m'entraîne</button></div>
  </section>`;
}

// ---------- Grammaire coréenne, un point à la fois (§6) ----------
function viewGrammar(id) {
  const i = KO_GRAMMAR.findIndex((g) => g.id === id);
  const g = KO_GRAMMAR[i];
  if (!g) return viewNotFound();
  const K = state.langs.ko;
  if (!K.hangulDone || (i > 0 && !K.grammarDone[KO_GRAMMAR[i - 1].id])) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "sleepy")}<h2>Un point à la fois</h2><p class="muted">Termine d'abord le point précédent : c'est comme ça qu'on passe le cap.</p><a class="btn" href="#/lang/ko/parcours">Parcours</a></div></section>`;
  const key = `gram-${id}`;
  if (ui.quiz?.key === key && ui.quiz.started) return viewQuiz("#/lang/ko/parcours", g.title);
  const ex = g.examples.map((src) => toSentence(src, "ko"));
  const frOf = (src) => TEXTS.ko.flatMap((t) => t.sentences).find(([s]) => s === src)?.[1] || "";
  return `<section class="view lesson-shell">
    <div class="lesson-top"><a class="close" href="#/lang/ko/parcours" aria-label="Quitter">✕</a><div style="flex:1"><small class="muted">Phase 2 · point ${i + 1} / ${KO_GRAMMAR.length}</small><h1 class="ko" style="font-size:1.4rem">${g.title}</h1></div></div>
    <div class="card" style="margin-top:18px"><p style="margin:0">${esc(g.explain)}</p></div>
    <h2 class="section-title">Écoute d'abord</h2>
    <div class="sentences">${ex.map((s, j) => `
      <div class="sentence"><div class="s-tools"><button data-act="say" data-text="${esc(s.text)}" data-lang="ko">🔊</button></div>
        <div class="s-body"><p class="s-text ko">${s.words.map((w) => esc(w.pre) + w.segs.map((x) => `<span class="w ${x.particle ? "pt" : ""}">${esc(x.surface)}</span>`).join("") + esc(w.post)).join(" ")}</p>
        <p class="s-fr">${esc(frOf(g.examples[j]))}</p></div></div>`).join("")}</div>
    <div class="center" style="margin-top:20px"><button class="btn" data-act="start-gram" data-id="${id}">Je m'entraîne</button></div>
  </section>`;
}

// ---------- Profil & réglages ----------
function viewProfile() {
  const S = state.settings;
  const since = account ? new Date(account.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
  return `
  <section class="view">
    <div class="card profile-head">
      <div class="avatar-wrap">
        <div class="avatar">${displayAvatar()}</div>
        ${account ? `<label class="avatar-edit" title="Changer la photo">📷<input type="file" id="avatar-file" accept="image/*" hidden /></label>` : ""}
      </div>
      <div style="flex:1;min-width:220px">
        <label class="muted" for="name" style="font-weight:800;font-size:.9rem">Ton prénom</label><br/>
        <input id="name" class="input" placeholder="Comment t'appelles-tu ?" value="${esc(state.name)}" maxlength="40" autocomplete="nickname" style="margin-top:6px;width:100%;max-width:320px" />
        ${account ? `
          <p class="muted acct-line">✉️ ${esc(account.email)} · Membre depuis le ${since}</p>
          <div class="wp-actions" style="margin-top:8px">${syncBadge()}
            ${account.avatar_url ? `<button class="mini" data-act="remove-photo">Retirer la photo</button>` : ""}
            <button class="mini" data-act="logout">Se déconnecter</button></div>`
        : serverOn ? `
          <div class="guest-cta">
            <p><b>Tu es en mode invité.</b> Ta progression n'existe que dans ce navigateur. Crée un compte pour la sauvegarder, la retrouver sur tous tes appareils et ajouter une photo.</p>
            <a class="btn small" href="#/inscription">Créer un compte</a> <a class="btn ghost small" href="#/connexion">J'ai déjà un compte</a>
          </div>`
        : `<p class="muted acct-line"><small>Mode invité : ta progression reste dans ce navigateur. Pour les comptes, lance le serveur (<code>node server.js</code>).</small></p>`}
      </div>
    </div>

    <h2 class="section-title">Mon activité</h2>
    ${activityCard()}

    <h2 class="section-title">${account?.avatar_url ? "Avatar (si tu retires ta photo)" : "Choisis ton avatar"}</h2>
    <div class="choice-row">${AVATARS.map((a) => `<button class="choice ${a === state.avatar ? "active" : ""}" data-act="avatar" data-v="${a}" style="font-size:1.6rem">${a}</button>`).join("")}</div>

    <h2 class="section-title">Objectif quotidien</h2>
    <div class="choice-row">${GOALS.map((g) => `<button class="choice ${g.min === state.goal ? "active" : ""}" data-act="goal" data-v="${g.min}">${g.label}<br/><span class="muted" style="font-size:.85rem">${g.min} min / jour</span></button>`).join("")}</div>

    <h2 class="section-title">Où j'en suis</h2>
    <div class="lang-grid">
      ${Object.entries(LANGUAGES).map(([id, l]) => {
        const L = state.langs[id], h = L.seconds / 3600;
        const cov = coverage(id, TEXTS[id].flatMap((t) => t.parsed));
        return `<div class="card">
          <h3>${l.flag} ${l.name}</h3>
          <div class="stat-grid" style="margin:12px 0">
            <div class="stat"><span class="ico">⏱️</span><div><b>${h.toFixed(1)} h</b><small>cumulées</small></div></div>
            <div class="stat"><span class="ico">📒</span><div><b>${knownCount(id)}</b><small>mots connus</small></div></div>
          </div>
          <p class="muted" style="margin:0 0 10px"><small>Tu comprends ~${pct(cov)} % des mots de nos ${id === "en" ? "dialogues" : "textes"}.</small></p>
          ${LEVEL_HOURS[id].steps.map(([lvl, hrs, txt]) => `<div class="lvl"><span>${lvl}</span><div class="bar"><span style="width:${Math.min(100, (h / hrs) * 100)}%"></span></div><small class="muted">${txt}</small></div>`).join("")}
        </div>`;
      }).join("")}
    </div>

    <h2 class="section-title">Réglages d'apprentissage</h2>
    <div class="card settings">
      <label>Rétention visée : <b>${pct(S.retention)} %</b>
        <input type="range" min="0.8" max="0.95" step="0.01" value="${S.retention}" data-set="retention" />
        <small class="muted">Plus haut = plus de révisions, moins d'oublis. 90 % est un bon équilibre.</small></label>
      <label>Nouvelles cartes par jour : <b>${S.newPerDay}</b>
        <input type="range" min="5" max="30" step="1" value="${S.newPerDay}" data-set="newPerDay" />
        <small class="muted">Au-delà de 15, les révisions s'accumulent vite.</small></label>
      <label>Mots transparents (anglais) comptés comme connus à : <b>${pct(S.cognateWeight)} %</b>
        <input type="range" min="0" max="1" step="0.1" value="${S.cognateWeight}" data-set="cognateWeight" /></label>
      <label class="row"><input type="checkbox" ${S.particleColors ? "checked" : ""} data-set="particleColors" /> Particules coréennes en couleur</label>
    </div>

    ${account ? `
    <h2 class="section-title">Sécurité du compte</h2>
    <div class="acct-grid">
      <form class="card form" data-form="password">
        <h3>Changer de mot de passe</h3>
        <input class="input" type="password" name="current" placeholder="Mot de passe actuel" autocomplete="current-password" required />
        <input class="input" type="password" name="next" placeholder="Nouveau (8 caractères min.)" autocomplete="new-password" minlength="8" required />
        <p class="form-err" hidden></p>
        <button class="btn small">Mettre à jour</button>
        <small class="muted">Tes autres appareils seront déconnectés.</small>
      </form>
      <div class="card">
        <h3>Appareils connectés</h3>
        <div id="sessions"><p class="muted">Chargement…</p></div>
        <button class="mini" data-act="logout-others" style="margin-top:10px">Déconnecter les autres appareils</button>
      </div>
    </div>` : ""}

    <div style="margin-top:36px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn ghost small" data-act="export">Exporter mes données (JSON)</button>
      <button class="btn ghost small" data-act="reset">Réinitialiser ma progression</button>
    </div>

    ${account ? `
    <details class="card danger">
      <summary><b>Supprimer mon compte</b></summary>
      <form class="form" data-form="delete" style="margin-top:12px">
        <p class="muted">Ton compte, ta photo et toute ta progression seront effacés définitivement du serveur.</p>
        <input class="input" type="password" name="password" placeholder="Confirme avec ton mot de passe" autocomplete="current-password" required />
        <p class="form-err" hidden></p>
        <button class="btn small danger-btn">Supprimer définitivement</button>
      </form>
    </details>` : ""}
  </section>`;
}

// Suivi d'activité : calendrier des 17 dernières semaines + totaux
function activityCard() {
  const H = state.history;
  const daySum = (d) => Object.values(H[d] || {}).reduce((a, x) => ({ sec: a.sec + x.sec, rev: a.rev + x.rev, prod: a.prod + x.prod, read: a.read + x.read }), { sec: 0, rev: 0, prod: 0, read: 0 });
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - 16 * 7); // lundi, 16 semaines avant
  const cells = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = today(d), x = daySum(key), min = Math.round(x.sec / 60);
    const lvl = !x.sec && !x.rev ? 0 : min < 5 ? 1 : min < 15 ? 2 : min < 30 ? 3 : 4;
    cells.push(`<span class="hm l${lvl}" title="${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} : ${min} min, ${x.rev} révision(s)"></span>`);
  }
  const days = Object.keys(H).filter((d) => daySum(d).sec || daySum(d).rev);
  const tot = Object.keys(H).reduce((a, d) => { const x = daySum(d); return { sec: a.sec + x.sec, prod: a.prod + x.prod, read: a.read + x.read }; }, { sec: 0, prod: 0, read: 0 });
  const week = Array.from({ length: 7 }, (_, i) => daySum(today(new Date(Date.now() - i * 864e5))).sec).reduce((a, b) => a + b, 0);
  return `<div class="card">
    <div class="stat-grid">
      <div class="stat"><span class="ico">📅</span><div><b>${days.length}</b><small>jours actifs</small></div></div>
      <div class="stat"><span class="ico">⏱️</span><div><b>${(tot.sec / 3600).toFixed(1)} h</b><small>au total</small></div></div>
      <div class="stat"><span class="ico">🗓️</span><div><b>${Math.round(week / 60)} min</b><small>ces 7 derniers jours</small></div></div>
      <div class="stat"><span class="ico">🧠</span><div><b>${state.logs.length}</b><small>révisions</small></div></div>
      <div class="stat"><span class="ico">💬</span><div><b>${tot.prod}</b><small>phrases produites</small></div></div>
      <div class="stat"><span class="ico">📖</span><div><b>${tot.read}</b><small>lectures</small></div></div>
    </div>
    <div class="heatmap" aria-label="Activité des 17 dernières semaines">${cells.join("")}</div>
    <div class="hm-legend muted"><small>Moins</small>${[0, 1, 2, 3, 4].map((l) => `<span class="hm l${l}"></span>`).join("")}<small>Plus</small></div>
  </div>`;
}

function prettyUA(ua) {
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const o = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${b}${o ? ` · ${o}` : ""}`;
}
async function loadSessions() {
  try {
    const { sessions } = await api("GET", "/api/sessions");
    const el = document.getElementById("sessions");
    if (el) el.innerHTML = sessions.map((x) => `<div class="sess"><b>${esc(prettyUA(x.user_agent))}</b>${x.current ? ' <span class="tag">cet appareil</span>' : ""}<br/><small class="muted">Vu le ${new Date(x.last_seen_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small></div>`).join("");
  } catch {}
}

// ---------- Connexion / inscription ----------
function viewAuth(mode) {
  if (!serverOn) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "sleepy")}<h2>Comptes indisponibles</h2>
    <p class="muted">Les comptes ont besoin du serveur Mochi. Lance <code>node server.js</code> puis ouvre <code>http://localhost:8000</code>.</p><a class="btn" href="#/">Continuer en invité</a></div></section>`;
  if (account) return `<section class="view lesson-shell"><div class="card empty">${displayAvatar("avatar")}<h2>Tu es connecté·e</h2><p class="muted">${esc(account.email)}</p><a class="btn" href="#/profil">Mon profil</a></div></section>`;
  const signup = mode === "inscription";
  const cards = state.cards.length, xp = Object.values(state.langs).reduce((a, L) => a + L.xp, 0);
  return `<section class="view lesson-shell">
    <div class="auth-head">${mochi("small")}<div><h1>${signup ? "Créer un compte" : "Content de te revoir !"}</h1>
      <p class="muted">${signup ? "Sauvegarde ta progression et retrouve-la partout." : "Connecte-toi pour retrouver ta progression."}</p></div></div>
    <form class="card form" data-form="${signup ? "signup" : "login"}">
      ${signup ? `<label>Prénom<input class="input" name="name" maxlength="40" autocomplete="nickname" value="${esc(state.name)}" placeholder="Comment t'appelles-tu ?" /></label>` : ""}
      <label>E-mail<input class="input" type="email" name="email" autocomplete="email" required /></label>
      <label>Mot de passe<input class="input" type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" ${signup ? 'minlength="8"' : ""} required />
        ${signup ? `<small class="muted">8 caractères minimum.</small>` : ""}</label>
      <p class="form-err" hidden></p>
      <button class="btn">${signup ? "Créer mon compte" : "Se connecter"}</button>
      ${signup && (cards || xp) ? `<p class="muted center"><small>✨ Ta progression actuelle (${cards} carte(s), ${xp} XP) sera rattachée à ton compte.</small></p>` : ""}
    </form>
    <p class="center muted">${signup ? `Déjà un compte ? <a class="lnk" href="#/connexion">Se connecter</a>` : `Pas encore de compte ? <a class="lnk" href="#/inscription">Créer un compte</a>`}</p>
  </section>`;
}

// ---------- Page publique « Pourquoi ça marche » (§10, §11) ----------
const SOURCES = [
  ["Méta-analyse sur la pratique de rappel espacée (29 études, g = 0,74)", "https://ifp.nyu.edu/?p=1511228"],
  ["Kim & Webb (2022), méta-analyse de l'effet d'espacement en L2, cité dans Serrano et al.", "https://pressto.amu.edu.pl/index.php/ssllt/article/download/35602/30649/76142"],
  ["FSRS : documentation Anki, présentation et code", "https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm", [["présentation", "https://concepts.dsebastien.net/concept/fsrs/"], ["code", "https://github.com/open-spaced-repetition"]]],
  ["Nation, I.S.P. (2006). How Large a Vocabulary Is Needed for Reading and Listening? Canadian Modern Language Review, 63(1)", "https://openaccess.wgtn.ac.nz/articles/journal_contribution/How_large_a_vocabulary_is_needed_for_reading_and_listening_/12552221/1"],
  ["Revue sur la couverture lexicale (95 % vs 98 %, besoins par type de contenu)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC8907927"],
  ["Conti, G. (2025). Pourquoi l'input doit être compréhensible à 95–98 %", "https://gianfrancoconti.com/2025/02/27/"],
  ["Li, S. (2010). The effectiveness of corrective feedback in SLA: A meta-analysis. Language Learning, 60(2), 309–365", "https://peeref.com/works/63503189"],
  ["Nguyen & Doan (2025). Beyond comprehensible input: a neuro-ecological critique of Krashen's hypothesis. Frontiers in Psychology", "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1636777/pdf"],
  ["González-Fernández & de la Viña (2025). The effectiveness of app-based and classroom-based instruction on L2 learning and motivation. Language Learning & Technology", "https://www.lltjournal.org/item-detail/1221/"],
  ["Whitworth (2024). Shadowing for pronunciation: a systematic review. Université d'Oxford", "https://ora.ox.ac.uk/objects/uuid:3104cae1-3a6b-400a-b173-de44384238d2"],
  ["Korea Times : classement FSI du coréen", "https://www.koreatimes.co.kr/www/nation/2023/11/113_240261.html"],
  ["Estimation des heures par niveau en coréen", "https://noun.town/blog/how-long-does-it-take-to-learn-korean/"],
  ["Coréen pour débutants (Hangul d'abord, 해요체, particules)", "https://www.languagebird.com/?p=12852"],
  ["Le « mur après le Hangul »", "https://www.hellotalk.com/en/blog/after-hangul-gap-in-korean-resources"],
  ["Niveaux de langue et honorifiques en coréen : Korea Herald", "https://www.koreaherald.com/article/3211101"],
  ["Revue critique des études internes de Duolingo", "https://callej.org/index.php/journal/article/download/419/347/1013"],
];
const WHY = [
  ["🧠", "On révise au bon moment, pas en boucle.", "Revoir une notion à intervalles espacés, en essayant de s'en souvenir avant de voir la réponse, est bien plus efficace que de la répéter d'affilée. Une méta-analyse de 29 études trouve un effet fort en faveur de cette méthode. On utilise FSRS, un algorithme open source qui apprend ton rythme d'oubli et planifie tes révisions juste avant que tu oublies.", [1, 2, 3]],
  ["📖", "Tu lis et écoutes des contenus que tu comprends presque entièrement.", "Pour apprendre en lisant ou en écoutant, il faut comprendre la grande majorité des mots (environ 95 %). Trop de mots inconnus et on décroche ; pas assez et on n'apprend rien de neuf. Le site calcule, pour chaque texte, quel pourcentage de mots tu connais déjà, et te propose ceux qui tombent dans la bonne zone.", [4, 5, 6]],
  ["💬", "Tu pratiques, et on te corrige intelligemment.", "Comprendre ne suffit pas : produire des phrases et recevoir un retour fait progresser. Les études montrent que reformuler correctement ta phrase est particulièrement efficace sur la durée. C'est ce que fait le site après chaque exercice d'écriture.", [7, 8]],
  ["🎧", "On travaille vraiment l'oreille.", "Les applis de langues aident bien pour le vocabulaire et la grammaire, mais moins pour l'écoute. C'est pour ça que tout le contenu a de l'audio, et qu'on propose le shadowing (répéter en même temps que le locuteur), qui améliore le rythme et l'intonation.", [9, 10]],
  ["🇰🇷", "Le coréen, dans le bon ordre.", "Le coréen demande du temps (environ 2 200 heures de cours selon l'institut de formation des diplomates américains pour un niveau professionnel). Mais son alphabet est l'un des plus simples au monde : la plupart des gens le lisent en une semaine environ. On commence donc par là, sans romanisation, puis on enchaîne avec le registre poli le plus utile au quotidien, et on t'accompagne dans la phase la plus difficile : particules, terminaisons et niveaux de politesse.", [11, 12, 13, 14]],
  ["🎯", "Des objectifs honnêtes.", "On te montre tes heures d'apprentissage et le nombre de mots que tu connais, pas seulement une série de jours. Tu sais où tu en es, et ce qu'il reste.", [5, 12]],
];
function viewWhy() {
  return `<section class="view why-page">
    <h1>Pourquoi notre méthode fonctionne</h1>
    <p class="lead">On n'a rien inventé : le site applique ce que la recherche en apprentissage des langues et en sciences cognitives a montré de plus solide. Voici les principes, et d'où ils viennent.</p>
    ${WHY.map(([ico, t, d, refs], i) => `
      <article class="card why-item">
        <div class="ico">${ico}</div>
        <div><h2>${i + 1}. ${t}</h2><p>${d}</p>
        <p class="refs">Sources : ${refs.map((n) => `<a href="#src-${n}" data-act="jump" data-n="${n}">[${n}]</a>`).join(" ")}</p></div>
      </article>`).join("")}
    <h2 class="section-title">Sources</h2>
    <ol class="sources">${SOURCES.map(([t, url, more], i) => `<li id="src-${i + 1}">${esc(t)} : <a href="${url}" target="_blank" rel="noopener">lien</a>${(more || []).map(([l, u]) => ` · <a href="${u}" target="_blank" rel="noopener">${l}</a>`).join("")}</li>`).join("")}</ol>
  </section>`;
}

function viewNotFound() {
  return `<section class="view card empty">${mochi("", "sleepy")}<h2>Oups, page introuvable</h2>
    <p class="muted">Mochi s'est perdu…</p><a class="btn" href="#/">Retour à l'accueil</a></section>`;
}

// ============================================================
//  ROUTEUR
// ============================================================
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const hashChanged = ui.lastHash !== location.hash;
  if (hashChanged && ui.lastHash !== null) stopAudio();
  let html, nav = "home", lang = null;

  if (parts.length === 0) html = viewHome();
  else if (parts[0] === "learn") {
    if (state.lastLang) return void (location.hash = `#/lang/${state.lastLang}`);
    html = viewHome(); nav = "learn";
  } else if (parts[0] === "profil") { html = viewProfile(); nav = "profil"; }
  else if (parts[0] === "connexion" || parts[0] === "inscription") { html = viewAuth(parts[0]); nav = "profil"; }
  else if (parts[0] === "pourquoi") { html = viewWhy(); nav = "pourquoi"; }
  else if (parts[0] === "lang" && LANGUAGES[parts[1]]) {
    lang = parts[1]; nav = "learn";
    state.lastLang = lang; state.langs[lang].started = true; save();
    const [, , tab, a] = parts;
    if (tab === "lire" && a) html = viewReader(lang, a);
    else if (tab === "revisions" && a === "go") { if (hashChanged) ui.review = null; html = viewReviewSession(lang); }
    else if (tab === "hangul" && isKo(lang)) html = viewHangul(Number(a) || 1);
    else if (tab === "grammaire" && isKo(lang)) html = viewGrammar(a);
    else html = viewLanguage(lang, TABS[lang].some(([k]) => k === tab) ? tab : "aujourdhui");
  } else html = viewNotFound();

  document.body.dataset.lang = lang || state.lastLang || "ko";
  document.body.classList.toggle("no-pt", !state.settings.particleColors);
  $app.innerHTML = html;
  if (!hashChanged) $app.querySelector(".view")?.classList.add("still");
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === nav));
  renderTopStats(lang);
  renderTopUser();
  if (account && parts[0] === "profil") loadSessions();
  if (hashChanged) window.scrollTo({ top: 0 });
  ui.lastHash = location.hash;
  const ans = document.getElementById("answer");
  if (ans) ans.focus();
}
const render = route;

function renderTopUser() {
  const el = document.getElementById("topbar-user");
  if (!el) return;
  if (account) { el.hidden = false; el.href = "#/profil"; el.innerHTML = `${displayAvatar("mini-avatar")}<span>${esc(account.name || "Profil")}</span>`; }
  else if (serverOn) { el.hidden = false; el.href = "#/connexion"; el.innerHTML = "<span>Se connecter</span>"; }
  else el.hidden = true;
}
function renderTopStats(lang) {
  const el = document.getElementById("topbar-stats");
  if (!lang) { el.innerHTML = ""; return; }
  const L = state.langs[lang];
  const n = reviewCount(lang);
  el.innerHTML = `<span class="chip">${LANGUAGES[lang].flag}</span>
    <a class="chip" href="#/lang/${lang}/revisions" title="Cartes à réviser">🧠 ${n}</a>
    <span class="chip" title="Sessions complètes d'affilée">🔥 ${currentStreak(L)}</span>`;
}

// ============================================================
//  INTERACTIONS
// ============================================================
async function playAll(lang) {
  const R = ui.reader, t = textById(lang, R.id);
  R.playing = true; render();
  for (let i = 0; i < t.parsed.length && R.playing; i++) {
    R.cur = i; render();
    document.getElementById(`s-${i}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    await speak(t.parsed[i].text, lang);
    await new Promise((r) => setTimeout(r, 350));
  }
  R.playing = false; R.cur = -1; render();
}

async function recordShadow(lang, si) {
  const t = textById(lang, ui.reader.id);
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return toast("L'enregistrement n'est pas disponible sur ce navigateur");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast("Micro refusé 🎙️"); }
  const rec = new MediaRecorder(stream), chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    stream.getTracks().forEach((tr) => tr.stop());
    const key = `${ui.reader.id}:${si}`;
    if (ui.recordings[key]) URL.revokeObjectURL(ui.recordings[key]);
    ui.recordings[key] = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
    render();
  };
  toast("🎙️ Répète en même temps !");
  rec.start();
  await speak(t.parsed[si].text, lang);
  setTimeout(() => rec.stop(), 900);
}
function playRec(key) { return new Promise((r) => { const a = new Audio(ui.recordings[key]); a.onended = a.onerror = r; a.play().catch(r); }); }

const actions = {
  say: (el) => speak(el.dataset.text, el.dataset.lang),
  locked: (el, e) => { e.preventDefault(); toast("🔒 Termine d'abord l'étape précédente"); },
  "skip-hangul": () => { if (confirm("Tu lis déjà le Hangul ? Le module sera marqué terminé et la romanisation disparaîtra.")) { state.langs.ko.hangulDone = true; save(); render(); } },
  register: (el) => { ui.registerWho = el.dataset.k; render(); },

  // Lecteur
  word: (el) => { const s = { s: +el.dataset.s, w: +el.dataset.w, g: +el.dataset.g }; ui.reader.sel = s; render(); },
  unsel: () => { ui.reader.sel = null; render(); },
  capture: () => {
    const lang = currentLang(), R = ui.reader, t = textById(lang, R.id);
    if (captureSeg(lang, t.parsed[R.sel.s], R.sel.w, R.sel.g, t.id)) toast("Ajouté aux révisions ✓");
    render();
  },
  "capture-all": () => {
    const lang = currentLang(), t = textById(lang, ui.reader.id);
    let n = 0;
    for (const { si, wi, gi } of unknownLemmas(lang, t.parsed).values()) if (captureSeg(lang, t.parsed[si], wi, gi, t.id)) n++;
    ui.reader.glossOpen = true; toast(`${n} carte(s) ajoutée(s) ✓`); render();
  },
  "mark-known": () => {
    const lang = currentLang(), R = ui.reader, seg = textById(lang, R.id).parsed[R.sel.s].words[R.sel.w].segs[R.sel.g];
    seg.lemmas.forEach((l) => { state.langs[lang].known[l] = true; delete state.langs[lang].unknown[l]; });
    save(); render();
  },
  "mark-unknown": () => {
    const lang = currentLang(), R = ui.reader, seg = textById(lang, R.id).parsed[R.sel.s].words[R.sel.w].segs[R.sel.g];
    seg.lemmas.forEach((l) => { delete state.langs[lang].known[l]; state.langs[lang].unknown[l] = true; });
    save(); render();
  },
  "play-all": () => playAll(currentLang()),
  stop: () => { stopAudio(); render(); },
  "play-s": (el) => { const lang = currentLang(); speak(textById(lang, ui.reader.id).parsed[+el.dataset.s].text, lang); },
  fr: (el) => { const i = +el.dataset.s; ui.reader.fr[i] = !ui.reader.fr[i]; render(); },
  speed: (el) => { state.settings.speed = +el.dataset.v; save(); render(); },
  "toggle-hide": () => { ui.reader.hide = !ui.reader.hide; render(); },
  "toggle-shadow": () => { ui.reader.shadow = !ui.reader.shadow; render(); },
  "toggle-particles": () => { state.settings.particleColors = !state.settings.particleColors; save(); render(); },
  shadow: (el) => recordShadow(currentLang(), +el.dataset.s),
  "play-rec": (el) => playRec(`${ui.reader.id}:${el.dataset.s}`),
  "play-both": async (el) => { const lang = currentLang(); await speak(textById(lang, ui.reader.id).parsed[+el.dataset.s].text, lang); await playRec(`${ui.reader.id}:${el.dataset.s}`); },
  "finish-read": () => {
    const lang = currentLang(), L = state.langs[lang], id = ui.reader.id;
    if (!L.readTexts[id]) { L.readTexts[id] = true; L.xp += 5; }
    track(lang, "read");
    bumpSession(lang, "input");
    stopAudio();
    location.hash = reviewCount(lang) ? `#/lang/${lang}/revisions/go` : `#/lang/${lang}/produire`;
  },

  // Révisions
  reveal: () => {
    const R = ui.review, a = document.getElementById("answer");
    if (a) R.typed = a.value.trim();
    R.revealed = true; render();
  },
  rate: (el) => {
    const R = ui.review, id = R.queue.shift();
    const card = rateCard(id, +el.dataset.g);
    if (card.due - new Date() < 20 * 60 * 1000) R.queue.push(id); // réapparaît dans la même séance
    else R.done++;
    R.revealed = false; R.typed = "";
    render();
    const next = state.cards.find((c) => c.id === R.queue[0]);
    if (next?.type === "listen") speak(next.context, next.lang);
  },

  // Production
  "check-prod": () => {
    const text = document.getElementById("prod-text").value.trim();
    if (!text) return toast("Écris d'abord une phrase ✍️");
    checkProduction(currentLang(), text); render();
  },
  "next-ex": () => { const lang = currentLang(); ui.prod = { lang, ex: pickExercise(lang, ui.prod?.ex.id), text: "", result: null, why: false }; render(); },
  why: () => { ui.prod.why = !ui.prod.why; render(); },

  // Mots
  "toggle-known": (el) => { const L = state.langs[currentLang()]; L.known[el.dataset.l] = true; delete L.unknown[el.dataset.l]; save(); render(); },
  "toggle-unknown": (el) => { const L = state.langs[currentLang()]; delete L.known[el.dataset.l]; L.unknown[el.dataset.l] = true; save(); render(); },
  "add-frequent": () => {
    const lang = currentLang(), stab = stabilityMap(lang);
    let n = 0;
    for (const l of Object.keys(LEXICON[lang])) {
      if (n >= 5) break;
      if (lemmaStatus(lang, l, stab) !== "new") continue;
      const ctx = findContext(lang, l);
      if (ctx && captureSeg(lang, ctx.s, ctx.w, ctx.g, ctx.source)) n++;
    }
    save(); toast(`${n} mot(s) ajouté(s), chacun avec sa phrase ✓`); render();
  },
  "add-faux": () => {
    let n = 0;
    for (const f of FAUX_AMIS) {
      const i = f.s.toLowerCase().indexOf(f.lemma);
      if (i < 0) continue;
      if (addCard("en", { lemma: f.lemma, before: f.s.slice(0, i), surface: f.s.slice(i, i + f.lemma.length), after: f.s.slice(i + f.lemma.length), contextFr: f.sfr, fr: f.fr, source: "faux-amis", note: "Faux ami !" })) n++;
    }
    save(); toast(`${n} faux ami(s) ajouté(s) ✓`); render();
  },

  // Oreille
  "ear-play": () => {
    const G = ui.ear, pair = EAR[G.lang].pairs[G.i];
    if (!G.target) G.target = pair.items[Math.floor(Math.random() * pair.items.length)];
    speak(G.target, G.lang, 0.85); render();
  },
  "ear-pick": (el) => { const G = ui.ear; if (G.picked) return; G.picked = el.dataset.w; G.n++; if (G.picked === G.target) G.score++; render(); },
  "ear-next": () => { const G = ui.ear, n = EAR[G.lang].pairs.length; Object.assign(G, { i: (G.i + 1 + Math.floor(Math.random() * (n - 1))) % n, target: null, picked: null }); render(); },

  // Quiz
  "quiz-pick": (el) => { const q = ui.quiz.qs[ui.quiz.queue[0]]; answerQuiz(el.dataset.o === q.answer, el.dataset.o); render(); },
  "quiz-next": () => { nextQuiz(); render(); },
  "build-l": (el) => { ui.quiz.build.l = el.dataset.x; render(); },
  "build-v": (el) => { ui.quiz.build.v = el.dataset.x; render(); },
  "build-check": () => { const Q = ui.quiz, q = Q.qs[Q.queue[0]]; answerQuiz(composeHangul(Q.build.l, Q.build.v) === q.target); render(); },
  "start-hangul": (el) => {
    const day = +el.dataset.day;
    startQuiz(`hangul-${day}`, hangulQuestions(day), () => {
      const K = state.langs.ko;
      if (!K.hangulDays[day]) { K.hangulDays[day] = true; K.xp += 10; }
      if (day === HANGUL_DAYS.length && !K.hangulDone) { K.hangulDone = true; toast("🎉 Hangul terminé ! La romanisation disparaît."); }
      save();
    });
    ui.quiz.started = true;
    const q = ui.quiz.qs[0]; if (q.autoplay || q.build) setTimeout(() => speak(q.audio, "ko"), 250);
    render();
  },
  "start-gram": (el) => {
    const g = KO_GRAMMAR.find((x) => x.id === el.dataset.id);
    startQuiz(`gram-${g.id}`, shuffle(g.quiz.map((q) => ({ ask: esc(q.fr), prompt: `<p class="q-sentence ko">${esc(q.q).replace("___", '<span class="blank">＿＿</span>')}</p>`, options: shuffle(q.o), answer: q.a, optCls: "ko", after: `<span class="ko">${esc(q.q.replace("___", q.a).replace(/^\(.*?\)\s*/, ""))}</span>` }))), () => {
      const K = state.langs.ko;
      if (!K.grammarDone[g.id]) { K.grammarDone[g.id] = true; K.xp += 10; g.lemmas.forEach((l) => (K.known[l] = true)); }
      save();
    });
    ui.quiz.started = true; render();
  },

  // Profil
  avatar: (el) => {
    state.avatar = el.dataset.v; save(); render();
    if (account) api("PATCH", "/api/me", { avatar_emoji: state.avatar }).then((d) => { account = d.user; }).catch((e) => toast(e.message));
  },
  "remove-photo": async () => {
    try { account = (await api("DELETE", "/api/avatar")).user; render(); toast("Photo retirée"); } catch (e) { toast(e.message); }
  },
  logout: async () => {
    await pushState();
    try { await api("POST", "/api/logout"); } catch {}
    account = null; state = loadState(); sync.status = "idle";
    location.hash = "#/"; route(); toast("À bientôt ! 👋");
  },
  "logout-others": async () => {
    try { await api("POST", "/api/logout-others"); toast("Autres appareils déconnectés ✓"); loadSessions(); } catch (e) { toast(e.message); }
  },
  goal: (el) => { state.goal = +el.dataset.v; save(); render(); toast("Objectif mis à jour 🎯"); },
  export: () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ cards: state.cards, review_logs: state.logs }, null, 2)], { type: "application/json" }));
    a.download = `mochi-${today()}.json`; a.click();
  },
  reset: () => { if (confirm("Effacer toute ta progression ?")) { state = defaultState(); save(); location.hash = "#/"; toast("Progression réinitialisée"); } },
  jump: (el, e) => { e.preventDefault(); document.getElementById(`src-${el.dataset.n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); },
};

$app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || !el.dataset.act || !actions[el.dataset.act]) return;
  if (el.tagName === "BUTTON" || el.dataset.act === "locked" || el.dataset.act === "jump") e.preventDefault?.();
  actions[el.dataset.act](el, e);
});
let nameTimer;
$app.addEventListener("input", (e) => {
  if (e.target.id === "name") {
    state.name = e.target.value.trim(); save();
    if (account) { clearTimeout(nameTimer); nameTimer = setTimeout(() => api("PATCH", "/api/me", { name: state.name }).then((d) => { account = d.user; renderTopUser(); }).catch((er) => toast(er.message)), 600); }
  }
  const k = e.target.dataset.set;
  if (k) {
    const v = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value);
    state.settings[k] = v; save();
    const b = e.target.closest("label")?.querySelector("b");
    if (b) b.textContent = k === "newPerDay" ? v : `${pct(v)} %`;
  }
});
// Photo de profil : recadrée en carré 256 px dans le navigateur avant l'envoi
async function resizeImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choisis une image.");
  if (file.size > 20e6) throw new Error("Image trop lourde (20 Mo max).");
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  const webp = await new Promise((r) => c.toBlob(r, "image/webp", 0.85));
  return webp?.type === "image/webp" ? webp : new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
}
$app.addEventListener("change", async (e) => {
  if (e.target.id !== "avatar-file" || !e.target.files[0]) return;
  try {
    toast("Envoi de la photo…");
    const blob = await resizeImage(e.target.files[0]);
    account = (await api("POST", "/api/avatar", undefined, blob)).user;
    render(); toast("Photo mise à jour 📸");
  } catch (er) { toast(er.message || "Impossible de lire cette image"); }
});

// Formulaires : connexion, inscription, mot de passe, suppression
$app.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const err = form.querySelector(".form-err");
  const btn = form.querySelector("button");
  err.hidden = true; btn.disabled = true;
  try {
    const kind = form.dataset.form;
    if (kind === "signup") {
      await applyAuth(await api("POST", "/api/signup", { email: f.email.trim(), password: f.password, name: f.name }), { isNew: true });
      location.hash = "#/profil"; toast("Compte créé, bienvenue ! 🎉");
    } else if (kind === "login") {
      await applyAuth(await api("POST", "/api/login", { email: f.email.trim(), password: f.password }));
      location.hash = state.lastLang ? `#/lang/${state.lastLang}` : "#/"; toast(`Re-bonjour${account.name ? ", " + account.name : ""} ! 🍡`);
    } else if (kind === "password") {
      await api("POST", "/api/password", { current: f.current, next: f.next });
      form.reset(); toast("Mot de passe mis à jour ✓"); loadSessions();
    } else if (kind === "delete") {
      if (!confirm("Supprimer définitivement ton compte et toute ta progression ?")) return;
      const id = account.id;
      await api("DELETE", "/api/me", { password: f.password });
      try { localStorage.removeItem(`mochi-user-${id}`); } catch {}
      account = null; state = loadState(); location.hash = "#/"; route(); toast("Compte supprimé");
    }
  } catch (er) { err.textContent = er.message; err.hidden = false; }
  finally { btn.disabled = false; }
});

$app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "answer") { e.preventDefault(); actions.reveal(); }
  if (e.target.id === "prod-text" && !e.shiftKey) { e.preventDefault(); actions["check-prod"](); }
});
document.addEventListener("keydown", (e) => {
  if (!ui.review || !location.hash.endsWith("/revisions/go") || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === " " && !ui.review.revealed) { e.preventDefault(); actions.reveal(); }
  else if (ui.review.revealed && ["1", "2", "3", "4"].includes(e.key)) actions.rate({ dataset: { g: e.key } });
});

window.addEventListener("hashchange", route);

// Démarrage : si le serveur répond et qu'une session existe, on charge le compte
(async function boot() {
  try {
    const r = await fetch("/api/me", { credentials: "same-origin" });
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
      serverOn = true;
      const d = await r.json();
      if (d.user) {
        account = d.user;
        state = d.state ? normalizeState(d.state) : loadState(storeKey());
        state.name = account.name; state.avatar = account.avatar_emoji;
      }
    }
  } catch {}
  route();
})();
