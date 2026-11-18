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

// Langues en préparation : montrées sur l'accueil, mais verrouillées (pas dans LANGUAGES,
// pour qu'aucune autre partie du site ne les traite comme des langues actives)
const COMING_SOON = [
  { id: "zh", name: "Chinois", native: "中文", flag: "🇨🇳", hello: "你好！", lang: "zh" },
  { id: "fr", name: "Français", native: "Français", flag: "🇫🇷", hello: "Bonjour !", lang: "fr" },
  { id: "ja", name: "Japonais", native: "日本語", flag: "🇯🇵", hello: "こんにちは！", lang: "ja" },
  { id: "it", name: "Italien", native: "Italiano", flag: "🇮🇹", hello: "Ciao!", lang: "it" },
];

const GOALS = [{ min: 5, label: "Tranquille" }, { min: 10, label: "Régulier" }, { min: 15, label: "Sérieux" }, { min: 20, label: "Intense" }];
const AVATARS = ["🐰", "🐱", "🐻", "🐼", "🦊", "🐥", "🐸", "🐨"];
const KNOWN_STABILITY = 7; // jours : au-delà, un mot en révision compte comme « connu » (§3)
const HAS_FSRS = typeof FSRS !== "undefined";

// ---------- État (sauvegardé dans le navigateur) ----------
const STORE_KEY = "mochi-state-v2";
const langDefaults = () => ({
  xp: 0, streak: 0, lastStreakDay: null, seconds: 0, todayDate: null, todaySec: 0, started: false,
  known: {}, unknown: {}, readTexts: {}, fullDays: {}, catchUp: false, session: {}, introduced: { date: null, count: 0 },
  hangulDone: false, hangulDays: {}, grammarDone: {}, grammarMiss: {}, earStats: {}, errors: {}, prodDone: {}, quests: {}, books: {},
});
const defaultState = () => ({
  name: "", avatar: "🐰", goal: 10, lastLang: null,
  settings: { retention: 0.9, newPerDay: 12, cognateWeight: 0.8, particleColors: true, speed: 1, textScale: 1, zen: false, theme: "auto", voices: {}, themes: [], look: {}, lookSeen: [], tourDone: false },
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

// ============================================================
//  SYNCHRONISATION PAR ÉVÉNEMENTS (plusieurs appareils, sans perte)
//  L'état est découpé en quatre familles, chacune avec sa règle de fusion :
//   - kv       : réglages et petites valeurs → la modification la plus récente gagne, clé par clé
//   - cartes   : la version la plus récente gagne, carte par carte
//   - révisions: ajout seul (jamais écrasées)
//   - compteurs: XP, temps, activité → on envoie des deltas, le serveur additionne
//  « snap » = ce que le serveur connaît déjà ; on n'envoie que la différence.
// ============================================================
const MAP_KEYS = ["known", "unknown", "readTexts", "fullDays", "hangulDays", "grammarDone", "grammarMiss", "earStats", "errors", "prodDone", "quests", "books"];
const CTR_KEYS = ["xp", "seconds"];
const sync = { status: "idle", timer: null, running: false, again: false, meta: null };

function flatten(st) {
  const kv = { goal: st.goal, lastLang: st.lastLang }, ctr = {};
  for (const [k, v] of Object.entries(st.settings)) kv[`settings.${k}`] = v;
  for (const [lang, L] of Object.entries(st.langs)) for (const [k, v] of Object.entries(L)) {
    if (CTR_KEYS.includes(k)) ctr[`${k}.${lang}`] = v;
    else if (MAP_KEYS.includes(k)) for (const [mk, mv] of Object.entries(v)) kv[`langs.${lang}.${k}.${mk}`] = mv;
    else kv[`langs.${lang}.${k}`] = v;
  }
  for (const [day, langs] of Object.entries(st.history)) for (const [lang, x] of Object.entries(langs)) for (const [f, n] of Object.entries(x)) ctr[`h.${day}.${lang}.${f}`] = n;
  return { kv, ctr };
}
function setKv(st, key, v) {
  const p = key.split(".");
  if (p[0] === "settings") { if (v !== null) st.settings[p[1]] = v; return; }
  if (p[0] === "langs") {
    const L = st.langs[p[1]];
    if (!L) return;
    if (MAP_KEYS.includes(p[2])) { const mk = p.slice(3).join("."); if (v === null) delete L[p[2]][mk]; else L[p[2]][mk] = v; }
    else if (v !== null) L[p[2]] = v;
    return;
  }
  if ((p[0] === "goal" || p[0] === "lastLang") && v !== null) st[p[0]] = v;
}
function setCounter(st, key, v) {
  const p = key.split(".");
  if (p[0] === "h") { const x = ((st.history[p[1]] ||= {})[p[2]] ||= { sec: 0, rev: 0, prod: 0, read: 0 }); x[p[3]] = v; }
  else if (CTR_KEYS.includes(p[0]) && st.langs[p[1]]) st.langs[p[1]][p[0]] = v;
}
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
const hv = (v) => fnv(JSON.stringify(v ?? null));
const NULL_H = hv(null);
const emptySnap = () => ({ kv: {}, cards: {}, logs: {}, ctr: {} });
function snapOf(st) {
  const f = flatten(st), s = emptySnap();
  for (const [k, v] of Object.entries(f.kv)) s.kv[k] = hv(v);
  for (const c of st.cards) s.cards[c.id] = hv(c);
  for (const l of st.logs) s.logs[l.id] = 1;
  s.ctr = { ...f.ctr };
  return s;
}

// Différence entre l'état local et ce que le serveur connaît
function computeDiff(st, snap, times) {
  const f = flatten(st), now = Date.now(), d = { kv: [], cards: [], logs: [], counters: [] };
  for (const k of new Set([...Object.keys(f.kv), ...Object.keys(snap.kv)])) {
    const h = hv(f.kv[k]);
    if (h !== (snap.kv[k] ?? NULL_H)) d.kv.push({ k, v: f.kv[k] ?? null, t: times[k] || now });
  }
  const byId = new Map(st.cards.map((c) => [c.id, c]));
  for (const id of new Set([...byId.keys(), ...Object.keys(snap.cards)])) {
    const c = byId.get(id) ?? null;
    if (hv(c) !== (snap.cards[id] ?? NULL_H)) d.cards.push({ id, data: c, t: times[`card:${id}`] || now });
  }
  for (const l of st.logs) if (!snap.logs[l.id]) d.logs.push({ id: l.id, card_id: l.card_id, data: l });
  for (const k of new Set([...Object.keys(f.ctr), ...Object.keys(snap.ctr)])) {
    const delta = (f.ctr[k] || 0) - (snap.ctr[k] || 0);
    if (delta) d.counters.push({ k, d: delta });
  }
  return { d, f };
}
const diffSize = (d) => d.kv.length + d.cards.length + d.logs.length + d.counters.length;

// Mémorise l'heure de chaque modification locale (pour « la plus récente gagne »)
let lastHashes = null;
function markChanges() {
  const M = sync.meta;
  if (!M) return;
  const f = flatten(state), now = Date.now(), cur = {};
  for (const [k, v] of Object.entries(f.kv)) cur[k] = hv(v);
  for (const c of state.cards) cur[`card:${c.id}`] = hv(c);
  if (lastHashes) for (const k of new Set([...Object.keys(cur), ...Object.keys(lastHashes)])) if (cur[k] !== lastHashes[k]) M.times[k] = now;
  lastHashes = cur;
}

const metaKey = () => `mochi-sync-${account.id}`;
function loadMeta() { try { return JSON.parse(localStorage.getItem(metaKey())); } catch { return null; } }
function saveMeta() { try { localStorage.setItem(metaKey(), JSON.stringify(sync.meta)); } catch {} }

function save() {
  try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch {}
  if (account && sync.meta) { markChanges(); saveMeta(); scheduleSync(5000); }
}
// Regroupe les envois (pas de report infini pendant une longue séance de révisions)
function scheduleSync(ms) {
  if (sync.status !== "error" && sync.status !== "saving") sync.status = "pending";
  if (!sync.timer) sync.timer = setTimeout(() => { sync.timer = null; syncNow(); }, ms);
}

async function syncNow() {
  if (!account || !sync.meta) return;
  if (sync.running) { sync.again = true; return; }
  clearTimeout(sync.timer); sync.timer = null;
  sync.running = true; sync.status = "saving"; updateSyncBadge();
  const M = sync.meta;
  const { d, f: sent } = computeDiff(state, M.snap, M.times);
  // Ce que le serveur connaîtra après cet envoi
  const sentSnap = { kv: { ...M.snap.kv }, cards: { ...M.snap.cards }, logs: { ...M.snap.logs }, ctr: { ...M.snap.ctr } };
  for (const x of d.kv) sentSnap.kv[x.k] = hv(x.v);
  for (const x of d.cards) sentSnap.cards[x.id] = hv(x.data);
  for (const x of d.logs) sentSnap.logs[x.id] = 1;
  for (const x of d.counters) sentSnap.ctr[x.k] = sent.ctr[x.k] || 0;
  try {
    const res = await api("POST", "/api/sync", { cursor: M.cursor, epoch: M.epoch, reset: !!M.reset, ...d });
    applyServer(res, res.epochChanged ? null : sentSnap);
    sync.status = "saved";
  } catch (e) {
    sync.status = "error";
    if (e.status === 401) { toast("Session expirée : reconnecte-toi"); signOutLocal(); route(); }
  } finally {
    sync.running = false;
    updateSyncBadge();
  }
  if (account && (sync.again || diffSize(computeDiff(state, sync.meta.snap, sync.meta.times).d))) { sync.again = false; scheduleSync(1000); }
}

// Applique les changements venus du serveur, sans écraser ce qui a été modifié
// localement pendant la requête.
function applyServer(res, sentSnap) {
  const M = sync.meta;
  let changedUI = false;
  if (!sentSnap) {
    // Compte réinitialisé depuis un autre appareil : on repart de l'état du serveur
    state = defaultState(); state.name = account.name; state.avatar = account.avatar_emoji;
    sentSnap = snapOf(state); M.times = {};
    changedUI = true;
  }
  const now = flatten(state);
  const snap = sentSnap;
  for (const { k, v } of res.kv) {
    if (hv(now.kv[k]) !== (snap.kv[k] ?? NULL_H)) continue; // modifié ici entre-temps : notre version partira au prochain envoi
    if (hv(now.kv[k]) !== hv(v)) { setKv(state, k, v); changedUI = true; }
    snap.kv[k] = hv(v);
  }
  const byId = new Map(state.cards.map((c, i) => [c.id, i]));
  for (const { id, data } of res.cards) {
    const i = byId.get(id), local = i === undefined ? null : state.cards[i];
    if (hv(local) !== (snap.cards[id] ?? NULL_H)) continue;
    if (hv(local) !== hv(data)) {
      changedUI = true;
      if (data === null) { if (i !== undefined) state.cards.splice(i, 1); byId.clear(); state.cards.forEach((c, j) => byId.set(c.id, j)); }
      else if (i === undefined) { state.cards.push(data); byId.set(id, state.cards.length - 1); }
      else state.cards[i] = data;
    }
    snap.cards[id] = hv(data);
  }
  const haveLogs = new Set(state.logs.map((l) => l.id));
  for (const { id, data } of res.logs) { if (!haveLogs.has(id)) { state.logs.push(data); changedUI = true; } snap.logs[id] = 1; }
  if (res.logs.length) state.logs.sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
  for (const { k, v } of res.counters) {
    const localDelta = (now.ctr[k] || 0) - (snap.ctr[k] || 0); // progrès local pas encore envoyé
    if ((now.ctr[k] || 0) !== v + localDelta) changedUI = true;
    setCounter(state, k, v + localDelta);
    snap.ctr[k] = v;
  }
  M.snap = snap; M.cursor = res.cursor; M.epoch = res.epoch; M.reset = false;
  // On oublie les heures des clés désormais synchronisées
  const left = computeDiff(state, snap, {}).d;
  const pending = new Set([...left.kv.map((x) => x.k), ...left.cards.map((x) => `card:${x.id}`)]);
  for (const k of Object.keys(M.times)) if (!pending.has(k)) delete M.times[k];
  lastHashes = null; markChanges();
  try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch {}
  saveMeta();
  if (changedUI && !document.querySelector?.("input:focus, textarea:focus")) route();
}

// Prépare l'appareil pour un compte : reprend sa progression locale, migre l'ancien
// format, ou part d'un état vide qui sera rempli par le serveur.
function attachAccount(user, { legacy = null, adoptGuest = false } = {}) {
  account = user;
  const meta = loadMeta();
  if (meta && !adoptGuest) { sync.meta = meta; state = loadState(storeKey()); }
  else if (adoptGuest) { sync.meta = { cursor: 0, epoch: 0, snap: emptySnap(), times: {} }; } // garde l'état invité : tout sera envoyé
  else if (legacy) { state = normalizeState(legacy); sync.meta = { cursor: 0, epoch: 0, snap: emptySnap(), times: {} }; }
  else { state = defaultState(); sync.meta = { cursor: 0, epoch: 0, snap: snapOf(state), times: {} }; }
  state.name = account.name; state.avatar = account.avatar_emoji;
  lastHashes = null; markChanges();
  try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch {}
  saveMeta();
}
function signOutLocal({ forget = false } = {}) {
  if (account && forget) { try { localStorage.removeItem(storeKey()); localStorage.removeItem(metaKey()); } catch {} }
  clearTimeout(sync.timer); sync.timer = null;
  account = null; sync.meta = null; sync.status = "idle"; lastHashes = null;
  rememberAccount(null);
  state = loadState();
}

function updateSyncBadge() {
  const el = document.getElementById("sync-badge");
  if (el) el.outerHTML = syncBadge();
}
function syncBadge() {
  const t = { idle: "☁️ Synchronisé", saved: "☁️ Synchronisé", pending: "⏳ Modifications en attente", saving: "⏳ Synchronisation…", error: "⚠️ Hors ligne : réessai bientôt" }[sync.status];
  return `<span class="tag" id="sync-badge">${t}</span>`;
}
document.addEventListener("visibilitychange", () => { if (account && (document.hidden || sync.status !== "saving")) syncNow(); });
addEventListener("online", () => syncNow());
setInterval(() => { if (account && !document.hidden) syncNow(); }, 60000); // récupère aussi les changements des autres appareils

async function applyAuth(data, { isNew } = {}) {
  if (data.features) features = data.features;
  attachAccount(data.user, { legacy: data.legacy_state, adoptGuest: isNew });
  rememberAccount({ user: data.user, features });
  if (isNew && state.avatar !== account.avatar_emoji) {
    try { account = (await api("PATCH", "/api/me", { avatar_emoji: state.avatar })).user; } catch {}
  }
  await syncNow();
}
const displayAvatar = (cls = "") => (account?.avatar_url
  ? `<img class="avatar-img ${cls}" src="${esc(account.avatar_url)}" alt="Photo de profil" />`
  : `<span class="${cls}">${state.avatar}</span>`);

// Suivi d'activité par jour
function track(lang, key, n = 1) {
  const day = (state.history[today()] ||= {});
  const x = (day[lang] ||= { sec: 0, rev: 0, prod: 0, read: 0, ex: 0 });
  x[key] ||= 0;
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
const koCls = (lang) => (isKo(lang) ? "ko" : "en");
// Fonction d'une particule coréenne, pour la couleur et le soulignement (charte §5)
const PARTICLE_FN = { 은: "topic", 는: "topic", 이: "subject", 가: "subject", 을: "object", 를: "object", 에: "place", 에서: "place", 에게: "place", 한테: "place", 께: "place" };
const PARTICLE_LABEL = { topic: "particule de thème", subject: "particule de sujet", object: "particule d'objet", place: "particule de lieu, de temps ou de destinataire", other: "particule" };
// Réglages d'affichage (charte §6, §14) : taille du texte et lecture zen
function applyDisplay() {
  document.body.classList.toggle("no-pt", !state.settings.particleColors);
  document.body.classList.toggle("zen", !!state.settings.zen);
  document.documentElement.style.setProperty("--text-scale", String(state.settings.textScale || 1));
  const th = state.settings.theme;
  if (th === "light" || th === "dark") document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
}
const particleFn = (p) => { const f = PARTICLE_FN[p] || "other"; return [f, PARTICLE_LABEL[f]]; };

// Mochi, la mascotte (charte §8) : un galet rond un peu plus large que haut, visage
// dans le tiers inférieur, aplats sans dégradé. Jamais triste ni en colère.
// Humeurs : happy (contente), focused (concentrée), proud (fière), curious (curieuse),
// thinking (pensive), sleepy (endormie), surprised (surprise).
const MOCHI_FACES = {
  happy: '<path d="M52 79 q5 -6 10 0 M78 79 q5 -6 10 0" class="mo-line"/><path d="M65 86 q5 4 10 0" class="mo-line"/>',
  focused: '<circle cx="57" cy="79" r="3.6" class="mo-ink"/><circle cx="83" cy="79" r="3.6" class="mo-ink"/><path d="M66 87 h8" class="mo-line"/>',
  proud: '<path d="M52 80 q5 -6 10 0 M78 80 q5 -6 10 0" class="mo-line"/><path d="M64 86 q6 6 12 0" class="mo-line"/><path d="M22 30 l2.5 5 5 .8 -3.6 3.5 .9 5 -4.8 -2.4 -4.8 2.4 .9 -5 -3.6 -3.5 5 -.8z M116 22 l2 4 4 .6 -2.9 2.8 .7 4 -3.8 -2 -3.8 2 .7 -4 -2.9 -2.8 4 -.6z" class="mo-star"/>',
  curious: '<circle cx="57" cy="78" r="3.6" class="mo-ink"/><circle cx="83" cy="80" r="3.6" class="mo-ink"/><path d="M66 87 q4 2 8 0" class="mo-line"/><text x="112" y="34" class="mo-mark">?</text>',
  thinking: '<circle cx="58" cy="76" r="3.4" class="mo-ink"/><circle cx="84" cy="76" r="3.4" class="mo-ink"/><path d="M66 87 h8" class="mo-line"/><circle cx="104" cy="30" r="2.6" class="mo-ink"/><circle cx="113" cy="24" r="2.6" class="mo-ink"/><circle cx="122" cy="18" r="2.6" class="mo-ink"/>',
  sleepy: '<path d="M52 80 q5 4 10 0 M78 80 q5 4 10 0" class="mo-line"/><path d="M66 88 q4 2 8 0" class="mo-line"/><text x="108" y="36" class="mo-mark">z</text><text x="119" y="24" class="mo-mark small">z</text>',
  surprised: '<circle cx="57" cy="78" r="4.4" class="mo-ink"/><circle cx="83" cy="78" r="4.4" class="mo-ink"/><circle cx="70" cy="88" r="3" class="mo-ink"/>',
};
function mochi(cls = "", mood = "happy", dressed = true) {
  const squash = mood === "sleepy" ? "M14 90 C14 54 38 40 70 40 C102 40 126 54 126 90 C126 104 104 106 70 106 C36 106 14 104 14 90 Z"
    : mood === "proud" ? "M18 84 C18 34 42 16 70 16 C98 16 122 34 122 84 C122 104 102 106 70 106 C38 106 18 104 18 84 Z"
    : "M12 84 C12 40 38 24 70 24 C102 24 128 40 128 84 C128 104 106 106 70 106 C34 106 12 104 12 84 Z";
  const tilt = mood === "curious" ? ' transform="rotate(-6 70 100)"' : mood === "focused" ? ' transform="rotate(3 70 100)"' : "";
  return `<svg class="mochi mochi-${mood} ${cls}" viewBox="0 0 140 120" aria-hidden="true">
    <ellipse cx="70" cy="110" rx="50" ry="6" class="mo-shadow"/>
    <g${tilt}>
      <path d="${squash}" class="mo-body"/>
      <ellipse cx="44" cy="88" rx="8" ry="4.5" class="mo-cheek"/><ellipse cx="96" cy="88" rx="8" ry="4.5" class="mo-cheek"/>
      ${MOCHI_FACES[mood] || MOCHI_FACES.happy}
      ${dressed && typeof mochiAccessories === "function" ? mochiAccessories(mood) : ""}
    </g>
  </svg>`;
}
// Petit visage pour le logotype (le premier « o » de « mochi »)
const LOGO_FACE = '<svg viewBox="0 0 40 34" aria-hidden="true"><path d="M2 22 C2 9 10 3 20 3 C30 3 38 9 38 22 C38 31 31 32 20 32 C9 32 2 31 2 22 Z" class="mo-body"/><circle cx="14" cy="21" r="2" class="mo-ink"/><circle cx="26" cy="21" r="2" class="mo-ink"/><path d="M18 25 q2 2 4 0" class="mo-line" style="stroke-width:1.5"/><ellipse cx="9" cy="25" rx="3" ry="1.8" class="mo-cheek"/><ellipse cx="31" cy="25" rx="3" ry="1.8" class="mo-cheek"/></svg>';

let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4000);
}

// ---------- Audio (§5, §14) ----------
// Deux sources, dans cet ordre :
//  1. les vraies voix du serveur (features.tts, voir tts.js), si l'admin en a configuré ;
//  2. la synthèse vocale du navigateur (speechSynthesis), qui dépend de l'appareil :
//     sous Linux, Chromium n'a souvent AUCUNE voix (il faut speech-dispatcher).
// Le profil (section Audio) montre ce qui est disponible et permet de choisir sa voix.
let voices = [];
const hasSynth = () => "speechSynthesis" in window;
function loadVoices() {
  if (!hasSynth()) return;
  const before = voices.length;
  voices = speechSynthesis.getVoices();
  if (voices.length !== before && location.hash.startsWith("#/profil")) route();
}
if (hasSynth()) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
const langOf = (v) => v.lang.replace("_", "-").toLowerCase();
// Toutes les voix du navigateur pour une langue (en, ko)
const voicesFor = (lang) => voices.filter((v) => langOf(v).startsWith(lang));
const serverVoices = (lang) => features.tts?.[lang] || [];
function pickVoice(code) {
  const lang = code.slice(0, 2), mine = voicesFor(lang), pref = String(state.settings.voices?.[lang] || "");
  return mine.find((v) => `browser:${v.name}` === pref) || mine.find((v) => /natural|neural|online|premium|enhanced|google/i.test(v.name)) || mine.find((v) => v.lang === code) || mine[0];
}
// Quelle source sera utilisée pour cette langue : "server", "browser" ou null (muet)
function audioSource(lang) {
  // Une voix du navigateur choisie explicitement l'emporte, si elle existe sur CET appareil
  // (le réglage est synchronisé : il peut venir d'un autre appareil).
  const pref = String(state.settings.voices?.[lang] || "");
  if (pref.startsWith("browser:") && voicesFor(lang).some((v) => `browser:${v.name}` === pref)) return "browser";
  if (serverVoices(lang).length) return "server";
  return voicesFor(lang).length ? "browser" : null;
}
// Au moins 4 « locuteurs » par langue (§14) : les vraies voix disponibles, complétées
// par des variations de hauteur et de débit si l'appareil ou le serveur en a moins de 4.
const TWEAKS = [[1, 1], [0.8, 0.95], [1.25, 1.05], [0.9, 0.9], [1.15, 1]];
function speakers(lang) {
  const sv = audioSource(lang) === "server" ? serverVoices(lang) : [];
  const vs = sv.length ? sv : voicesFor(lang), out = [];
  for (let i = 0; out.length < Math.max(4, vs.length); i++) {
    const real = vs.length > i, [pitch, rate] = real ? [1, 1] : TWEAKS[i % TWEAKS.length];
    out.push(sv.length ? { server: sv[i % sv.length], pitch, rate } : { voice: vs[i % (vs.length || 1)] || null, pitch, rate });
  }
  return out;
}
let current = null; // lecture en cours (élément Audio ou null)
let playToken = 0;   // chaque nouvelle lecture annule la précédente (même pendant le téléchargement)
const warnedMute = {};
function speak(text, lang, speed = state.settings.speed, who = null) {
  stopSound();
  if (audioSource(lang) === "server") {
    const voice = who?.server || defaultServerVoice(lang), token = playToken;
    return serverSpeak(text, lang, voice, speed * (who?.rate || 1), who && who.pitch !== 1, token).catch((e) => {
      if (token !== playToken || e?.name === "AbortError") return; // interrompue par une autre lecture : pas une panne
      if (e?.name === "NotAllowedError") return; // lecture automatique bloquée avant toute interaction : le bouton 🔊 reste là
      const why = audioError(e);
      console.warn("Voix du serveur illisible :", why, e);
      // Repli sur les voix du navigateur s'il y en a ; sinon on dit la vraie raison
      if (voicesFor(lang).length) return browserSpeak(text, lang, speed, null);
      toast(`Voix du serveur illisible (${why}). Recharge la page ; si ça continue, signale ce message.`);
    });
  }
  return browserSpeak(text, lang, speed, who);
}
const MEDIA_ERR = { 1: "lecture annulée", 2: "erreur réseau", 3: "décodage impossible", 4: "format non pris en charge" };
const audioError = (e) => (e?.mediaCode ? `${MEDIA_ERR[e.mediaCode] || "erreur média"} ${e.mediaCode}${e.message ? ` : ${e.message}` : ""}` : `${e?.name || "Erreur"} : ${e?.message || e}`);
const defaultServerVoice = (lang) => { const sv = serverVoices(lang), pref = state.settings.voices?.[lang]; return sv.includes(pref) ? pref : sv[0]; };
const ttsUrl = (text, lang, voice) => `/api/tts?lang=${lang}&voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, 300))}`;
// Le fichier est d'abord téléchargé en entier (fetch → Blob), puis joué depuis la mémoire :
// plus de requêtes partielles (Range) entre le lecteur audio, le service worker et le serveur.
async function serverSpeak(text, lang, voice, rate, shiftPitch, token = playToken) {
  const r = await fetch(ttsUrl(text, lang, voice), { credentials: "same-origin" });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw Object.assign(new Error(d.error || `HTTP ${r.status}`), { name: "Serveur" }); }
  const blob = await r.blob();
  if (token !== playToken) return; // une autre lecture a commencé pendant le téléchargement
  const src = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const a = new Audio(src);
    const done = (err) => { URL.revokeObjectURL(src); if (current === a) current = null; err ? reject(err) : resolve(); };
    a.playbackRate = Number.isFinite(rate) && rate > 0 ? Math.min(2, Math.max(0.5, rate)) : 1;
    if (shiftPitch) a.preservesPitch = false; // variation de « locuteur » pour §14
    current = a;
    a.onended = () => done();
    a.onpause = () => { if (a.currentTime < a.duration) done(); }; // arrêtée par stopSound : la promesse se termine
    a.onerror = () => done(Object.assign(new Error(a.error?.message || ""), { mediaCode: a.error?.code }));
    a.play().catch(done);
  });
}
function browserSpeak(text, lang, speed, who) {
  return new Promise((resolve) => {
    if (!hasSynth()) { toast("L'audio n'est pas disponible sur ce navigateur"); return resolve(); }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGUAGES[lang].speechLang;
    const v = who ? who.voice : pickVoice(u.lang);
    if (v) u.voice = v;
    else if (!warnedMute[lang]) {
      warnedMute[lang] = true;
      toast(`Aucune voix ${lang === "ko" ? "coréenne" : "anglaise"} sur cet appareil : voir Profil › Audio`);
    }
    if (who) u.pitch = who.pitch;
    u.rate = 0.9 * speed * (who ? who.rate : 1);
    // Filet de sécurité : certains navigateurs (Chromium sans voix) ne déclenchent jamais onend
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(guard); resolve(); } };
    const guard = setTimeout(finish, 2500 + (text.length * 180) / (u.rate || 1));
    u.onend = u.onerror = finish;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
function stopSound() {
  playToken++;
  if (current) { const a = current; current = null; a.pause(); }
  if (hasSynth()) speechSynthesis.cancel();
}
function stopAudio() { stopSound(); if (ui.reader) ui.reader.playing = false; }

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
// Chapitres des livres (library.js) : lus dans le même lecteur que les textes
const CHAPTER_TEXTS = Object.fromEntries(Object.keys(LANGUAGES).map((l) => [l, {}]));
const textById = (lang, id) => TEXTS[lang].find((t) => t.id === id) || CHAPTER_TEXTS[lang][id];

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
  if (!HAS_FSRS) { toast("FSRS n'a pas pu être chargé"); return null; }
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
  return state.cards.filter((c) => c.lang === lang && !c.paused && c.fsrs.state !== 0 && new Date(c.fsrs.due) <= now).sort((a, b) => new Date(a.fsrs.due) - new Date(b.fsrs.due));
}
function newAllowance(lang) {
  const I = state.langs[lang].introduced;
  return Math.max(0, state.settings.newPerDay - (I.date === today() ? I.count : 0));
}
// Retour après une absence (§16, charte §9) : on plafonne les révisions du jour
// et on étale le retard sur plusieurs jours, sans nouvelles cartes en attendant.
const CATCHUP_FIRST = 20, CATCHUP_DAILY = 40;
function reviewQueue(lang) {
  const all = dueCards(lang), s = session(lang);
  return s.cap == null ? all : all.slice(0, Math.max(0, s.cap - (s.reviewed || 0)));
}
// Anti-interférence (§12) : au plus 1 nouveau mot par groupe sémantique et par jour,
// et jamais deux mots confusables le même jour. Les mots écartés attendent demain.
const GROUP_OF = {}, CONF_OF = {};
for (const lang of Object.keys(SEMANTIC_GROUPS)) {
  GROUP_OF[lang] = {}; CONF_OF[lang] = {};
  for (const [g, ws] of Object.entries(SEMANTIC_GROUPS[lang])) for (const w of ws) GROUP_OF[lang][w] = g;
  for (const [a, b] of CONFUSABLE[lang]) { (CONF_OF[lang][a] ||= new Set()).add(b); (CONF_OF[lang][b] ||= new Set()).add(a); }
}
const lemmaParts = (lemma) => String(lemma).split(" + ");
function interferes(lang, lemma, taken) {
  for (const l of lemmaParts(lemma)) {
    if (taken.lemmas.has(l)) return false; // même mot (cartes sœurs) : pas une interférence
    const g = GROUP_OF[lang]?.[l];
    if (g && taken.groups.has(g)) return true;
    for (const c of CONF_OF[lang]?.[l] || []) if (taken.lemmas.has(c)) return true;
  }
  return false;
}
function takeLemma(lang, lemma, taken) {
  for (const l of lemmaParts(lemma)) { taken.lemmas.add(l); const g = GROUP_OF[lang]?.[l]; if (g) taken.groups.add(g); }
}
function introducedToday(lang) {
  const I = state.langs[lang].introduced, taken = { lemmas: new Set(), groups: new Set() };
  if (I.date === today()) for (const l of I.lemmas || []) takeLemma(lang, l, taken);
  return taken;
}
function waitingNew(lang) {
  const shown = newCards(lang);
  if (shown.length >= newAllowance(lang) || session(lang).cap != null) return 0;
  return state.cards.filter((c) => c.lang === lang && !c.paused && c.fsrs.state === 0 && c.type === "recog").length - shown.filter((c) => c.type === "recog").length;
}
function newCards(lang) {
  if (session(lang).cap != null) return [];
  const taken = introducedToday(lang), out = [], max = newAllowance(lang);
  for (const c of state.cards) {
    if (out.length >= max) break;
    if (c.lang !== lang || c.paused || c.fsrs.state !== 0) continue;
    if (c.type === "recog" && interferes(lang, c.lemma, taken)) continue;
    takeLemma(lang, c.lemma, taken);
    out.push(c);
  }
  return out;
}
function reviewCount(lang) { return reviewQueue(lang).length + newCards(lang).length; }

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
  const s = session(c.lang); s.reviewed = (s.reviewed || 0) + 1;
  if (wasNew) {
    if (L.introduced.date !== today()) L.introduced = { date: today(), count: 0, lemmas: [] };
    L.introduced.count++;
    (L.introduced.lemmas ||= []).push(c.lemma);
  }
  // Production/écoute débloquées après 2 réussites sur des révisions espacées (pas les étapes du jour 1)
  if (c.type === "recog" && rating >= 3 && prevState === 2 && ++c.successes >= 2) unlockSiblings(c);
  L.xp += 2;
  track(c.lang, "rev");
  save();
  return card;
}

