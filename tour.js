// ============================================================
//  Mochi — visite guidée de la première visite
//  6 étapes courtes, présentées par Mochi, avec un aperçu de l'élément réel.
//  Affichée une seule fois, aux nouveaux venus (aucune progression) ; on peut la
//  passer à tout moment et la revoir (Profil, accueil). Fenêtre de dialogue
//  accessible : Échap ferme, ← → naviguent, le focus reste dans la fenêtre.
// ============================================================
const TOUR_STEPS = [
  {
    mood: "happy", title: "Bienvenue sur Mochi !",
    text: "Je suis Mochi 🍡. Ici, tu apprends l'anglais ou le coréen en quelques minutes par jour : lire des textes à ton niveau, réviser juste avant d'oublier, et écrire.",
    demo: `<p class="tour-hint">La visite prend une minute. Tu peux la passer quand tu veux.</p>`,
  },
  {
    mood: "curious", title: "1. Choisis ta langue",
    text: "Sur l'accueil, choisis 🇬🇧 anglais ou 🇰🇷 coréen. Tu peux apprendre les deux : chaque langue a sa propre progression.",
    demo: `<div class="tour-langs"><span>🇬🇧 Anglais</span><span>🇰🇷 Coréen</span></div><p class="tour-hint">En coréen, on commence par l'alphabet (le Hangul) : environ une semaine, pas à pas.</p>`,
  },
  {
    mood: "focused", title: "2. ☀️ Aujourd'hui : ta séance guidée",
    text: "Chaque jour, une séance en 4 étapes t'attend. Pas besoin de réfléchir : suis le bouton rose.",
    demo: `<ol class="tour-steps"><li>📖 Lire et écouter un texte</li><li>🫳 Capturer les mots inconnus</li><li>🧠 Réviser tes cartes</li><li>💬 Écrire une phrase</li></ol>`,
  },
  {
    mood: "curious", title: "3. 📖 Lire",
    text: "Des textes, des livres et une histoire où Mochi part vivre à Séoul ou à Londres. Touche un mot pour voir sa traduction et l'ajouter à tes révisions.",
    demo: `<p class="tour-read">I went to the <span class="w new tour-tap">cinema</span> with my sister.</p><div class="tour-pop"><b>cinema</b> = cinéma <span class="tag">+ Ajouter aux révisions</span></div>`,
  },
  {
    mood: "focused", title: "4. 🎯 S'entraîner",
    text: "Les révisions reviennent au bon moment pour ne pas oublier. Il y a aussi des exercices variés : phrases à trou, traduction, écoute, dictée…",
    demo: `<div class="tour-nav"><span>☀️ Aujourd'hui</span><span>📖 Lire</span><span class="on">🎯 S'entraîner</span></div><p class="tour-hint">Ces 3 sections sont en haut de chaque langue.</p>`,
  },
  {
    mood: "proud", title: "5. ⭐ Progresser sans pression",
    text: "L'objectif : 5 jours sur 7. Rater un jour ne casse rien. Chaque semaine, 3 quêtes, et des accessoires à gagner pour habiller Mochi.",
    demo: `<p class="tour-hint">Crée un compte (Profil) pour sauvegarder ta progression et la retrouver sur tous tes appareils. Tu y trouves aussi les réglages : voix, clavier coréen, thème…</p>`,
  },
];
const tourShouldShow = () => !state.settings.tourDone && !state.cards.length && !Object.values(state.langs).some((L) => L.started);
let tourReturnFocus = null;
function openTour(i = 0) {
  ui.tour = { i };
  tourReturnFocus = document.activeElement;
  renderTour();
}
function closeTour() {
  ui.tour = null;
  state.settings.tourDone = true; save();
  document.getElementById("tour")?.remove();
  tourReturnFocus?.focus?.();
}
function renderTour() {
  let el = document.getElementById("tour");
  if (!ui.tour) { el?.remove(); return; }
  const i = ui.tour.i, s = TOUR_STEPS[i], last = i === TOUR_STEPS.length - 1;
  if (!el && typeof document.createElement !== "function") return; // environnement sans DOM complet
  if (!el) { el = document.createElement("div"); el.id = "tour"; el.className = "tour-backdrop"; document.body.appendChild(el); }
  el.innerHTML = `<div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
    <button class="close-x" data-tour="skip" aria-label="Fermer la visite">✕</button>
    <div class="tour-mochi">${mochi("", s.mood)}</div>
    <h2 id="tour-title">${s.title}</h2>
    <p id="tour-text">${s.text}</p>
    <div class="tour-demo" aria-hidden="true">${s.demo}</div>
    <div class="tour-dots" aria-label="Étape ${i + 1} sur ${TOUR_STEPS.length}">${TOUR_STEPS.map((_, j) => `<span class="${j === i ? "on" : ""}"></span>`).join("")}</div>
    <div class="tour-actions">
      ${i > 0 ? `<button class="btn ghost small" data-tour="prev">← Retour</button>` : `<button class="btn ghost small" data-tour="skip">Passer la visite</button>`}
      <button class="btn" data-tour="${last ? "done" : "next"}">${last ? "C'est parti !" : "Suivant →"}</button>
    </div>
  </div>`;
  el.querySelector?.(`[data-tour="${last ? "done" : "next"}"]`)?.focus?.();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-tour]");
  if (b) {
    const a = b.dataset.tour;
    if (a === "next") { ui.tour.i++; renderTour(); }
    else if (a === "prev") { ui.tour.i--; renderTour(); }
    else if (a === "skip" || a === "done") closeTour();
    else if (a === "open") openTour();
    return;
  }
  if (e.target.id === "tour") closeTour(); // clic à côté de la fenêtre
});
document.addEventListener("keydown", (e) => {
  if (!ui.tour) return;
  if (e.key === "Escape") { e.preventDefault(); closeTour(); }
  else if (e.key === "ArrowRight" && ui.tour.i < TOUR_STEPS.length - 1) { ui.tour.i++; renderTour(); }
  else if (e.key === "ArrowLeft" && ui.tour.i > 0) { ui.tour.i--; renderTour(); }
  else if (e.key === "Tab") { // le focus reste dans la fenêtre
    const f = [...document.querySelectorAll("#tour button")], first = f[0], lastB = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastB.focus(); }
    else if (!e.shiftKey && document.activeElement === lastB) { e.preventDefault(); first.focus(); }
  }
}, true);
// Première visite : la visite s'ouvre d'elle-même (pas sur les pages de compte)
function maybeStartTour() {
  if (ui.tour || ui.tourOffered || !tourShouldShow() || /^#\/(connexion|inscription|reinitialiser|verifier|mot-de-passe)/.test(location.hash)) return;
  ui.tourOffered = true;
  setTimeout(() => { if (tourShouldShow()) openTour(); }, 400);
}
