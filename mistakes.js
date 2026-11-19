// ============================================================
//  Mochi — mistakes.js : carnet d'erreurs (AMELIORATIONS v0.6, F3)
//  Toutes les corrections (correcteur IA ou hors ligne, exercices) alimentent un carnet par langue,
//  regroupé par type (particules, registre, articles…). Une erreur est « vaincue » après 3 réussites
//  sur au moins 3 jours différents (§13 : répétition espacée). Les erreurs récurrentes deviennent des
//  cartes (le mécanisme des particules, généralisé).
//  Données : state.langs[lang].mistakes[type] = { n, last, ex: [[tu as écrit, correction]], wins: [jours], done }
// ============================================================
// Types : libellé, explication courte (écrite une fois, relue), exercice ciblé
const MISTAKE_TYPES = {
  "particule:theme-sujet": { label: "은/는 ou 이/가", ex: "particule", why: "은/는 annonce le thème (ce dont on parle, souvent déjà connu, ou un contraste). 이/가 désigne le sujet nouveau, ou celui qui répond à « qui ? ». Après une consonne : 은 / 이 ; après une voyelle : 는 / 가." },
  "particule:objet": { label: "을/를 (complément d'objet)", ex: "particule", why: "을/를 marque ce qu'on mange, regarde, aime… Après une consonne : 을 ; après une voyelle : 를. À l'oral, on l'omet souvent, mais à l'écrit il compte." },
  "particule:lieu": { label: "에 ou 에서", ex: "particule", why: "에 : là où l'on va, là où l'on est, et le moment (학교에 가요, 집에 있어요, 세 시에). 에서 : là où l'action se passe (카페에서 공부해요)." },
  "particule:autre": { label: "Autres particules (도, 의, 와/과, (으)로…)", ex: "particule", why: "Chaque particule a un rôle précis : 도 « aussi », 의 « de » (possession), 와/과 et 하고 « et, avec », (으)로 « vers, en (moyen) »." },
  registre: { label: "Registre (-요)", ex: "registre", why: "Avec un inconnu, un collègue ou un commerçant : phrases finies par -요 (해요체). Sans -요, c'est du 반말, réservé aux proches. 합니다체 est correct mais plus formel." },
  terminaison: { label: "Terminaisons et conjugaison", ex: "forme", why: "La fin du verbe porte le temps et la politesse : -아요/-어요 (présent), -았어요/-었어요 (passé), -(으)ㄹ 거예요 (futur). On choisit 아 ou 어 selon la dernière voyelle du radical." },
  article: { label: "Articles (a, an, the)", ex: "trou", why: "Au sens général, pas d'article : I like coffee, Cats are cute. « a / an » pour une chose parmi d'autres (a coffee, an apple), « the » pour une chose précise, déjà connue (the coffee you made)." },
  preposition: { label: "Prépositions (in, on, at…)", ex: "trou", why: "at pour un point précis (at 7, at the station), on pour un jour ou une surface (on Monday, on the table), in pour un mois, une ville, un espace (in May, in Paris, in the box)." },
  verbe: { label: "Formes du verbe", ex: "forme", why: "Au présent, he / she / it prend un -s (she works). Pour une question ou une négation : do / does (Does he play? I don't know). be change de forme : I am, you are, he is." },
  "faux-ami": { label: "Faux amis", ex: "faux", why: "Ils ressemblent au français mais ne veulent pas dire la même chose : actually = en fait, library = bibliothèque, sensible = raisonnable." },
  confusion: { label: "Mots proches", ex: "confusion", why: "Deux mots proches par le son ou le sens : apprends-les à des moments différents, chacun dans sa phrase (§12)." },
  vocabulaire: { label: "Choix du mot", ex: "traduction", why: "Le mot existe, mais un natif en dirait un autre ici. Retiens la phrase corrigée entière : le mot vient avec son contexte." },
  orthographe: { label: "Orthographe", ex: "dictee", why: "Une lettre ou une syllabe de travers. La dictée aide à fixer l'écriture des mots qu'on entend." },
  grammaire: { label: "Grammaire (autres)", ex: "forme", why: "Une construction de phrase à revoir. Compare ta phrase et la version corrigée, puis réécris-la de mémoire." },
};
const MISTAKE_WIN_DAYS = 3;
const mistakeLabel = (type) => MISTAKE_TYPES[type]?.label || (type.startsWith("grammaire:") && typeof KO_GRAMMAR !== "undefined" ? `Grammaire : ${KO_GRAMMAR.find((g) => g.id === type.slice(10))?.title || type.slice(10)}` : type);
const mistakeInfo = (type) => MISTAKE_TYPES[type] || (type.startsWith("grammaire:") ? { ex: "grammaire", why: "Un point de grammaire coréen à revoir : relis la leçon, puis entraîne-toi en alternance avec les autres points (§13)." } : MISTAKE_TYPES.grammaire);
const mistakeBook = (lang) => (state.langs[lang].mistakes ||= {});

