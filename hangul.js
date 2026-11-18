// ============================================================
//  Mochi — atelier des syllabes (module Hangul, PEDAGOGIE §6)
//  Choisir une consonne, une voyelle et (si on veut) une consonne finale (받침),
//  et voir le bloc s'assembler : schéma de placement, son, prononciation.
//  Second outil : taper n'importe quel mot (clavier coréen du site) et le voir décomposé.
//  + correction des exercices « écris ce que tu entends » du module Hangul.
// ============================================================
const VERT_V = [..."ㅏㅐㅑㅒㅓㅔㅕㅖㅣ"], HORIZ_V = [..."ㅗㅛㅜㅠㅡ"]; // les autres (ㅘ ㅝ ㅢ…) sont mixtes
const CHO_ROM = { ㄱ: "g", ㄲ: "kk", ㄴ: "n", ㄷ: "d", ㄸ: "tt", ㄹ: "r", ㅁ: "m", ㅂ: "b", ㅃ: "pp", ㅅ: "s", ㅆ: "ss", ㅇ: "", ㅈ: "j", ㅉ: "jj", ㅊ: "ch", ㅋ: "k", ㅌ: "t", ㅍ: "p", ㅎ: "h" };
const JUNG_ROM = { ㅏ: "a", ㅐ: "ae", ㅑ: "ya", ㅒ: "yae", ㅓ: "eo", ㅔ: "e", ㅕ: "yeo", ㅖ: "ye", ㅗ: "o", ㅘ: "wa", ㅙ: "wae", ㅚ: "oe", ㅛ: "yo", ㅜ: "u", ㅝ: "wo", ㅞ: "we", ㅟ: "wi", ㅠ: "yu", ㅡ: "eu", ㅢ: "ui", ㅣ: "i" };
// Les 7 sons possibles en fin de syllabe
const FINAL_SOUND = { ㄱ: "k", ㄲ: "k", ㅋ: "k", ㄳ: "k", ㄺ: "k", ㄴ: "n", ㄵ: "n", ㄶ: "n", ㄷ: "t", ㅅ: "t", ㅆ: "t", ㅈ: "t", ㅊ: "t", ㅌ: "t", ㅎ: "t", ㄹ: "l", ㄼ: "l", ㄽ: "l", ㄾ: "l", ㅀ: "l", ㅁ: "m", ㄻ: "m", ㅂ: "p", ㅍ: "p", ㅄ: "p", ㄿ: "p", ㅇ: "ng" };
const sylRom = (l, v, f) => (CHO_ROM[l] ?? "") + JUNG_ROM[v] + (f ? FINAL_SOUND[f] : "");
const vowelShape = (v) => (VERT_V.includes(v) ? "vert" : HORIZ_V.includes(v) ? "horiz" : "mix");

// Schéma du bloc : chaque lettre à sa place, en couleur
function blockDiagram(l, v, f, small = false) {
  const shape = vowelShape(v), [v1, v2] = shape === "mix" ? HG_SPLIT[v] : [v, null];
  const cell = (cls, t) => `<span class="bd-${cls}">${t}</span>`;
  const inner = shape === "vert" ? `${cell("c", l)}${cell("v", v)}`
    : shape === "horiz" ? `${cell("c", l)}${cell("v", v)}`
    : `${cell("c", l)}${cell("v2", v2)}${cell("v1", v1)}`;
  return `<div class="block-diagram ${shape} ${f ? "with-f" : ""} ${small ? "small" : ""} ko" aria-hidden="true">${inner}${f ? cell("f", f) : ""}</div>`;
}
const SHAPE_FR = {
  vert: "Voyelle verticale : la consonne se met à gauche.",
  horiz: "Voyelle horizontale : la consonne se met au-dessus.",
  mix: "Voyelle composée (une horizontale + une verticale) : la consonne en haut à gauche, la voyelle l'entoure.",
};

