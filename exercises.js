// ============================================================
//  Mochi — exercices supplémentaires (rappel actif, contexte + audio)
//  Dictée · Remettre dans l'ordre · Compréhension orale · Registres (coréen)
//  · Faux amis (anglais) · Mélange (alternance, §13). Phrases choisies parmi celles que l'utilisateur
//  comprend presque entièrement (§3).
// ============================================================

// group : rangement du menu (Écoute · Écrit · Grammaire · Vocabulaire). Les types qui
// ne sont pas de l'écoute sont majoritaires : l'écoute a déjà l'onglet « Écouter les sons ».
const EX_KINDS = {
  melange: { icon: "🔀", label: "Mélange", langs: ["en", "ko", "zh", "ru"] },
  dictee: { icon: "✍️", label: "Dictée", langs: ["en", "ko", "zh", "ru"], group: "listen" },
  ecoute: { icon: "🎧", label: "Compréhension orale", langs: ["en", "ko", "zh", "ru"], group: "listen" },
  trou: { icon: "✏️", label: "Phrase à trou", langs: ["en", "ko", "zh", "ru"], group: "write" },
  traduction: { icon: "🔁", label: "Traduis", langs: ["en", "ko", "zh", "ru"], group: "write" },
  forme: { icon: "🔤", label: "La bonne forme", langs: ["en", "ko", "ru"], group: "write" },
  ordre: { icon: "🧩", label: "Remettre dans l'ordre", langs: ["en", "ko", "zh", "ru"], group: "grammar" },
  particule: { icon: "🧷", label: "La bonne particule", langs: ["ko"], group: "grammar" },
  registre: { icon: "🙇", label: "Quel registre ?", langs: ["ko"], group: "grammar" },
  confusion: { icon: "⚖️", label: "Ne pas confondre", langs: ["en", "ko", "zh", "ru"], group: "vocab" },
  paires: { icon: "🔗", label: "Associe", langs: ["en", "ko", "zh", "ru"], group: "vocab" },
  faux: { icon: "🎭", label: "Faux amis", langs: ["en"], group: "vocab" },
};
const EX_GROUPS = [["listen", "🎧 Écoute"], ["write", "✍️ Écrit"], ["grammar", "🧩 Grammaire"], ["vocab", "📒 Vocabulaire"]];
// Types définis plus bas (EX_MORE) : { ready(lang) → bool, build(lang, q, prev), view(lang, E) → html, check?(lang, E) }
const EX_MORE = {};

TABS.en.splice(4, 0, ["exercices", "🎯 Exercices"]);
TABS.ko.splice(5, 0, ["exercices", "🎯 Exercices"]);
GATED_TABS.push("exercices");

// Phrases candidates : on privilégie celles dont on connaît déjà la plupart des mots
function pickSentence(lang, avoidText) {
  const stab = stabilityMap(lang);
  const all = TEXTS[lang].flatMap((t) => t.parsed.map((s) => ({ s, c: coverage(lang, [s], stab) })));
  const pool = all.filter((x) => x.s.text !== avoidText);
  const good = pool.filter((x) => x.c >= 0.8);
  const list = good.length >= 3 ? good : pool.sort((a, b) => b.c - a.c).slice(0, 8);
  return list[Math.floor(Math.random() * list.length)].s;
}

// Alternance (§13) : un point de grammaire est d'abord travaillé seul (Parcours),
// puis les séances mélangent les points déjà vus, avec plus de poids pour les
// points récents et souvent ratés. On doit *choisir* la bonne forme.
function grammarPool() {
  const K = state.langs.ko;
  const done = KO_GRAMMAR.filter((g) => K.grammarDone[g.id]);
  const recent = new Set(done.slice(-2).map((g) => g.id));
  return done.map((g) => ({ g, w: 1 + (recent.has(g.id) ? 2 : 0) + 2 * Math.min(3, K.grammarMiss[g.id] || 0) }));
}
function weightedPick(items) {
  let r = Math.random() * items.reduce((t, x) => t + x.w, 0);
  for (const x of items) if ((r -= x.w) < 0) return x;
  return items[items.length - 1];
}
function mixKind(lang, prevKind) {
  const pool = grammarPool();
  if (isKo(lang) && pool.length >= 2 && Math.random() < 0.5) return "grammaire";
  const kinds = Object.keys(EX_KINDS).filter((k) => k !== "melange" && k !== prevKind && EX_KINDS[k].langs.includes(lang) && (!EX_MORE[k]?.ready || EX_MORE[k].ready(lang)));
  return kinds[Math.floor(Math.random() * kinds.length)];
}

