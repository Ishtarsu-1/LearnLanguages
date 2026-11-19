// ============================================================
//  Mochi — lessons.js : Parcours coréen, thèmes, révisions, mes mots, production, mots, oreille, faux amis, Hangul, grammaire
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// ---------- Parcours coréen (§6) ----------
function tabPath(lang) {
  const K = state.langs.ko;
  const hDone = Object.keys(K.hangulDays).length;
  const gDone = KO_GRAMMAR.filter((g) => K.grammarDone[g.id]).length;
  const phase2Done = gDone === KO_GRAMMAR.length;
  return `
    <div class="card phase ${K.hangulDone ? "done" : ""}">
      <div class="phase-head"><b>Phase 1 · Le Hangul</b><span class="tag">${K.hangulDone ? "Terminé ✓" : `${hDone} / ${HANGUL_DAYS.length} jours`}</span></div>
      <p class="mt-8 mb-0 mx-0"><a class="btn ghost small" href="#/lang/ko/atelier">🧪 Atelier des syllabes</a></p>
      <div class="bar"><span data-bar-w="${K.hangulDone ? 100 : (hDone / HANGUL_DAYS.length) * 100}"></span></div>
      <div class="day-grid">
        ${HANGUL_DAYS.map((d, i) => {
          const done = K.hangulDays[i + 1], open = i === 0 || K.hangulDays[i] || K.hangulDone || isAdmin();
          return `<a class="day ${done ? "done" : ""} ${open ? "" : "locked"}" href="#/lang/ko/hangul/${i + 1}" data-act="${open ? "" : "locked"}">
            <small>Jour ${i + 1}</small><b>${d.title}</b><span class="ko">${d.sub}</span></a>`;
        }).join("")}
      </div>
    </div>

    <div class="card phase mt-18">
      <div class="phase-head"><b>Phase 2 · Les briques de la phrase</b><span class="tag">${gDone} / ${KO_GRAMMAR.length}</span></div>
      <div class="bar"><span data-bar-w="${(gDone / KO_GRAMMAR.length) * 100}"></span></div>
      <p class="muted mt-10 mb-14 mx-0">Particules, terminaisons, niveaux de politesse : c'est la phase où presque tout le monde trouve ça dur. C'est normal. On avance <b>un point à la fois</b>, avec beaucoup d'exemples avant de produire.</p>
      <div class="gram-list">
        ${KO_GRAMMAR.map((g, i) => {
          const done = K.grammarDone[g.id], open = isAdmin() || (K.hangulDone && (i === 0 || K.grammarDone[KO_GRAMMAR[i - 1].id]));
          return `<a class="gram ${done ? "done" : ""} ${open ? "" : "locked"}" href="#/lang/ko/grammaire/${g.id}" data-act="${open ? "" : "locked"}">
            <span class="gram-n">${done ? "✓" : open ? i + 1 : "🔒"}</span><span class="ko">${g.title}</span></a>`;
        }).join("")}
      </div>
    </div>

    <div class="card phase ${phase2Done ? "" : "dim"} mt-18">
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
    <p class="muted mt-12 mb-0 mx-0"><small>Dans le parcours, on reste au registre poli (해요체), le plus utile au quotidien.</small></p>
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
  `<span class="flavor ${locked ? "locked" : ""}" data-vars="--mochi-fill:${th.fill}${th.dark && !locked ? ";--mochi-ink:#FBF4EA" : ""}">${mochi("small", mood, false)}</span>`;
function tabThemes(lang) {
  const P = themeProgress(lang), got = P.filter((p) => p.unlocked).length;
  return `
    <div class="card mb-16"><p class="m-0">Un <b>thème</b> regroupe des mots qui vont ensemble dans une scène (commander, chaud, emporter…). Chaque thème a sa <b>saveur de Mochi</b> : tu la débloques avec <b>${FLAVOR_STEPS[0]} mots solides</b> du thème (révisés et retenus au moins une semaine).
      Choisis tes thèmes préférés ⭐ : la bibliothèque les met en avant.</p>
      <p class="muted mt-8 mb-0 mx-0"><small>${got} / ${THEMES.length} saveurs débloquées · les mots de tous les jours restent prioritaires, quel que soit le thème.</small></p></div>
    <div class="theme-grid">
      ${P.map((p) => `<div class="card theme-card ${p.unlocked ? "unlocked" : ""}">
        <button class="fav ${p.fav ? "on" : ""}" data-act="theme-fav" data-t="${p.id}" aria-pressed="${p.fav}" title="${p.fav ? "Retirer des favoris" : "Thème préféré"}">${p.fav ? "★" : "☆"}</button>
        ${flavorMochi(p, p.unlocked ? "proud" : "curious", !p.unlocked)}
        <h3>${p.icon} ${esc(p.name)}</h3>
        <small class="muted">${p.unlocked ? `Saveur ${esc(p.flavor)} débloquée !` : `Saveur ${esc(p.flavor)} · encore ${Math.max(0, p.need - p.solid)} mot(s) solide(s)`}</small>
        <div class="cov"><div class="bar"><span data-bar-w="${p.words.length ? (p.solid / p.words.length) * 100 : 0}"></span></div><b>${p.solid} / ${p.words.length}</b></div>
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
    <div class="card mb-16"><p class="m-0">Classés selon <b>ton</b> vocabulaire (${num0(knownCount(lang))} mots connus). La zone idéale : <b>92–98 %</b> de mots connus.${favs.length ? " Tes thèmes ⭐ passent devant." : ""}</p></div>
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
            <div class="cov"><div class="bar"><span data-bar-w="${pct(c)}"></span></div><b>${pct(c)} %</b></div>
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
    // Chinois : pinyin au-dessus de chaque mot (ruby), désactivable
    const txt = isZh(lang) && state.settings.pinyin ? `<ruby>${esc(seg.surface)}<rt>${esc(zhLemmaPy(seg.lemmas))}</rt></ruby>` : esc(seg.surface);
    return `<span class="w ${cls} ${pt ? `pt pt-${pt[0]}` : ""} ${sel}" data-act="word" data-s="${si}" data-w="${wi}" data-g="${gi}"${pt ? ` title="${pt[1]}"` : ""} tabindex="0" role="button">${txt}</span>`;
  };

  let panel = "";
  if (R.sel) {
    const s = t.parsed[R.sel.s], seg = s.words[R.sel.w].segs[R.sel.g];
    const lemma = seg.lemmas.join(" + ");
    const has = state.cards.some((x) => x.lang === lang && x.lemma === lemma);
    const st = seg.lemmas.map((l) => lemmaStatus(lang, l, stab));
    panel = `<div class="wordpanel card">
      <button class="close-x" data-act="unsel" aria-label="Fermer">✕</button>
      <div class="wp-word ${koCls(lang)}">${esc(seg.surface)} ${seg.surface !== lemma && !isZh(lang) ? `<small class="muted">← ${esc(lemma)}</small>` : ""}</div>
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
      <div class="grow"><h1 class="fs-1-4rem">${t.icon} ${esc(t.title)}</h1></div>
      <span class="zone ${z.k}">${z.label}</span>
    </div>
    <p class="cov-line">Tu connais <b>~${pct(c)} %</b> des mots de ce texte.${c < 0.9 ? " C'est beaucoup de mots nouveaux : le glossaire ci-dessous va t'aider." : c > 0.98 ? " Parfait pour gagner en fluidité." : ""}</p>

    ${c < 0.9 && unknown.size ? `<details class="card gloss" ${R.glossOpen ? "open" : ""}>
      <summary><b>📖 Glossaire</b> · ${unknown.size} mots inconnus</summary>
      <div class="gloss-grid">${[...unknown.keys()].map((l) => `<div><b class="${koCls(lang)}">${esc(l)}</b> <span class="muted">${esc(lexFr(lang, l))}</span></div>`).join("")}</div>
      <button class="btn small mt-12" data-act="capture-all">+ Ajouter les ${unknown.size} mots aux révisions</button>
    </details>` : ""}

    <div class="player card">
      <button class="btn ghost small" data-act="${R.playing ? "stop" : "play-all"}">${R.playing ? "⏸ Stop" : "▶ Tout écouter"}</button>
      <div class="seg-ctl">${[0.75, 1, 1.25].map((v) => `<button class="${v === sp ? "on" : ""}" data-act="speed" data-v="${v}">${v}×</button>`).join("")}</div>
      <button class="choice small-choice ${R.hide ? "active" : ""}" data-act="toggle-hide">${R.hide ? "🙈 Texte masqué" : "👀 Texte affiché"}</button>
      <button class="choice small-choice ${R.shadow ? "active" : ""}" data-act="toggle-shadow">🎙️ Shadowing</button>
      ${isKo(lang) ? `<button class="choice small-choice ${state.settings.particleColors ? "active" : ""}" data-act="toggle-particles">🎨 Particules</button>` : ""}
      ${isZh(lang) ? `<button class="choice small-choice ${state.settings.pinyin ? "active" : ""}" data-act="toggle-pinyin" aria-pressed="${!!state.settings.pinyin}">拼 Pinyin</button>` : ""}
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
            <p class="s-text ${koCls(lang)}">${s.words.map((w, wi) => esc(w.pre) + w.segs.map((g, gi) => segHtml(g, si, wi, gi)).join("") + esc(w.post)).join(s.words.sep ?? " ")}</p>
            ${R.fr[si] ? `<p class="s-fr">${esc(s.fr)}</p>` : ""}
            ${ui.recordings[`${textId}:${si}`] ? `<div class="rec-row"><button class="choice small-choice" data-act="play-s" data-s="${si}">▶ Modèle</button><button class="choice small-choice" data-act="play-rec" data-s="${si}">▶ Moi</button><button class="choice small-choice" data-act="play-both" data-s="${si}">▶ Les deux</button></div>` : ""}
          </div>
        </div>`).join("")}
    </div>

    <div class="legend muted"><span class="w new">nouveau</span><span class="w learning">en révision</span>${lang === "en" ? '<span class="w cognate">transparent</span>' : '<span class="w pt pt-topic">thème</span><span class="w pt pt-subject">sujet</span><span class="w pt pt-object">objet</span><span class="w pt pt-place">lieu, temps</span><span class="w pt">autre particule</span>'}<span>Touche un mot pour sa traduction.</span></div>

    ${panel}

    <div class="ta-center mt-28">
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
    <div class="stat-grid card mt-16">
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
    : `<div class="card"><p class="muted m-0">Aucun mot pour l'instant. Pendant la lecture, touche un mot inconnu puis « + Ajouter aux révisions » : il apparaîtra ici, avec sa phrase.</p></div>`}`;
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
  const top = `<div class="lesson-top"><a class="close" href="#/lang/${lang}/revisions" aria-label="Quitter">✕</a><div class="progress"><span data-bar-w="${pct(progress)}"></span></div><span class="chip">${R.queue.length}</span></div>`;
  if (!R.queue.length) {
    if (R.done) bumpSession(lang, "review");
    const ex = currentExercise(lang);
    return `<section class="view lesson-shell">${top}<div class="card empty mt-30">${mochi()}
      <h2>Révisions terminées !</h2><p class="muted">${R.done} carte(s) revue(s). FSRS a planifié les prochaines juste avant que tu les oublies.</p>
      <a class="btn" href="#/lang/${lang}/produire">Maintenant, produis une phrase 💬</a>
      <p class="muted mt-14"><small>Prochain exercice : « ${esc(ex.prompt)} »</small></p></div></section>`;
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
      const ok = sameAnswer(lang, R.typed, c.surface);
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
  if (P.loading) fb = `<div class="card feedback loading">${mochi("small", "thinking")}<p><b>Mochi relit ta phrase…</b>${features.llmSlow ? "<br/><small class=\"muted\">La correction peut prendre un moment.</small>" : /Ollama/.test(features.engine || "") ? "<br/><small class=\"muted\">Modèle local : ça peut prendre jusqu'à une minute.</small>" : ""}</p></div>`;
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
      <p class="muted corrector"><small>${r.llm ? `✨ Corrigé par ${esc(P.engine || features.engine || "l'IA")}${P.remaining != null ? ` · ${P.remaining} correction(s) restante(s) aujourd'hui` : ""}` : /pause pour aujourd'hui/.test(P.llmError || "") ? `☕ ${esc(P.llmError)}` : `Correcteur hors ligne${P.llmError ? ` (${esc(P.llmError)})` : ""} : compare avec des réponses types.`}</small></p>
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
      <h2 class="mt-10 mb-14 mx-0">${esc(ex.prompt)}</h2>
      ${P.mode === "free" && recent.length ? `<p class="muted mt-n6 mb-12 mx-0">Essaie de réutiliser un de tes mots récents 👇</p>` : ""}
      <textarea id="prod-text" class="input ${k}" rows="${P.mode === "free" ? 3 : 2}" maxlength="500" placeholder="${{ ko: "한국어로 써 보세요…", zh: "用中文写（汉字或拼音）…", ru: "Напиши по-русски (ou en lettres latines)…" }[lang] || "Write in English…"}" ${r || P.loading ? "disabled" : ""}>${esc(P.text)}</textarea>
      ${recent.length ? `<p class="muted mt-10 mb-0 mx-0"><small>Tes mots récents : ${recent.map((w) => `<span class="tag ${k}">${esc(w)}</span>`).join(" ")}</small></p>` : ""}
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
      P.result = { llm: true, perfect, verdict: f.verdict, alt: perfect && !sameAnswer(lang, f.recast, text) ? f.recast : "", target: f.recast, tHtml: d.tHtml, uHtml: d.uHtml, errors: f.errors, explanation: f.explanation, encouragement: f.encouragement };
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
const norm = (lang, s) => normFor(lang)(s);

function checkProductionLocal(lang, text) {
  const P = ui.prod, ex = P.ex;
  const tWords = parseSentence(ex.target, lang);
  const target = plain(tWords);
  const cands = [target, ...ex.accept];
  const match = cands.find((c) => sameAnswer(lang, c, text));
  const issues = isKo(lang) ? koChecks(ex, text, tWords) : { register: [], particles: [] };
  if (match) {
    issues.particles = [];
    P.result = { perfect: true, alt: sameAnswer(lang, match, target) ? (ex.accept[0] || "") : target, target, issues };
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
// Ajoute aux révisions les `max` prochains mots fréquents, chacun avec sa phrase (§12 : variés)
function addFrequent(lang, max) {
  const stab = stabilityMap(lang), taken = { lemmas: new Set(), groups: new Set() };
  let n = 0;
  for (const l of Object.keys(LEXICON[lang])) {
    if (n >= max) break;
    if (lemmaStatus(lang, l, stab) !== "new" || interferes(lang, l, taken)) continue;
    takeLemma(lang, l, taken);
    const ctx = findContext(lang, l);
    if (ctx && captureSeg(lang, ctx.s, ctx.w, ctx.g, ctx.source)) n++;
  }
  return n;
}
function tabWords(lang) {
  const stab = stabilityMap(lang);
  const lemmas = Object.keys(LEXICON[lang]);
  const next = lemmas.filter((l) => lemmaStatus(lang, l, stab) === "new" && findContext(lang, l)).slice(0, 5);
  const label = { known: "Connu", learning: "En révision", cognate: "Transparent", new: "Nouveau" };
  const counts = { known: 0, learning: 0, cognate: 0, new: 0 };
  lemmas.forEach((l) => counts[lemmaStatus(lang, l, stab)]++);
  return `
    <div class="card mb-16">
      <div class="stat-grid">
        <div class="stat"><span class="ico">✅</span><div><b>${counts.known}</b><small>connus</small></div></div>
        <div class="stat"><span class="ico">🔄</span><div><b>${counts.learning}</b><small>en révision</small></div></div>
        ${lang === "en" ? `<div class="stat"><span class="ico">🤝</span><div><b>${counts.cognate}</b><small>transparents</small></div></div>` : ""}
      </div>
      <p class="muted mt-12 mb-12 mx-0"><small>Un mot devient « connu » quand FSRS estime que tu le retiens au moins ${KNOWN_STABILITY} jours, ou si tu le marques toi-même. Les mots sont classés par fréquence : on apprend d'abord les plus utiles.</small></p>
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
      <p class="muted mt-4 mb-14 mx-0">${esc(pair.label)} · score ${G.score}/${G.n}${G.target ? ` · voix ${G.who + 1}/${nVoices}` : ""}</p>
      <button class="big-audio" data-act="ear-play" aria-label="Écouter">🔊</button>
      <div class="choice-row center mt-16">
        ${pair.items.map((w) => {
          const cls = G.picked ? (w === G.target ? "right" : w === G.picked ? "wrong" : "") : "";
          return `<button class="choice ${k} ${cls}" data-act="ear-pick" data-w="${esc(w)}" ${G.target ? "" : "disabled"} ${isKo(lang) ? 'lang="ko"' : 'lang="en"'}>${G.picked ? (w === G.target ? "✓ " : w === G.picked ? "✗ " : "") : ""}${esc(w)}</button>`;
        }).join("")}
      </div>
      ${G.picked ? `<p class="center muted mt-12 mb-0 mx-0">${G.picked === G.target ? "Bien entendu !" : `Presque ! C'était <b class="${k}">${esc(G.target)}</b>. Réécoute les deux :`}</p>
        <div class="choice-row center mt-8">${pair.items.map((w) => `<button class="btn ghost small ${k}" data-act="ear-replay" data-w="${esc(w)}">🔊 ${esc(w)}</button>`).join("")}</div>
        <div class="wp-actions center"><button class="btn small" data-act="ear-next">Suivant →</button></div>` : !G.target ? `<p class="muted center"><small>Appuie sur 🔊 pour commencer. Chaque mot est prononcé par plusieurs voix : c'est ce qui entraîne vraiment l'oreille.</small></p>` : ""}
    </div>
    ${scores.length ? `<h2 class="section-title">Mes scores par son</h2><div class="card">${scores.map((x) => `
      <div class="reg-row"><b class="${k}">${esc(x.k)}</b><span class="bar ear-bar grow"><span data-bar-w="${pct(x.ok / x.n)}"></span></span><small class="muted">${x.ok}/${x.n}${x.n >= 4 && x.ok / x.n < 0.7 ? " · à travailler" : ""}</small></div>`).join("")}
      <p class="muted"><small>Les sons les plus faibles reviennent plus souvent.</small></p></div>` : ""}
    ${E.notes.map((n) => `<h2 class="section-title">${esc(n.t)}</h2><div class="card">${n.lines.map(([a, b]) => `
      <div class="reg-row"><button class="reg-ko ${k}" data-act="say" data-text="${esc(a.replace(/[A-Z]{2,}/g, (m) => m.toLowerCase()))}" data-lang="${lang}">${esc(a)} 🔊</button><small class="muted">${esc(b)}</small></div>`).join("")}</div>`).join("")}
    <div class="card tip mt-18">🎙️ Pour le <b>shadowing</b>, ouvre un texte dans « Lire » et active le mode 🎙️.</div>`;
}