// Particule coréenne → groupe
function particleGroup(p) {
  if (["은", "는", "이", "가"].includes(p)) return "particule:theme-sujet";
  if (["을", "를"].includes(p)) return "particule:objet";
  if (["에", "에서"].includes(p)) return "particule:lieu";
  return "particule:autre";
}
// Erreur du correcteur IA → type
const EN_ARTICLES = new Set(["a", "an", "the"]), EN_PREPS = new Set(["in", "on", "at", "to", "for", "from", "with", "of", "by", "about", "into", "onto"]);
function classifyError(lang, e) {
  if (e.type === "registre") return "registre";
  if (e.type === "orthographe") return "orthographe";
  if (lang === "ko" && e.particle) return particleGroup(e.particle);
  if (e.type === "vocabulaire") return "vocabulaire";
  if (lang === "en") {
    const a = String(e.original || "").toLowerCase().split(/\s+/).filter(Boolean), b = String(e.correction || "").toLowerCase().split(/\s+/).filter(Boolean);
    const diff = [...a.filter((w) => !b.includes(w)), ...b.filter((w) => !a.includes(w))];
    if (diff.length && diff.every((w) => EN_ARTICLES.has(w))) return "article";
    if (diff.length && diff.every((w) => EN_PREPS.has(w))) return "preposition";
    return "verbe";
  }
  return lang === "ko" ? "terminaison" : "grammaire";
}
// Exercice → type suivi (null : exercice trop général pour dire quelle erreur c'est)
function exerciseType(lang, q) {
  if (!q) return null;
  if (q.kind === "particule") return particleGroup(q.answer);
  if (q.kind === "registre") return "registre";
  if (q.kind === "faux") return "faux-ami";
  if (q.kind === "grammaire" && q.g?.id) return `grammaire:${q.g.id}`;
  if (q.kind === "forme") return lang === "ko" ? "terminaison" : "verbe";
  if (q.kind === "confusion") return "confusion";
  return null;
}

// Une erreur de plus (retour en « à travailler » si elle était vaincue)
function addMistake(lang, type, example) {
  if (!type) return null;
  const B = mistakeBook(lang), m = (B[type] ||= { n: 0, ex: [], wins: [], done: null });
  m.n++; m.last = today();
  if (m.done) { m.done = null; m.wins = []; }
  if (example?.[0] && example?.[1] && !m.ex.some((x) => x[0] === example[0])) m.ex = [example, ...m.ex].slice(0, 3);
  B[type] = { ...m }; // nouvel objet : la synchro voit le changement
  return B[type];
}
// Une réussite sur ce type : vaincue après 3 jours différents
function winMistake(lang, type) {
  const B = mistakeBook(lang), m = type && B[type];
  if (!m || m.done) return false;
  if (!m.wins.includes(today())) m.wins = [...m.wins, today()].slice(-MISTAKE_WIN_DAYS);
  if (m.wins.length >= MISTAKE_WIN_DAYS) { m.done = today(); B[type] = { ...m }; toast(`💪 Erreur vaincue : ${mistakeLabel(type)} ! Mochi est fière de toi.`); return true; }
  B[type] = { ...m };
  return false;
}
// Branché sur exDone (exercises.js)
function noteExercise(lang, q, ok, picked) {
  const type = exerciseType(lang, q);
  if (!type) return;
  if (ok) winMistake(lang, type);
  else addMistake(lang, type, picked && q.s ? [q.s.text.replace(q.answer || "", picked), q.s.text] : null);
}
// Branché sur la correction d'une phrase (lessons.js) : erreurs du correcteur IA ; les erreurs
// répétées (2 fois ou plus) deviennent des cartes « phrase à trou » sur la correction.
function noteProduction(lang, errors, text, recastText, contextFr, source) {
  for (const e of errors || []) {
    const type = classifyError(lang, e), m = addMistake(lang, type, [e.original ? `${e.original}` : text, e.correction]);
    if (!m || m.n < 2 || type.startsWith("particule:")) continue; // particules : cartes déjà créées par recordProduction
    const c = String(e.correction || "").trim(), i = c ? recastText.indexOf(c) : -1;
    if (i < 0 || c.split(/\s+/).length > 3) continue;
    if (addCard(lang, { type: "cloze", lemma: c.toLowerCase(), before: recastText.slice(0, i), surface: c, after: recastText.slice(i + c.length), contextFr: contextFr || "", fr: e.explanation || mistakeLabel(type), source: source || "carnet" })) toast(`🎯 Carte ciblée créée : ${mistakeLabel(type)}`);
  }
}
// Correcteur hors ligne (coréen) : registre et particules
function noteLocalIssues(lang, issues) {
  for (const r of issues?.register || []) if (!r.ok) addMistake(lang, "registre", null);
  for (const p of issues?.particles || []) addMistake(lang, particleGroup(p.want), [`${p.stem}${p.got}`, `${p.stem}${p.want}`]);
}

