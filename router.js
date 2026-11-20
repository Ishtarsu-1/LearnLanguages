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
  else if (parts[0] === "ctf") { html = viewCtf(); nav = ""; }
  else if (parts[0] === "amis") { html = viewFriends(parts[1], parts[2]); nav = "amis"; }
  else if (parts[0] === "duel" && parts[1]) { html = viewDuel(parts[1]); nav = "amis"; }
  else if (parts[0] === "ami" && parts[1]) { html = viewInviteLink(decodeURIComponent(parts[1])); nav = "amis"; }
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
    if (tab === "lire" && a) html = parts[4] === "quiz" ? viewTextQuiz(lang, a) : viewReader(lang, a);
    else if (tab === "livre" && a) { html = viewBook(lang, a, parts[4], parts[5]); nav = "lire"; }
    else if (tab === "revisions" && a === "go") { if (hashChanged) ui.review = null; html = viewReviewSession(lang); }
    else if (tab === "hangul" && isKo(lang)) html = viewHangul(Number(a) || 1);
    else if (tab === "atelier" && isKo(lang)) html = viewAtelier();
    else if (tab === "pinyin" && isZh(lang) && a) html = viewPinyin(a);
    else if (tab === "alphabet" && lang === "ru" && a) html = viewCyrillic(a);
    else if (tab === "grammaire" && isKo(lang)) html = viewGrammar(a);
    else if (tab === "erreurs") html = viewMistakes(lang);
    else html = viewLanguage(lang, tab === "pratique" || TABS[lang].some(([k]) => k === tab) ? tab : "aujourdhui");
  } else html = viewNotFound();

  document.body.dataset.lang = lang || state.lastLang || "ko";
  applyDisplay();
  $app.innerHTML = html + (typeof legalFooter === "function" ? legalFooter() : ""); // legal.js
  const logo = document.getElementById("logo-o"); if (logo && !logo.innerHTML) logo.innerHTML = LOGO_FACE;
  $app.querySelectorAll(".ko, .en, .zh, .ru").forEach((e) => { if (!e.classList.contains("lang-card")) e.lang = e.classList.contains("ko") ? "ko" : e.classList.contains("zh") ? "zh-CN" : e.classList.contains("ru") ? "ru" : "en"; });
  if (!hashChanged) $app.querySelector(".view")?.classList.add("still");
  // Navigation principale : état actif (aria-current) et pastille des cartes à revoir
  const due = lang ? reviewCount(lang) : 0;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === "amis") a.hidden = !!features.portable; // version portable : pas d'amis
    const on = a.dataset.nav === nav;
    a.classList.toggle("active", on);
    if (on) a.setAttribute?.("aria-current", "page"); else a.removeAttribute?.("aria-current");
    if (!a.querySelector || !["reviser", "amis"].includes(a.dataset.nav)) return;
    // Pastilles : cartes à revoir (S'entraîner), demandes d'ami et invitations à un défi (Amis)
    const n = a.dataset.nav === "reviser" ? due : account?.social_pending || 0;
    let b = a.querySelector(".nav-badge");
    if (n && !b) { b = document.createElement("span"); b.className = "nav-badge"; a.append(b); }
    if (b) { if (n) { b.textContent = n; b.title = a.dataset.nav === "reviser" ? "Cartes à revoir" : "Demandes et invitations en attente"; } else b.remove(); }
  });
  renderTopStats(lang);
  renderTopUser();
  if (typeof ctfBadge === "function") ctfBadge(); // mini-CTF (version portable --ctf)
  if (account && parts[0] === "profil") loadSessions();
  if (hashChanged) window.scrollTo({ top: 0 });
  ui.lastHash = location.hash;
  if (typeof enhanceKoInputs === "function") enhanceKoInputs($app); // clavier coréen (keyboard.js)
  if (typeof checkNewAccessories === "function") checkNewAccessories(); // accessoires gagnés (cosmetics.js)
  if (typeof mochiAttach === "function") { mochiAttach($app); if (lang) mochiCheckFlavors(lang); } // Mochi vivant (mochi-live.js)
  if (typeof maybeBetaNotice === "function") maybeBetaNotice(); // versions portables : « version de test, tous droits réservés » (legal.js)
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
  if (features.portable && !account) { el.hidden = true; return; } // version portable : pas de comptes
  if (account) { el.hidden = false; el.href = "#/profil"; el.innerHTML = `${displayAvatar("mini-avatar")}<span>${esc(account.name || "Profil")}</span>`; }
  else if (serverOn) { el.hidden = false; el.href = "#/connexion"; el.innerHTML = "<span>Se connecter</span>"; }
  else el.hidden = true;
}
function renderTopStats(lang) {
  const el = document.getElementById("topbar-stats");
  if (!lang) { el.innerHTML = ""; return; }
  const L = state.langs[lang];
  const n = reviewCount(lang), streak = currentStreak(L);
  const begun = state.cards.some((c) => c.lang === lang) || streak > 0 || Object.keys(L.fullDays).length > 0;
  if (!begun) { el.innerHTML = `<span class="chip" aria-label="${LANGUAGES[lang].name}">${LANGUAGES[lang].flag}</span>`; return; }
  const rev = `${plural(n, "révision", "révisions")} à faire`, ser = `Série : ${plural(streak, "semaine régulière", "semaines régulières")}`;
  el.innerHTML = `<span class="chip" aria-label="${LANGUAGES[lang].name}">${LANGUAGES[lang].flag}</span>
    <a class="chip" href="#/lang/${lang}/revisions" title="${rev}" aria-label="${rev}">🧠 ${n}</a>
    <span class="chip" title="${ser} (5 jours sur 7)" aria-label="${ser}">📅 ${streak}</span>`;
}
