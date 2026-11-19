// ============================================================
//  Mochi — bibliothèque de lectures graduées (PEDAGOGIE §15, ROADMAP P1)
//  Petits livres en chapitres, classés par niveau et par thème. Chaque chapitre
//  se lit dans le lecteur habituel (audio, glossaire, shadowing, capture de mots),
//  puis : 2 ou 3 questions de compréhension, et les mots inconnus proposés en cartes.
//  Un chapitre s'ouvre quand le précédent est terminé (questions comprises).
//  Même format de phrases que content.js. Livres et vocabulaire : dossier content/.
// ============================================================

// q : question en français ; options : la bonne réponse est la première (mélangées à l'affichage)
// Un fichier par livre dans content/books/<langue>/, chargés par content.data.js.
const BOOKS = CONTENT.books;

// Chaque chapitre devient un « texte » que le lecteur sait afficher (textById le trouve ici).
// Sert aussi au mode histoire (story.js), dont les chapitres ont en plus :
//   mission (missions.js), keywords (mots à mettre en révision), grammar (point de KO_GRAMMAR requis).
function registerBook(lang, b) {
  b.chapters.forEach((ch, i) => {
    const id = `${b.id}-${i + 1}`;
    ch.id = id;
    CHAPTER_TEXTS[lang][id] = {
      id, title: `${b.title} · ${i + 1}. ${ch.title}`, icon: b.icon, kind: b.story ? "Histoire" : "Chapitre", themes: b.themes, book: b.id, chapter: i,
      sentences: ch.sentences, parsed: ch.sentences.map(([src, fr]) => toSentence(src, lang, fr)),
    };
  });
}
for (const lang of Object.keys(BOOKS)) for (const b of BOOKS[lang]) registerBook(lang, b);
const allBooks = (lang) => [...BOOKS[lang], ...(typeof STORIES !== "undefined" ? STORIES[lang] : [])];
const bookById = (lang, id) => allBooks(lang).find((b) => b.id === id);
const quizDone = (lang, b, i) => state.langs[lang].books[`${b.id}:${i + 1}`] !== undefined;
const missionDone = (lang, b, i) => !b.chapters[i].mission || !!state.langs[lang].books[`${b.id}:${i + 1}:mission`];
const chapterDone = (lang, b, i) => quizDone(lang, b, i) && missionDone(lang, b, i);
// Mots clés d'un chapitre : en révision (carte) ou déjà connus
const keywordsMissing = (lang, ch) => (ch.keywords || []).filter((l) => !state.langs[lang].known[l] && !state.cards.some((c) => c.lang === lang && c.lemma.split(" + ").includes(l)));
// Pourquoi un chapitre est fermé (null s'il est ouvert)
function chapterLock(lang, b, i) {
  if (isAdmin()) return null;
  const ch = b.chapters[i], g = ch.grammar && KO_GRAMMAR.find((x) => x.id === ch.grammar);
  if (i > 0 && !chapterDone(lang, b, i - 1)) return `Termine d'abord le chapitre ${i}${b.chapters[i - 1].mission ? " (questions et mission)" : ""}.`;
  if (i > 0 && keywordsMissing(lang, b.chapters[i - 1]).length) return `Mets d'abord en révision les mots clés du chapitre ${i} : ${keywordsMissing(lang, b.chapters[i - 1]).join(", ")}.`;
  if (g && !state.langs[lang].grammarDone[g.id]) return `Fais d'abord le point de grammaire « ${g.title} » (Parcours).`;
  return null;
}
const chapterOpen = (lang, b, i) => !chapterLock(lang, b, i);

// Carte « livre » de l'onglet Lire
function bookCards(lang) {
  const stab = stabilityMap(lang);
  return BOOKS[lang].map((b) => {
    const parsed = b.chapters.flatMap((ch) => CHAPTER_TEXTS[lang][ch.id].parsed);
    const c = coverage(lang, parsed, stab), z = zone(c), done = b.chapters.filter((_, i) => chapterDone(lang, b, i)).length;
    const words = parsed.reduce((n, s) => n + s.words.length, 0);
    return `<a class="card text-item book-item" href="#/lang/${lang}/livre/${b.id}">
      <span class="ti-icon">${b.icon}</span>
      <div>
        <h3><span class="${koCls(lang)}">${esc(b.title)}</span> <small class="muted">· ${esc(b.fr)}</small></h3>
        <small class="muted">Livre ${b.level} · ${b.chapters.length} chapitres · ${words} mots${done ? ` · ${done}/${b.chapters.length} lus` : ""}</small>
        <div class="cov"><div class="bar"><span data-bar-w="${pct(c)}"></span></div><b>${pct(c)} %</b></div>
      </div>
      <span class="zone ${z.k}">${z.label}</span>
    </a>`;
  }).join("");
}