function viewAtelier() {
  const A = (ui.atelier ||= { l: "ㅎ", v: "ㅏ", f: "ㄴ" });
  const syl = composeHangul(A.l, A.v, A.f), rom = sylRom(A.l, A.v, A.f);
  const chip = (kind, x, label = x) => `<button class="chip ko ${A[kind] === x ? "active" : ""}" data-act="atl-pick" data-k="${kind}" data-x="${x}" aria-pressed="${A[kind] === x}">${label}</button>`;
  const back = "#/lang/ko/parcours";
  return `<section class="view lesson-shell">
    <div class="lesson-top"><a class="close" href="${back}" aria-label="Retour">←</a><div style="flex:1"><small class="muted">Hangul</small><h1 style="font-size:1.4rem">🧪 Atelier des syllabes</h1></div></div>
    <div class="card atelier-main">
      <div class="atl-result">
        <button class="atl-syl ko" data-act="say" data-text="${syl}" data-lang="ko" aria-label="Écouter ${syl}">${syl}</button>
        ${blockDiagram(A.l, A.v, A.f)}
      </div>
      <p class="center" style="margin:6px 0 0"><span class="ko">${A.l} + ${A.v}${A.f ? ` + ${A.f}` : ""}</span> = <b class="ko">${syl}</b> · se prononce ≈ « ${rom} »</p>
      <p class="muted center" style="margin:6px 0 0"><small>${SHAPE_FR[vowelShape(A.v)]}${A.l === "ㅇ" ? " ㅇ au début est muet." : ""}${A.f ? ` En bas, ${A.f} se prononce [${FINAL_SOUND[A.f]}].` : ""} Touche la syllabe pour l'entendre.</small></p>
    </div>
    <h2 class="section-title">1. La consonne du début</h2>
    <div class="choice-row atl-row">${HG_CHO.map((x) => chip("l", x)).join("")}</div>
    <h2 class="section-title">2. La voyelle</h2>
    <p class="muted" style="margin:-6px 0 8px"><small>Verticales · horizontales · composées</small></p>
    <div class="choice-row atl-row">${[...VERT_V, ...HORIZ_V, ...HG_JUNG.filter((x) => vowelShape(x) === "mix")].map((x) => chip("v", x)).join("")}</div>
    <h2 class="section-title">3. La consonne du bas (받침), si tu veux</h2>
    <div class="choice-row atl-row">${chip("f", "", "aucune")}${HG_JONG.slice(1).map((x) => chip("f", x)).join("")}</div>
    <div class="card tip" style="margin-top:16px">🔊 <b>En bas, il n'y a que 7 sons</b> : [k] [n] [t] [l] [m] [p] [ng]. Essaie ㅅ, ㅈ, ㅊ, ㅌ ou ㅎ en bas : ils se disent tous [t].</div>

    <h2 class="section-title">Décompose un mot</h2>
    <div class="card">
      <p style="margin:0 0 8px">Écris un mot coréen (avec le clavier du site si besoin) : chaque syllabe est démontée lettre par lettre.</p>
      <input class="input ko" id="atelier-word" maxlength="20" autocomplete="off" spellcheck="false" placeholder="ex. 한국어" value="${esc(A.word || "")}" />
      <div id="atelier-out" class="atl-out">${decomposeView(A.word || "")}</div>
    </div>
  </section>`;
}
function decomposeView(word) {
  const parts = [...word].map((ch) => {
    const s = hgDecompose(ch);
    if (!s) return ch.trim() ? `<div class="atl-piece"><span class="atl-big ko">${esc(ch)}</span><small class="muted">pas une syllabe</small></div>` : "";
    const l = HG_CHO[s.l], v = HG_JUNG[s.v], f = HG_JONG[s.t];
    return `<div class="atl-piece"><span class="atl-big ko">${ch}</span>${blockDiagram(l, v, f, true)}<small class="ko">${l} + ${v}${f ? ` + ${f}` : ""}</small><small class="muted">≈ ${sylRom(l, v, f)}</small></div>`;
  }).join("");
  return parts || `<p class="muted"><small>Les syllabes apparaîtront ici.</small></p>`;
}

Object.assign(actions, {
  "atl-pick": (el) => { ui.atelier[el.dataset.k] = el.dataset.x; render(); const A = ui.atelier; speak(composeHangul(A.l, A.v, A.f), "ko"); },
});
// Décomposition en direct (sans re-rendre la page : le champ garde le focus)
$app.addEventListener("input", (e) => {
  if (e.target.id !== "atelier-word") return;
  ui.atelier.word = e.target.value;
  const out = document.getElementById("atelier-out");
  if (out) out.innerHTML = decomposeView(e.target.value);
});
// Exercice « écris ce que tu entends » (module Hangul)
const normType = (t) => String(t || "").replace(/[\s.,!?~]/g, "");
$app.addEventListener("submit", (e) => {
  if (!e.target.matches?.("form[data-quiz-type]")) return;
  e.preventDefault();
  const Q = ui.quiz, q = Q?.qs[Q.queue[0]];
  if (!q?.type || Q.answer) return;
  const typed = document.getElementById("quiz-type")?.value.trim() || "";
  if (!typed) return;
  answerQuiz(normType(typed) === normType(q.target), typed);
  render();
});