function newExercise(lang, kind) {
  const prev = ui.ex?.q?.s?.text;
  const mix = kind === "melange";
  if (mix) kind = mixKind(lang, ui.ex?.q?.kind);
  const q = { kind, mix };
  if (kind === "grammaire") {
    const { g } = weightedPick(grammarPool());
    const it = g.quiz[Math.floor(Math.random() * g.quiz.length)];
    Object.assign(q, { g, it, answer: it.a, options: shuffle(it.o) });
  }
  if (kind === "dictee") q.s = pickSentence(lang, prev);
  else if (kind === "ordre") {
    q.s = pickSentence(lang, prev);
    // On retire la ponctuation des tuiles ; elle est rendue à la fin
    q.tiles = shuffle(q.s.words.map((w, i) => ({ i, t: w.segs.map((g) => g.surface).join("") })));
    if (q.tiles.every((t, j) => t.i === j) && q.tiles.length > 1) q.tiles.reverse();
    q.order = [];
  } else if (kind === "ecoute") {
    q.s = pickSentence(lang, prev);
    const others = shuffle(TEXTS[lang].flatMap((t) => t.parsed).filter((x) => x.fr !== q.s.fr)).slice(0, 3).map((x) => x.fr);
    q.options = shuffle([q.s.fr, ...others]);
    q.answer = q.s.fr;
  } else if (kind === "registre") {
    // Une phrase + un interlocuteur dont la formulation est unique parmi les quatre
    const p = REGISTERS.phrases[Math.floor(Math.random() * REGISTERS.phrases.length)];
    const forms = REGISTERS.who.map(([k]) => p[k]);
    const unique = REGISTERS.who.filter(([k]) => forms.filter((f) => f === p[k]).length === 1);
    const [who, label, reg] = unique[Math.floor(Math.random() * unique.length)];
    Object.assign(q, { p, who: label, reg, answer: p[who], options: shuffle([...new Set(forms)]) });
  } else if (kind === "faux") {
    const f = FAUX_AMIS[Math.floor(Math.random() * FAUX_AMIS.length)];
    const [right, trap] = f.fr.split(" (≠ ");
    const trapFr = trap.split(" → ")[0];
    Object.assign(q, { f, answer: right, options: shuffle([right, trapFr]) });
  }
  if (EX_MORE[kind]) EX_MORE[kind].build(lang, q, prev);
  ui.ex = { lang, kind: mix ? "melange" : kind, q, picked: null, typed: "", result: null };
  if (kind === "dictee" || kind === "ecoute") setTimeout(() => speak(q.s.text, lang), 300);
}