// ---------- Session du jour, série, temps (§0, §8) ----------
function lastActiveDay(lang) {
  return Object.keys(state.history).filter((d) => d < today() && state.history[d][lang]).sort().pop() || null;
}
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);
function session(lang) {
  const L = state.langs[lang];
  if (L.session.date !== today()) {
    const backlog = dueCards(lang).length, last = lastActiveDay(lang);
    const away = last && daysBetween(last, today()) >= 4;
    if (!L.catchUp && away && backlog > CATCHUP_FIRST) { L.catchUp = true; L.session = { cap: CATCHUP_FIRST, welcomeBack: backlog }; }
    else if (L.catchUp && backlog > CATCHUP_DAILY) L.session = { cap: CATCHUP_DAILY };
    else { L.catchUp = false; L.session = {}; }
    Object.assign(L.session, { date: today(), input: false, review: false, production: false, captured: 0, reviewed: 0 });
  }
  return L.session;
}
// Une séance compte si elle contient les révisions dues (ou au moins 10) ET un input
// ou une production (§16). Ouvrir l'appli ne suffit pas.
function sessionComplete(lang) {
  const s = session(lang);
  const reviewOk = s.review || reviewCount(lang) === 0 || (s.reviewed || 0) >= 10;
  return reviewOk && (s.input || s.production);
}
function bumpSession(lang, key) {
  const s = session(lang);
  if (key === "captured") s.captured++; else s[key] = true;
  const L = state.langs[lang];
  if (sessionComplete(lang) && !L.fullDays[today()]) {
    L.fullDays[today()] = true;
    const w = weekly(L);
    toast(w.thisWeek === WEEK_GOAL ? `🍡 Semaine régulière réussie ! Série : ${w.streak} semaine(s)` : `✓ Séance complète · ${w.thisWeek}/${WEEK_GOAL} cette semaine`);
  }
  save();
}