// ---------- Faux amis (§7) ----------
function tabFauxAmis(lang) {
  const has = (l) => state.cards.some((c) => c.lang === "en" && c.lemma === l);
  const missing = FAUX_AMIS.filter((f) => !has(f.lemma)).length;
  return `
    <div class="card mb-16"><p class="m-0">Ils ressemblent au français mais ne veulent pas dire la même chose. Chaque carte garde sa phrase d'exemple et son audio.</p>
    ${missing ? `<button class="btn small mt-12" data-act="add-faux">+ Ajouter les ${missing} faux amis aux révisions</button>` : `<p class="muted"><small>Tous les faux amis sont dans tes révisions ✓</small></p>`}</div>
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
  const top = `<div class="lesson-top"><a class="close" href="${backHref}" aria-label="Quitter">✕</a><div class="progress"><span data-bar-w="${pct(done / Q.total)}"></span></div></div>`;
  if (!Q.queue.length) {
    const score = Q.total - Q.failed.size;
    if (!Q.finished) { Q.finished = true; Q.onDone(score); }
    return `<section class="view lesson-shell">${top}<div class="card empty mt-30">${mochi()}
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
      <div class="choice-row center mt-10">${q.vowels.map((x) => `<button class="choice ko ${Q.build.v === x ? "active" : ""}" data-act="build-v" data-x="${x}" ${A ? "disabled" : ""}>${x}</button>`).join("")}</div>
      ${q.finals ? `<p class="muted mt-12 mb-0 mx-0"><small>Consonne du bas (받침) :</small></p><div class="choice-row center mt-6">${q.finals.map((x) => `<button class="choice ko ${Q.build.f === x ? "active" : ""}" data-act="build-f" data-x="${x}" ${A ? "disabled" : ""}>${x}</button>`).join("")}</div>` : ""}
      ${A ? (A.ok ? `<p class="ok-msg">Bien joué !</p>` : `<p class="ko-msg">C'était <b class="ko">${q.target}</b> = ${q.target_l} + ${q.target_v}${q.target_f ? ` + ${q.target_f}` : ""}</p>`) : `<div class="center mt-16"><button class="btn" data-act="build-check" ${Q.build.l && Q.build.v && (!q.finals || Q.build.f) ? "" : "disabled"}>Vérifier</button></div>`}`;
  } else if (q.type) {
    body = `<p class="q-label">Écris ce que tu entends <span class="muted">(${esc(q.fr)})</span></p>
      <button class="big-audio" data-act="say" data-text="${q.target}" data-lang="ko">🔊</button>
      ${A ? `<p class="${A.ok ? "ok-msg" : "ko-msg"}">${A.ok ? "Bien joué !" : `Tu as écrit <b class="ko">${esc(A.picked || "…")}</b> · c'était <b class="ko">${q.target}</b>`}</p>`
        : `<form class="type-form" data-quiz-type="1"><input class="input answer ko" id="quiz-type" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="한글로…" />
          <p class="muted mt-6 mb-0 mx-0"><small>Pas de clavier coréen ? Ouvre « ⌨️ 한글 » juste en dessous.</small></p>
          <div class="center mt-12"><button class="btn">Vérifier</button></div></form>`}`;
  } else {
    body = `<p class="q-label">${q.ask}</p>${q.prompt}
      <div class="choice-row center mt-16">${q.options.map((o) => {
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
  if (q.audio && (ok || q.build)) speak(q.audio, q.audioLang || "ko");
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
    <div class="lesson-top"><a class="close" href="#/lang/ko/parcours" aria-label="Quitter">✕</a><div class="grow"><small class="muted">Hangul · jour ${day} / ${HANGUL_DAYS.length}</small><h1 class="fs-1-4rem">${d.title}</h1></div></div>
    <div class="card mt-18">${intro}</div>
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
    <div class="lesson-top"><a class="close" href="#/lang/ko/parcours" aria-label="Quitter">✕</a><div class="grow"><small class="muted">Phase 2 · point ${i + 1} / ${KO_GRAMMAR.length}</small><h1 class="ko fs-1-4rem">${g.title}</h1></div></div>
    <div class="card mt-18"><p class="m-0">${esc(g.explain)}</p></div>
    <h2 class="section-title">Écoute d'abord</h2>
    <div class="sentences">${ex.map((s, j) => `
      <div class="sentence"><div class="s-tools"><button data-act="say" data-text="${esc(s.text)}" data-lang="ko">🔊</button></div>
        <div class="s-body"><p class="s-text ko">${s.words.map((w) => esc(w.pre) + w.segs.map((x) => `<span class="w ${x.particle ? `pt pt-${particleFn(x.surface)[0]}` : ""}">${esc(x.surface)}</span>`).join("") + esc(w.post)).join(" ")}</p>
        <p class="s-fr">${esc(frOf(g.examples[j]))}</p></div></div>`).join("")}</div>
    <div class="center mt-20"><button class="btn" data-act="start-gram" data-id="${id}">Je m'entraîne</button></div>
  </section>`;
}
