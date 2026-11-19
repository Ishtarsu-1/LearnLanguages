// ============================================================
//  Mochi — sync.js : Synchronisation par événements entre appareils
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// ============================================================
//  SYNCHRONISATION PAR ÉVÉNEMENTS (plusieurs appareils, sans perte)
//  L'état est découpé en quatre familles, chacune avec sa règle de fusion :
//   - kv       : réglages et petites valeurs → la modification la plus récente gagne, clé par clé
//   - cartes   : la version la plus récente gagne, carte par carte
//   - révisions: ajout seul (jamais écrasées)
//   - compteurs: XP, temps, activité → on envoie des deltas, le serveur additionne
//  « snap » = ce que le serveur connaît déjà ; on n'envoie que la différence.
// ============================================================
const MAP_KEYS = ["known", "unknown", "readTexts", "fullDays", "hangulDays", "pinyinDays", "grammarDone", "grammarMiss", "earStats", "errors", "prodDone", "quests", "books"];
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
const avatarGlyph = (a) => (AVATARS.includes(a) && a !== "mochi" ? a : mochi("avatar-mochi", "happy"));
const displayAvatar = (cls = "") => (account?.avatar_url
  ? `<img class="avatar-img ${cls}" src="${esc(account.avatar_url)}" alt="Photo de profil" />`
  : `<span class="${cls}">${avatarGlyph(state.avatar)}</span>`);

// Suivi d'activité par jour
function track(lang, key, n = 1) {
  const day = (state.history[today()] ||= {});
  const x = (day[lang] ||= { sec: 0, rev: 0, prod: 0, read: 0, ex: 0 });
  x[key] ||= 0;
  x[key] += n;
}

// État d'interface (non sauvegardé)
const ui = { review: null, quiz: null, prod: null, reader: null, ear: null, recordings: {}, lastHash: null };
