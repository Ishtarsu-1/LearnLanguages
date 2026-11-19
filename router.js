// ============================================================
//  Mochi — router.js : Routes et rendu
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// ============================================================
//  ROUTEUR
// ============================================================
// Onglets de la barre de navigation (charte §7 : 4 au maximum)
const NAV_TABS = { aujourdhui: "aujourdhui", lire: "histoire", reviser: "pratique" };
const navOfTab = (tab) => ({ today: "aujourdhui", read: "lire", practice: "reviser" })[sectionOf(tab || "aujourdhui")];
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const hashChanged = ui.lastHash !== location.hash;
  if (hashChanged && ui.lastHash !== null) stopAudio();
  let html, nav = "home", lang = null;

  if (parts.length === 0) html = viewHome();
  else if (NAV_TABS[parts[0]] || parts[0] === "learn") {
    // Navigation principale (charte §7) : ouvre l'onglet dans la dernière langue,
    // ou l'accueil (choix de la langue) si aucune n'a encore été choisie.
    const tab = NAV_TABS[parts[0]] || "aujourdhui";
    if (state.lastLang) return void (location.hash = `#/lang/${state.lastLang}/${tab}`);
    html = viewHome(); nav = parts[0] === "learn" ? "aujourdhui" : parts[0];
  } else if (parts[0] === "profil") { html = viewProfile(); nav = "profil"; }
  else if (parts[0] === "connexion" || parts[0] === "inscription") { html = viewAuth(parts[0]); nav = "profil"; }
  else if (parts[0] === "pourquoi") { html = viewWhy(); nav = "pourquoi"; }
  else if (parts[0] === "avis") { html = viewFeedback(); nav = ""; }
  else if (parts[0] === "amis") { html = viewFriends(parts[1], parts[2]); nav = "profil"; }
  else if (parts[0] === "ami" && parts[1]) { html = viewInviteLink(decodeURIComponent(parts[1])); nav = "profil"; }
  else if (parts[0] === "admin" && parts[1] === "contenu") { html = viewAdminContent(parts[2] && decodeURIComponent(parts[2])); nav = "profil"; }
  else if (parts[0] === "admin") { html = viewAdmin(); nav = "profil"; }
  else if (parts[0] === "legal") { html = viewLegal(parts[1]); nav = ""; }
  else if (parts[0] === "mot-de-passe-oublie") { html = viewForgot(); nav = "profil"; }
  else if (parts[0] === "reinitialiser" && parts[1]) { html = viewReset(parts[1]); nav = "profil"; }
  else if (parts[0] === "verifier" && parts[1]) {
    if (parts[1] === "ok" && !ui.verify) return void (location.hash = account ? "#/profil" : "#/"); // rechargement après coup
    html = viewVerify(parts[1]); nav = "profil";
  }
  else if (parts[0] === "lang" && LANGUAGES[parts[1]]) {
    lang = parts[1]; nav = navOfTab(parts[2]);
    state.lastLang = lang; state.langs[lang].started = true; save();
    const [, , tab, a] = parts;
    if (tab === "lire" && a) html = viewReader(lang, a);
    else if (tab === "livre" && a) { html = viewBook(lang, a, parts[4], parts[5]); nav = "lire"; }
    else if (tab === "revisions" && a === "go") { if (hashChanged) ui.review = null; html = viewReviewSession(lang); }
    else if (tab === "hangul" && isKo(lang)) html = viewHangul(Number(a) || 1);
    else if (tab === "atelier" && isKo(lang)) html = viewAtelier();
    else if (tab === "grammaire" && isKo(lang)) html = viewGrammar(a);
    else html = viewLanguage(lang, tab === "pratique" || TABS[lang].some(([k]) => k === tab) ? tab : "aujourdhui");
  } else html = viewNotFound();

  document.body.dataset.lang = lang || state.lastLang || "ko";
  applyDisplay();
  $app.innerHTML = html + (typeof legalFooter === "function" ? legalFooter() : ""); // legal.js
  const logo = document.getElementById("logo-o"); if (logo && !logo.innerHTML) logo.innerHTML = LOGO_FACE;
  $app.querySelectorAll(".ko, .en").forEach((e) => { if (!e.classList.contains("lang-card")) e.lang = e.classList.contains("ko") ? "ko" : "en"; });
  if (!hashChanged) $app.querySelector(".view")?.classList.add("still");
  // Navigation principale : état actif (aria-current) et pastille des cartes à revoir
  const due = lang ? reviewCount(lang) : 0;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.dataset.nav === nav;
    a.classList.toggle("active", on);
    if (on) a.setAttribute?.("aria-current", "page"); else a.removeAttribute?.("aria-current");
    if (a.dataset.nav !== "reviser" || !a.querySelector) return;
    let b = a.querySelector(".nav-badge");
    if (due && !b) { b = document.createElement("span"); b.className = "nav-badge"; a.append(b); }
    if (b) { if (due) { b.textContent = due; b.title = "Cartes à revoir"; } else b.remove(); }
  });
  renderTopStats(lang);
  renderTopUser();
  if (account && parts[0] === "profil") loadSessions();
  if (hashChanged) window.scrollTo({ top: 0 });
  ui.lastHash = location.hash;
  if (typeof enhanceKoInputs === "function") enhanceKoInputs($app); // clavier coréen (keyboard.js)
  if (typeof checkNewAccessories === "function") checkNewAccessories(); // accessoires gagnés (cosmetics.js)
  if (typeof maybeStartTour === "function") maybeStartTour(); // visite guidée de la première visite (tour.js)
  const ans = document.getElementById("answer");
  if (ans) ans.focus();
}
const render = route;

function renderTopUser() {
  const el = document.getElementById("topbar-user");
  if (!el) return;
  // Barre du bas : l'avatar (Mochi par défaut) à la place de l'icône du profil
  const ico = document.querySelector?.('.bottomnav [data-nav="profil"] > span');
  if (ico) ico.innerHTML = displayAvatar("nav-avatar");
  if (account) { el.hidden = false; el.href = "#/profil"; el.innerHTML = `${displayAvatar("mini-avatar")}<span>${esc(account.name || "Profil")}</span>`; }
  else if (serverOn) { el.hidden = false; el.href = "#/connexion"; el.innerHTML = "<span>Se connecter</span>"; }
  else el.hidden = true;
}
function renderTopStats(lang) {
  const el = document.getElementById("topbar-stats");
  if (!lang) { el.innerHTML = ""; return; }
  const L = state.langs[lang];
  const n = reviewCount(lang);
  el.innerHTML = `<span class="chip">${LANGUAGES[lang].flag}</span>
    <a class="chip" href="#/lang/${lang}/revisions" title="Cartes à réviser">🧠 ${n}</a>
    <span class="chip" title="Semaines régulières d'affilée (5 jours sur 7)">📅 ${currentStreak(L)}</span>`;
}