function tabExercises(lang) {
  const kinds = Object.entries(EX_KINDS).filter(([, v]) => v.langs.includes(lang));
  if (!ui.ex || ui.ex.lang !== lang) newExercise(lang, kinds[0][0]);
  const E = ui.ex, q = E.q, k = koCls(lang), kind = q.kind;
  const btn = ([id, v]) => `<button class="choice small-choice ${id === E.kind ? "active" : ""}" data-act="ex-kind" data-k="${id}" ${id === E.kind ? 'aria-pressed="true"' : ""}>${v.icon} ${v.label}</button>`;
  const menu = `<details class="ex-menu-wrap" ${ui.exMenuOpen ? "open" : ""}>
      <summary><span class="ex-current">${EX_KINDS[E.kind].icon} ${EX_KINDS[E.kind].label}${E.kind === "melange" ? " <small class=\"muted\">(recommandé)</small>" : ""}</span><span class="lnk">Changer d'exercice</span></summary>
      <div class="ex-menu">${btn(["melange", EX_KINDS.melange])}
        ${EX_GROUPS.map(([g, label]) => { const list = kinds.filter(([, v]) => v.group === g); return list.length ? `<div class="ex-group"><small class="muted">${label}</small><div>${list.map(btn).join("")}</div></div>` : ""; }).join("")}
      </div>
    </details>`;
  const play = () => `<button class="big-audio" data-act="say" data-text="${esc(q.s.text)}" data-lang="${lang}">🔊</button>`;
  const next = `<div class="wp-actions center"><button class="btn small" data-act="ex-next">Suivant →</button></div>`;
  let body = "";

  if (kind === "dictee") {
    body = `<p class="q-label">Écoute et écris la phrase.</p>
      <div class="center audio-row">${play()}<button class="choice small-choice" data-act="say-slow">🐢 Lentement</button></div>
      ${E.result ? `
        <p class="q-sentence ${k}">${E.result.tHtml}</p>
        ${E.result.ok ? `<p class="ok-msg">Parfait !</p>` : `<p class="muted">Ta réponse : <span class="${k}">${E.result.uHtml}</span></p>`}
        <p class="muted">${esc(q.s.fr)}</p>${next}`
      : `<input class="input answer ${k}" id="ex-answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ce que tu entends…" />
         <div class="wp-actions center"><button class="btn" data-act="ex-check">Vérifier</button></div>`}`;
  } else if (kind === "ordre") {
    const done = E.result;
    const used = new Set(q.order);
    body = `<p class="q-label">Remets les mots dans l'ordre.</p><p class="muted">« ${esc(q.s.fr)} »</p>
      <div class="tile-line ${done ? (done.ok ? "right" : "wrong") : ""} ${k}">${q.order.map((ti, j) => `<button class="tile" data-act="ex-untile" data-j="${j}" ${done ? "disabled" : ""}>${esc(q.tiles[ti].t)}</button>`).join("") || `<span class="muted">Touche les mots ci-dessous…</span>`}</div>
      <div class="tile-pool ${k}">${q.tiles.map((t, ti) => `<button class="tile ${used.has(ti) ? "used" : ""}" data-act="ex-tile" data-t="${ti}" ${used.has(ti) || done ? "disabled" : ""}>${esc(t.t)}</button>`).join("")}</div>
      ${done ? `${done.ok ? `<p class="ok-msg">Bravo !</p>` : `<p class="ko-msg">Ordre correct : <span class="${k}">${esc(q.s.text)}</span></p>`}${isKo(lang) && !done.ok ? `<p class="muted"><small>En coréen, le verbe va toujours à la fin, et les particules indiquent le rôle de chaque mot.</small></p>` : ""}${next}`
        : `<div class="wp-actions center"><button class="btn" data-act="ex-check" ${q.order.length === q.tiles.length ? "" : "disabled"}>Vérifier</button></div>`}`;
  } else if (kind === "ecoute") {
    body = `<p class="q-label">Écoute. Que veut dire cette phrase ?</p><div class="center">${play()}</div>
      ${choices(q.options, q.answer, E.picked, "")}
      ${E.picked ? `<p class="q-sentence ${k} mt-12">${esc(q.s.text)}</p>${next}` : ""}`;
  } else if (kind === "registre") {
    body = `<p class="q-label">Tu parles à : <b>${esc(q.who)}</b>. Comment dis-tu « ${esc(q.p.fr)} » ?</p>
      ${choices(q.options, q.answer, E.picked, "ko")}
      ${E.picked ? `<p class="muted mt-12">${esc(q.reg)} · ${esc(q.p.note)}</p>${next}` : ""}
      <p class="muted"><small>Pour reconnaître les registres. Dans le parcours, on produit au registre poli (해요체).</small></p>`;
  } else if (kind === "faux") {
    body = `<p class="q-label">Que veut dire le mot surligné ?</p>
      <p class="q-sentence">${esc(q.f.s).replace(new RegExp(q.f.lemma, "i"), (m) => `<mark>${esc(m)}</mark>`)}</p>
      <button class="btn ghost small" data-act="say" data-text="${esc(q.f.s)}" data-lang="en">🔊 Phrase</button>
      ${choices(q.options, q.answer, E.picked, "")}
      ${E.picked ? `<p class="muted mt-12">${esc(q.f.sfr)}</p><p class="note">⚠️ ${esc(q.f.fr)}</p>${next}` : ""}`;
  }
  if (EX_MORE[kind]) body = EX_MORE[kind].view(lang, E);
  if (kind === "grammaire") {
    body = `<p class="q-label">Choisis la bonne forme.</p>
      <p class="q-sentence ko" lang="ko">${esc(q.it.q)}</p><p class="muted">${esc(q.it.fr)}</p>
      ${choices(q.options, q.answer, E.picked, "ko")}
      ${E.picked ? `<p class="muted mt-12"><b>${esc(q.g.title)}</b> · ${esc(q.g.explain)}</p>${next}` : ""}`;
  }
  const mixInfo = q.mix ? `<p class="muted center"><small>🔀 ${EX_KINDS[kind]?.label || "Grammaire"} · les exercices et les points de grammaire déjà vus sont mélangés : c'est plus dur, et c'est pour ça que ça marche.</small></p>` : "";
  const nMist = typeof mistakesOpen === "function" ? mistakesOpen(lang) : 0;
  return `${menu}${nMist ? `<p class="mt-0"><a class="lnk" href="#/lang/${lang}/erreurs">📒 Mon carnet d'erreurs · ${plural(nMist, "type à travailler", "types à travailler")}</a></p>` : ""}<div class="card review-card ex-card">${body}</div>${mixInfo}`;
}

