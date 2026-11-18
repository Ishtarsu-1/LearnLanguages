// ============================================================
//  Mochi — fsrs-cards.js : Cartes, FSRS, files de révision, anti-interférence
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
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
  return d < 31 ? `${Math.round(d)} j` : d < 365 ? `${Math.round(d / 30)} mois` : `${num1(d / 365)} an`;
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
