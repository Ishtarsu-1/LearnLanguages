// ============================================================
//  Mochi — exercices supplémentaires (rappel actif, contexte + audio)
//  Dictée · Remettre dans l'ordre · Compréhension orale · Registres (coréen)
//  · Faux amis (anglais). Phrases choisies parmi celles que l'utilisateur
//  comprend presque entièrement (§3).
// ============================================================

const EX_KINDS = {
  dictee: { icon: "✍️", label: "Dictée", langs: ["en", "ko"] },
  ordre: { icon: "🧩", label: "Remettre dans l'ordre", langs: ["en", "ko"] },
  ecoute: { icon: "🎧", label: "Compréhension orale", langs: ["en", "ko"] },
  registre: { icon: "🙇", label: "Quel registre ?", langs: ["ko"] },
  faux: { icon: "🎭", label: "Faux amis", langs: ["en"] },
};

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

function newExercise(lang, kind) {
  const prev = ui.ex?.q?.s?.text;
  const q = { kind };
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
  ui.ex = { lang, kind, q, picked: null, typed: "", result: null };
  if (kind === "dictee" || kind === "ecoute") setTimeout(() => speak(q.s.text, lang), 300);
}

function tabExercises(lang) {
  const kinds = Object.entries(EX_KINDS).filter(([, v]) => v.langs.includes(lang));
  if (!ui.ex || ui.ex.lang !== lang) newExercise(lang, kinds[0][0]);
  const E = ui.ex, q = E.q, k = koCls(lang);
  const menu = `<div class="ex-menu">${kinds.map(([id, v]) => `<button class="choice small-choice ${id === E.kind ? "active" : ""}" data-act="ex-kind" data-k="${id}">${v.icon} ${v.label}</button>`).join("")}</div>`;
  const play = () => `<button class="big-audio" data-act="say" data-text="${esc(q.s.text)}" data-lang="${lang}">🔊</button>`;
  const next = `<div class="wp-actions center"><button class="btn small" data-act="ex-next">Suivant →</button></div>`;
  let body = "";

  if (E.kind === "dictee") {
    body = `<p class="q-label">Écoute et écris la phrase.</p>
      <div class="center audio-row">${play()}<button class="choice small-choice" data-act="say-slow">🐢 Lentement</button></div>
      ${E.result ? `
        <p class="q-sentence ${k}">${E.result.tHtml}</p>
        ${E.result.ok ? `<p class="ok-msg">Parfait !</p>` : `<p class="muted">Ta réponse : <span class="${k}">${E.result.uHtml}</span></p>`}
        <p class="muted">${esc(q.s.fr)}</p>${next}`
      : `<input class="input answer ${k}" id="ex-answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ce que tu entends…" />
         <div class="wp-actions center"><button class="btn" data-act="ex-check">Vérifier</button></div>`}`;
  } else if (E.kind === "ordre") {
    const done = E.result;
    const used = new Set(q.order);
    body = `<p class="q-label">Remets les mots dans l'ordre.</p><p class="muted">« ${esc(q.s.fr)} »</p>
      <div class="tile-line ${done ? (done.ok ? "right" : "wrong") : ""} ${k}">${q.order.map((ti, j) => `<button class="tile" data-act="ex-untile" data-j="${j}" ${done ? "disabled" : ""}>${esc(q.tiles[ti].t)}</button>`).join("") || `<span class="muted">Touche les mots ci-dessous…</span>`}</div>
      <div class="tile-pool ${k}">${q.tiles.map((t, ti) => `<button class="tile ${used.has(ti) ? "used" : ""}" data-act="ex-tile" data-t="${ti}" ${used.has(ti) || done ? "disabled" : ""}>${esc(t.t)}</button>`).join("")}</div>
      ${done ? `${done.ok ? `<p class="ok-msg">Bravo !</p>` : `<p class="ko-msg">Ordre correct : <span class="${k}">${esc(q.s.text)}</span></p>`}${isKo(lang) && !done.ok ? `<p class="muted"><small>En coréen, le verbe va toujours à la fin, et les particules indiquent le rôle de chaque mot.</small></p>` : ""}${next}`
        : `<div class="wp-actions center"><button class="btn" data-act="ex-check" ${q.order.length === q.tiles.length ? "" : "disabled"}>Vérifier</button></div>`}`;
  } else if (E.kind === "ecoute") {
    body = `<p class="q-label">Écoute. Que veut dire cette phrase ?</p><div class="center">${play()}</div>
      ${choices(q.options, q.answer, E.picked, "")}
      ${E.picked ? `<p class="q-sentence ${k}" style="margin-top:12px">${esc(q.s.text)}</p>${next}` : ""}`;
  } else if (E.kind === "registre") {
    body = `<p class="q-label">Tu parles à : <b>${esc(q.who)}</b>. Comment dis-tu « ${esc(q.p.fr)} » ?</p>
      ${choices(q.options, q.answer, E.picked, "ko")}
      ${E.picked ? `<p class="muted" style="margin-top:12px">${esc(q.reg)} · ${esc(q.p.note)}</p>${next}` : ""}
      <p class="muted"><small>Pour reconnaître les registres. Dans le parcours, on produit au registre poli (해요체).</small></p>`;
  } else if (E.kind === "faux") {
    body = `<p class="q-label">Que veut dire le mot surligné ?</p>
      <p class="q-sentence">${esc(q.f.s).replace(new RegExp(q.f.lemma, "i"), (m) => `<mark>${esc(m)}</mark>`)}</p>
      <button class="btn ghost small" data-act="say" data-text="${esc(q.f.s)}" data-lang="en">🔊 Phrase</button>
      ${choices(q.options, q.answer, E.picked, "")}
      ${E.picked ? `<p class="muted" style="margin-top:12px">${esc(q.f.sfr)}</p><p class="note">⚠️ ${esc(q.f.fr)}</p>${next}` : ""}`;
  }
  return `${menu}<div class="card review-card ex-card">${body}</div>`;
}