// ---------- Page « Mes erreurs fréquentes » ----------
function viewMistakes(lang) {
  const B = mistakeBook(lang), all = Object.entries(B).filter(([, m]) => m.n > 0);
  const open = all.filter(([, m]) => !m.done).sort((a, b) => b[1].n - a[1].n || (b[1].last || "").localeCompare(a[1].last || ""));
  const won = all.filter(([, m]) => m.done).sort((a, b) => (b[1].done || "").localeCompare(a[1].done || ""));
  const k = koCls(lang);
  const card = ([type, m]) => {
    const info = mistakeInfo(type), dots = Array.from({ length: MISTAKE_WIN_DAYS }, (_, i) => (i < m.wins.length ? "●" : "○")).join("");
    const exOk = info.ex && EX_KINDS[info.ex] && (!EX_KINDS[info.ex].langs || EX_KINDS[info.ex].langs.includes(lang));
    return `<div class="card mistake ${m.done ? "won" : ""}">
      <div class="ca-head"><h3 class="m-0 grow">${esc(mistakeLabel(type))}</h3><span class="chip">×${m.n}</span></div>
      <p class="muted mt-6">${esc(info.why)}</p>
      ${m.ex.length ? `<ul class="mistake-ex">${m.ex.map(([you, fix]) => `<li><span class="${k}"><del>${esc(you)}</del> → <ins>${esc(fix)}</ins></span></li>`).join("")}</ul>` : ""}
      ${m.done ? `<p class="ok-msg m-0">💪 Vaincue le ${new Date(m.done).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</p>`
        : `<p class="m-0"><small class="muted" title="Vaincue après ${MISTAKE_WIN_DAYS} réussites sur ${MISTAKE_WIN_DAYS} jours différents">Réussites : <span aria-label="${m.wins.length} sur ${MISTAKE_WIN_DAYS}">${dots}</span></small>
          ${exOk ? ` <button class="btn small" data-act="mistake-train" data-k="${info.ex}">M'entraîner</button>` : ""}</p>`}
    </div>`;
  };
  return `<section class="view">
    <div class="avis-head">${mochi("small", won.length && !open.length ? "proud" : "focused")}<div><h1 class="m-0">Mes erreurs fréquentes</h1>
      <p class="muted mt-4 mb-0 mx-0">Les erreurs sont normales et utiles : elles montrent quoi travailler. Une erreur est vaincue après ${MISTAKE_WIN_DAYS} réussites, sur ${MISTAKE_WIN_DAYS} jours différents.</p></div></div>
    ${open.length ? open.map(card).join("") : `<div class="card empty"><p class="m-0">${all.length ? "Plus rien à travailler pour l'instant 🎉" : "Rien ici pour l'instant. Tes corrections (phrases, exercices) viendront remplir ce carnet."}</p></div>`}
    ${won.length ? `<h2 class="section-title">Erreurs vaincues 💪</h2>${won.map(card).join("")}` : ""}
    <p><a class="btn ghost small" href="#/lang/${lang}/exercices">← Exercices</a></p>
  </section>`;
}
const mistakesOpen = (lang) => Object.values(state.langs[lang]?.mistakes || {}).filter((m) => m.n > 0 && !m.done).length;

Object.assign(actions, {
  "mistake-train": (el) => { const lang = currentLang(); newExercise(lang, el.dataset.k); location.hash = `#/lang/${lang}/exercices`; },
});