// Liste des chapitres d'un livre ou d'une histoire, avec l'étape suivante de chacun
function chapterList(lang, b) {
  const L = state.langs[lang], stab = stabilityMap(lang), back = `#/lang/${lang}/livre/${b.id}`;
  return `
    <div class="chapter-list">
      ${b.chapters.map((ch, i) => {
        const t = CHAPTER_TEXTS[lang][ch.id], lock = chapterLock(lang, b, i), open = !lock, done = chapterDone(lang, b, i), read = L.readTexts[ch.id];
        const qd = quizDone(lang, b, i), md = missionDone(lang, b, i), M = ch.mission && MISSIONS[ch.mission];
        const c = coverage(lang, t.parsed, stab);
        const next = read && !qd ? { href: `${back}/quiz/${i + 1}`, tag: "Questions →" } : qd && !md ? { href: `${back}/mission/${i + 1}`, tag: `${M.icon} Mission →` } : { href: `#/lang/${lang}/lire/${ch.id}`, tag: "" };
        const unknown = done ? [...unknownLemmas(lang, t.parsed, stab).keys()].filter((l) => !state.cards.some((x) => x.lang === lang && x.lemma === l)).length : 0;
        const kwMissing = done ? keywordsMissing(lang, ch) : [];
        return `<div class="chapter-row">
          <a class="card chapter ${done ? "done" : ""} ${open ? "" : "locked"}" href="${next.href}" data-act="${open ? "" : "locked"}" ${lock ? `title="${esc(lock)}"` : ""}>
            <span class="ch-n">${done ? "✓" : open ? i + 1 : "🔒"}</span>
            <div class="grow"><b class="${koCls(lang)}">${esc(ch.title)}</b><br/><small class="muted">${ch.sentences.length} phrases · ~${pct(c)} % de mots connus${qd ? ` · questions ${L.books[`${b.id}:${i + 1}`]}/${ch.questions.length}` : read ? " · lu, questions à faire" : ""}${M ? ` · ${M.icon} ${md ? "mission réussie" : `mission : ${esc(M.title)}`}` : ""}</small>
              ${lock && (i === 0 || chapterDone(lang, b, i - 1)) ? `<br/><small class="lock-why">🔒 ${esc(lock)}</small>` : ""}</div>
            ${next.tag ? `<span class="tag">${next.tag}</span>` : ""}
          </a>
          ${kwMissing.length ? `<button class="btn small" data-act="book-keywords" data-id="${ch.id}">+ Mots clés en révision (${kwMissing.join(", ")})</button>` : ""}
          ${unknown ? `<button class="btn ghost small" data-act="book-capture" data-id="${ch.id}">+ ${unknown} mot(s) inconnu(s) en révision</button>` : ""}
        </div>`;
      }).join("")}
    </div>
  `;
}

// Page d'un livre : chapitres, progression, questions
function viewBook(lang, bookId, sub, n) {
  const b = bookById(lang, bookId);
  if (!b) return viewNotFound();
  if (hangulGate(lang)) return `<section class="view">${gateCard()}</section>`;
  const back = `#/lang/${lang}/livre/${b.id}`;
  if (sub === "mission") { const i = Number(n) - 1; return b.chapters[i]?.mission ? viewMission(lang, b, i) : viewNotFound(); }
  if (sub === "quiz") {
    const i = Number(n) - 1, ch = b.chapters[i];
    if (!ch) return viewNotFound();
    const key = `book-${b.id}-${n}`;
    if (ui.quiz?.key !== key) startBookQuiz(lang, b, i);
    return viewQuiz(back, `Chapitre ${n}`);
  }
  return `<section class="view">
    <div class="lesson-top"><a class="close" href="#/lang/${lang}/${b.story ? "histoire" : "lire"}" aria-label="Retour">←</a>
      <div class="grow"><h1 class="fs-1-5rem">${b.icon} <span class="${koCls(lang)}">${esc(b.title)}</span></h1><p class="muted mt-2 mb-0 mx-0">${esc(b.fr)} · livre ${b.level}</p></div></div>
    <div class="card mt-16 mb-16 mx-0"><p class="m-0">${esc(b.summary)}</p>
      <p class="muted mt-8 mb-0 mx-0"><small>Lis et écoute chaque chapitre, puis réponds à 2 ou 3 questions. Le chapitre suivant s'ouvre ensuite.</small></p></div>
    ${chapterList(lang, b)}
  </section>`;
}

// Questions de compréhension (format du quiz commun : les erreurs sont reposées)
function startBookQuiz(lang, b, i) {
  const ch = b.chapters[i];
  const qs = ch.questions.map((x) => ({ ask: esc(x.q), prompt: "", options: shuffle(x.options), answer: x.options[0] }));
  startQuiz(`book-${b.id}-${i + 1}`, qs, (score) => {
    const L = state.langs[lang], key = `${b.id}:${i + 1}`;
    if (L.books[key] === undefined) L.xp += 10;
    L.books[key] = Math.max(score, L.books[key] ?? 0);
    save();
  });
}
// Après « J'ai fini » sur un chapitre : on passe aux questions plutôt qu'aux révisions
function finishChapter(lang, t) {
  location.hash = `#/lang/${lang}/livre/${t.book}/quiz/${t.chapter + 1}`;
}

Object.assign(actions, {
  // Mots clés d'un chapitre d'histoire → cartes (condition pour ouvrir le suivant)
  "book-keywords": (el) => {
    const lang = currentLang(), t = CHAPTER_TEXTS[lang][el.dataset.id], b = bookById(lang, t.book), ch = b.chapters[t.chapter];
    const want = new Set(keywordsMissing(lang, ch));
    let n = 0;
    t.parsed.forEach((s) => s.words.forEach((w, wi) => w.segs.forEach((g, gi) => {
      if (g.lemmas.some((l) => want.has(l)) && captureSeg(lang, s, wi, gi, t.id)) { n++; g.lemmas.forEach((l) => want.delete(l)); }
    })));
    save(); toast(`${n} mot(s) clé(s) en révision ✓`); render();
  },
  // Mots inconnus d'un chapitre terminé → cartes de révision (§15)
  "book-capture": (el) => {
    const lang = currentLang(), t = CHAPTER_TEXTS[lang][el.dataset.id];
    let n = 0;
    for (const { si, wi, gi } of unknownLemmas(lang, t.parsed).values()) if (captureSeg(lang, t.parsed[si], wi, gi, t.id)) n++;
    save(); toast(`${n} carte(s) ajoutée(s) ✓`); render();
  },
});