function choices(options, answer, picked, cls) {
  return `<div class="ex-choices">${options.map((o) => {
    const state = picked ? (o === answer ? "right" : o === picked ? "wrong" : "") : "";
    return `<button class="choice ${cls} ${state}" data-act="ex-pick" data-o="${esc(o)}" ${picked ? "disabled" : ""}>${esc(o)}</button>`;
  }).join("")}</div>`;
}

function exDone(lang, ok) {
  const L = state.langs[lang];
  if (typeof noteExercise === "function") noteExercise(lang, ui.ex?.q, ok, ui.ex?.picked); // carnet d'erreurs (mistakes.js)
  if (ok) L.xp += 1;
  track(lang, "ex");
  save();
}

TAB_VIEWS.exercices = (lang) => tabExercises(lang);

Object.assign(actions, {
  "ex-kind": (el) => { ui.exMenuOpen = false; newExercise(currentLang(), el.dataset.k); render(); },
  "ex-next": () => { newExercise(currentLang(), ui.ex.kind); render(); },
  "say-slow": () => speak(ui.ex.q.s.text, currentLang(), 0.7),
  "ex-pick": (el) => {
    const E = ui.ex;
    if (E.picked) return;
    E.picked = el.dataset.o;
    exDone(E.lang, E.picked === E.q.answer);
    if (E.q.kind === "grammaire" && E.picked !== E.q.answer) {
      const M = state.langs.ko.grammarMiss; M[E.q.g.id] = (M[E.q.g.id] || 0) + 1; save();
    }
    if (E.q.kind === "registre" && E.picked === E.q.answer) speak(E.q.answer, "ko");
    render();
  },
  "ex-tile": (el) => { const q = ui.ex.q; q.order.push(+el.dataset.t); render(); },
  "ex-untile": (el) => { ui.ex.q.order.splice(+el.dataset.j, 1); render(); },
  "ex-check": () => {
    const E = ui.ex, lang = E.lang, q = E.q;
    if (q.kind === "dictee") {
      const typed = (document.getElementById("ex-answer")?.value || "").trim();
      if (!typed) return toast("Écris ce que tu entends ✍️");
      const r = recast(typed, q.s.text, lang);
      E.result = { ...r, ok: sameAnswer(lang, typed, q.s.text) };
    } else if (EX_MORE[q.kind]?.check) {
      if (EX_MORE[q.kind].check(lang, E) === false) return; // rien à vérifier (champ vide…)
      if (E.result?.async) return; // vérification par l'IA en cours : exDone sera appelé à la réponse
    } else if (q.kind === "ordre") {
      const sep = q.s.words.sep ?? " ";
      const built = q.order.map((ti) => q.tiles[ti].t).join(sep);
      const right = q.s.words.map((w) => w.segs.map((g) => g.surface).join("")).join(sep);
      E.result = { ok: built === right };
      speak(q.s.text, lang);
    }
    exDone(lang, E.result.ok);
    render();
  },
});

// Entrée valide la dictée
$app.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "ex-answer") { e.preventDefault(); actions["ex-check"](); }
});

