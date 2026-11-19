// ============================================================
//  Mochi — ui.js : Utilitaires d'interface : esc, toast, mochi(), formatage des nombres
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// ---------- Utilitaires ----------
const $app = document.getElementById("app");
// Pluriel français : 0 et 1 au singulier (« 0 semaine », « 2 semaines »). Nombre formaté (« 1 200 »).
const plural = (n, one, many = `${one}s`) => `${Number(n || 0).toLocaleString("fr-FR")} ${Math.abs(Number(n || 0)) >= 2 ? many : one}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterday = () => today(new Date(Date.now() - 864e5));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (x) => Math.round(x * 100);
// Nombres affichés au format français : « 1,5 h », « 1 234 mots » (espace fine insécable)
const num1 = (n) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num0 = (n) => Math.round(Number(n)).toLocaleString("fr-FR");
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const isKo = (lang) => lang === "ko";
const isZh = (lang) => lang === "zh";
// Écritures non latines : comparaison caractère par caractère (pas de mots séparés par des espaces)
const isCjk = (lang) => lang === "ko" || lang === "zh";
// Classe de langue : police et attribut lang (.ko, .zh, .en)
const koCls = (lang) => (isKo(lang) ? "ko" : isZh(lang) ? "zh" : lang === "ru" ? "ru" : "en");
// Fonction d'une particule coréenne, pour la couleur et le soulignement (charte §5)
const PARTICLE_FN = { 은: "topic", 는: "topic", 이: "subject", 가: "subject", 을: "object", 를: "object", 에: "place", 에서: "place", 에게: "place", 한테: "place", 께: "place" };
const PARTICLE_LABEL = { topic: "particule de thème", subject: "particule de sujet", object: "particule d'objet", place: "particule de lieu, de temps ou de destinataire", other: "particule" };
// Styles dynamiques sans attribut style="…" (interdit par la CSP) : les templates posent
// data-bar-w (largeur en %, barres de progression) ou data-vars (« --nom:valeur;… »), appliqués
// ici par le CSSOM, que la CSP autorise. Un observateur couvre tout ce qui est inséré dans la page.
function applyDynStyles(root) {
  const els = root?.querySelectorAll ? [...(root.matches?.("[data-bar-w],[data-vars]") ? [root] : []), ...root.querySelectorAll("[data-bar-w],[data-vars]")] : [];
  for (const el of els) {
    if (el.dataset.barW !== undefined) el.style.width = `${Number(el.dataset.barW) || 0}%`;
    if (el.dataset.vars) for (const d of el.dataset.vars.split(";")) {
      const i = d.indexOf(":");
      if (i > 0) el.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
  }
}
if (typeof MutationObserver === "function" && document.body) {
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) applyDynStyles(n); })
    .observe(document.body, { childList: true, subtree: true });
}
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
// Chaque humeur est découpée en yeux / bouche / signes autour, pour animer chaque partie
// séparément (MOCHI.md, lot M1) : les yeux clignent dans toutes les humeurs sauf sleepy.
const MOCHI_FACES = {
  happy: { eyes: '<path d="M52 79 q5 -6 10 0 M78 79 q5 -6 10 0" class="mo-line"/>', mouth: '<path d="M65 86 q5 4 10 0" class="mo-line"/>' },
  focused: { eyes: '<circle cx="57" cy="79" r="3.6" class="mo-ink"/><circle cx="83" cy="79" r="3.6" class="mo-ink"/>', mouth: '<path d="M66 87 h8" class="mo-line"/>' },
  proud: { eyes: '<path d="M52 80 q5 -6 10 0 M78 80 q5 -6 10 0" class="mo-line"/>', mouth: '<path d="M64 86 q6 6 12 0" class="mo-line"/>',
    marks: '<path d="M22 30 l2.5 5 5 .8 -3.6 3.5 .9 5 -4.8 -2.4 -4.8 2.4 .9 -5 -3.6 -3.5 5 -.8z M116 22 l2 4 4 .6 -2.9 2.8 .7 4 -3.8 -2 -3.8 2 .7 -4 -2.9 -2.8 4 -.6z" class="mo-star"/>' },
  curious: { eyes: '<circle cx="57" cy="78" r="3.6" class="mo-ink"/><circle cx="83" cy="80" r="3.6" class="mo-ink"/>', mouth: '<path d="M66 87 q4 2 8 0" class="mo-line"/>', marks: '<text x="112" y="34" class="mo-mark">?</text>' },
  thinking: { eyes: '<circle cx="58" cy="76" r="3.4" class="mo-ink"/><circle cx="84" cy="76" r="3.4" class="mo-ink"/>', mouth: '<path d="M66 87 h8" class="mo-line"/>',
    marks: '<circle cx="104" cy="30" r="2.6" class="mo-ink mo-dot"/><circle cx="113" cy="24" r="2.6" class="mo-ink mo-dot"/><circle cx="122" cy="18" r="2.6" class="mo-ink mo-dot"/>' },
  sleepy: { eyes: '<path d="M52 80 q5 4 10 0 M78 80 q5 4 10 0" class="mo-line"/>', mouth: '<path d="M66 88 q4 2 8 0" class="mo-line"/>', marks: '<text x="108" y="36" class="mo-mark">z</text><text x="119" y="24" class="mo-mark small">z</text>' },
  surprised: { eyes: '<circle cx="57" cy="78" r="4.4" class="mo-ink"/><circle cx="83" cy="78" r="4.4" class="mo-ink"/>', mouth: '<circle cx="70" cy="88" r="3" class="mo-ink"/>' },
};
const MOCHI_MOODS = Object.keys(MOCHI_FACES);
const MOCHI_BODY = {
  sleepy: "M14 90 C14 54 38 40 70 40 C102 40 126 54 126 90 C126 104 104 106 70 106 C36 106 14 104 14 90 Z",
  proud: "M18 84 C18 34 42 16 70 16 C98 16 122 34 122 84 C122 104 102 106 70 106 C38 106 18 104 18 84 Z",
  base: "M12 84 C12 40 38 24 70 24 C102 24 128 40 128 84 C128 104 106 106 70 106 C34 106 12 104 12 84 Z",
};
const MOCHI_TILT = { curious: "rotate(-6 70 100)", focused: "rotate(3 70 100)" };
// Les morceaux qui changent avec l'humeur (repris par mochi-live.js pour changer d'humeur sans tout redessiner)
function mochiParts(mood, dressed = true) {
  const f = MOCHI_FACES[mood] || MOCHI_FACES.happy, acc = dressed && typeof mochiAccessories === "function";
  return {
    body: MOCHI_BODY[mood] || MOCHI_BODY.base, tilt: MOCHI_TILT[mood] || "", eyes: f.eyes, mouth: f.mouth, marks: f.marks || "",
    acc: acc ? mochiAccessories(mood, ["head", "neck"]) : "", faceAcc: acc ? mochiAccessories(mood, ["face"]) : "",
  };
}
// mochi(cls, mood, dressed, { live }) : SVG en groupes nommés (MOCHI.md §2). Seul un Mochi
// « live » est animé par mochi-live.js ; les autres restent statiques (performance, calme).
function mochi(cls = "", mood = "happy", dressed = true, opts = {}) {
  if (!MOCHI_FACES[mood]) mood = "happy";
  const p = mochiParts(mood, dressed);
  const data = opts.live ? ` data-live="1"${opts.intro ? ` data-intro="${opts.intro}"` : ""}${dressed ? "" : ' data-bare="1"'}` : "";
  return `<svg class="mochi mochi-${mood}${opts.live ? " live" : ""} ${cls}" data-mood="${mood}"${data} viewBox="0 0 140 120" aria-hidden="true">
    <ellipse cx="70" cy="110" rx="50" ry="6" class="mo-shadow"/>
    <g class="mo-rig"><g class="mo-tilt"${p.tilt ? ` transform="${p.tilt}"` : ""}>
      <g class="mo-squash">
        <path d="${p.body}" class="mo-body"/>
        <g class="mo-cheeks"><ellipse cx="44" cy="88" rx="8" ry="4.5" class="mo-cheek"/><ellipse cx="96" cy="88" rx="8" ry="4.5" class="mo-cheek"/></g>
        <g class="mo-face"><g class="mo-eyes">${p.eyes}</g><g class="mo-mouth">${p.mouth}</g><g class="mo-face-acc">${p.faceAcc}</g></g>
        <g class="mo-acc">${p.acc}</g>
      </g>
      <g class="mo-marks">${p.marks}</g>
    </g></g>
    <g class="mo-fx"></g>
  </svg>`;
}
// Petit visage pour le logotype (le premier « o » de « mochi »)
const LOGO_FACE = '<svg viewBox="0 0 40 34" aria-hidden="true"><path d="M2 22 C2 9 10 3 20 3 C30 3 38 9 38 22 C38 31 31 32 20 32 C9 32 2 31 2 22 Z" class="mo-body"/><circle cx="14" cy="21" r="2" class="mo-ink"/><circle cx="26" cy="21" r="2" class="mo-ink"/><path d="M18 25 q2 2 4 0" class="mo-line" stroke-width="1.5"/><ellipse cx="9" cy="25" rx="3" ry="1.8" class="mo-cheek"/><ellipse cx="31" cy="25" rx="3" ry="1.8" class="mo-cheek"/></svg>';

let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4000);
}
