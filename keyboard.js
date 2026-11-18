// ============================================================
//  Mochi — clavier coréen intégré (pour qui n'a pas de clavier coréen installé)
//  Disposition 두벌식 (le standard en Corée). Deux façons de taper :
//   - sur l'écran : touches à cliquer ou toucher (téléphone, ordinateur) ;
//   - au clavier physique : quand le clavier coréen est ouvert, chaque touche donne
//     la lettre coréenne placée au même endroit (e.code = position physique : marche
//     en AZERTY comme en QWERTY). Un vrai clavier coréen du système n'est pas gêné.
//  Les lettres se combinent en syllabes au fil de la frappe : ㅎ + ㅏ + ㄴ → 한.
//  S'active sur tout champ de saisie coréen (classe .input.ko), sans rien changer aux écrans.
// ============================================================
const KO_ROWS = [
  [["KeyQ", "ㅂ", "ㅃ"], ["KeyW", "ㅈ", "ㅉ"], ["KeyE", "ㄷ", "ㄸ"], ["KeyR", "ㄱ", "ㄲ"], ["KeyT", "ㅅ", "ㅆ"], ["KeyY", "ㅛ"], ["KeyU", "ㅕ"], ["KeyI", "ㅑ"], ["KeyO", "ㅐ", "ㅒ"], ["KeyP", "ㅔ", "ㅖ"]],
  [["KeyA", "ㅁ"], ["KeyS", "ㄴ"], ["KeyD", "ㅇ"], ["KeyF", "ㄹ"], ["KeyG", "ㅎ"], ["KeyH", "ㅗ"], ["KeyJ", "ㅓ"], ["KeyK", "ㅏ"], ["KeyL", "ㅣ"]],
  [["KeyZ", "ㅋ"], ["KeyX", "ㅌ"], ["KeyC", "ㅊ"], ["KeyV", "ㅍ"], ["KeyB", "ㅠ"], ["KeyN", "ㅜ"], ["KeyM", "ㅡ"]],
];
const KO_KEYMAP = Object.fromEntries(KO_ROWS.flat().map(([code, j, s]) => [code, [j, s || j]]));

