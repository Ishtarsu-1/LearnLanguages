// ============================================================
//  Mochi — visite guidée INTERACTIVE de la première visite
//  Sur le vrai site : un projecteur éclaire le vrai élément, Mochi dit quoi faire,
//  et c'est l'utilisateur qui clique (choisir sa langue, ouvrir un texte, toucher
//  un mot, l'ajouter aux révisions, aller dans S'entraîner…). La visite avance
//  d'elle-même quand l'action est faite. En coréen, sans Hangul, elle montre
//  l'alphabet au lieu de la lecture (PEDAGOGIE §6).
//  Le reste de l'écran est assombri et bloqué (seul l'élément éclairé répond).
//  Échap ou « Passer » ferme ; on peut la revoir depuis l'accueil ou le profil.
// ============================================================
const tourLang = () => currentLang() || state.lastLang || "en";
const tourGated = () => hangulGate(tourLang());
const onLangPage = () => !!currentLang();
const goLang = (tab = "aujourdhui") => { location.hash = `#/lang/${tourLang()}/${tab}`; };
// Pages sans la barre des sections (lecteur, leçon…) : on revient sur la page de la langue
const ensureNav = () => { if (!onLangPage() || !document.querySelector?.(".section-nav")) goLang(); };

// Chaque étape : target (sélecteur du vrai élément) ou center ; doneWhen (action faite → étape suivante)
// ou next (bouton « Suivant ») ; skipIf (étape sans objet) ; enter (amener la bonne page).
const TOUR = [
  { center: true, mood: "happy", title: "Bienvenue sur Mochi !", next: "C'est parti !",
    text: "Je vais te montrer le site <b>en vrai</b> : c'est toi qui cliques, je te guide. Ça prend 2 minutes.",
    enter() { if (!/^#?\/?$/.test(location.hash)) location.hash = "#/"; } },
  { target: ".lang-grid", title: "Choisis ta langue", text: "Clique sur la carte de la langue que tu veux apprendre. Tu pourras faire l'autre plus tard (les langues grisées arrivent bientôt).",
    doneWhen: onLangPage, enter() { if (onLangPage()) location.hash = "#/"; } },
  { target: ".section-nav", title: "Les 3 sections", next: true,
    text: "☀️ <b>Aujourd'hui</b> : ta séance guidée. 📖 <b>Lire</b> : textes, livres, histoire. 🎯 <b>S'entraîner</b> : révisions et exercices.",
    enter: ensureNav },
  // Coréen sans Hangul : l'alphabet d'abord
  { skipIf: () => !tourGated(), target: 'a.btn[href*="/hangul/"]', title: "En coréen, l'alphabet d'abord",
    text: "Le Hangul s'apprend en une semaine environ, en 10 petites leçons. Clique sur « Jour 1 du Hangul ».",
    doneWhen: () => /\/hangul\//.test(location.hash), enter() { goLang(); } },
  { skipIf: () => !/\/hangul\//.test(location.hash), target: ".alpha-grid, .build-demo", title: "Touche une lettre", next: true,
    text: "Chaque jour : tu découvres quelques lettres (touche-les pour les entendre), puis tu t'entraînes. Tu reprendras ici quand tu veux." },
  // Lecture (anglais, ou coréen une fois le Hangul fait)
  { skipIf: tourGated, target: '.step a.btn[href*="/lire/"]', title: "Ta séance du jour",
    text: "Chaque jour : lire, capturer des mots, réviser, écrire. On commence par lire : clique sur « Lire ».",
    doneWhen: () => /\/lire\/[^/]+$/.test(location.hash), enter() { goLang("aujourdhui"); } },
  { skipIf: () => tourGated() || !/\/lire\/[^/]+$/.test(location.hash), target: ".sentences .w:not(.proper)", title: "Touche un mot",
    text: "Touche n'importe quel mot du texte : sa traduction s'affiche.", doneWhen: () => !!document.querySelector?.(".wordpanel") },
  { skipIf: () => tourGated() || !document.querySelector?.(".wordpanel"), target: ".wordpanel", title: "Ajoute-le à tes révisions", next: "Plus tard",
    text: "« + Ajouter aux révisions » en fait une carte, avec sa phrase et l'audio. Mochi te la reposera juste avant que tu l'oublies.",
    doneWhen: () => state.cards.length > (ui.tour?.cards0 ?? 0) || !!document.querySelector?.(".wordpanel .tag") },
  { skipIf: () => tourGated() || !document.querySelector?.(".player"), target: ".player", title: "Écoute", next: true,
    text: "<b>▶ Tout écouter</b> lit le texte avec une vraie voix. Tu peux ralentir, masquer le texte, ou répéter en même temps (shadowing)." },
  { target: '.section-nav a[href$="/pratique"]', title: "S'entraîner", text: "Quand tu as lu, place à l'entraînement : clique sur « S'entraîner ».",
    doneWhen: () => /\/pratique$/.test(location.hash), enter: ensureNav },
  { target: ".tool-grid", title: "Tes outils", next: true,
    text: "<b>Réviser</b> revient au bon moment, puis des exercices variés : phrases à trou, traduction, écoute… Pas d'idée ? La séance du jour te guide.",
    enter() { if (!/\/pratique$/.test(location.hash)) goLang("pratique"); } },
  { target: '[data-nav="profil"]', title: "Ton profil", next: true,
    text: "Crée un compte pour sauvegarder ta progression partout. Tu y règles aussi les voix, le clavier coréen… et tu habilles Mochi." },
  { center: true, mood: "proud", title: "À toi de jouer !", next: "Terminer",
    text: "L'objectif : <b>5 jours sur 7</b>, quelques minutes. Rater un jour ne casse rien. Tu peux revoir cette visite depuis ton profil." },
];

const tourShouldShow = () => !state.settings.tourDone && !state.cards.length && !Object.values(state.langs).some((L) => L.started);
let tourTimer = null, tourReturnFocus = null;
function openTour() {
  tourReturnFocus = document.activeElement;
  ui.tour = { i: -1, cards0: state.cards.length };
  tourGo(0);
  clearInterval(tourTimer);
  tourTimer = setInterval(tourTick, 200);
}
function closeTour(finished = false) {
  clearInterval(tourTimer); tourTimer = null;
  ui.tour = null;
  state.settings.tourDone = true; save();
  ["tour-block", "tour-spot", "tour-bubble"].forEach((id) => document.getElementById(id)?.remove?.());
  if (finished && currentLang()) goLang("aujourdhui");
  tourReturnFocus?.focus?.();
}
// Aller à l'étape i (en sautant celles qui n'ont pas lieu d'être)
function tourGo(i) {
  while (i < TOUR.length && TOUR[i].skipIf?.()) i++;
  if (i >= TOUR.length) return closeTour(true);
  ui.tour.i = i; ui.tour.scrolled = false; ui.tour.since = Date.now();
  TOUR[i].enter?.();
  tourDraw();
}
const tourNext = () => tourGo(ui.tour.i + 1);
// Le premier élément visible qui correspond (la barre du haut ou celle du bas, selon l'écran)
function tourTarget(sel) {
  const list = document.querySelectorAll?.(sel) || [];
  for (const el of list) { const r = el.getBoundingClientRect?.(); if (r && r.width > 0 && r.height > 0) return el; }
  return null;
}
function tourTick() {
  if (!ui.tour) return;
  const s = TOUR[ui.tour.i];
  if (s.skipIf?.()) return tourNext();
  // Action faite : on laisse voir le résultat un court instant
  if (s.doneWhen?.() && Date.now() - ui.tour.since > 300) return tourNext();
  tourDraw();
}
function tourEl(id, cls) {
  let el = document.getElementById(id);
  if (!el && typeof document.createElement === "function") { el = document.createElement("div"); el.id = id; el.className = cls; document.body.appendChild(el); }
  return el;
}
function tourDraw() {
  const s = TOUR[ui.tour?.i];
  if (!s || typeof innerWidth === "undefined") return; // pas de vrai écran (tests)
  const block = tourEl("tour-block", "tour-block"), spot = tourEl("tour-spot", "tour-spot"), bubble = tourEl("tour-bubble", "tour-bubble");
  if (!block || !spot || !bubble) return;
  const target = s.target ? tourTarget(s.target) : null;
  if (target && !ui.tour.scrolled) { target.scrollIntoView?.({ block: target.getBoundingClientRect().height > innerHeight * 0.55 ? "start" : "center", behavior: "smooth" }); ui.tour.scrolled = true; }
  const W = innerWidth, H = innerHeight, pad = 8;
  let hole = null;
  if (target) {
    const r = target.getBoundingClientRect();
    hole = { x: Math.max(4, r.left - pad), y: Math.max(4, r.top - pad), w: Math.min(W - 8, r.width + pad * 2), h: r.height + pad * 2 };
  }
  // Le voile bloque tout, sauf le trou au-dessus de l'élément éclairé
  block.style.clipPath = hole
    ? `polygon(evenodd, 0 0, ${W}px 0, ${W}px ${H}px, 0 ${H}px, 0 0, ${hole.x}px ${hole.y}px, ${hole.x}px ${hole.y + hole.h}px, ${hole.x + hole.w}px ${hole.y + hole.h}px, ${hole.x + hole.w}px ${hole.y}px, ${hole.x}px ${hole.y}px)`
    : "none";
  Object.assign(spot.style, hole ? { display: "block", left: `${hole.x}px`, top: `${hole.y}px`, width: `${hole.w}px`, height: `${hole.h}px` } : { display: "none" });
  // Bulle : contenu (seulement s'il change, pour ne pas voler le focus) puis position
  const lost = s.target && !target;
  const key = `${ui.tour.i}|${lost}`;
  if (bubble.dataset.key !== key) {
    bubble.dataset.key = key;
    bubble.setAttribute("role", "dialog"); bubble.setAttribute("aria-live", "polite"); bubble.setAttribute("aria-labelledby", "tour-title");
    bubble.innerHTML = `${s.center ? `<div class="tour-mochi">${mochi("", s.mood || "happy")}</div>` : `<div class="tour-mini">${mochi("small", s.doneWhen ? "curious" : "happy")}</div>`}
      <div class="tour-body">
        <small class="muted">Visite guidée</small>
        <h2 id="tour-title">${s.title}</h2>
        <p>${s.text}</p>
        ${lost ? `<p class="muted"><small>Tu t'es un peu éloigné ? <button class="linkish" data-tour="here">Revenir à cette étape</button></small></p>` : ""}
        ${s.doneWhen && !s.next ? `<p class="tour-do">👆 À toi : fais-le sur l'élément éclairé.</p>` : ""}
        <div class="tour-actions">
          <button class="btn ghost small" data-tour="skip">Passer la visite</button>
          ${s.next ? `<button class="btn small" data-tour="next">${s.next === true ? "Suivant →" : s.next}</button>` : ""}
        </div>
      </div>`;
    bubble.classList.toggle("center", !!s.center || lost);
    bubble.querySelector?.('[data-tour="next"]')?.focus?.();
  }
  if (s.center || !hole) { bubble.classList.remove("compact"); bubble.style.left = ""; bubble.style.top = ""; return; }
  // Élément trop haut pour l'écran (ex. la liste des langues sur téléphone) : bulle compacte en bas,
  // on peut faire défiler la page pour atteindre la suite de l'élément éclairé
  const tall = hole.h > H * 0.55;
  bubble.classList.toggle("compact", tall);
  const bw = Math.min(360, W - 24), bh = bubble.offsetHeight || 180;
  const below = hole.y + hole.h + 12, above = hole.y - bh - 12;
  const top = tall ? H - bh - 8 : below + bh < H - 8 ? below : above > 8 ? above : Math.max(8, H - bh - 8);
  bubble.style.width = `${bw}px`;
  bubble.style.left = `${Math.min(Math.max(12, hole.x + hole.w / 2 - bw / 2), W - bw - 12)}px`;
  bubble.style.top = `${top}px`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-tour]");
  if (!b) return;
  const a = b.dataset.tour;
  if (a === "open") { e.preventDefault(); openTour(); }
  else if (!ui.tour) return;
  else if (a === "next") { if (ui.tour.i === TOUR.length - 1) closeTour(true); else tourNext(); }
  else if (a === "skip") closeTour();
  else if (a === "here") { TOUR[ui.tour.i].enter?.(); ui.tour.scrolled = false; }
});
document.addEventListener("keydown", (e) => { if (ui.tour && e.key === "Escape") { e.preventDefault(); closeTour(); } }, true);
addEventListener("resize", () => ui.tour && tourDraw());
// Première visite : la visite s'ouvre d'elle-même (pas sur les pages de compte)
function maybeStartTour() {
  if (ui.tour || ui.tourOffered || !tourShouldShow() || /^#\/(connexion|inscription|reinitialiser|verifier|mot-de-passe|legal)/.test(location.hash)) return;
  ui.tourOffered = true;
  setTimeout(() => { if (tourShouldShow() && !ui.tour) openTour(); }, 400);
}