// Série hebdomadaire (§16) : objectif 5 jours sur 7, 2 jours de repos inclus.
// Rater un jour ne casse rien ; seule une semaine sous l'objectif remet la série à zéro.
const WEEK_GOAL = 5;
function monday(d = new Date()) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function weekDays(L, mon) {
  const d = new Date(mon), out = [];
  for (let i = 0; i < 7; i++) { out.push({ day: today(d), done: !!L.fullDays[today(d)] }); d.setDate(d.getDate() + 1); }
  return out;
}
function weekly(L) {
  const mon = monday(), days = weekDays(L, mon);
  const thisWeek = days.filter((x) => x.done).length;
  let streak = thisWeek >= WEEK_GOAL ? 1 : 0;
  for (let i = 1; i < 520; i++) {
    mon.setDate(mon.getDate() - 7);
    if (weekDays(L, mon).filter((x) => x.done).length >= WEEK_GOAL) streak++; else break;
  }
  const left = days.filter((x) => x.day >= today()).length; // jours restants, aujourd'hui compris
  const todayDone = !!L.fullDays[today()];
  return { streak, thisWeek, days, resting: !todayDone && thisWeek >= WEEK_GOAL, reachable: thisWeek + left - (todayDone ? 1 : 0) >= WEEK_GOAL };
}
const currentStreak = (L) => weekly(L).streak;
const todayMin = (L) => (L.todayDate === today() ? Math.floor(L.todaySec / 60) : 0);