// ============================================================
//  Types d'exercices supplémentaires (PEDAGOGIE §1, §2, §4, §6, §12, §13)
//  Surtout de l'ÉCRIT et de la grammaire : retrouver un mot de mémoire, produire
//  une phrase avec reformulation, choisir la bonne forme, ne pas confondre.
// ============================================================
const segList = (s) => s.words.flatMap((w, wi) => w.segs.map((g, gi) => ({ wi, gi, g })));
// Phrase avec un trou à la place d'un morceau (et, après la réponse, le morceau surligné)
function blankHtml(s, wi, gi, fill = null, cls = "") {
  return s.words.map((w, i) => esc(w.pre) + w.segs.map((g, j) => (i === wi && j === gi
    ? `<span class="blank ${cls}">${fill != null ? esc(fill) : "＿".repeat(Math.max(2, [...g.surface].length))}</span>`
    : esc(g.surface))).join("") + esc(w.post)).join(" ");
}
// Une phrase bien comprise (§3) et un morceau qui vérifie `pred`
function pickSeg(lang, pred, prev) {
  const stab = stabilityMap(lang);
  const cands = TEXTS[lang].flatMap((t) => t.parsed).filter((s) => s.text !== prev)
    .flatMap((s) => segList(s).filter((x) => pred(x.g, s)).map((x) => ({ s, ...x, c: coverage(lang, [s], stab) })));
  if (!cands.length) return null;
  const good = cands.filter((x) => x.c >= 0.8);
  const list = good.length >= 3 ? good : cands;
  return list[Math.floor(Math.random() * list.length)];
}
// Les mots-outils les plus fréquents (the, a, be…) ne font pas de bons trous
const LEX_RANK = Object.fromEntries(Object.keys(LANGUAGES).map((l) => [l, Object.fromEntries(Object.keys(LEXICON[l]).map((k, i) => [k, i]))]));
const contentWord = (lang) => (g) => !g.proper && !g.particle && g.lemmas.length === 1 && [...g.surface].length >= 2
  && LEXICON[lang][g.lemmas[0]] && (LEX_RANK[lang][g.lemmas[0]] ?? 0) >= 12 && g.lemmas[0] !== "이다";
const typedField = (lang, ph) => `<input class="input answer ${koCls(lang)}" id="ex-answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${ph}" />
  <div class="wp-actions center"><button class="btn" data-act="ex-check">Vérifier</button></div>`;
const exNext = `<div class="wp-actions center"><button class="btn small" data-act="ex-next">Suivant →</button></div>`;
const typedValue = () => (document.getElementById("ex-answer")?.value || "").trim();

// ✏️ Phrase à trou : retrouver le mot de mémoire (rappel actif écrit, §1-2)
EX_MORE.trou = {
  build(lang, q, prev) { Object.assign(q, pickSeg(lang, contentWord(lang), prev)); q.answer = q.g.surface; },
  view(lang, E) {
    const q = E.q, k = koCls(lang), R = E.result;
    return `<p class="q-label">Complète la phrase.</p>
      <p class="q-sentence ${k}">${blankHtml(q.s, q.wi, q.gi, R ? q.answer : null, R ? "right" : "")}</p>
      <p class="muted">« ${esc(q.s.fr)} »</p>
      ${R ? `${R.ok ? `<p class="ok-msg">Bien joué !</p>` : `<p class="ko-msg">Tu as écrit <b class="${k}">${esc(R.typed)}</b> · c'était <b class="${k}">${esc(q.answer)}</b> (${esc(lexFr(lang, q.g.lemmas[0]))})</p>`}${exNext}`
        : `${E.hint ? `<p class="muted center"><small>💡 ${isZh(lang) ? `En pinyin : <b>${esc(zhPinyin(q.answer))}</b>` : `Commence par <b class="${k}">${esc([...q.answer][0])}</b>`} · ${[...q.answer].length} ${{ ko: "syllabes", zh: "caractères" }[lang] || "lettres"}</small></p>` : `<p class="center"><button class="btn ghost small" data-act="ex-hint">💡 Un indice</button></p>`}${typedField(lang, "Le mot qui manque…")}`}`;
  },
  check(lang, E) {
    const t = typedValue(); if (!t) { toast("Écris le mot qui manque ✍️"); return false; }
    E.result = { typed: t, ok: sameAnswer(lang, t, E.q.answer) };
    speak(E.q.s.text, lang);
  },
};

