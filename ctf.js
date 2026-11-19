// ============================================================
//  Mochi — ctf.js : page du mini-CTF (#/ctf), seulement si le serveur l'annonce (features.ctf :
//  version portable construite avec --ctf). Règles, indices progressifs, saisie des drapeaux.
//  La vérification se fait côté serveur (empreintes) : les drapeaux ne sont pas dans ce fichier.
//  Script classique chargé dans l'ordre par index.html.
// ============================================================
const CTF_KEY = "mochi-ctf";
const CTF_HINTS = [
  ["Les sites ont souvent un petit fichier qui dit aux robots des moteurs de recherche où ils n'ont PAS le droit d'aller.",
    "Essaie d'ouvrir /robots.txt à la racine du site (dans la barre d'adresse, après 127.0.0.1:47800).",
    "Le message codé de la cachette finit par « = » : c'est du base64. Dans le Terminal du Mac : echo 'le message' | base64 -d (ou un décodeur base64 en ligne)."],
  ["Lis bien TOUT ce que contient la cachette, même ce qui ne s'affiche pas à l'écran (clic droit › « Afficher le code source de la page »).",
    "Le coffre ne s'ouvre que pour un admin, et ton rôle est stocké dans un cookie. Outils de développement : Cmd+Option+I (Chrome, Firefox ; dans Safari, active d'abord Réglages › Avancés › « Afficher les fonctionnalités pour les développeurs web ») › onglet Application (Chrome) ou Stockage (Firefox, Safari) › Cookies.",
    "Change la valeur du cookie mochi_role, puis ouvre (ou recharge) http://127.0.0.1:47800/api/ctf/coffre."],
];
const ctfState = () => { try { return JSON.parse(localStorage.getItem(CTF_KEY)) || { found: [null, null], hints: [0, 0] }; } catch { return { found: [null, null], hints: [0, 0] }; } };
const ctfSave = (s) => { try { localStorage.setItem(CTF_KEY, JSON.stringify(s)); } catch {} };

function viewCtf() {
  if (!features.ctf) return viewNotFound();
  const S = ctfState(), n = S.found.filter(Boolean).length;
  if (n === 2 && !ui.ctfMagic && !ui.ctfAsked) { ui.ctfAsked = true; ctfMagic(); }
  const flagCard = (i) => {
    const got = S.found[i], h = S.hints[i];
    return `<div class="card ctf-flag ${got ? "done" : ""}">
      <h2 class="m-0">🚩 Drapeau ${i + 1} ${got ? "· trouvé ✓" : ""}</h2>
      <p class="muted">${i === 0 ? "Reconnaissance : ce que le site montre aux robots… mais pas aux humains." : "Le coffre du professeur : seuls les admins peuvent l'ouvrir. Es-tu admin ?"}</p>
      ${got ? `<p><code>${esc(got)}</code></p>` : `${h ? `<ol class="ctf-hints">${CTF_HINTS[i].slice(0, h).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
        ${h < 3 ? `<button class="btn ghost small" data-act="ctf-hint" data-i="${i}">💡 ${h ? "Un autre indice" : "Un indice"} (${h}/3)</button>` : ""}`}
    </div>`;
  };
  return `<section class="view lesson-shell">
    <div class="avis-head">${mochi("small", n === 2 ? "proud" : "focused")}<div><h1 class="m-0">🕵️ Le défi de Mochi</h1>
      <p class="muted mt-4 mb-0 mx-0">Une phrase magique est cachée dans ce site, coupée en <b>deux drapeaux</b> de la forme <code>MOCHI{…}</code>. À toi de les trouver !</p></div></div>
    <div class="card tip"><b>Les règles</b><br/>• Tout se passe dans le navigateur : la barre d'adresse, le code source des pages, les outils de développement.<br/>
      • Pas le droit d'ouvrir les fichiers du dossier « app » : ce serait trop facile 😉<br/>
      • Rien ne peut casser : le site tourne seulement sur ton ordinateur.<br/>
      • <b>Bonus</b> : si tu trouves une <b>vraie</b> faille dans Mochi (en dehors du défi), note comment tu as fait et envoie-la avec le bouton 💬 (type « Un bug »). Respect garanti !</div>
    <p class="muted">Progression : ${n} / 2 drapeaux</p>
    ${flagCard(0)}${flagCard(1)}
    ${n < 2 ? `<form class="card ctf-form" data-ctf="1"><label class="avis-field"><span>Proposer un drapeau</span>
      <input id="ctf-flag" class="input" autocomplete="off" spellcheck="false" maxlength="120" placeholder="MOCHI{…}"/></label>
      <button class="btn">Vérifier</button><p class="form-err" hidden></p></form>`
      : `<div class="card celebrate">${mochi("small", "proud")}<div><h2>🎉 Bravo, détective !</h2><p>La phrase magique :</p><p class="ctf-magic" id="ctf-magic">${esc(ui.ctfMagic || "…")}</p><p class="muted">Montre-la à Nathan pour réclamer ton cadeau 🍡</p></div></div>`}
  </section>`;
}
async function ctfMagic() {
  try { ui.ctfMagic = (await api("POST", "/api/ctf/magic", { flags: ctfState().found })).phrase; } catch (e) { ui.ctfMagic = e.message; }
  if (location.hash === "#/ctf") render();
}
Object.assign(actions, {
  "ctf-hint": (el) => { const S = ctfState(), i = +el.dataset.i; S.hints[i] = Math.min(3, S.hints[i] + 1); ctfSave(S); render(); },
});
$app.addEventListener("submit", async (e) => {
  if (!e.target.matches?.("form[data-ctf]")) return;
  e.preventDefault();
  const v = document.getElementById("ctf-flag").value.trim(), err = e.target.querySelector(".form-err");
  if (!v) return;
  try {
    const r = await api("POST", "/api/ctf/check", { flag: v });
    if (!r.ok) { err.textContent = "Ce n'est pas un drapeau… continue de chercher !"; err.hidden = false; return; }
    const S = ctfState(); S.found[r.which - 1] = v; ctfSave(S);
    toast(`🚩 Drapeau ${r.which} trouvé !`);
    if (S.found.every(Boolean)) ctfMagic();
    render();
  } catch (er) { err.textContent = er.message; err.hidden = false; }
});
// En mode CTF, le badge du haut mène au défi
function ctfBadge() {
  const b = document.querySelector?.(".beta-pill");
  if (!b || !features.ctf || b.dataset.ctf) return;
  b.dataset.ctf = "1"; b.href = "#/ctf"; b.textContent = "🚩 Défi CTF"; b.title = "Le défi de Mochi : trouve les deux drapeaux";
}