let lastActivity = 0;
["click", "keydown", "pointerdown"].forEach((ev) => addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));
setInterval(() => {
  const lang = currentLang();
  const listening = (current && !current.paused) || (hasSynth() && speechSynthesis.speaking);
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
  if (!ui.prod || ui.prod.lang !== lang) ui.prod = { lang, mode: "guided", ex: pickExercise(lang), free: pickFree(lang), text: "", result: null, why: false };
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
const fsrsWarning = () => (HAS_FSRS ? "" : `<div class="card warn">⚠️ L'algorithme FSRS n'a pas pu être chargé. Les révisions sont désactivées.</div>`);

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
      ${COMING_SOON.map((l) => `
        <button type="button" class="lang-card soon" data-act="lang-soon" data-name="${l.name}" aria-disabled="true" aria-label="${l.name} : bientôt disponible">
          <span class="soon-badge">🔒 Bientôt</span>
          <span class="flag">${l.flag}</span>
          <div><h2>${l.name}</h2><div class="hello" lang="${l.lang}">${l.hello}</div></div>
          <p class="muted" style="margin:0">En préparation</p>
        </button>`).join("")}
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
    <p style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn ghost small" data-tour="open">🧭 Visite guidée du site</button><a class="btn ghost small" href="#/pourquoi">Pourquoi ça marche ? →</a></p>
  </section>`;
}

// ---------- Tableau de bord d'une langue ----------
const TABS = {
  en: [["aujourdhui", "☀️ Aujourd'hui"], ["lire", "📖 Lire"], ["themes", "🍡 Thèmes"], ["revisions", "🧠 Réviser"], ["produire", "💬 Produire"], ["mots", "📒 Mots"], ["oreille", "🎧 Oreille"], ["fauxamis", "🎭 Faux amis"]],
  ko: [["aujourdhui", "☀️ Aujourd'hui"], ["parcours", "🗺️ Parcours"], ["lire", "📖 Lire"], ["themes", "🍡 Thèmes"], ["revisions", "🧠 Réviser"], ["produire", "💬 Produire"], ["mots", "📒 Mots"], ["oreille", "🎧 Oreille"]],
};
// Vues des onglets (d'autres fichiers, comme exercises.js, peuvent en ajouter)
const TAB_VIEWS = {};
const GATED_TABS = ["lire", "revisions", "produire", "mots"]; // coréen : après le Hangul
// Admin (tools/admin.js) : toutes les leçons sont ouvertes, sans prérequis
const isAdmin = () => !!account?.is_admin;
const hangulGate = (lang) => isKo(lang) && !state.langs.ko.hangulDone && !isAdmin();
function gateCard() {
  const n = Object.keys(state.langs.ko.hangulDays).length;
  return `<div class="card empty">${mochi("small", "curious")}
    <h2>D'abord, le Hangul</h2>
    <p class="muted">L'alphabet coréen s'apprend en une semaine environ. Ensuite, plus aucune romanisation : tout se lit en Hangul.</p>
    <a class="btn" href="#/lang/ko/hangul/${Math.min(n + 1, HANGUL_DAYS.length)}">Jour ${Math.min(n + 1, HANGUL_DAYS.length)} du Hangul</a>
    <p><button class="linkish" data-act="skip-hangul">Je lis déjà le Hangul</button></p></div>`;
}

// ---------- Navigation d'une langue : 3 sections, pas un mur de boutons ----------
// Aujourd'hui (la séance guidée) · Lire (histoire, bibliothèque, thèmes) · S'entraîner (outils en cartes).
// Les identifiants d'onglets (#/lang/xx/revisions…) ne changent pas : les anciens liens marchent.
const READ_TABS = [["histoire", "🎬", "Histoire"], ["lire", "📚", "Bibliothèque"], ["themes", "🍡", "Thèmes"]];
const sectionOf = (tab) => (tab === "aujourdhui" ? "today" : READ_TABS.some(([k]) => k === tab) ? "read" : "practice");
// Outils de la section « S'entraîner » : nom en clair, à quoi ça sert, et un indicateur
function practiceTools(lang) {
  const L = state.langs[lang], due = reviewCount(lang), mine = state.cards.filter((c) => c.lang === lang).length;
  const K = state.langs.ko, hDone = Object.keys(K.hangulDays).length, gDone = KO_GRAMMAR.filter((g) => K.grammarDone[g.id]).length;
  const tools = [
    isKo(lang) && ["parcours", "🗺️", "Parcours", "L'alphabet puis la grammaire, un pas à la fois.", K.hangulDone ? `Grammaire ${gDone}/${KO_GRAMMAR.length}` : `Hangul ${hDone}/${HANGUL_DAYS.length}`],
    ["revisions", "🧠", "Réviser", "Les mots à revoir aujourd'hui, au bon moment pour ne pas les oublier.", due ? `${due} à revoir` : "À jour ✓", due > 0],
    ["exercices", "🎯", "Exercices", "Dictée, phrases à remettre dans l'ordre, compréhension… tout mélangé.", ""],
    ["produire", "💬", "Écrire", "Écris une phrase : Mochi te propose une version plus naturelle.", ""],
    ["oreille", "🎧", "Écouter les sons", "Distingue les sons qui se ressemblent, avec plusieurs voix.", ""],
    !isKo(lang) && ["fauxamis", "🎭", "Faux amis", "Les mots qui ressemblent au français… mais ne veulent pas dire la même chose.", ""],
    ["mots", "📒", "Mes mots", "Tous les mots que tu apprends, et ceux que tu connais déjà.", mine ? `${mine} carte${mine > 1 ? "s" : ""}` : ""],
    ["niveau", "🧭", "Test de niveau", "5 minutes pour savoir où tu en es.", L.placement ? "Fait ✓" : ""],
  ];
  return tools.filter(Boolean);
}
function langNav(lang, tab) {
  const sec = sectionOf(tab), due = reviewCount(lang);
  const main = [["today", "aujourdhui", "☀️", "Aujourd'hui"], ["read", "histoire", "📖", "Lire"], ["practice", "pratique", "🎯", "S'entraîner"]];
  const tool = sec === "practice" && tab !== "pratique" ? practiceTools(lang).find(([k]) => k === tab) : null;
  return `<nav class="section-nav" aria-label="Sections">
      ${main.map(([id, k, ico, label]) => `<a class="sec ${sec === id ? "active" : ""}" href="#/lang/${lang}/${k}" ${sec === id ? 'aria-current="page"' : ""}><span class="sec-ico" aria-hidden="true">${ico}</span><span>${label}</span>${id === "practice" && due ? `<span class="sec-badge" title="Cartes à revoir">${due}</span>` : ""}</a>`).join("")}
    </nav>
    ${sec === "read" ? `<nav class="sub-nav" aria-label="Lire">${READ_TABS.map(([k, ico, label]) => `<a class="${k === tab ? "active" : ""}" href="#/lang/${lang}/${k}" ${k === tab ? 'aria-current="page"' : ""}>${ico} ${label}</a>`).join("")}</nav>` : ""}
    ${tool ? `<div class="tool-head"><a class="lnk" href="#/lang/${lang}/pratique">← S'entraîner</a><h2>${tool[1]} ${tool[2]}</h2></div>` : ""}`;
}
function tabPractice(lang) {
  return `<p class="muted" style="margin:0 0 14px">Choisis un exercice. Pas d'idée ? <a class="lnk" href="#/lang/${lang}/aujourdhui">La séance du jour</a> te guide pas à pas.</p>
    <div class="tool-grid">
      ${practiceTools(lang).map(([k, ico, title, desc, badge, hot]) => `<a class="card tool-card" href="#/lang/${lang}/${k}">
        <span class="tool-ico" aria-hidden="true">${ico}</span>
        <div><h3>${title}</h3><p class="muted">${desc}</p>${badge ? `<span class="tag ${hot ? "hot" : ""}">${badge}</span>` : ""}</div>
      </a>`).join("")}
    </div>`;
}

function viewLanguage(lang, tab) {
  const l = LANGUAGES[lang];
  const L = state.langs[lang];
  const p = Math.min(100, Math.round((todayMin(L) / state.goal) * 100));
  const gated = hangulGate(lang) && GATED_TABS.includes(tab);
  const body = gated ? gateCard() : (TAB_VIEWS[tab] || tabToday)(lang);
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
        ${langNav(lang, tab)}
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
            <div class="stat"><span class="ico">📅</span><div><b>${currentStreak(L)}</b><small>semaine(s) régulière(s)</small></div></div>
            <div class="stat"><span class="ico">⭐</span><div><b>${L.xp}</b><small>XP</small></div></div>
          </div>
        </div>
        ${weekCard(L)}
        ${questsCard(lang)}
        <div class="card">
          <h3>Vers le ${lvl[0]}</h3>
          <div class="bar" style="margin:10px 0 6px"><span style="width:${Math.min(100, (hours / lvl[1]) * 100)}%"></span></div>
          <small class="muted">${hours.toFixed(1)} h sur ${lvl[2]} estimées. C'est un marathon : chaque session compte.</small>
        </div>
      </aside>
    </div>
  </section>`;
}

// Semaine en cours : 7 pastilles, objectif 5 (§16). Jamais de compte à rebours.
function weekCard(L) {
  const w = weekly(L), names = ["L", "M", "M", "J", "V", "S", "D"];
  const msg = w.thisWeek >= WEEK_GOAL ? "Semaine réussie ! Les jours restants sont des jours de repos."
    : w.reachable ? `Encore ${WEEK_GOAL - w.thisWeek} jour(s) cette semaine. 2 jours de repos sont inclus.`
    : "Cette semaine ne comptera pas pour la série, et ce n'est pas grave : chaque séance fait progresser.";
  return `<div class="card week">
    <h3>Ma semaine · ${w.thisWeek}/${WEEK_GOAL}</h3>
    <ol class="week-dots" aria-label="Séances complètes cette semaine">${w.days.map((d, i) => `<li class="${d.done ? "done" : ""} ${d.day === today() ? "today" : ""}" title="${d.day}${d.done ? " : séance complète" : ""}"><span aria-hidden="true">${d.done ? "✓" : names[i]}</span><span class="sr-only">${d.day} ${d.done ? "fait" : "pas fait"}</span></li>`).join("")}</ol>
    <small class="muted">${msg}</small>
  </div>`;
}

// ---------- Quêtes de la semaine (ROADMAP P2, PEDAGOGIE §16) ----------
// 3 quêtes par semaine et par langue, tirées parmi les bonnes pratiques. Le tirage dépend
// seulement de la semaine et de la langue : tous les appareils voient les mêmes quêtes sans
// rien synchroniser. Les objectifs suivent l'objectif du jour (5, 10, 15 ou 20 min).
// La progression se lit dans l'historique (state.history), déjà synchronisé.
const QUEST_XP = 50;
const QUESTS = [
  { id: "read", icon: "📖", base: 3, title: (n) => `Lis ${n} texte${n > 1 ? "s" : ""}`, count: (h) => h.read },
  { id: "prod", icon: "💬", base: 10, title: (n) => `Écris ${n} phrases`, count: (h) => h.prod },
  { id: "ear", icon: "🎧", base: 30, title: (n) => `Fais ${n} essais de paires de sons`, count: (h) => h.ear },
  { id: "rev", icon: "🧠", base: 80, title: (n) => `Fais ${n} révisions`, count: (h) => h.rev },
  { id: "min", icon: "⏱️", base: 60, title: (n) => `Pratique ${n} minutes`, count: (h) => Math.floor(h.sec / 60) },
  { id: "row", icon: "🔥", base: 4, scale: false, title: (n) => `Séance complète ${n} jours de suite`, count: (h, L, days) => { let best = 0, cur = 0; for (const d of days) { cur = L.fullDays[d] ? cur + 1 : 0; best = Math.max(best, cur); } return best; } },
];
function weekQuests(lang, mon = monday()) {
  const wk = today(mon), days = Array.from({ length: 7 }, (_, i) => today(new Date(+mon + i * 864e5))).filter((d) => d <= today());
  const L = state.langs[lang], f = Math.min(1.6, Math.max(0.6, state.goal / 10));
  const h = { read: 0, prod: 0, ear: 0, rev: 0, sec: 0 };
  for (const d of days) for (const k in h) h[k] += state.history[d]?.[lang]?.[k] || 0;
  // Tirage déterministe : on trie le catalogue selon un hachage (semaine, langue, quête)
  const rank = (q) => parseInt(fnv(`${wk}|${lang}|${q.id}`), 36);
  const picked = [...QUESTS].sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  return picked.map((q) => {
    const goal = q.scale === false ? q.base : Math.max(1, Math.round((q.base * f) / (q.base >= 10 ? 5 : 1)) * (q.base >= 10 ? 5 : 1));
    const n = Math.min(goal, q.count(h, L, days));
    const key = `${wk}:${q.id}`;
    return { ...q, key, goal, n, title: q.title(goal), done: n >= goal, claimed: !!L.quests[key] };
  });
}
function questsCard(lang) {
  const qs = weekQuests(lang), left = 7 - ((new Date().getDay() + 6) % 7) - 1;
  return `<div class="card quests">
    <h3>Quêtes de la semaine</h3>
    <ul>${qs.map((q) => `<li class="${q.done ? "done" : ""}">
      <span class="q-ico" aria-hidden="true">${q.claimed ? "✅" : q.icon}</span>
      <div class="q-body"><b>${esc(q.title)}</b>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${q.goal}" aria-valuenow="${q.n}" aria-label="${esc(q.title)}"><span style="width:${(q.n / q.goal) * 100}%"></span></div>
        <small class="muted">${q.n} / ${q.goal}</small></div>
      ${q.done && !q.claimed ? `<button class="btn small" data-act="quest-claim" data-k="${q.key}" data-l="${lang}">+${QUEST_XP} XP</button>` : ""}
    </li>`).join("")}</ul>
    <small class="muted">${qs.every((q) => q.claimed) ? "Toutes les quêtes sont faites, bravo ! Les prochaines arrivent lundi." : left > 0 ? `Nouvelles quêtes lundi (dans ${left} jour${left > 1 ? "s" : ""}).` : "Nouvelles quêtes demain."}</small>
  </div>`;
}

function stepCard(n, icon, title, done, desc, action) {
  return `<div class="card step ${done ? "done" : ""}">
    <div class="step-n">${done ? "✓" : n}</div>
    <div style="flex:1"><h3>${icon} ${title}</h3><p class="muted">${desc}</p></div>
    ${action || ""}
  </div>`;
}

Object.assign(TAB_VIEWS, { pratique: (l) => tabPractice(l), aujourdhui: (l) => tabToday(l), parcours: (l) => tabPath(l), lire: (l) => tabLibrary(l), themes: (l) => tabThemes(l), revisions: (l) => tabReviews(l), produire: (l) => tabProduce(l), mots: (l) => tabWords(l), oreille: (l) => tabEar(l), fauxamis: (l) => tabFauxAmis(l) });

function tabToday(lang) {
  if (hangulGate(lang)) {
    const n = Object.keys(state.langs.ko.hangulDays).length;
    return `${placementOffer(lang)}<div class="card phase"><b>Phase 1 · Le Hangul</b><div class="bar"><span style="width:${(n / HANGUL_DAYS.length) * 100}%"></span></div><small class="muted">${n} / ${HANGUL_DAYS.length} jours</small></div>${gateCard()}`;
  }
  const s = session(lang);
  const best = rankedTexts(lang)[0];
  const due = reviewQueue(lang).length, fresh = newCards(lang).length;
  const reviewDone = s.review || due + fresh === 0;
  const ex = currentExercise(lang);
  const all = sessionComplete(lang);
  const w = weekly(state.langs[lang]);
  const nextStep = !s.input ? 1 : !reviewDone ? 3 : !s.production ? 4 : 0;
  return `
    ${placementOffer(lang)}
    ${s.welcomeBack ? `<div class="card celebrate">${mochi("small")}<div><h3>Content de te revoir !</h3><p class="muted">On reprend en douceur : ${CATCHUP_FIRST} révisions aujourd'hui, le reste plus tard, réparti sur les prochains jours. Pas de nouvelles cartes en attendant.</p></div></div>` : ""}
    ${all ? `<div class="card celebrate">${mochi("small", w.thisWeek >= WEEK_GOAL ? "proud" : "happy")}<div><h3>Séance du jour bouclée</h3><p class="muted">${w.thisWeek}/${WEEK_GOAL} jours cette semaine. Tu peux continuer, mais l'essentiel est fait.</p></div></div>`
      : w.resting ? `<div class="card celebrate">${mochi("small", "sleepy")}<div><h3>Jour de repos possible</h3><p class="muted">Objectif de la semaine atteint. Mochi fait la sieste, ta série est en sécurité. Tu peux quand même pratiquer si tu en as envie.</p></div></div>` : ""}
    ${stepCard(1, "📖", "Lire & écouter", s.input,
      `${esc(best.t.title)} · tu connais ~${pct(best.c)} % des mots${best.z.k === "gloss" ? " (avec glossaire)" : ""}.`,
      `<a class="btn small ${nextStep === 1 ? "" : "ghost"}" href="#/lang/${lang}/lire/${best.t.id}">Lire</a>`)}
    ${stepCard(2, "🫳", "Capturer", s.captured > 0, s.captured ? `${s.captured} mot(s) capturé(s) aujourd'hui.` : "Pendant la lecture, touche un mot inconnu pour l'ajouter.", "")}
    ${stepCard(3, "🧠", "Réviser", reviewDone, due + fresh ? `${due} carte(s) à revoir, ${fresh} nouvelle(s).` : "Rien à réviser pour l'instant.",
      due + fresh ? `<a class="btn small ${nextStep === 3 ? "" : "ghost"}" href="#/lang/${lang}/revisions/go">Réviser</a>` : "")}
    ${stepCard(4, "💬", "Produire", s.production, `« ${esc(ex.prompt)} »`, `<a class="btn small ${nextStep === 4 ? "" : "ghost"}" href="#/lang/${lang}/produire">Écrire</a>`)}
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
      <p style="margin:8px 0 0"><a class="btn ghost small" href="#/lang/ko/atelier">🧪 Atelier des syllabes</a></p>
      <div class="bar"><span style="width:${K.hangulDone ? 100 : (hDone / HANGUL_DAYS.length) * 100}%"></span></div>
      <div class="day-grid">
        ${HANGUL_DAYS.map((d, i) => {
          const done = K.hangulDays[i + 1], open = i === 0 || K.hangulDays[i] || K.hangulDone || isAdmin();
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
          const done = K.grammarDone[g.id], open = isAdmin() || (K.hangulDone && (i === 0 || K.grammarDone[KO_GRAMMAR[i - 1].id]));
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
// ---------- Thèmes de situation et collection de Mochis (§12, ROADMAP « Mochidex ») ----------
// Mots d'un thème : lemmes de ses textes, sauf le socle (mots présents dans 3 thèmes ou plus,
// mots des textes sans thème) et les particules. Calculé une fois par langue.
const THEME_WORDS_CACHE = {};
function themeWords(lang) {
  if (THEME_WORDS_CACHE[lang]) return THEME_WORDS_CACHE[lang];
  const themesOf = {}, socle = new Set();
  for (const t of TEXTS[lang]) for (const s of t.sentences) for (const w of parseSentence(s[0], lang)) for (const g of w.segs) {
    if (g.particle) continue;
    for (const l of g.lemmas) { if (!(t.themes || []).length) socle.add(l); for (const th of t.themes || []) (themesOf[l] ||= new Set()).add(th); }
  }
  const out = Object.fromEntries(THEMES.map((th) => [th.id, []]));
  for (const [l, ths] of Object.entries(themesOf)) if (ths.size < 3 && !socle.has(l) && !KO_PARTICLES.has(l)) for (const th of ths) out[th].push(l);
  return (THEME_WORDS_CACHE[lang] = out);
}
// Paliers de « mots solides » (stabilité FSRS ≥ 7 jours ou marqués connus) : 10 débloque la saveur
const FLAVOR_STEPS = [10, 50, 100];
function themeProgress(lang, stab = stabilityMap(lang)) {
  const words = themeWords(lang);
  return THEMES.map((th) => {
    const w = words[th.id], solid = w.filter((l) => lemmaStatus(lang, l, stab) === "known").length;
    const texts = TEXTS[lang].filter((t) => (t.themes || []).includes(th.id));
    const need = Math.min(FLAVOR_STEPS[0], w.length || FLAVOR_STEPS[0]);
    return { ...th, words: w, solid, texts, unlocked: w.length > 0 && solid >= need, need, fav: state.settings.themes.includes(th.id) };
  });
}
const flavorMochi = (th, mood = "happy", locked = false) =>
  `<span class="flavor ${locked ? "locked" : ""}" style="--mochi-fill:${th.fill}${th.dark && !locked ? ";--mochi-ink:#FBF4EA" : ""}">${mochi("small", mood, false)}</span>`;
function tabThemes(lang) {
  const P = themeProgress(lang), got = P.filter((p) => p.unlocked).length;
  return `
    <div class="card" style="margin-bottom:16px"><p style="margin:0">Un <b>thème</b> regroupe des mots qui vont ensemble dans une scène (commander, chaud, emporter…). Chaque thème a sa <b>saveur de Mochi</b> : tu la débloques avec <b>${FLAVOR_STEPS[0]} mots solides</b> du thème (révisés et retenus au moins une semaine).
      Choisis tes thèmes préférés ⭐ : la bibliothèque les met en avant.</p>
      <p class="muted" style="margin:8px 0 0"><small>${got} / ${THEMES.length} saveurs débloquées · les mots de tous les jours restent prioritaires, quel que soit le thème.</small></p></div>
    <div class="theme-grid">
      ${P.map((p) => `<div class="card theme-card ${p.unlocked ? "unlocked" : ""}">
        <button class="fav ${p.fav ? "on" : ""}" data-act="theme-fav" data-t="${p.id}" aria-pressed="${p.fav}" title="${p.fav ? "Retirer des favoris" : "Thème préféré"}">${p.fav ? "★" : "☆"}</button>
        ${flavorMochi(p, p.unlocked ? "proud" : "curious", !p.unlocked)}
        <h3>${p.icon} ${esc(p.name)}</h3>
        <small class="muted">${p.unlocked ? `Saveur ${esc(p.flavor)} débloquée !` : `Saveur ${esc(p.flavor)} · encore ${Math.max(0, p.need - p.solid)} mot(s) solide(s)`}</small>
        <div class="cov"><div class="bar"><span style="width:${p.words.length ? (p.solid / p.words.length) * 100 : 0}%"></span></div><b>${p.solid} / ${p.words.length}</b></div>
        <div class="theme-texts">${p.texts.length ? p.texts.map((t) => `<a class="chip" href="#/lang/${lang}/lire/${t.id}">${t.icon} ${esc(t.title)}${state.langs[lang].readTexts[t.id] ? " ✓" : ""}</a>`).join("") : `<small class="muted">Textes à venir</small>`}</div>
      </div>`).join("")}
    </div>`;
}
const themeOf = (id) => THEMES.find((t) => t.id === id);

function tabLibrary(lang) {
  const favs = state.settings.themes, filter = ui.libTheme && THEMES.some((t) => t.id === ui.libTheme) ? ui.libTheme : null;
  // Les thèmes favoris passent devant, à zone de couverture égale (on ne sort jamais de la bonne zone pour un thème)
  const isFav = (t) => (t.themes || []).some((x) => favs.includes(x));
  const list = rankedTexts(lang).filter(({ t }) => !filter || (t.themes || []).includes(filter))
    .sort((a, b) => a.z.order - b.z.order || isFav(b.t) - isFav(a.t));
  const used = THEMES.filter((th) => TEXTS[lang].some((t) => (t.themes || []).includes(th.id)));
  return `
    <div class="card" style="margin-bottom:16px"><p style="margin:0">Classés selon <b>ton</b> vocabulaire (${knownCount(lang)} mots connus). La zone idéale : <b>92–98 %</b> de mots connus.${favs.length ? " Tes thèmes ⭐ passent devant." : ""}</p></div>
    <div class="choice-row lib-filter" role="group" aria-label="Filtrer par thème">
      <button class="chip ${filter ? "" : "active"}" data-act="lib-theme" data-t="">Tous</button>
      ${used.map((th) => `<button class="chip ${filter === th.id ? "active" : ""}" data-act="lib-theme" data-t="${th.id}">${th.icon} ${esc(th.name)}${favs.includes(th.id) ? " ⭐" : ""}</button>`).join("")}
    </div>
    ${!filter && BOOKS[lang].length ? `<h2 class="section-title">📚 Livres gradués</h2><div class="text-list">${bookCards(lang)}</div><h2 class="section-title">Textes courts</h2>` : ""}
    <div class="text-list">
      ${list.map(({ t, c, z }) => `
        <a class="card text-item" href="#/lang/${lang}/lire/${t.id}">
          <span class="ti-icon">${t.icon}</span>
          <div>
            <h3>${esc(t.title)} ${state.langs[lang].readTexts[t.id] ? '<small class="muted">· lu ✓</small>' : ""}</h3>
            <small class="muted">${t.kind} · ${t.sentences.length} phrases · 🔊 audio${(t.themes || []).map((x) => ` · ${themeOf(x)?.icon || ""} ${esc(themeOf(x)?.name || x)}`).join("")}</small>
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
  const lock = t.book && chapterLock(lang, bookById(lang, t.book), t.chapter);
  if (lock) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "focused")}<h2>Pas encore</h2><p class="muted">${esc(lock)}</p><a class="btn" href="#/lang/${lang}/livre/${t.book}">Retour au livre</a></div></section>`;
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
    const pt = seg.particle ? particleFn(seg.surface) : null;
    return `<span class="w ${cls} ${pt ? `pt pt-${pt[0]}` : ""} ${sel}" data-act="word" data-s="${si}" data-w="${wi}" data-g="${gi}"${pt ? ` title="${pt[1]}"` : ""} tabindex="0" role="button">${esc(seg.surface)}</span>`;
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
      <a class="close" href="${t.book ? `#/lang/${lang}/livre/${t.book}` : `#/lang/${lang}/lire`}" aria-label="Retour" data-act="stop">←</a>
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
      <button class="btn ghost small" data-act="${R.playing ? "stop" : "play-all"}">${R.playing ? "⏸ Stop" : "▶ Tout écouter"}</button>
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

    <div class="legend muted"><span class="w new">nouveau</span><span class="w learning">en révision</span>${lang === "en" ? '<span class="w cognate">transparent</span>' : '<span class="w pt pt-topic">thème</span><span class="w pt pt-subject">sujet</span><span class="w pt pt-object">objet</span><span class="w pt pt-place">lieu, temps</span><span class="w pt">autre particule</span>'}<span>Touche un mot pour sa traduction.</span></div>

    ${panel}

    <div style="text-align:center;margin-top:28px">
      <button class="btn" data-act="finish-read">J'ai fini ✓</button>
    </div>
  </section>`;
}

// ---------- Révisions (§1, §2) ----------
function tabReviews(lang) {
  const due = reviewQueue(lang).length, fresh = newCards(lang).length;
  const total = state.cards.filter((c) => c.lang === lang).length;
  const byType = (t) => state.cards.filter((c) => c.lang === lang && c.type === t).length;
  return `
    <div class="card empty">
      ${mochi("small", due + fresh ? "happy" : "sleepy")}
      <h2>${due + fresh ? `${due + fresh} carte(s) à réviser` : "Tout est à jour"}</h2>
      <p class="muted">${due} à revoir · ${fresh} nouvelle(s) (max ${state.settings.newPerDay} / jour)<br/>Rétention visée : ${pct(state.settings.retention)} %</p>
      ${waitingNew(lang) ? `<p class="muted"><small>${waitingNew(lang)} mot(s) proche(s) d'un mot déjà vu aujourd'hui attendent demain : les apprendre ensemble les mélangerait.</small></p>` : ""}
      ${due + fresh && HAS_FSRS ? `<a class="btn" href="#/lang/${lang}/revisions/go">Commencer</a>` : `<a class="btn ghost" href="#/lang/${lang}/lire">Lire un texte pour capturer des mots</a>`}
    </div>
    <div class="stat-grid card" style="margin-top:16px">
      <div class="stat"><span class="ico">🃏</span><div><b>${total}</b><small>cartes au total</small></div></div>
      <div class="stat"><span class="ico">👁️</span><div><b>${byType("recog")}</b><small>reconnaissance</small></div></div>
      <div class="stat"><span class="ico">✍️</span><div><b>${byType("prod") + byType("cloze")}</b><small>production</small></div></div>
      <div class="stat"><span class="ico">🎧</span><div><b>${byType("listen")}</b><small>écoute</small></div></div>
    </div>
    <p class="muted"><small>Les cartes de production et d'écoute se débloquent après 2 bonnes réponses en reconnaissance.</small></p>
    ${myCardsList(lang)}`;
}

// ---------- Mes mots en révision : la liste des mots capturés, par langue ----------
// Un mot peut avoir plusieurs cartes (reconnaissance, production, écoute) : on les regroupe.
const CARD_TYPE_ICON = { recog: ["👁️", "reconnaissance"], prod: ["✍️", "production"], cloze: ["✍️", "phrase à trou"], listen: ["🎧", "écoute"] };
function cardGroups(lang) {
  const by = new Map();
  for (const c of state.cards) if (c.lang === lang) (by.get(c.lemma) || by.set(c.lemma, []).get(c.lemma)).push(c);
  const now = new Date(), newIds = new Set(newCards(lang).map((c) => c.id));
  return [...by.entries()].map(([lemma, cards]) => {
    const main = cards.find((c) => c.type === "recog") || cards[0], active = cards.filter((c) => !c.paused);
    const due = active.filter((c) => c.fsrs.state !== 0).map((c) => new Date(c.fsrs.due)).sort((a, b) => a - b)[0] || null;
    const stab = Math.max(...cards.map((c) => c.fsrs.stability || 0));
    const status = !active.length ? ["paused", "En pause"]
      : active.some((c) => newIds.has(c.id)) ? ["today", "Nouveau, aujourd'hui"]
      : due && due <= now ? ["today", "À revoir aujourd'hui"]
      : active.every((c) => c.fsrs.state === 0) ? ["new", "Nouveau, bientôt"]
      : stab >= KNOWN_STABILITY ? ["solid", `Solide 💪 · dans ${fmtInterval(due, now)}`]
      : ["later", `Dans ${fmtInterval(due, now)}`];
    return { lemma, cards, main, due, status, paused: !active.length, created: Math.max(...cards.map((c) => Date.parse(c.created) || 0)) };
  });
}
function myCardsList(lang) {
  const groups = cardGroups(lang), sort = ui.cardSort || "recent", k = koCls(lang);
  const sorted = [...groups].sort(sort === "az" ? (a, b) => a.lemma.localeCompare(b.lemma, lang)
    : sort === "due" ? (a, b) => (a.paused - b.paused) || ((a.due || 0) - (b.due || 0))
    : (a, b) => b.created - a.created);
  const langTabs = Object.entries(LANGUAGES).map(([id, l]) => {
    const n = new Set(state.cards.filter((c) => c.lang === id).map((c) => c.lemma)).size;
    return `<a class="${id === lang ? "active" : ""}" href="#/lang/${id}/revisions" ${id === lang ? 'aria-current="page"' : ""}>${l.flag} ${l.name} (${n})</a>`;
  }).join("");
  const sortBtn = (id, label) => `<button class="chip ${sort === id ? "active" : ""}" data-act="card-sort" data-s="${id}" aria-pressed="${sort === id}">${label}</button>`;
  return `<h2 class="section-title" id="mes-mots">Mes mots en révision</h2>
    <nav class="sub-nav" aria-label="Langue">${langTabs}</nav>
    ${groups.length ? `
    <div class="cards-tools">
      <input class="input" id="card-search" type="search" placeholder="Rechercher un mot ou une traduction…" aria-label="Rechercher dans mes mots" />
      <div class="choice-row" role="group" aria-label="Trier">${sortBtn("recent", "Récents")}${sortBtn("due", "Prochaine révision")}${sortBtn("az", "A → Z")}</div>
    </div>
    <div class="my-cards">
      ${sorted.map((g) => {
        const m = g.main, types = [...new Set(g.cards.map((c) => c.type))];
        return `<div class="my-card ${g.paused ? "paused" : ""}" data-search="${esc(`${g.lemma} ${m.surface} ${lexFr(lang, g.lemma)} ${m.fr || ""}`.toLowerCase())}">
          <div class="mc-head">
            <button class="mc-word ${k}" data-act="say" data-text="${esc(m.surface || g.lemma)}" data-lang="${lang}" title="Écouter">${esc(m.surface || g.lemma)}${m.surface && m.surface !== g.lemma ? ` <small class="muted">← ${esc(g.lemma)}</small>` : ""}</button>
            <span class="mc-st st-${g.status[0]}">${g.status[1]}</span>
          </div>
          <p class="mc-fr">${esc(m.fr || lexFr(lang, g.lemma))}</p>
          ${m.context ? `<p class="mc-ctx ${k}">${esc(m.before)}<mark>${esc(m.surface)}</mark>${esc(m.after)} <button class="mini" data-act="say" data-text="${esc(m.context)}" data-lang="${lang}" aria-label="Écouter la phrase">🔊</button></p>${m.contextFr ? `<p class="muted mc-ctxfr"><small>${esc(m.contextFr)}</small></p>` : ""}` : ""}
          <div class="mc-foot">
            <span class="muted"><small>${types.map((t) => `<span title="${CARD_TYPE_ICON[t]?.[1] || t}">${CARD_TYPE_ICON[t]?.[0] || "🃏"}</span>`).join(" ")} · ajouté le ${new Date(g.created).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</small></span>
            <button class="mini" data-act="card-pause" data-l="${esc(g.lemma)}">${g.paused ? "▶ Remettre en révision" : "Retirer des révisions"}</button>
          </div>
        </div>`;
      }).join("")}
    </div>
    <p class="muted" id="card-none" hidden>Aucun mot ne correspond.</p>`
    : `<div class="card"><p class="muted" style="margin:0">Aucun mot pour l'instant. Pendant la lecture, touche un mot inconnu puis « + Ajouter aux révisions » : il apparaîtra ici, avec sa phrase.</p></div>`}`;
}

function startReview(lang) {
  ui.review = { lang, queue: [...reviewQueue(lang), ...newCards(lang)].map((c) => c.id), revealed: false, typed: "", done: 0 };
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
    const labels = [[1, "À revoir", "again", "↺"], [2, "Difficile", "hard", "〰"], [3, "Bien", "good", "✓"], [4, "Facile", "easy", "⚡"]];
    buttons = `<div class="rate">${labels.map(([g, l, cls, ico]) => `<button class="rate-btn ${cls}" data-act="rate" data-g="${g}" aria-keyshortcuts="${g}"><b><span aria-hidden="true">${ico}</span> ${l}</b><small>${fmtInterval(prev[g].card.due, new Date())}</small><kbd aria-hidden="true">${g}</kbd></button>`).join("")}</div>`;
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
// Deux correcteurs : le LLM (compte connecté, serveur configuré) et, en secours,
// la comparaison avec des réponses de référence (hors ligne, invité).
const llmReady = () => !!(account && features.llm);

function tabProduce(lang) {
  currentExercise(lang);
  const P = ui.prod, k = koCls(lang);
  const ex = P.mode === "free" ? P.free : P.ex;
  const recent = [...recentLemmas(lang)].slice(0, 8);
  const r = P.result;
  let fb = "";
  if (P.loading) fb = `<div class="card feedback loading">${mochi("small", "thinking")}<p><b>Mochi relit ta phrase…</b>${/Ollama/.test(features.engine || "") ? "<br/><small class=\"muted\">Modèle local : ça peut prendre jusqu'à une minute.</small>" : ""}</p></div>`;
  else if (r) {
    const label = { grammaire: "Grammaire", vocabulaire: "Vocabulaire", registre: "Registre", orthographe: "Orthographe" };
    const head = r.perfect
      ? `<h3>✅ ${r.verdict === "acceptable" ? "C'est correct !" : "C'est naturel, bravo !"}</h3>${r.alt ? `<p class="muted">${r.verdict === "acceptable" ? "Un natif dirait plutôt" : "On dit aussi"} : <span class="${k}">${esc(r.alt)}</span></p>` : ""}`
      : `<h3>Version naturelle</h3><p class="recast ${k}">${r.tHtml}</p><p class="muted">Ta phrase : <span class="${k}">${r.uHtml}</span></p>`;
    const issues = r.llm
      ? r.errors.map((e) => `<div class="issue ${e.type === "registre" ? "reg" : ""}"><b>${label[e.type]}</b> ${e.original ? `<span class="${k}"><del>${esc(e.original)}</del> → <ins>${esc(e.correction)}</ins></span>` : `<span class="${k}">+ <ins>${esc(e.correction)}</ins></span>`}${P.why ? `<br/><small>${esc(e.explanation)}</small>` : ""}</div>`).join("")
      : r.issues.register.map((i) => `<div class="issue ${i.ok ? "soft" : "reg"}"><b>Registre</b> ${esc(i.msg)}</div>`).join("")
        + r.issues.particles.map((i) => `<div class="issue"><b>Particule</b> <span class="ko">${esc(i.stem)}<del>${esc(i.got)}</del> → ${esc(i.stem)}<ins>${esc(i.want)}</ins></span> · ${esc(i.explain || "")}</div>`).join("");
    const why = r.llm ? r.explanation : ex.why;
    fb = `<div class="card feedback">
      ${head}${issues}
      ${r.encouragement ? `<p class="encourage">🍡 ${esc(r.encouragement)}</p>` : ""}
      <div class="wp-actions">
        <button class="btn ghost small" data-act="say" data-text="${esc(r.target)}" data-lang="${lang}">🔊 Écouter</button>
        ${why ? `<button class="btn ghost small" data-act="why">${P.why ? "Masquer" : "Pourquoi ?"}</button>` : ""}
        <button class="btn small" data-act="next-ex">Phrase suivante →</button>
      </div>
      ${P.why && why ? `<p class="why">💡 ${esc(why)}</p>` : ""}
      <p class="muted corrector"><small>${r.llm ? `✨ Corrigé par ${esc(P.engine || features.engine || "l'IA")}${P.remaining != null ? ` · ${P.remaining} correction(s) restante(s) aujourd'hui` : ""}` : `Correcteur hors ligne${P.llmError ? ` (${esc(P.llmError)})` : ""} : compare avec des réponses types.`}</small></p>
    </div>`;
  }
  const modes = `<div class="seg-ctl mode-ctl">
      <button class="${P.mode !== "free" ? "on" : ""}" data-act="prod-mode" data-v="guided">🎯 Guidé</button>
      <button class="${P.mode === "free" ? "on" : ""}" data-act="prod-mode" data-v="free">✍️ Phrase libre</button>
    </div>`;
  if (P.mode === "free" && !llmReady()) {
    return `${modes}<div class="card empty">${mochi("small", "curious")}<h2>Phrases libres</h2>
      <p class="muted">Pour écrire ce que tu veux et être corrigé·e intelligemment, ${account ? "le correcteur IA doit être activé sur le serveur (voir SETUP.md)." : "connecte-toi : le correcteur IA est réservé aux comptes."}</p>
      ${account ? "" : `<a class="btn" href="#/connexion">Se connecter</a>`}</div>`;
  }
  return `
    ${modes}
    <div class="card prod">
      ${ex.who ? `<div class="who"><span class="tag">👤 ${esc(ex.who)}</span>${isKo(lang) ? `<span class="tag">Registre : poli en -요</span>` : ""}</div>` : ""}
      <h2 style="margin:10px 0 14px">${esc(ex.prompt)}</h2>
      ${P.mode === "free" && recent.length ? `<p class="muted" style="margin:-6px 0 12px">Essaie de réutiliser un de tes mots récents 👇</p>` : ""}
      <textarea id="prod-text" class="input ${k}" rows="${P.mode === "free" ? 3 : 2}" maxlength="500" placeholder="${isKo(lang) ? "한국어로 써 보세요…" : "Write in English…"}" ${r || P.loading ? "disabled" : ""}>${esc(P.text)}</textarea>
      ${recent.length ? `<p class="muted" style="margin:10px 0 0"><small>Tes mots récents : ${recent.map((w) => `<span class="tag ${k}">${esc(w)}</span>`).join(" ")}</small></p>` : ""}
      ${r || P.loading ? "" : `<div class="wp-actions"><button class="btn" data-act="check-prod">Vérifier</button><button class="btn ghost small" data-act="next-ex">Autre phrase</button></div>`}
    </div>
    ${fb}
    <p class="muted"><small>On te renvoie ta phrase reformulée plutôt qu'un simple « faux ». ${isKo(lang) ? "Le registre est vérifié selon l'interlocuteur. " : ""}Les variantes correctes sont acceptées.${llmReady() ? "" : account ? "" : " Connecte-toi pour le correcteur IA."}</small></p>`;
}

function pickFree(lang, skip) {
  const list = FREE_PROMPTS[lang].filter((p) => p.prompt !== skip);
  return list[Math.floor(Math.random() * list.length)];
}

// Comptabilise l'exercice (session, XP, activité) et les erreurs récurrentes
function recordProduction(lang, exId, particleErrors) {
  const L = state.langs[lang];
  for (const pe of particleErrors) {
    L.errors[pe.particle] = (L.errors[pe.particle] || 0) + 1;
    if (L.errors[pe.particle] >= 2 && pe.before != null) {
      if (addCard(lang, { type: "cloze", lemma: pe.particle, before: pe.before, surface: pe.particle, after: pe.after, contextFr: pe.contextFr, fr: LEXICON.ko[pe.particle]?.fr || pe.particle, source: exId })) toast(`🎯 Carte ciblée créée pour la particule ${pe.particle}`);
    }
  }
  if (exId) L.prodDone[exId] = today();
  L.xp += 5;
  track(lang, "prod");
  bumpSession(lang, "production");
}

async function checkProduction(lang, text) {
  const P = ui.prod;
  P.text = text;
  if (llmReady()) {
    const ex = P.mode === "free" ? P.free : P.ex;
    P.loading = true; render();
    try {
      const reference = P.mode === "free" ? null : plain(parseSentence(ex.target, lang));
      const { feedback: f, remaining, engine } = await api("POST", "/api/feedback", { lang, prompt: ex.prompt, who: ex.who || null, register: ex.register || null, reference, text });
      const perfect = f.verdict !== "errors";
      const d = recast(text, f.recast, lang);
      P.result = { llm: true, perfect, verdict: f.verdict, alt: perfect && norm(lang, f.recast) !== norm(lang, text) ? f.recast : "", target: f.recast, tHtml: d.tHtml, uHtml: d.uHtml, errors: f.errors, explanation: f.explanation, encouragement: f.encouragement };
      P.remaining = remaining; P.engine = engine;
      // Particules ratées → cartes ciblées, à partir de la phrase corrigée
      const pes = isKo(lang) ? f.errors.filter((e) => e.particle && KO_PARTICLES.has(e.particle)).map((e) => {
        const i = f.recast.indexOf(e.correction);
        const end = i + e.correction.length;
        const ok = i >= 0 && e.correction.endsWith(e.particle);
        return { particle: e.particle, before: ok ? f.recast.slice(0, end - e.particle.length) : null, after: ok ? f.recast.slice(end) : null, contextFr: ex.prompt };
      }) : [];
      recordProduction(lang, P.mode === "free" ? null : ex.id, pes);
      P.loading = false;
      return;
    } catch (e) {
      P.loading = false;
      P.llmError = e.message;
      if (P.mode === "free") { P.result = null; toast(e.message); return; } // pas de réponse type en mode libre
    }
  }
  checkProductionLocal(lang, text);
}
const norm = (lang, s) => (isKo(lang) ? normKo : normEn)(s);

function checkProductionLocal(lang, text) {
  const P = ui.prod, ex = P.ex;
  const tWords = parseSentence(ex.target, lang);
  const target = plain(tWords);
  const cands = [target, ...ex.accept];
  const match = cands.find((c) => norm(lang, c) === norm(lang, text));
  const issues = isKo(lang) ? koChecks(ex, text, tWords) : { register: [], particles: [] };
  if (match) {
    issues.particles = [];
    P.result = { perfect: true, alt: norm(lang, match) === norm(lang, target) ? (ex.accept[0] || "") : target, target, issues };
  } else {
    const best = cands.map((c) => ({ c, r: recast(text, c, lang) })).sort((a, b) => b.r.sim - a.r.sim)[0];
    P.result = { perfect: false, ...best.r, target: best.c, issues };
  }
  const pes = issues.particles.map((i) => {
    const wi = tWords.findIndex((w) => w.segs.map((s) => s.surface).join("").startsWith(i.stem) && w.segs.some((s) => s.particle));
    const gi = wi >= 0 ? tWords[wi].segs.findIndex((s) => s.particle) : -1;
    if (!(gi > 0 && tWords[wi].segs.length === gi + 1)) return { particle: i.want, before: null };
    return { particle: i.want, ...splitAround(tWords, wi, gi), contextFr: ex.prompt };
  });
  recordProduction(lang, ex.id, pes);
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
      <a class="btn ghost small" href="#/lang/${lang}/revisions">📋 Voir mes mots en révision</a>
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
// Paires minimales multi-voix (HVPT, §14) : plusieurs voix, plusieurs mots par
// contraste, retour immédiat, réécoute des options et score par contraste.
const earKey = (pair) => pair.label;
function pickPair(lang, avoid) {
  const E = EAR[lang], S = state.langs[lang].earStats;
  // Plus de poids aux contrastes faibles ou peu travaillés
  const items = E.pairs.map((p, i) => { const st = S[earKey(p)] || { n: 0, ok: 0 }; return { i, w: i === avoid ? 0.01 : 1 + 3 * (1 - (st.ok + 1) / (st.n + 2)) }; });
  let r = Math.random() * items.reduce((t, x) => t + x.w, 0);
  for (const x of items) if ((r -= x.w) < 0) return x.i;
  return 0;
}
function earScores(lang) {
  const S = state.langs[lang].earStats;
  return [...new Set(EAR[lang].pairs.map(earKey))].map((k) => ({ k, n: S[k]?.n || 0, ok: S[k]?.ok || 0 }));
}
function tabEar(lang) {
  const E = EAR[lang];
  if (!ui.ear || ui.ear.lang !== lang) ui.ear = { lang, i: pickPair(lang), target: null, picked: null, score: 0, n: 0, who: 0 };
  const G = ui.ear, pair = E.pairs[G.i], k = koCls(lang), nVoices = speakers(lang).length;
  const scores = earScores(lang).filter((x) => x.n);
  return `
    <div class="card">
      <h3>Qu'est-ce que tu entends ?</h3>
      <p class="muted" style="margin:4px 0 14px">${esc(pair.label)} · score ${G.score}/${G.n}${G.target ? ` · voix ${G.who + 1}/${nVoices}` : ""}</p>
      <button class="big-audio" data-act="ear-play" aria-label="Écouter">🔊</button>
      <div class="choice-row center" style="margin-top:16px">
        ${pair.items.map((w) => {
          const cls = G.picked ? (w === G.target ? "right" : w === G.picked ? "wrong" : "") : "";
          return `<button class="choice ${k} ${cls}" data-act="ear-pick" data-w="${esc(w)}" ${G.target ? "" : "disabled"} ${isKo(lang) ? 'lang="ko"' : 'lang="en"'}>${G.picked ? (w === G.target ? "✓ " : w === G.picked ? "✗ " : "") : ""}${esc(w)}</button>`;
        }).join("")}
      </div>
      ${G.picked ? `<p class="center muted" style="margin:12px 0 0">${G.picked === G.target ? "Bien entendu !" : `Presque ! C'était <b class="${k}">${esc(G.target)}</b>. Réécoute les deux :`}</p>
        <div class="choice-row center" style="margin-top:8px">${pair.items.map((w) => `<button class="btn ghost small ${k}" data-act="ear-replay" data-w="${esc(w)}">🔊 ${esc(w)}</button>`).join("")}</div>
        <div class="wp-actions center"><button class="btn small" data-act="ear-next">Suivant →</button></div>` : !G.target ? `<p class="muted center"><small>Appuie sur 🔊 pour commencer. Chaque mot est prononcé par plusieurs voix : c'est ce qui entraîne vraiment l'oreille.</small></p>` : ""}
    </div>
    ${scores.length ? `<h2 class="section-title">Mes scores par son</h2><div class="card">${scores.map((x) => `
      <div class="reg-row"><b class="${k}">${esc(x.k)}</b><span class="bar ear-bar" style="flex:1"><span style="width:${pct(x.ok / x.n)}%"></span></span><small class="muted">${x.ok}/${x.n}${x.n >= 4 && x.ok / x.n < 0.7 ? " · à travailler" : ""}</small></div>`).join("")}
      <p class="muted"><small>Les sons les plus faibles reviennent plus souvent.</small></p></div>` : ""}
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
  ui.quiz = { key, qs: questions, queue: questions.map((_, i) => i), failed: new Set(), answer: null, onDone, total: questions.length, build: { l: null, v: null, f: null } };
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
      ${q.finals ? `<p class="muted" style="margin:12px 0 0"><small>Consonne du bas (받침) :</small></p><div class="choice-row center" style="margin-top:6px">${q.finals.map((x) => `<button class="choice ko ${Q.build.f === x ? "active" : ""}" data-act="build-f" data-x="${x}" ${A ? "disabled" : ""}>${x}</button>`).join("")}</div>` : ""}
      ${A ? (A.ok ? `<p class="ok-msg">Bien joué !</p>` : `<p class="ko-msg">C'était <b class="ko">${q.target}</b> = ${q.target_l} + ${q.target_v}${q.target_f ? ` + ${q.target_f}` : ""}</p>`) : `<div class="center" style="margin-top:16px"><button class="btn" data-act="build-check" ${Q.build.l && Q.build.v && (!q.finals || Q.build.f) ? "" : "disabled"}>Vérifier</button></div>`}`;
  } else if (q.type) {
    body = `<p class="q-label">Écris ce que tu entends <span class="muted">(${esc(q.fr)})</span></p>
      <button class="big-audio" data-act="say" data-text="${q.target}" data-lang="ko">🔊</button>
      ${A ? `<p class="${A.ok ? "ok-msg" : "ko-msg"}">${A.ok ? "Bien joué !" : `Tu as écrit <b class="ko">${esc(A.picked || "…")}</b> · c'était <b class="ko">${q.target}</b>`}</p>`
        : `<form class="type-form" data-quiz-type="1"><input class="input answer ko" id="quiz-type" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="한글로…" />
          <p class="muted" style="margin:6px 0 0"><small>Pas de clavier coréen ? Ouvre « ⌨️ 한글 » juste en dessous.</small></p>
          <div class="center" style="margin-top:12px"><button class="btn">Vérifier</button></div></form>`}`;
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
  Q.answer = null; Q.build = { l: null, v: null, f: null };
  const q = Q.qs[Q.queue[0]];
  if (q?.autoplay) setTimeout(() => speak(q.audio, "ko"), 250);
}

// ---------- Module Hangul (§6) ----------
const LEADS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ", VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const BASIC_C = [..."ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ"], BASIC_V = [..."ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ"];
const FINALS = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"];
const BASIC_F = [..."ㄱㄴㄷㄹㅁㅂㅅㅇ"]; // les finales les plus courantes
const composeHangul = (l, v, f = "") => String.fromCharCode(0xac00 + (LEADS.indexOf(l) * 21 + VOWELS.indexOf(v)) * 28 + FINALS.indexOf(f));
function decomposeHangul(s) { const c = s.charCodeAt(0) - 0xac00; return [LEADS[Math.floor(c / 588)], VOWELS[Math.floor((c % 588) / 28)], FINALS[c % 28]]; }
const distractors = (pool, right, n = 3) => shuffle([right, ...shuffle(pool.filter((x) => x !== right)).slice(0, n)]);

function hangulQuestions(day) {
  const d = HANGUL_DAYS[day - 1];
  if (d.kind === "jamo") {
    // Distracteurs de la même famille (voyelles avec voyelles…) pour que l'audio reste sans ambiguïté
    const isV = (c) => VOWELS.includes(c);
    const noHomophone = (pool, ch) => pool.filter((x) => !(HANGUL_HOMOPHONES[ch] || []).includes(x));
    const seenAll = HANGUL_DAYS.slice(0, day).filter((x) => x.kind === "jamo").flatMap((x) => x.items);
    return shuffle(d.items.flatMap(([ch, rom, say]) => { const seen = seenAll.filter((x) => isV(x[0]) === isV(ch)); return [
      { ask: "Quel son fait cette lettre ?", prompt: `<div class="big-char ko">${ch}</div>`, options: distractors([...new Set(seen.map((x) => x[1]))], rom), answer: rom, audio: say },
      ch === "ㅇ" ? null : { ask: "Quelle lettre entends-tu ?", prompt: `<button class="big-audio" data-act="say" data-text="${say}" data-lang="ko">🔊</button>`, options: distractors(noHomophone(seen.map((x) => x[0]), ch), ch), answer: ch, optCls: "ko", audio: say, autoplay: true, after: `<span class="ko">${say}</span>` },
    ].filter(Boolean); }));
  }
  if (d.kind === "build" || d.kind === "buildFinal") {
    const fin = d.kind === "buildFinal";
    const builds = d.items.map(([syl, rom]) => {
      const [l, v, f] = decomposeHangul(syl);
      return { build: true, target: syl, rom, target_l: l, target_v: v, target_f: f, leads: distractors(fin ? [...BASIC_C, "ㄲ", "ㄸ", "ㅃ", "ㅆ", "ㅉ"] : BASIC_C, l, 3), vowels: distractors(BASIC_V, v, 3), finals: fin ? distractors(BASIC_F, f, 3) : null, audio: syl };
    });
    // Écrire ce qu'on entend, avec le clavier coréen (keyboard.js)
    const typing = (d.type || []).map(([w, fr]) => ({ type: true, target: w, fr, audio: w, autoplay: true }));
    return [...shuffle(builds), ...shuffle(typing)];
  }
  return shuffle(d.items.map(([w, rom]) => ({ ask: "Comment se lit ce mot ?", prompt: `<div class="big-char ko">${w}</div>`, options: distractors(d.items.map((x) => x[1]), rom), answer: rom, audio: w })));
}

function viewHangul(day) {
  const d = HANGUL_DAYS[day - 1];
  const K = state.langs.ko;
  if (!d) return viewNotFound();
  if (day > 1 && !K.hangulDays[day - 1] && !K.hangulDone && !isAdmin()) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "focused")}<h2>Un jour à la fois</h2><p class="muted">Termine d'abord le jour ${day - 1}.</p><a class="btn" href="#/lang/ko/hangul/${day - 1}">Jour ${day - 1}</a></div></section>`;
  const key = `hangul-${day}`;
  if (ui.quiz?.key === key && ui.quiz.started) return viewQuiz("#/lang/ko/parcours", `Jour ${day}`);
  const intro = d.kind === "jamo"
    ? `<div class="alpha-grid">${d.items.map(([ch, rom, say]) => `<button class="alpha ko" data-act="say" data-text="${say}" data-lang="ko"><span>${ch}<small>${K.hangulDone ? "" : rom}</small></span></button>`).join("")}</div>
       <p class="muted"><small>Touche une lettre pour l'entendre (dans une syllabe : ${d.items[0][2]}). <b>Écoute d'abord</b> : les repères écrits ne sont qu'une aide.</small></p>
       <details class="fr-guide"><summary>Comment lire les repères ?</summary><p class="muted"><small>Ils sont pensés pour un francophone (la romanisation officielle, faite pour l'anglais, trompe : son « u » se lirait comme dans « lune » alors que ㅜ se dit « ou »).<br/>
       <b>ô</b> = o fermé (beau) · <b>o</b> = o ouvert (porte) · <b>ou</b> comme « loup » · <b>eu</b> lèvres étirées · une consonne suivie de <b>h</b> est soufflée (kh, th, ph) · une consonne <b>doublée</b> est tendue, sans souffle (kk, tt, pp). Ils disparaissent à la fin du module.</small></p></details>`
    : d.kind === "build"
    ? `<p>Une syllabe coréenne = un bloc. Tout dépend de la forme de la voyelle :</p>
       <ul><li>voyelle <b>verticale</b> (ㅏ ㅓ ㅣ ㅑ ㅕ…) : la consonne va <b>à gauche</b> → ㄴ + ㅏ = <b class="ko">나</b></li>
       <li>voyelle <b>horizontale</b> (ㅗ ㅜ ㅡ ㅛ ㅠ) : la consonne va <b>au-dessus</b> → ㅁ + ㅗ = <b class="ko">모</b>, ㅅ + ㅜ = <b class="ko">수</b></li></ul>
       <p class="muted"><small>Une syllabe commence toujours par une consonne : ㅇ en début de syllabe est muet, il « tient la place » → 아 = « a ».</small></p>`
    : d.kind === "buildFinal"
    ? `<p>Une syllabe peut avoir une 3ᵉ lettre, <b>en bas</b> : le 받침. Elle se place sous la consonne et la voyelle, quelle que soit leur forme.</p>
       <div class="build-demo ko"><span>ㅎ + ㅏ + ㄴ = <b>한</b></span><span>ㄱ + ㅜ + ㄱ = <b>국</b></span><span>ㅇ + ㅗ + ㅅ = <b>옷</b></span></div>
       <p><b>En fin de syllabe, il n'existe que 7 sons</b> : [k] (ㄱ ㅋ ㄲ), [n] (ㄴ), [t] (ㄷ ㅅ ㅆ ㅈ ㅊ ㅌ ㅎ), [l] (ㄹ), [m] (ㅁ), [p] (ㅂ ㅍ), [ng] (ㅇ). Ainsi 옷 se dit « ot ».</p>
       <p class="muted"><small>À la fin, tu écriras des mots que tu entends, avec le clavier coréen du site.</small></p>`
    : `<p>Une consonne peut se placer <b>sous</b> le bloc : c'est le 받침 (consonne finale).</p>
       <div class="build-demo ko"><span>하 + ㄴ = <b>한</b></span><span>구 + ㄱ = <b>국</b></span><span>바 + ㅂ = <b>밥</b></span></div>`;
  return `<section class="view lesson-shell">
    <div class="lesson-top"><a class="close" href="#/lang/ko/parcours" aria-label="Quitter">✕</a><div style="flex:1"><small class="muted">Hangul · jour ${day} / ${HANGUL_DAYS.length}</small><h1 style="font-size:1.4rem">${d.title}</h1></div></div>
    <div class="card" style="margin-top:18px">${intro}</div>
    <p class="muted"><small>💡 La romanisation n'est qu'une aide temporaire pendant ce module. Elle disparaîtra ensuite.</small></p>
    ${d.kind === "build" || d.kind === "buildFinal" || d.kind === "words" ? `<p class="center"><a class="btn ghost small" href="#/lang/ko/atelier">🧪 Atelier des syllabes : assemble-les toi-même</a></p>` : ""}
    <div class="center"><button class="btn" data-act="start-hangul" data-day="${day}">Je m'entraîne</button></div>
  </section>`;
}

// ---------- Grammaire coréenne, un point à la fois (§6) ----------
function viewGrammar(id) {
  const i = KO_GRAMMAR.findIndex((g) => g.id === id);
  const g = KO_GRAMMAR[i];
  if (!g) return viewNotFound();
  const K = state.langs.ko;
  if (!isAdmin() && (!K.hangulDone || (i > 0 && !K.grammarDone[KO_GRAMMAR[i - 1].id]))) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "focused")}<h2>Un point à la fois</h2><p class="muted">Termine d'abord le point précédent : c'est comme ça qu'on passe le cap.</p><a class="btn" href="#/lang/ko/parcours">Parcours</a></div></section>`;
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
        <div class="s-body"><p class="s-text ko">${s.words.map((w) => esc(w.pre) + w.segs.map((x) => `<span class="w ${x.particle ? `pt pt-${particleFn(x.surface)[0]}` : ""}">${esc(x.surface)}</span>`).join("") + esc(w.post)).join(" ")}</p>
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
    ${verifyBanner()}
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

    ${typeof lookCard === "function" ? lookCard() : ""}

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

    <h2 class="section-title">Affichage</h2>
    <div class="card settings">
      <label>Taille du texte : <b>${pct(S.textScale)} %</b>
        <input type="range" min="0.9" max="1.5" step="0.05" value="${S.textScale}" data-set="textScale" /></label>
      <label class="row"><input type="checkbox" ${S.zen ? "checked" : ""} data-set="zen" /> Mode lecture zen (aucun surlignage des mots dans le lecteur)</label>
      <div><span>Thème</span>
        <div class="choice-row" role="radiogroup" aria-label="Thème" style="margin-top:6px">${[["auto", "🖥️ Comme l'appareil"], ["light", "☀️ Clair"], ["dark", "🌙 Sombre"]].map(([v, l]) => `<button class="choice ${(S.theme || "auto") === v ? "active" : ""}" role="radio" aria-checked="${(S.theme || "auto") === v}" data-act="theme" data-v="${v}">${l}</button>`).join("")}</div></div>
    </div>

    <h2 class="section-title">Audio</h2>
    ${audioCard()}

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
      <a class="btn ghost small" href="#/pourquoi">🔬 Pourquoi ça marche ?</a>
      <button class="btn ghost small" data-tour="open">🧭 Revoir la visite guidée</button>
      ${isAdmin() ? `<a class="btn small" href="#/admin">🛠️ Tableau de bord admin</a>` : ""}
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

// Profil › Audio : quelles voix sont disponibles, laquelle utiliser, et quoi faire s'il n'y en a pas
function audioCard() {
  const S = state.settings;
  const rows = Object.entries(LANGUAGES).map(([id, l]) => {
    const sv = serverVoices(id), bv = voicesFor(id), src = audioSource(id), pref = S.voices?.[id] || "";
    const status = src === "server" ? `<span class="badge ok">🎙️ Voix neuronales du serveur (${sv.length})</span>`
      : src === "browser" ? `<span class="badge">🔈 Voix du navigateur (${bv.length})</span>`
      : `<span class="badge warn">🔇 Aucune voix ${id === "ko" ? "coréenne" : "anglaise"}</span>`;
    const opts = [
      ...sv.map((v) => [v, `🎙️ ${v} (serveur)`]),
      ...bv.map((v) => [`browser:${v.name}`, `🔈 ${v.name}${/natural|neural|online|premium|enhanced/i.test(v.name) ? " ✨" : ""}`]),
    ];
    return `<div class="voice-row">
      <div class="audio-head"><b>${l.flag} ${l.name}</b> ${status}</div>
      ${opts.length ? `<div class="audio-ctl">
        <select class="input" data-voice="${id}" aria-label="Voix ${l.name}"><option value="">Automatique (la meilleure trouvée)</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === pref ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
        <button class="btn ghost small" data-act="say" data-lang="${id}" data-text="${esc(id === "ko" ? "안녕하세요! 저는 모찌예요." : "Hi! I'm Mochi. Nice to meet you.")}">▶ Tester</button>
      </div>` : ""}
    </div>`;
  }).join("");
  const anyMute = Object.keys(LANGUAGES).some((id) => !audioSource(id));
  return `<div class="card settings">
    ${rows}
    <label>Vitesse de lecture : <b>${pct(S.speed)} %</b>
      <input type="range" min="0.6" max="1.2" step="0.05" value="${S.speed}" data-set="speed" /></label>
    <details class="audio-help" ${anyMute ? "open" : ""}>
      <summary><b>Pas de son, ou une voix robotique ?</b></summary>
      <p class="muted">Sans voix serveur, Mochi utilise les voix installées sur ton appareil. Pour en ajouter :</p>
      <ul class="muted">
        <li><b>Le plus simple</b> : ouvre Mochi dans <b>Microsoft Edge</b> (voix « Natural » coréennes et anglaises, gratuites, même sous Linux) ou <b>Google Chrome</b> (voix « Google »).</li>
        <li><b>Windows</b> : Paramètres › Heure et langue › Voix › Ajouter des voix › coréen.</li>
        <li><b>macOS / iPhone</b> : Réglages › Accessibilité › Contenu énoncé › Voix › coréen (Yuna) et anglais.</li>
        <li><b>Android</b> : Paramètres › Synthèse vocale › Moteur Google › installer les données coréennes.</li>
        <li><b>Linux (Chromium, Firefox)</b> : installe <code>speech-dispatcher</code> et <code>espeak-ng</code>, puis redémarre le navigateur. Ça marche, mais la voix est très robotique.</li>
      </ul>
      <p class="muted"><small>Les meilleures voix sont celles du serveur (Kokoro, MeloTTS…) : voir SETUP.md, section « Vraies voix ».</small></p>
    </details>
  </div>`;
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
  if (!serverOn) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "thinking")}<h2>Comptes indisponibles</h2>
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
    <p class="center muted">${signup ? `Déjà un compte ? <a class="lnk" href="#/connexion">Se connecter</a>` : `<a class="lnk" href="#/mot-de-passe-oublie">Mot de passe oublié ?</a> · Pas encore de compte ? <a class="lnk" href="#/inscription">Créer un compte</a>`}</p>
  </section>`;
}

// ---------- Tableau de bord admin ----------
// Contenu : calculé ici depuis content.js & co. Comptes et usage : GET /api/admin/stats.
function contentStats() {
  const sentences = (l) => TEXTS[l].reduce((a, t) => a + t.parsed.length, 0);
  return Object.keys(LANGUAGES).map((l) => ({
    lang: l,
    rows: [
      ["📖 Textes", TEXTS[l].length, `${sentences(l)} phrases`],
      ["📚 Livres gradués", BOOKS[l].length, `${BOOKS[l].reduce((a, b) => a + b.chapters.length, 0)} chapitres`],
      ["📒 Mots du lexique", Object.keys(LEXICON[l]).length, `${Object.keys(SEMANTIC_GROUPS[l] || {}).length} catégories, ${(CONFUSABLE[l] || []).length} paires de contraires`],
      ["💬 Exercices de production", PRODUCTION[l].length, `${(FREE_PROMPTS[l] || []).length} sujets libres`],
      ["🎧 Paires de sons", EAR[l].pairs.length, ""],
      ["🎯 Types d'exercices", Object.keys(EX_KINDS).length, "communs aux deux langues"],
      ...(l === "ko" ? [["🔤 Jours de Hangul", HANGUL_DAYS.length, ""], ["🧱 Points de grammaire", KO_GRAMMAR.length, `${Object.keys(REGISTERS).length} registres`], ["🧭 Test de niveau", KO_LOANS.length, "mots d'emprunt"]]
        : [["🎭 Faux amis", FAUX_AMIS.length, ""], ["🧭 Test de niveau", EN_BANDS.length * EN_BANDS[0].length, `${EN_BANDS.length} tranches + ${EN_FAKE.length} faux mots`]]),
    ],
  }));
}
function viewAdmin() {
  if (!isAdmin()) return viewNotFound();
  const A = ui.admin;
  if (!A) {
    ui.admin = { loading: true };
    api("GET", "/api/admin/stats").then((d) => { ui.admin = { d }; }).catch((e) => { ui.admin = { err: e.message }; }).finally(() => { if (location.hash === "#/admin") render(); });
  }
  const d = ui.admin.d, fmtDate = (x) => (x ? new Date(x).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" }) : "—");
  const kb = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : `${Math.round(b / 1e3)} Ko`);
  const stat = (ico, n, label) => `<div class="stat"><span class="ico">${ico}</span><div><b>${n}</b><small>${label}</small></div></div>`;
  const features = d ? [
    ["Correcteur IA (Produire)", d.llm.engine ? `✅ ${esc(d.llm.engine)}` : "❌ désactivé", d.llm.engine ? `${d.llm.today} correction(s) aujourd'hui, ${d.llm.total} au total · ${d.llm.daily} max / compte / jour` : ""],
    ["Vraies voix", Object.keys(d.tts.voices).length ? `✅ ${Object.entries(d.tts.voices).map(([l, v]) => `${LANGUAGES[l].flag} ×${v.length}`).join(" ")}` : "🔈 navigateur", `${d.tts.files} phrase(s) en cache (${kb(d.tts.bytes)})`],
    ["E-mails", d.mail === "resend" ? "✅ Resend" : "🖥️ terminal (pas d'envoi)", d.mail === "resend" ? "" : "RESEND_API_KEY absent"],
    ["Appli installable / hors ligne", "serviceWorker" in (globalThis.navigator || {}) ? "✅" : "❌ navigateur non compatible", ""],
    ["FSRS (révisions espacées)", HAS_FSRS ? "✅ ts-fsrs 5.2.3" : "⚠️ non chargé", ""],
  ] : [];
  return `<section class="view">
    <h1>🛠️ Tableau de bord</h1>
    <p class="muted">Visible seulement par les admins. Toutes les leçons sont ouvertes pour toi, sans prérequis.</p>

    <h2 class="section-title">Comptes et usage</h2>
    ${ui.admin.err ? `<div class="card"><p class="form-err">${esc(ui.admin.err)}</p></div>` : !d ? `<div class="card"><p class="muted">Chargement…</p></div>` : `
    <div class="card"><div class="stat-grid admin-grid">
      ${stat("👥", d.users.total, "comptes")}${stat("✉️", d.users.verified, "adresses confirmées")}
      ${stat("🆕", `${d.users.new7} / ${d.users.new30}`, "nouveaux (7 j / 30 j)")}${stat("🔥", d.users.active7, "actifs sur 7 jours")}
      ${stat("🃏", d.cards.reduce((a, x) => a + x.n, 0), d.cards.map((x) => `${LANGUAGES[x.lang]?.flag || "?"} ${x.n}`).join(" · ") || "cartes")}${stat("🧠", d.reviews.total, "révisions enregistrées")}
    </div></div>

    <h2 class="section-title">Fonctionnalités</h2>
    <div class="card"><table class="admin-table"><tbody>${features.map(([n, st, info]) => `<tr><th scope="row">${n}</th><td>${st}</td><td class="muted">${info}</td></tr>`).join("")}</tbody></table></div>`}

    <h2 class="section-title">Contenu</h2>
    <div class="lang-grid">${contentStats().map((c) => `<div class="card"><h3>${LANGUAGES[c.lang].flag} ${LANGUAGES[c.lang].name}</h3>
      <table class="admin-table"><tbody>${c.rows.map(([n, v, info]) => `<tr><th scope="row">${n}</th><td><b>${v}</b></td><td class="muted">${info}</td></tr>`).join("")}</tbody></table></div>`).join("")}</div>

    <h2 class="section-title">Accès direct aux leçons</h2>
    <div class="card admin-links">
      <p><b>🇰🇷 Hangul</b> ${HANGUL_DAYS.map((x, i) => `<a class="chip" href="#/lang/ko/hangul/${i + 1}">J${i + 1}</a>`).join("")}</p>
      <p><b>🇰🇷 Grammaire</b> ${KO_GRAMMAR.map((g, i) => `<a class="chip ko" href="#/lang/ko/grammaire/${g.id}">${i + 1}. ${esc(g.title)}</a>`).join("")}</p>
      ${Object.keys(LANGUAGES).map((l) => `<p><b>${LANGUAGES[l].flag} Livres</b> ${BOOKS[l].map((b) => `<a class="chip" href="#/lang/${l}/livre/${b.id}">${b.icon} ${esc(b.title)}</a>`).join("")}</p>`).join("")}
      ${Object.keys(LANGUAGES).map((l) => `<p><b>${LANGUAGES[l].flag} Textes</b> ${TEXTS[l].map((t) => `<a class="chip" href="#/lang/${l}/lire/${t.id}">${esc(t.title)}</a>`).join("")}</p>`).join("")}
      <p><b>Onglets</b> ${Object.keys(LANGUAGES).flatMap((l) => TABS[l].map(([k, n]) => `<a class="chip" href="#/lang/${l}/${k}">${LANGUAGES[l].flag} ${n}</a>`)).join("")}</p>
    </div>

    ${d ? `<h2 class="section-title">Comptes (${d.list.length}${d.list.length === 100 ? "+" : ""})</h2>
    <div class="card table-scroll"><table class="admin-table users"><thead><tr><th>E-mail</th><th>Prénom</th><th>Inscrit</th><th>Dernière connexion</th><th>Cartes</th><th>Révisions</th></tr></thead><tbody>
      ${d.list.map((u) => `<tr><td>${esc(u.email)} ${u.admin ? "🛠️" : ""} ${u.verified ? "" : `<span title="adresse non confirmée">✉️?</span>`}</td><td>${esc(u.name)}</td><td>${fmtDate(u.created_at)}</td><td>${fmtDate(u.last_login_at)}</td><td>${u.cards}</td><td>${u.reviews}</td></tr>`).join("")}
    </tbody></table></div>` : ""}
    <p style="margin-top:20px"><button class="btn ghost small" data-act="admin-refresh">↻ Actualiser</button></p>
  </section>`;
}