// 🔤 La bonne forme : conjuguer / accorder dans le contexte (먹다 → 먹었어요, go → went)
EX_MORE.forme = {
  build(lang, q, prev) {
    Object.assign(q, pickSeg(lang, (g) => !g.proper && !g.particle && g.lemmas.length === 1 && !g.surface.includes("'")
      && g.surface.toLowerCase() !== g.lemmas[0] && LEXICON[lang][g.lemmas[0]] && (!isKo(lang) || g.lemmas[0].endsWith("다")), prev));
    q.answer = q.g.surface;
  },
  view(lang, E) {
    const q = E.q, k = koCls(lang), R = E.result, base = q.g.lemmas[0];
    return `<p class="q-label">Mets le mot à la bonne forme.</p>
      <p class="q-sentence ${k}">${blankHtml(q.s, q.wi, q.gi, R ? q.answer : null, R ? "right" : "")} <small class="muted">(${esc(base)})</small></p>
      <p class="muted">« ${esc(q.s.fr)} »</p>
      ${R ? `${R.ok ? `<p class="ok-msg">Parfait !</p>` : `<p class="ko-msg">Tu as écrit <b class="${k}">${esc(R.typed)}</b></p>`}
          <p class="ex-note"><b class="${k}">${esc(base)}</b> → <b class="${k}">${esc(q.answer)}</b>${isKo(lang) ? (/요$/.test(q.answer) ? " · terminaison polie en -요" : "") : ""}</p>${exNext}`
        : typedField(lang, { ko: "ex. 먹어요", ru: "ex. люблю" }[lang] || "ex. went")}`;
  },
  check(lang, E) {
    const t = typedValue(); if (!t) { toast("Écris la forme du mot ✍️"); return false; }
    E.result = { typed: t, ok: sameAnswer(lang, t, E.q.answer) };
    speak(E.q.s.text, lang);
  },
};

// 🔁 Traduis : produire une phrase entière, feedback par reformulation (§4)
EX_MORE.traduction = {
  build(lang, q, prev) { q.s = pickSentence(lang, prev); },
  view(lang, E) {
    const q = E.q, k = koCls(lang), R = E.result;
    if (R?.async) return `<p class="q-label">Traduis en ${LANGUAGES[lang].name.toLowerCase()}.</p><p class="q-sentence">« ${esc(q.s.fr)} »</p><div class="card feedback loading">${mochi("small", "thinking")}<p><b>Mochi relit ta phrase…</b></p></div>`;
    return `<p class="q-label">Traduis en ${LANGUAGES[lang].name.toLowerCase()}.</p>
      <p class="q-sentence">« ${esc(q.s.fr)} »</p>
      ${R ? `<p class="muted">Ta phrase : <span class="${k}">${R.uHtml || esc(R.typed)}</span></p>
          ${R.ok ? `<p class="ok-msg">${R.verdict === "acceptable" ? "Correct ! Version plus naturelle :" : "Parfait !"}</p>` : `<p class="ko-msg">Version corrigée :</p>`}
          ${R.ok && R.verdict !== "acceptable" ? "" : `<p class="q-sentence ${k}">${R.tHtml || esc(R.recast)}</p>`}
          ${R.explain ? `<p class="ex-note">${esc(R.explain)}</p>` : ""}
          ${R.local && !R.ok ? `<p class="muted"><small>Comparée à une traduction possible : d'autres formulations peuvent être justes.${llmReady() ? "" : " Connecte-toi pour une correction par l'IA."}</small></p>` : ""}
          <div class="center"><button class="btn ghost small" data-act="say" data-text="${esc(q.s.text)}" data-lang="${lang}">🔊 Écouter</button></div>${exNext}`
        : `<textarea class="input answer ${k}" id="ex-answer" rows="2" maxlength="300" placeholder="${{ ko: "한국어로…", zh: "用中文（汉字或拼音）…", ru: "По-русски (ou en lettres latines)…" }[lang] || "In English…"}"></textarea>
           <div class="wp-actions center"><button class="btn" data-act="ex-check">Vérifier</button></div>`}`;
  },
  check(lang, E) {
    const t = typedValue(), q = E.q; if (!t) { toast("Écris ta traduction ✍️"); return false; }
    if (sameAnswer(lang, t, q.s.text)) { E.result = { typed: t, ok: true }; return; }
    if (!llmReady()) { E.result = { typed: t, ok: false, local: true, ...recast(t, q.s.text, lang) }; return; }
    E.result = { async: true };
    api("POST", "/api/feedback", { lang, prompt: `Traduis en ${LANGUAGES[lang].name.toLowerCase()} : « ${q.s.fr} »`, reference: q.s.text, text: t })
      .then((r) => { const f = r.feedback, ok = f.verdict !== "errors"; E.result = { typed: t, ok, verdict: f.verdict, recast: f.recast, explain: f.explanation, ...(ok && f.verdict === "correct" ? {} : recast(t, f.recast, lang)) }; exDone(lang, ok); })
      .catch(() => { E.result = { typed: t, ok: false, local: true, ...recast(t, q.s.text, lang) }; exDone(lang, false); })
      .finally(() => { if (ui.ex === E) render(); });
  },
};