// ---------- Composition du Hangul (Unicode : 0xAC00 + (initiale × 21 + voyelle) × 28 + finale) ----------
const HG_CHO = [..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"];
const HG_JUNG = [..."ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"];
const HG_JONG = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"];
const HG_VOWEL_COMB = { "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ", "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ", "ㅡㅣ": "ㅢ" };
const HG_FINAL_COMB = { "ㄱㅅ": "ㄳ", "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ", "ㄹㄱ": "ㄺ", "ㄹㅁ": "ㄻ", "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄽ", "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ", "ㅂㅅ": "ㅄ" };
const HG_SPLIT = Object.fromEntries([...Object.entries(HG_VOWEL_COMB), ...Object.entries(HG_FINAL_COMB)].map(([pair, c]) => [c, [...pair]]));
const hgCompose = (l, v, t = 0) => String.fromCharCode(0xac00 + (l * 21 + v) * 28 + t);
function hgDecompose(ch) {
  const c = (ch || "").charCodeAt(0) - 0xac00;
  if (!(c >= 0 && c < 11172)) return null;
  return { l: Math.floor(c / 588), v: Math.floor((c % 588) / 28), t: c % 28 };
}
// Ajoute une lettre (jamo) à la fin d'un texte en composant la syllabe en cours.
// `joinable` : faux si la lettre précédente n'a pas été tapée juste avant (on ne recolle pas un vieux mot).
function hangulAdd(before, j, joinable = true) {
  const last = before.slice(-1), rest = before.slice(0, -1), s = joinable ? hgDecompose(last) : null;
  if (HG_CHO.includes(j)) { // consonne
    if (s && s.t === 0 && HG_JONG.includes(j)) return rest + hgCompose(s.l, s.v, HG_JONG.indexOf(j));
    const comb = s && s.t > 0 && HG_FINAL_COMB[HG_JONG[s.t] + j];
    if (comb) return rest + hgCompose(s.l, s.v, HG_JONG.indexOf(comb));
    return before + j;
  }
  if (!HG_JUNG.includes(j)) return before + j;
  // voyelle
  if (s && s.t === 0) {
    const cv = HG_VOWEL_COMB[HG_JUNG[s.v] + j];
    return cv ? rest + hgCompose(s.l, HG_JUNG.indexOf(cv), 0) : before + j;
  }
  if (s && s.t > 0) { // la finale passe au début de la nouvelle syllabe : 한 + ㅏ → 하나
    const fin = HG_JONG[s.t], split = HG_SPLIT[fin];
    const keep = split ? HG_JONG.indexOf(split[0]) : 0, moved = split ? split[1] : fin;
    return rest + hgCompose(s.l, s.v, keep) + hgCompose(HG_CHO.indexOf(moved), HG_JUNG.indexOf(j), 0);
  }
  if (joinable && HG_CHO.includes(last)) return rest + hgCompose(HG_CHO.indexOf(last), HG_JUNG.indexOf(j), 0);
  if (joinable && HG_VOWEL_COMB[last + j]) return rest + HG_VOWEL_COMB[last + j];
  return before + j;
}
// Retour arrière dans la syllabe en cours : 한 → 하 → ㅎ → (rien)
function hangulBack(before) {
  const last = before.slice(-1), rest = before.slice(0, -1), s = hgDecompose(last);
  if (s) {
    if (s.t > 0) { const sp = HG_SPLIT[HG_JONG[s.t]]; return rest + hgCompose(s.l, s.v, sp ? HG_JONG.indexOf(sp[0]) : 0); }
    const sp = HG_SPLIT[HG_JUNG[s.v]];
    return rest + (sp ? hgCompose(s.l, HG_JUNG.indexOf(sp[0]), 0) : HG_CHO[s.l]);
  }
  if (HG_SPLIT[last]) return rest + HG_SPLIT[last][0];
  return rest;
}

// ---------- Saisie dans un champ ----------
const kbd = { open: false, shift: false, lastPos: new WeakMap(), layout: null };
// Repères sous les touches : la vraie disposition du clavier de l'utilisateur si le navigateur
// la donne (AZERTY : la touche ㅂ affiche « a »), sinon QWERTY
try { navigator.keyboard?.getLayoutMap?.().then((m) => { kbd.layout = m; }).catch(() => {}); } catch {}
const keyLabel = (code) => kbd.layout?.get(code) || code.slice(3).toLowerCase();
try { kbd.open = localStorage.getItem("mochi-ko-kbd") === "1"; } catch {}
const isKoField = (el) => el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && el.classList.contains("input") && el.classList.contains("ko") && !el.disabled;
function kbdApply(el, fn) {
  const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
  const joinable = a === b && kbd.lastPos.get(el) === a;
  const before = el.value.slice(0, a), after = el.value.slice(b);
  const next = fn(before, joinable).slice(0, Number(el.getAttribute("maxlength")) || 10000);
  el.value = next + after;
  el.setSelectionRange?.(next.length, next.length);
  kbd.lastPos.set(el, next.length);
  el.dispatchEvent(new Event("input", { bubbles: true })); // les écrans écoutent « input » (brouillon, etc.)
}
const kbdType = (el, j) => kbdApply(el, (before, joinable) => hangulAdd(before, j, joinable));
const kbdBack = (el) => kbdApply(el, (before, joinable) => (joinable ? hangulBack(before) : before.slice(0, -1)));
const kbdText = (el, t) => { kbdApply(el, (before) => before + t); kbd.lastPos.delete(el); };

// Clavier physique → lettres coréennes (seulement quand le clavier coréen est ouvert)
document.addEventListener("keydown", (e) => {
  const el = e.target;
  if (!kbd.open || !isKoField(el) || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.key === "Process") return;
  const m = KO_KEYMAP[e.code];
  if (m) { e.preventDefault(); kbdType(el, e.shiftKey ? m[1] : m[0]); }
  else if (e.key === "Backspace" && kbd.lastPos.get(el) === el.selectionStart && el.selectionStart === el.selectionEnd) { e.preventDefault(); kbdBack(el); }
}, true);
// Un clic ou une flèche ailleurs dans le texte termine la syllabe en cours
document.addEventListener("selectionchange", () => { const el = document.activeElement; if (isKoField(el) && kbd.lastPos.get(el) !== el.selectionStart) kbd.lastPos.delete(el); });

// ---------- Clavier à l'écran ----------
function kbdPanel(id) {
  const key = (code, j, s) => { const t = kbd.shift && s ? s : j; return `<button type="button" class="kkey ${kbd.shift && s ? "shifted" : ""}" data-kbd="type" data-j="${t}" data-for="${id}" aria-label="${t}"><span>${t}</span><small>${esc(keyLabel(code))}</small></button>`; };
  return `<div class="ko-kbd ko" role="group" aria-label="Clavier coréen" data-for="${id}">
    ${KO_ROWS.map((row, r) => `<div class="krow">${r === 2 ? `<button type="button" class="kkey wide ${kbd.shift ? "on" : ""}" data-kbd="shift" data-for="${id}" aria-pressed="${kbd.shift}" aria-label="Majuscule (consonnes doubles)">⇧</button>` : ""}${row.map(([c, j, s]) => key(c, j, s)).join("")}${r === 2 ? `<button type="button" class="kkey wide" data-kbd="back" data-for="${id}" aria-label="Effacer">⌫</button>` : ""}</div>`).join("")}
    <div class="krow"><button type="button" class="kkey" data-kbd="text" data-t="?" data-for="${id}">?</button><button type="button" class="kkey space" data-kbd="text" data-t=" " data-for="${id}" aria-label="Espace">espace</button><button type="button" class="kkey" data-kbd="text" data-t="." data-for="${id}">.</button><button type="button" class="kkey" data-kbd="text" data-t="!" data-for="${id}">!</button></div>
    <p class="muted kbd-tip"><small>Astuce : tant que ce clavier est ouvert, ton clavier physique tape aussi en coréen (même position que sur un clavier coréen). ⇧ donne les consonnes doubles (ㄲ ㄸ ㅃ ㅆ ㅉ).</small></p>
  </div>`;
}
// Ajoute le bouton « ⌨️ 한글 » (et le clavier s'il est ouvert) sous chaque champ coréen.
// Appelé après chaque rendu (route) : les écrans n'ont rien à faire.
function enhanceKoInputs(root = document) {
  root.querySelectorAll?.(".input.ko").forEach((el) => {
    if (!/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.disabled || !el.id || el.nextElementSibling?.classList?.contains("kbd-bar")) return;
    el.insertAdjacentHTML("afterend", `<div class="kbd-bar"><button type="button" class="chip kbd-toggle ${kbd.open ? "active" : ""}" data-kbd="toggle" data-for="${el.id}" aria-expanded="${kbd.open}">⌨️ 한글 ${kbd.open ? "· fermer" : "· clavier coréen"}</button>${kbd.open ? kbdPanel(el.id) : ""}</div>`);
    // Sur téléphone, le clavier à l'écran remplace celui du système
    if (kbd.open) el.setAttribute("inputmode", "none"); else el.removeAttribute("inputmode");
  });
}
function refreshKbd(id) {
  const el = document.getElementById(id), bar = el?.nextElementSibling;
  if (bar?.classList.contains("kbd-bar")) bar.remove();
  if (el) enhanceKoInputs(el.parentElement);
}
// Garder le focus dans le champ quand on touche une touche
document.addEventListener("mousedown", (e) => { if (e.target.closest?.("[data-kbd]") && e.target.closest("[data-kbd]").dataset.kbd !== "toggle") e.preventDefault(); });
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-kbd]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const el = document.getElementById(b.dataset.for);
  if (!el) return;
  const k = b.dataset.kbd;
  if (k === "toggle") { kbd.open = !kbd.open; kbd.shift = false; try { localStorage.setItem("mochi-ko-kbd", kbd.open ? "1" : "0"); } catch {} document.querySelectorAll(".kbd-bar").forEach((x) => x.remove()); enhanceKoInputs(); el.focus(); return; }
  if (k === "shift") { kbd.shift = !kbd.shift; refreshKbd(el.id); el.focus(); return; }
  if (k === "type") { kbdType(el, b.dataset.j); if (kbd.shift) { kbd.shift = false; refreshKbd(el.id); } }
  else if (k === "back") kbdBack(el);
  else if (k === "text") kbdText(el, b.dataset.t);
  el.focus();
}, true);