function choices(options, answer, picked, cls) {
  return `<div class="ex-choices">${options.map((o) => {
    const state = picked ? (o === answer ? "right" : o === picked ? "wrong" : "") : "";
    return `<button class="choice ${cls} ${state}" data-act="ex-pick" data-o="${esc(o)}" ${picked ? "disabled" : ""}>${esc(o)}</button>`;
  }).join("")}</div>`;
}

function exDone(lang, ok) {
  const L = state.langs[lang];
  if (ok) L.xp += 1;
  track(lang, "ex");
  save();
}

TAB_VIEWS.exercices = (lang) => tabExercises(lang);

Object.assign(actions, {
  "ex-kind": (el) => { newExercise(currentLang(), el.dataset.k); render(); },
  "ex-next": () => { newExercise(currentLang(), ui.ex.kind); render(); },
  "say-slow": () => speak(ui.ex.q.s.text, currentLang(), 0.7),
  "ex-pick": (el) => {
    const E = ui.ex;
    if (E.picked) return;
    E.picked = el.dataset.o;
    exDone(E.lang, E.picked === E.q.answer);
    if (E.kind === "registre" && E.picked === E.q.answer) speak(E.q.answer, "ko");
    render();
  },
  "ex-tile": (el) => { const q = ui.ex.q; q.order.push(+el.dataset.t); render(); },
  "ex-untile": (el) => { ui.ex.q.order.splice(+el.dataset.j, 1); render(); },
  "ex-check": () => {
    const E = ui.ex, lang = E.lang, q = E.q;
    if (E.kind === "dictee") {
      const typed = (document.getElementById("ex-answer")?.value || "").trim();
      if (!typed) return toast("Écris ce que tu entends ✍️");
      const r = recast(typed, q.s.text, lang);
      E.result = { ...r, ok: norm(lang, typed) === norm(lang, q.s.text) };
    } else if (E.kind === "ordre") {
      const built = q.order.map((ti) => q.tiles[ti].t).join(" ");
      const right = q.s.words.map((w) => w.segs.map((g) => g.surface).join("")).join(" ");
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