// 🧷 La bonne particule (coréen, §6) : rôle + forme selon la dernière lettre
const PARTICLE_PAIR = { 은: "는", 는: "은", 이: "가", 가: "이", 을: "를", 를: "을", 와: "과", 과: "와", 로: "으로", 으로: "로", 랑: "이랑", 이랑: "랑" };
const PARTICLE_GRAMMAR = { 은: "eun-neun", 는: "eun-neun", 이: "i-ga", 가: "i-ga", 을: "eul-reul", 를: "eul-reul", 에: "e", 에서: "eseo", 도: "do" };
const MAIN_PARTICLES = ["은", "는", "이", "가", "을", "를", "에", "에서", "도"];
EX_MORE.particule = {
  build(lang, q, prev) {
    Object.assign(q, pickSeg(lang, (g) => g.particle && (MAIN_PARTICLES.includes(g.surface) || PARTICLE_PAIR[g.surface]), prev));
    const a = q.g.surface, others = shuffle(MAIN_PARTICLES.filter((x) => x !== a && x !== PARTICLE_PAIR[a] && PARTICLE_FN[x] !== PARTICLE_FN[a])).slice(0, PARTICLE_PAIR[a] ? 2 : 3);
    q.answer = a; q.options = shuffle([a, ...(PARTICLE_PAIR[a] ? [PARTICLE_PAIR[a]] : []), ...others]);
    const before = q.s.words[q.wi].segs[q.gi - 1]?.surface || "", last = hgDecompose([...before].pop());
    q.final = last ? last.t > 0 : null; q.finalL = last && last.t === 8; // 8 = ㄹ
    q.before = before;
  },
  view(lang, E) {
    const q = E.q, a = q.answer, [fn, label] = particleFn(a), pair = PARTICLE_PAIR[a];
    const rule = !pair ? "" : ["로", "으로"].includes(a) ? `Après une voyelle ou ㄹ : 로 ; après une autre consonne : 으로.`
      : `Après une consonne : ${["은", "이", "을", "과", "이랑"].includes(a) ? a : pair} ; après une voyelle : ${["는", "가", "를", "와", "랑"].includes(a) ? a : pair}.`;
    return `<p class="q-label">Quelle particule va dans le trou ?</p>
      <p class="q-sentence ko">${blankHtml(q.s, q.wi, q.gi, E.picked ? a : null, E.picked ? "right" : "")}</p>
      <p class="muted">« ${esc(q.s.fr)} »</p>
      ${choices(q.options, a, E.picked, "ko")}
      ${E.picked ? `<p class="ex-note"><b class="ko">${a}</b> : ${label}.${rule ? ` ${rule} « <span class="ko">${esc(q.before)}</span> » finit par ${q.final ? "une consonne" : "une voyelle"}.` : ""}</p>${exNext}` : ""}`;
  },
};

// ⚖️ Ne pas confondre (§12) : seulement quand les DEUX mots d'une paire sont déjà connus ou en révision
function confusablePairs(lang) {
  const stab = stabilityMap(lang), L = state.langs[lang], has = (w) => L.known[w] || stab[w] !== undefined;
  const inText = (w) => TEXTS[lang].some((t) => t.parsed.some((s) => segList(s).some((x) => x.g.lemmas.includes(w))));
  return (CONFUSABLE[lang] || []).filter(([a, b]) => has(a) && has(b) && (inText(a) || inText(b)));
}
EX_MORE.confusion = {
  ready: (lang) => confusablePairs(lang).length > 0,
  build(lang, q, prev) {
    const pairs = confusablePairs(lang);
    if (!pairs.length) { q.empty = true; return; }
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    Object.assign(q, pickSeg(lang, (g) => g.lemmas.length === 1 && pair.includes(g.lemmas[0]), prev) || pickSeg(lang, (g) => g.lemmas.length === 1 && pair.includes(g.lemmas[0])));
    q.answer = q.g.lemmas[0]; q.options = shuffle([...pair]); q.pair = pair;
  },
  view(lang, E) {
    const q = E.q, k = koCls(lang);
    if (q.empty) return `<p class="q-label">⚖️ Ne pas confondre</p><p>Cet exercice oppose deux mots qui se ressemblent ou s'opposent (${{ ko: "먹다 / 마시다, 출근하다 / 퇴근하다", zh: "吃 / 喝, 上班 / 下班", ru: "идти / ехать, учить / изучать" }[lang] || "early / late, open / close"}).</p>
      <p class="muted">Il s'ouvre quand tu connais <b>les deux</b> mots d'une paire. C'est voulu : les apprendre en même temps les mélange en mémoire. Une fois les deux bien installés, les opposer aide à les distinguer.</p>`;
    return `<p class="q-label">Quel mot va dans le trou ? <small class="muted">(forme de base)</small></p>
      <p class="q-sentence ${k}">${blankHtml(q.s, q.wi, q.gi, E.picked ? q.g.surface : null, E.picked ? "right" : "")}</p>
      <p class="muted">« ${esc(q.s.fr)} »</p>
      ${choices(q.options, q.answer, E.picked, k)}
      ${E.picked ? `<p class="ex-note">${q.pair.map((w) => `<b class="${k}">${esc(w)}</b> = ${esc(lexFr(lang, w))}`).join(" · ")}</p>${exNext}` : ""}`;
  },
};