// ---------- Mot de passe oublié et vérification de l'adresse (ROADMAP P0) ----------
function viewForgot() {
  if (!serverOn) return viewAuth("connexion");
  const sent = ui.forgotSent;
  return `<section class="view lesson-shell">
    <div class="auth-head">${mochi("small", sent ? "happy" : "thinking")}<div><h1>Mot de passe oublié</h1>
      <p class="muted">On t'envoie un lien pour en choisir un nouveau.</p></div></div>
    ${sent ? `<div class="card"><p><b>C'est parti !</b> Si un compte existe pour <b>${esc(sent)}</b>, un e-mail vient d'y être envoyé.</p>
      <p class="muted">Le lien marche une seule fois, pendant 30 minutes. Pense à regarder dans les indésirables.</p>
      <button class="mini" data-act="forgot-again">Utiliser une autre adresse</button></div>`
    : `<form class="card form" data-form="forgot">
      <label>E-mail du compte<input class="input" type="email" name="email" autocomplete="email" required /></label>
      <p class="form-err" hidden></p>
      <button class="btn">Envoyer le lien</button>
    </form>`}
    <p class="center muted"><a class="lnk" href="#/connexion">Retour à la connexion</a></p>
  </section>`;
}
function viewReset(token) {
  if (!serverOn) return viewAuth("connexion");
  return `<section class="view lesson-shell">
    <div class="auth-head">${mochi("small")}<div><h1>Nouveau mot de passe</h1>
      <p class="muted">Tes autres appareils seront déconnectés.</p></div></div>
    <form class="card form" data-form="reset">
      <input type="hidden" name="token" value="${esc(token)}" />
      <label>Nouveau mot de passe<input class="input" type="password" name="password" autocomplete="new-password" minlength="8" required />
        <small class="muted">8 caractères minimum.</small></label>
      <label>Confirme-le<input class="input" type="password" name="confirm" autocomplete="new-password" minlength="8" required /></label>
      <p class="form-err" hidden></p>
      <button class="btn">Enregistrer et me connecter</button>
    </form>
  </section>`;
}
function viewVerify(token) {
  const V = ui.verify;
  if (!V || V.token !== token) {
    ui.verify = { token, status: "pending" };
    api("POST", "/api/email/verify", { token })
      .then(() => { ui.verify.status = "ok"; if (account) account.email_verified = true; })
      .catch((e) => { ui.verify.status = "err"; ui.verify.msg = e.message; })
      .finally(() => { history.replaceState?.(null, "", "#/verifier/ok"); ui.verify.token = "ok"; render(); });
  }
  const st = ui.verify.status;
  return `<section class="view lesson-shell"><div class="card empty">
    ${mochi("small", st === "ok" ? "proud" : st === "err" ? "surprised" : "thinking")}
    <h2>${st === "ok" ? "Adresse confirmée !" : st === "err" ? "Lien expiré" : "Vérification…"}</h2>
    <p class="muted">${st === "ok" ? "Merci. Tu pourras récupérer ton compte si tu oublies ton mot de passe." : st === "err" ? esc(ui.verify.msg) : ""}</p>
    ${st !== "pending" ? `<a class="btn" href="${account ? "#/profil" : "#/connexion"}">${account ? "Mon profil" : "Se connecter"}</a>` : ""}
  </div></section>`;
}
const verifyBanner = () => account && !account.email_verified
  ? `<div class="card verify-banner" role="status"><span aria-hidden="true">✉️</span><p><b>Confirme ton adresse e-mail.</b> On t'a envoyé un lien à ${esc(account.email)}. Sans ça, impossible de récupérer ton compte si tu oublies ton mot de passe.</p><button class="mini" data-act="resend-verify">Renvoyer l'e-mail</button></div>` : "";

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
  ["Tinkham, T. (1997). The effects of semantic and thematic clustering on the learning of second language vocabulary. Second Language Research, 13(2), 138–163", "https://synapsesocial.com/papers/W2038339147"],
  ["Tinkham, T. (1994). Thèse sur le regroupement sémantique et thématique", "https://ideals.illinois.edu/items/19069"],
  ["Nakata, T. & Suzuki, Y. (2019). Effects of massing and spacing on the learning of semantically related and unrelated words. Studies in Second Language Acquisition", "https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/F58BA8D70385603B9C42E408BFCB8A10/S0272263118000219a.pdf/effects-of-massing-and-spacing-on-the-learning-of-semantically-related-and-unrelated-words.pdf"],
  ["Pan, S. C. et al. (2019). The synergistic benefits of systematic and random interleaving for second language grammar learning. JARMAC", "https://sc-pan.github.io/pdf/PLPR_2019.pdf"],
  ["Pan, S. C. et al. (2024). Interleaved practice enhances grammar skill learning for similar and dissimilar tenses in Romance languages", "https://sc-pan.github.io/pdf/PRKL_2024.pdf"],
  ["Uchihara, T., Karas, M. & Thomson, R. I. High variability phonetic training (HVPT): A meta-analysis of L2 perceptual training studies. Studies in Second Language Acquisition", "https://resolve.cambridge.org/core/journals/studies-in-second-language-acquisition/article/high-variability-phonetic-training-hvpt-a-metaanalysis-of-l2-perceptual-training-studies/6ABB8C1F32D88D53EA8D05A4565E76F6/core-reader", [["perception → production (2024)", "https://www.cambridge.org/core/product/E38D8F5CE65DC708137B0E95F97C6BC7"]]],
  ["Liu, J. & Zhang, J. (2018). The Effects of Extensive Reading on English Vocabulary Learning: A Meta-analysis. English Language Teaching, 11(6)", "https://econpapers.repec.org/RePEc:ibn:eltjnl:v:11:y:2018:i:6:p:1"],
  ["Jeon, E.-Y. & Day, R. R. (2016). The effectiveness of ER on reading proficiency: A meta-analysis. Reading in a Foreign Language", "https://scholarspace.manoa.hawaii.edu/server/api/core/bitstreams/eebea128-afb4-47cd-8a16-453a7eff6ca1/content"],
  ["Étude sur l'apprentissage du vocabulaire en lisant et écoutant 10 lectures graduées", "https://core.ac.uk/download/215386265.pdf"],
  ["Lee, J.-Y. & Baek, M. (2023). Effects of Gamification on Students' English Language Proficiency: A Meta-Analysis on Research in South Korea. Sustainability, 15(14)", "https://mdpi.com/2071-1050/15/14/11325"],
  ["Étude sur les effets de la gamification de Duolingo sous l'angle de l'autodétermination (2026)", "https://jst-ud.vn/jst-ud/article/download/10685/6973/33542"],
  ["Duolingo, tests A/B sur les séries", "https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals", [["analyse critique", "https://uxmag.com/?p=20707"]]],
  ["Lally, P. et al. (2009/2010), formation des habitudes (UCL)", "https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit", [["résumé (jours manqués)", "https://jamesclear.com/new-habit"]]],
];
const WHY = [
  ["🧠", "On révise au bon moment, pas en boucle.", "Revoir une notion à intervalles espacés, en essayant de s'en souvenir avant de voir la réponse, est bien plus efficace que de la répéter d'affilée. Une méta-analyse de 29 études trouve un effet fort en faveur de cette méthode. On utilise FSRS, un algorithme open source qui apprend ton rythme d'oubli et planifie tes révisions juste avant que tu oublies.", [1, 2, 3]],
  ["📖", "Tu lis et écoutes des contenus que tu comprends presque entièrement.", "Pour apprendre en lisant ou en écoutant, il faut comprendre la grande majorité des mots (environ 95 %). Trop de mots inconnus et on décroche ; pas assez et on n'apprend rien de neuf. Le site calcule, pour chaque texte, quel pourcentage de mots tu connais déjà, et te propose ceux qui tombent dans la bonne zone.", [4, 5, 6]],
  ["💬", "Tu pratiques, et on te corrige intelligemment.", "Comprendre ne suffit pas : produire des phrases et recevoir un retour fait progresser. Les études montrent que reformuler correctement ta phrase est particulièrement efficace sur la durée. C'est ce que fait le site après chaque exercice d'écriture.", [7, 8]],
  ["🎧", "On travaille vraiment l'oreille.", "Les applis de langues aident bien pour le vocabulaire et la grammaire, mais moins pour l'écoute. C'est pour ça que tout le contenu a de l'audio, et qu'on propose le shadowing (répéter en même temps que le locuteur), qui améliore le rythme et l'intonation.", [9, 10]],
  ["🇰🇷", "Le coréen, dans le bon ordre.", "Le coréen demande du temps (environ 2 200 heures de cours selon l'institut de formation des diplomates américains pour un niveau professionnel). Mais son alphabet est l'un des plus simples au monde : la plupart des gens le lisent en une semaine environ. On commence donc par là, sans romanisation, puis on enchaîne avec le registre poli le plus utile au quotidien, et on t'accompagne dans la phase la plus difficile : particules, terminaisons et niveaux de politesse.", [11, 12, 13, 14]],
  ["🧩", "Les mots qui se ressemblent, étalés dans le temps.", "Apprendre d'un coup des mots très proches (tous les fruits, gauche et droite) crée de la confusion. Regrouper des mots qui vont ensemble dans une même scène (au café : commander, chaud, à emporter) aide au contraire. Mochi n'introduit donc jamais le même jour deux mots de la même catégorie, ni deux contraires.", [17, 18, 19]],
  ["🔀", "On mélange les exercices, et on écoute plusieurs voix.", "Alterner plusieurs points de grammaire dans une même séance aide à apprendre à choisir la bonne forme. Et entendre un même son prononcé par plusieurs voix entraîne efficacement l'oreille : c'est aujourd'hui considéré comme la méthode d'entraînement de la perception la mieux étayée par la recherche.", [20, 21, 22]],
  ["🍡", "Une motivation honnête.", "Les éléments de jeu aident à apprendre, à condition de récompenser les vrais progrès. Et rater un jour n'empêche pas une habitude de se former : chez Mochi, ta série est hebdomadaire, avec des jours de repos, et la mascotte n'est jamais triste à cause de toi.", [26, 27, 28, 29]],
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
  return `<section class="view card empty">${mochi("", "curious")}<h2>Oups, page introuvable</h2>
    <p class="muted">Mochi s'est perdu…</p><a class="btn" href="#/">Retour à l'accueil</a></section>`;
}

// ============================================================
//  ROUTEUR
// ============================================================
// Onglets de la barre de navigation (charte §7 : 4 au maximum)
const NAV_TABS = { aujourdhui: "aujourdhui", lire: "histoire", reviser: "pratique" };
const navOfTab = (tab) => ({ today: "aujourdhui", read: "lire", practice: "reviser" })[sectionOf(tab || "aujourdhui")];
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const hashChanged = ui.lastHash !== location.hash;
  if (hashChanged && ui.lastHash !== null) stopAudio();
  let html, nav = "home", lang = null;

  if (parts.length === 0) html = viewHome();
  else if (NAV_TABS[parts[0]] || parts[0] === "learn") {
    // Navigation principale (charte §7) : ouvre l'onglet dans la dernière langue,
    // ou l'accueil (choix de la langue) si aucune n'a encore été choisie.
    const tab = NAV_TABS[parts[0]] || "aujourdhui";
    if (state.lastLang) return void (location.hash = `#/lang/${state.lastLang}/${tab}`);
    html = viewHome(); nav = parts[0] === "learn" ? "aujourdhui" : parts[0];
  } else if (parts[0] === "profil") { html = viewProfile(); nav = "profil"; }
  else if (parts[0] === "connexion" || parts[0] === "inscription") { html = viewAuth(parts[0]); nav = "profil"; }
  else if (parts[0] === "pourquoi") { html = viewWhy(); nav = "pourquoi"; }
  else if (parts[0] === "admin") { html = viewAdmin(); nav = "profil"; }
  else if (parts[0] === "mot-de-passe-oublie") { html = viewForgot(); nav = "profil"; }
  else if (parts[0] === "reinitialiser" && parts[1]) { html = viewReset(parts[1]); nav = "profil"; }
  else if (parts[0] === "verifier" && parts[1]) {
    if (parts[1] === "ok" && !ui.verify) return void (location.hash = account ? "#/profil" : "#/"); // rechargement après coup
    html = viewVerify(parts[1]); nav = "profil";
  }
  else if (parts[0] === "lang" && LANGUAGES[parts[1]]) {
    lang = parts[1]; nav = navOfTab(parts[2]);
    state.lastLang = lang; state.langs[lang].started = true; save();
    const [, , tab, a] = parts;
    if (tab === "lire" && a) html = viewReader(lang, a);
    else if (tab === "livre" && a) { html = viewBook(lang, a, parts[4], parts[5]); nav = "lire"; }
    else if (tab === "revisions" && a === "go") { if (hashChanged) ui.review = null; html = viewReviewSession(lang); }
    else if (tab === "hangul" && isKo(lang)) html = viewHangul(Number(a) || 1);
    else if (tab === "atelier" && isKo(lang)) html = viewAtelier();
    else if (tab === "grammaire" && isKo(lang)) html = viewGrammar(a);
    else html = viewLanguage(lang, tab === "pratique" || TABS[lang].some(([k]) => k === tab) ? tab : "aujourdhui");
  } else html = viewNotFound();

  document.body.dataset.lang = lang || state.lastLang || "ko";
  applyDisplay();
  $app.innerHTML = html;
  const logo = document.getElementById("logo-o"); if (logo && !logo.innerHTML) logo.innerHTML = LOGO_FACE;
  $app.querySelectorAll(".ko, .en").forEach((e) => { if (!e.classList.contains("lang-card")) e.lang = e.classList.contains("ko") ? "ko" : "en"; });
  if (!hashChanged) $app.querySelector(".view")?.classList.add("still");
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === nav));
  renderTopStats(lang);
  renderTopUser();
  if (account && parts[0] === "profil") loadSessions();
  if (hashChanged) window.scrollTo({ top: 0 });
  ui.lastHash = location.hash;
  if (typeof enhanceKoInputs === "function") enhanceKoInputs($app); // clavier coréen (keyboard.js)
  if (typeof checkNewAccessories === "function") checkNewAccessories(); // accessoires gagnés (cosmetics.js)
  if (typeof maybeStartTour === "function") maybeStartTour(); // visite guidée de la première visite (tour.js)
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
    <span class="chip" title="Semaines régulières d'affilée (5 jours sur 7)">📅 ${currentStreak(L)}</span>`;
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
    const t = textById(lang, id);
    if (t?.book) return finishChapter(lang, t);
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
  "check-prod": async () => {
    if (ui.prod.loading) return;
    const text = document.getElementById("prod-text").value.trim();
    if (!text) return toast("Écris d'abord une phrase ✍️");
    await checkProduction(currentLang(), text); render();
  },
  "next-ex": () => {
    const P = ui.prod, lang = currentLang();
    if (P.mode === "free") P.free = pickFree(lang, P.free?.prompt); else P.ex = pickExercise(lang, P.ex?.id);
    Object.assign(P, { text: "", result: null, why: false, llmError: null }); render();
  },
  "prod-mode": (el) => { Object.assign(ui.prod, { mode: el.dataset.v, text: "", result: null, why: false }); render(); },
  why: () => { ui.prod.why = !ui.prod.why; render(); },

  // Mots
  "toggle-known": (el) => { const L = state.langs[currentLang()]; L.known[el.dataset.l] = true; delete L.unknown[el.dataset.l]; save(); render(); },
  "toggle-unknown": (el) => { const L = state.langs[currentLang()]; delete L.known[el.dataset.l]; L.unknown[el.dataset.l] = true; save(); render(); },
  "add-frequent": () => {
    const lang = currentLang(), stab = stabilityMap(lang);
    let n = 0;
    const taken = { lemmas: new Set(), groups: new Set() };
    for (const l of Object.keys(LEXICON[lang])) {
      if (n >= 5) break;
      if (lemmaStatus(lang, l, stab) !== "new" || interferes(lang, l, taken)) continue; // §12 : des mots variés
      takeLemma(lang, l, taken);
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
    if (!G.target) { G.target = pair.items[Math.floor(Math.random() * pair.items.length)]; G.who = Math.floor(Math.random() * speakers(G.lang).length); }
    speak(G.target, G.lang, 0.85, speakers(G.lang)[G.who]); render();
  },
  "ear-replay": (el) => { const G = ui.ear; speak(el.dataset.w, G.lang, 0.85, speakers(G.lang)[G.who]); },
  "ear-pick": (el) => {
    const G = ui.ear; if (G.picked || !G.target) return;
    G.picked = el.dataset.w; G.n++;
    const good = G.picked === G.target; if (good) G.score++;
    const S = state.langs[G.lang].earStats, key = earKey(EAR[G.lang].pairs[G.i]);
    S[key] = { n: (S[key]?.n || 0) + 1, ok: (S[key]?.ok || 0) + (good ? 1 : 0) };
    track(G.lang, "ex"); track(G.lang, "ear"); save(); render();
  },
  "quest-claim": (el) => {
    const L = state.langs[el.dataset.l], q = weekQuests(el.dataset.l).find((x) => x.key === el.dataset.k);
    if (!q || !q.done || L.quests[q.key]) return;
    L.quests[q.key] = true; L.xp += QUEST_XP; save(); render();
    toast(weekQuests(el.dataset.l).every((x) => x.claimed) ? "Toutes les quêtes de la semaine sont faites ! 🎉" : `Quête réussie : +${QUEST_XP} XP ⭐`);
  },
  "ear-next": () => { const G = ui.ear; Object.assign(G, { i: pickPair(G.lang, G.i), target: null, picked: null }); render(); },

  // Quiz
  "quiz-pick": (el) => { const q = ui.quiz.qs[ui.quiz.queue[0]]; answerQuiz(el.dataset.o === q.answer, el.dataset.o); render(); },
  "quiz-next": () => { nextQuiz(); render(); },
  "build-l": (el) => { ui.quiz.build.l = el.dataset.x; render(); },
  "build-v": (el) => { ui.quiz.build.v = el.dataset.x; render(); },
  "build-f": (el) => { ui.quiz.build.f = el.dataset.x; render(); },
  "build-check": () => { const Q = ui.quiz, q = Q.qs[Q.queue[0]]; answerQuiz(composeHangul(Q.build.l, Q.build.v, q.finals ? Q.build.f : "") === q.target); render(); },
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
    await syncNow();
    if (sync.status === "error" && !confirm("Certaines modifications ne sont pas encore synchronisées et seront perdues sur cet appareil. Se déconnecter quand même ?")) return;
    try { await api("POST", "/api/logout"); } catch {}
    signOutLocal({ forget: true }); // rien ne reste sur un ordinateur partagé
    location.hash = "#/"; route(); toast("À bientôt ! 👋");
  },
  "logout-others": async () => {
    try { await api("POST", "/api/logout-others"); toast("Autres appareils déconnectés ✓"); loadSessions(); } catch (e) { toast(e.message); }
  },
  "theme-fav": (el) => {
    const id = el.dataset.t, cur = state.settings.themes;
    state.settings.themes = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    save(); render();
  },
  "lib-theme": (el) => { ui.libTheme = el.dataset.t || null; render(); },
  "admin-refresh": () => { ui.admin = null; render(); },
  "forgot-again": () => { ui.forgotSent = null; render(); },
  "resend-verify": async () => {
    try { const r = await api("POST", "/api/email/resend", {}); if (r.already) account.email_verified = true; toast(r.already ? "Adresse déjà confirmée ✓" : "E-mail renvoyé ✉️"); render(); }
    catch (e) { toast(e.message); }
  },
  "card-sort": (el) => { ui.cardSort = el.dataset.s; render(); },
  // Retirer = mettre en pause (réversible, et compatible avec la synchronisation entre appareils)
  "card-pause": (el) => {
    const lang = currentLang(), cards = state.cards.filter((c) => c.lang === lang && c.lemma === el.dataset.l);
    const pause = cards.some((c) => !c.paused);
    cards.forEach((c) => { if (pause) c.paused = true; else delete c.paused; });
    save(); render();
    toast(pause ? `« ${el.dataset.l} » retiré des révisions (tu peux le remettre)` : `« ${el.dataset.l} » remis en révision ✓`);
  },
  "lang-soon": (el) => toast(`${el.dataset.name} : en cours de préparation, bientôt sur Mochi 🍡`),
  theme: (el) => { state.settings.theme = el.dataset.v; save(); render(); },
  goal: (el) => { state.goal = +el.dataset.v; save(); render(); toast("Objectif mis à jour 🎯"); },
  export: () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ cards: state.cards, review_logs: state.logs }, null, 2)], { type: "application/json" }));
    a.download = `mochi-${today()}.json`; a.click();
  },
  reset: () => {
    if (!confirm(account ? "Effacer toute ta progression, sur tous tes appareils ?" : "Effacer toute ta progression ?")) return;
    state = defaultState();
    if (account) { state.name = account.name; state.avatar = account.avatar_emoji; sync.meta.reset = true; sync.meta.snap = emptySnap(); sync.meta.times = {}; }
    save(); if (account) syncNow();
    location.hash = "#/"; toast("Progression réinitialisée");
  },
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
  if (e.target.id === "card-search") {
    const q = e.target.value.trim().toLowerCase(); let shown = 0;
    $app.querySelectorAll(".my-card").forEach((el) => { const hit = !q || el.dataset.search.includes(q); el.hidden = !hit; shown += hit; });
    const none = document.getElementById("card-none"); if (none) none.hidden = shown > 0;
    return;
  }
  if (e.target.id === "name") {
    state.name = e.target.value.trim(); save();
    if (account) { clearTimeout(nameTimer); nameTimer = setTimeout(() => api("PATCH", "/api/me", { name: state.name }).then((d) => { account = d.user; renderTopUser(); }).catch((er) => toast(er.message)), 600); }
  }
  const k = e.target.dataset.set;
  if (k) {
    const v = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value);
    state.settings[k] = v; save();
    if (k === "textScale" || k === "zen" || k === "particleColors") applyDisplay();
    const b = e.target.closest("label")?.querySelector("b");
    if (b) b.textContent = k === "newPerDay" ? v : `${pct(v)} %`;
  }
  if (e.target.dataset.voice) {
    const lang = e.target.dataset.voice;
    state.settings.voices = { ...state.settings.voices, [lang]: e.target.value || undefined };
    save();
    render();
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
    } else if (kind === "forgot") {
      await api("POST", "/api/password/forgot", { email: f.email.trim() });
      ui.forgotSent = f.email.trim(); render();
    } else if (kind === "reset") {
      if (f.password !== f.confirm) throw new Error("Les deux mots de passe ne sont pas identiques.");
      await applyAuth(await api("POST", "/api/password/reset", { token: f.token, password: f.password }));
      history.replaceState?.(null, "", "#/profil"); route(); toast("Mot de passe changé, tu es connecté·e ✓");
    } else if (kind === "password") {
      await api("POST", "/api/password", { current: f.current, next: f.next });
      form.reset(); toast("Mot de passe mis à jour ✓"); loadSessions();
    } else if (kind === "delete") {
      if (!confirm("Supprimer définitivement ton compte et toute ta progression ?")) return;
      await api("DELETE", "/api/me", { password: f.password });
      signOutLocal({ forget: true }); location.hash = "#/"; route(); toast("Compte supprimé");
    }
  } catch (er) { err.textContent = er.message; err.hidden = false; }
  finally { btn.disabled = false; }
});

$app.addEventListener("keydown", (e) => {
  // Éléments cliquables non natifs (mots du lecteur) : Entrée ou Espace = clic
  if ((e.key === "Enter" || e.key === " ") && e.target.getAttribute?.("role") === "button" && e.target.dataset?.act) { e.preventDefault(); e.target.click(); return; }
  if (e.key !== "Enter") return;
  if (e.target.id === "answer") { e.preventDefault(); actions.reveal(); }
  if (e.target.id === "prod-text" && !e.shiftKey) { e.preventDefault(); actions["check-prod"](); }
});
document.addEventListener("keydown", (e) => {
  if (!ui.review || !location.hash.endsWith("/revisions/go") || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === " " && !ui.review.revealed) { e.preventDefault(); actions.reveal(); }
  else if (ui.review.revealed && ["1", "2", "3", "4"].includes(e.key)) actions.rate({ dataset: { g: e.key } });
  else if (e.key === "r" || e.key === "R") { const c = state.cards.find((x) => x.id === ui.review.queue[0]); if (c) speak(c.context, c.lang); }
});

window.addEventListener("hashchange", route);

// Démarrage : si le serveur répond et qu'une session existe, on charge le compte
// Hors ligne (appli installée, métro…) : on retrouve le dernier compte connu et sa
// progression locale ; la synchro reprendra au retour du réseau.
const LAST_ACCOUNT = "mochi-last-account";
const rememberAccount = (d) => { try { if (d) localStorage.setItem(LAST_ACCOUNT, JSON.stringify(d)); else localStorage.removeItem(LAST_ACCOUNT); } catch {} };
(async function boot() {
  try {
    const r = await fetch("/api/me", { credentials: "same-origin" });
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
      serverOn = true;
      const d = await r.json();
      features = d.features || features;
      if (d.user) attachAccount(d.user, { legacy: d.legacy_state });
      rememberAccount(d.user ? { user: d.user, features } : null);
    }
  } catch {
    let last = null; try { last = JSON.parse(localStorage.getItem(LAST_ACCOUNT)); } catch {}
    if (last?.user) { serverOn = true; features = last.features || features; attachAccount(last.user); sync.status = "error"; }
  }
  route();
  if (account) syncNow();
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && location.protocol?.startsWith("http")) navigator.serviceWorker.register("/sw.js").catch(() => {});
  setTimeout(prefetchAudio, 8000);
})();

// Pré-télécharge l'audio des cartes à revoir dans les 2 prochains jours (vraies voix),
// pour réviser hors ligne. Lentement, pour ne pas épuiser la limite de génération.
async function prefetchAudio() {
  if (typeof navigator === "undefined" || !navigator.onLine || !("caches" in window)) return;
  const soon = Date.now() + 2 * 864e5, seen = new Set();
  const list = state.cards.filter((c) => c.context && new Date(c.due) <= soon && audioSource(c.lang) === "server")
    .map((c) => ttsUrl(c.context, c.lang, defaultServerVoice(c.lang))).filter((u) => !seen.has(u) && seen.add(u));
  const cache = await caches.open("mochi-audio");
  for (const u of list.slice(0, 15)) {
    if (!navigator.onLine) return;
    if (await cache.match(u)) continue;
    try { await fetch(u); } catch { return; } // le service worker range la réponse dans son cache
    await new Promise((r) => setTimeout(r, 3000));
  }
}