// 🔗 Associe : 5 mots et leur sens (les mots en révision d'abord)
EX_MORE.paires = {
  build(lang, q) {
    const ok = (l) => LEXICON[lang][l] && !KO_PARTICLES.has(l) && l !== "이다" && [...l].length >= 2;
    const mine = shuffle([...new Set(state.cards.filter((c) => c.lang === lang).map((c) => c.lemma))].filter(ok));
    const fromTexts = [...new Set(TEXTS[lang].flatMap((t) => t.parsed.flatMap((s) => segList(s).flatMap((x) => x.g.lemmas))))].filter(ok);
    const seenFr = new Set(), pick = [];
    for (const l of [...mine, ...shuffle(fromTexts)]) { const fr = LEXICON[lang][l].fr; if (pick.length < 5 && !seenFr.has(fr) && !pick.includes(l)) { pick.push(l); seenFr.add(fr); } }
    Object.assign(q, { words: pick, right: shuffle(pick.map((_, i) => i)), sel: null, matched: [], errors: 0, flash: null });
  },
  view(lang, E) {
    const q = E.q, k = koCls(lang), done = q.matched.length === q.words.length;
    return `<p class="q-label">Associe chaque mot à son sens.</p>
      <div class="pairs">
        <div class="pairs-col">${q.words.map((w, i) => `<button class="choice ${k} ${q.matched.includes(i) ? "right" : q.sel === i ? "active" : ""}" data-act="pair-l" data-i="${i}" ${q.matched.includes(i) ? "disabled" : ""}>${esc(w)}</button>`).join("")}</div>
        <div class="pairs-col">${q.right.map((i) => `<button class="choice ${q.matched.includes(i) ? "right" : q.flash === i ? "wrong" : ""}" data-act="pair-r" data-i="${i}" ${q.matched.includes(i) ? "disabled" : ""}>${esc(LEXICON[lang][q.words[i]].fr)}</button>`).join("")}</div>
      </div>
      ${done ? `<p class="ok-msg">${q.errors ? `Fini, avec ${plural(q.errors, "erreur", "erreurs")}.` : "Sans faute !"}</p>${exNext}` : `<p class="muted center"><small>Touche un mot à gauche, puis son sens à droite.</small></p>`}`;
  },
};

Object.assign(actions, {
  "ex-hint": () => { ui.ex.hint = true; render(); },
  "pair-l": (el) => { const q = ui.ex.q, i = +el.dataset.i; q.sel = i; q.flash = null; speak(q.words[i], ui.ex.lang); render(); },
  "pair-r": (el) => {
    const E = ui.ex, q = E.q, i = +el.dataset.i;
    if (q.sel === null) { toast("Choisis d'abord un mot à gauche"); return; }
    if (i === q.sel) { q.matched.push(i); q.sel = null; q.flash = null; if (q.matched.length === q.words.length) exDone(E.lang, q.errors === 0); }
    else { q.errors++; q.flash = i; }
    render();
  },
});
// Particule ratée → le point de grammaire correspondant revient plus souvent dans le Mélange (§13)
const exPickBase = actions["ex-pick"];
actions["ex-pick"] = (el) => {
  const E = ui.ex;
  if (!E.picked && E.q.kind === "particule" && el.dataset.o !== E.q.answer) {
    const id = PARTICLE_GRAMMAR[E.q.answer]; if (id) { const M = state.langs.ko.grammarMiss; M[id] = (M[id] || 0) + 1; }
  }
  exPickBase(el);
};

// Le menu « Changer d'exercice » reste ouvert ou fermé d'un exercice à l'autre
$app.addEventListener("toggle", (e) => { if (e.target.classList?.contains("ex-menu-wrap")) ui.exMenuOpen = e.target.open; }, true);
