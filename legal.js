// ============================================================
//  Mochi — textes légaux : mentions légales, conditions d'utilisation (charte),
//  politique de confidentialité (RGPD), cookies. Pages #/legal/<page>.
//
//  ⚠️ À COMPLÉTER avant la mise en ligne : LEGAL_INFO ci-dessous. Tant qu'un champ
//  vaut « [À COMPLÉTER…] », il est surligné sur les pages.
//  Ces textes décrivent le fonctionnement RÉEL du site (vérifié dans le code) ; la
//  politique de confidentialité s'adapte aux services activés sur le serveur
//  (correcteur IA, e-mails). Ce sont des modèles sérieux, pas un avis juridique :
//  à faire relire si le site devient public ou commercial.
//  Quand ces textes changent : mettre à jour LEGAL_INFO.version ET TERMS_VERSION (server.js).
// ============================================================
const LEGAL_INFO = {
  editor: "[À COMPLÉTER : prénom et nom de l'éditeur]",
  status: "particulier, projet personnel non commercial, en phase de test",
  contact: "[À COMPLÉTER : adresse e-mail de contact]",
  // Où tourne le serveur. Exemples : « l'ordinateur personnel de l'éditeur (France), rendu accessible via
  // Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, États-Unis » ;
  // ou « GitHub, Inc., 88 Colin P Kelly Jr St, San Francisco, CA 94107, États-Unis (GitHub Pages) »
  host: "[À COMPLÉTER : hébergeur (nom, adresse)]",
  version: "2026-11-18",
  updated: "18 novembre 2026",
};
const LEGAL_PAGES = { mentions: "Mentions légales", cgu: "Conditions d'utilisation", confidentialite: "Confidentialité", cookies: "Cookies", credits: "Crédits" };
const legalField = (v) => (/^\[À COMPLÉTER/.test(v) ? `<mark class="todo">${esc(v)}</mark>` : esc(v));
const L_ = new Proxy({}, { get: (_, k) => legalField(LEGAL_INFO[k]) });

function legalMentions() {
  return `
  <h2>Éditeur</h2>
  <p>Mochi est édité par ${L_.editor}, ${L_.status}.<br/>Contact : ${L_.contact}</p>
  <h2>Hébergement</h2>
  <p>${L_.host}</p>
  <h2>Version de test</h2>
  <p>Mochi est en cours de développement. Le site est ouvert temporairement à un petit nombre de personnes pour le tester. Il peut être interrompu, modifié ou remis à zéro à tout moment (voir les <a class="lnk" href="#/legal/cgu">conditions d'utilisation</a>).</p>
  <h2>Propriété intellectuelle</h2>
  <p>Les textes pédagogiques, exercices, illustrations (dont la mascotte Mochi) et le code du site appartiennent à l'éditeur, sauf mention contraire. Toute reproduction sans autorisation est interdite.</p>
  <p>Mochi utilise des éléments libres, chacun sous sa licence : les polices Pretendard, Jua et Fredoka (SIL Open Font License 1.1), la bibliothèque de révision espacée ts-fsrs (licence MIT) et, quand elles sont activées, les voix de synthèse Kokoro (Apache 2.0) et MeloTTS (MIT).</p>
  <h2>Signaler un contenu</h2>
  <p>Pour signaler un contenu illicite (par exemple une photo de profil), écris à ${L_.contact}.</p>`;
}

function legalCgu() {
  return `
  <p>En créant un compte ou en utilisant Mochi, tu acceptes ces conditions. Elles sont écrites simplement : si un point n'est pas clair, écris à ${L_.contact}.</p>
  <h2>1. Ce qu'est Mochi</h2>
  <p>Mochi est un site gratuit pour apprendre l'anglais et le coréen : lecture, révisions espacées, exercices, correction de phrases. Il est <b>en phase de test</b> : c'est une version provisoire, ouverte temporairement.</p>
  <h2>2. Version de test : ce que ça implique</h2>
  <ul>
    <li>Le site peut être <b>indisponible</b> par moments (le serveur peut être éteint), contenir des erreurs ou changer sans préavis.</li>
    <li>Ta progression peut, en cas de problème technique, être <b>perdue ou remise à zéro</b>. Tu peux l'exporter à tout moment (Profil › « Exporter mes données »).</li>
    <li>La phase de test peut s'arrêter à tout moment. Dans ce cas, les comptes et données sont supprimés (voir la <a class="lnk" href="#/legal/confidentialite">politique de confidentialité</a>).</li>
  </ul>
  <h2>3. Ton compte</h2>
  <ul>
    <li>Le compte est facultatif : sans compte, Mochi fonctionne en mode invité et ta progression reste dans ton navigateur.</li>
    <li>Pour créer un compte, il faut avoir <b>au moins 15 ans</b>, ou l'accord d'un parent ou tuteur.</li>
    <li>Tu donnes une adresse e-mail valide et tu gardes ton mot de passe pour toi. Tu es responsable de ce qui est fait avec ton compte.</li>
    <li>Tu peux supprimer ton compte à tout moment (Profil › « Supprimer mon compte ») : tout est effacé définitivement.</li>
  </ul>
  <h2>4. Charte de bonne conduite</h2>
  <p>Mochi est un espace d'apprentissage bienveillant. En l'utilisant, tu t'engages à :</p>
  <ul>
    <li>ne publier aucune <b>photo de profil</b> choquante, illicite ou qui ne t'appartient pas (pas de photo d'une autre personne sans son accord) ;</li>
    <li>ne pas écrire dans les exercices et conversations de contenu illicite, haineux, violent ou harcelant ;</li>
    <li><b>ne pas saisir d'informations sensibles</b> (santé, opinions, numéros de carte, mots de passe…) dans les phrases et conversations : elles peuvent être envoyées à un service d'IA pour être corrigées ;</li>
    <li>ne pas détourner l'IA de son usage (lui faire produire autre chose que de l'aide à l'apprentissage) ni contourner les limites d'utilisation ;</li>
    <li>ne pas tenter d'accéder aux comptes des autres, de perturber le site ou d'en extraire massivement le contenu.</li>
  </ul>
  <p>En cas de manquement, l'éditeur peut retirer un contenu, suspendre ou supprimer le compte concerné.</p>
  <h2>5. L'IA et les corrections</h2>
  <p>Certaines corrections et conversations sont produites par une intelligence artificielle, et les voix peuvent être synthétiques. <b>Elles peuvent se tromper</b> : prends-les comme une aide, pas comme une vérité absolue. L'utilisation de l'IA est limitée chaque jour pour garder le service disponible pour tous.</p>
  <h2>6. Responsabilité</h2>
  <p>Mochi est fourni gratuitement, « en l'état », pendant sa phase de test. L'éditeur fait de son mieux pour qu'il fonctionne bien et protège tes données, mais ne peut garantir l'absence d'erreurs ou d'interruptions, ni un résultat d'apprentissage.</p>
  <h2>7. Changements</h2>
  <p>Ces conditions peuvent évoluer. En cas de changement important, il te sera demandé de les accepter de nouveau.</p>
  <h2>8. Droit applicable</h2>
  <p>Ces conditions sont soumises au droit français. En cas de désaccord, on cherche d'abord une solution à l'amiable : écris à ${L_.contact}.</p>`;
}

function legalPrivacy() {
  const claude = /Claude/.test(features.engine || ""), ollama = /Ollama/.test(features.engine || "");
  const resend = features.mail === "resend";
  const serverVoices = Object.keys(features.tts || {}).length > 0;
  const row = (cat, data, why, base, keep) => `<tr><th scope="row">${cat}</th><td>${data}</td><td>${why}</td><td>${base}</td><td>${keep}</td></tr>`;
  return `
  <p>Cette page explique quelles données Mochi utilise, pourquoi, combien de temps, et tes droits. Elle décrit ce que fait réellement le site.</p>
  <h2>Qui est responsable ?</h2>
  <p>Le responsable du traitement est ${L_.editor}, éditeur de Mochi (${L_.status}). Contact pour toute question ou demande : ${L_.contact}.</p>

  <h2>En bref</h2>
  <ul>
    <li>Pas de publicité, pas de revente de données, pas de mesure d'audience, pas de pistage.</li>
    <li>Sans compte, ta progression reste <b>dans ton navigateur</b> : rien n'est envoyé au serveur.</li>
    <li>Avec un compte, ta progression est sauvegardée sur le serveur pour la retrouver sur tes appareils. Tu peux la supprimer à tout moment.</li>
  </ul>

  <h2>Quelles données, pourquoi, combien de temps ?</h2>
  <div class="table-scroll"><table class="legal-table">
    <thead><tr><th>Quoi</th><th>Données</th><th>Pour quoi faire</th><th>Base légale</th><th>Durée</th></tr></thead>
    <tbody>
      ${row("Compte", "Adresse e-mail, mot de passe (stocké chiffré de façon irréversible, scrypt), prénom, avatar choisi, date d'inscription, de dernière connexion, d'acceptation des conditions", "Te connecter, retrouver ta progression, sécuriser le compte", "Exécution du service que tu demandes (contrat)", "Jusqu'à la suppression du compte ou la fin de la phase de test")}
      ${row("Photo de profil", "L'image que tu envoies (recadrée en 256 × 256 px)", "L'afficher sur ton profil", "Exécution du service", "Jusqu'à ce que tu la retires ou supprimes ton compte")}
      ${row("Progression", "Mots et cartes de révision, historique des révisions, exercices, temps passé, réglages", "Planifier tes révisions, suivre tes progrès, synchroniser tes appareils", "Exécution du service", "Jusqu'à la suppression du compte (ou « Réinitialiser ma progression »)")}
      ${row("Sessions", "Jeton de connexion (stocké sous forme d'empreinte), type de navigateur, dates", "Te garder connecté, afficher « Appareils connectés »", "Exécution du service", "30 jours, ou jusqu'à la déconnexion")}
      ${row("Sécurité", "Adresse IP et adresse e-mail en cas de tentatives répétées (connexion, inscription, mot de passe oublié, voix)", "Freiner les attaques et les abus", "Intérêt légitime (sécurité du service)", "24 heures au plus")}
      ${row("Liens par e-mail", "Jetons de réinitialisation du mot de passe et de confirmation d'adresse (empreintes)", "Te permettre de changer ton mot de passe, confirmer ton adresse", "Exécution du service", "30 minutes (mot de passe) ou 7 jours (confirmation), usage unique")}
      ${row("Corrections par l'IA", "Le nombre d'utilisations par jour. Les phrases envoyées ne sont <b>pas conservées</b> par Mochi", "Limiter l'usage quotidien", "Exécution du service", "90 jours (compteurs)")}
      ${row("Amis et défis", "Ton pseudo, ta liste d'amis, les demandes et les blocages, tes défis. Tes amis voient ton prénom, ton pseudo, ton avatar et, si tu le laisses activé, tes heures et tes mots solides", "Ajouter des amis, vous lancer des défis et suivre leur progression", "Exécution du service que tu demandes", "Jusqu'à ce que tu retires l'ami, quittes le défi ou supprimes ton compte")}
      ${row("Tes retours (« Donner mon avis »)", "Ton message, sa note et son type, la page où tu étais, ton navigateur, ton compte si tu es connecté·e, et une adresse de contact si tu en donnes une", "Améliorer Mochi pendant la phase de test, te répondre si tu le demandes", "Intérêt légitime (améliorer le service) ; ton choix d'écrire", "Le temps de la phase de test")}
      ${row("Sauvegardes", "Une copie de la base (comptes, progression, amis, défis, retours) et des photos de profil", "Ne rien perdre en cas de panne", "Intérêt légitime (continuité du service)", "14 jours (copies quotidiennes), 7 jours (copie continue) ; une donnée supprimée disparaît des sauvegardes après ce délai")}
      ${row("Journal technique", "Messages d'erreur du serveur (sans contenu de tes exercices)", "Corriger les pannes", "Intérêt légitime", "Le temps de la phase de test")}
    </tbody>
  </table></div>

  <h2>Qui reçoit ces données ?</h2>
  <p>Seul l'éditeur y a accès. Certains services techniques interviennent pour faire fonctionner Mochi :</p>
  <ul>
    <li><b>Hébergement</b> : ${L_.host}.</li>
    ${claude ? `<li><b>Correcteur et conversations IA : Anthropic (États-Unis)</b>. Quand tu fais corriger une phrase, traduis avec correction ou parles dans une mission, <b>ta phrase</b> et le contexte de l'exercice lui sont envoyés pour produire la correction. Ni ton e-mail ni ton nom ne sont transmis.</li>` : ollama ? `<li><b>Correcteur et conversations IA</b> : le modèle tourne <b>sur le serveur de Mochi</b> (Ollama) ; tes phrases ne sont envoyées à aucun service extérieur.</li>` : `<li><b>Correcteur IA</b> : désactivé pour l'instant.</li>`}
    ${resend ? `<li><b>E-mails (mot de passe oublié, confirmation d'adresse, tes retours transmis à l'éditeur) : Resend (États-Unis)</b>, qui reçoit l'adresse et le contenu du message.</li>` : `<li><b>E-mails</b> : aucun service d'envoi n'est utilisé pour l'instant.</li>`}
    ${serverVoices ? `<li><b>Voix</b> : générées <b>sur le serveur de Mochi</b> (Kokoro, MeloTTS), uniquement à partir des textes du site.</li>` : ""}
    <li><b>Voix du navigateur</b> : quand Mochi utilise les voix installées sur ton appareil, certains navigateurs (Chrome, Edge…) envoient le texte lu à leurs propres serveurs pour le prononcer. Il s'agit des textes de Mochi, pas de tes données.</li>
  </ul>
  ${claude || resend ? `<p><b>Transferts hors de l'Union européenne.</b> Les services situés aux États-Unis indiqués ci-dessus reçoivent des données dans le cadre des garanties prévues par le RGPD (adhésion au Data Privacy Framework UE–États-Unis ou clauses contractuelles types, selon le prestataire).</p>` : ""}

  <h2>Sur ton appareil</h2>
  <p>Mochi enregistre ta progression dans le stockage de ton navigateur, pour fonctionner vite et même hors ligne, et utilise un seul cookie, nécessaire à la connexion. Détails sur la page <a class="lnk" href="#/legal/cookies">Cookies</a>.</p>

  <h2>Sécurité</h2>
  <p>Connexion chiffrée (HTTPS), mots de passe chiffrés de façon irréversible, jetons stockés sous forme d'empreinte, cookie de session inaccessible aux scripts, protection contre les requêtes venant d'autres sites, limitation des tentatives. Aucune sécurité n'étant absolue, en cas de fuite de données présentant un risque pour toi, tu en serais informé.</p>

  <h2>Tes droits</h2>
  <p>Tu peux à tout moment :</p>
  <ul>
    <li><b>consulter et récupérer</b> tes données : Profil › « Exporter mes données (JSON) » pour ta progression ; écris à ${L_.contact} pour une copie complète ;</li>
    <li><b>les corriger</b> : prénom, avatar et photo dans ton profil ; écris-nous pour le reste ;</li>
    <li><b>les supprimer</b> : Profil › « Supprimer mon compte » efface immédiatement et définitivement ton compte, ta photo et ta progression ;</li>
    <li>t'<b>opposer</b> à un traitement ou en demander la <b>limitation</b>, en écrivant à ${L_.contact}.</li>
  </ul>
  <p>Réponse sous un mois au plus. Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la <b>CNIL</b> (<a class="lnk" href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">cnil.fr/fr/plaintes</a>).</p>

  <h2>Mineurs</h2>
  <p>Le compte est ouvert à partir de 15 ans, ou plus tôt avec l'accord d'un parent ou tuteur. Le mode invité ne demande aucune donnée personnelle.</p>

  <h2>Fin de la phase de test</h2>
  <p>Si la phase de test s'arrête, les comptes et toutes les données associées sont supprimés dans un délai de 30 jours. Tu peux exporter ta progression avant.</p>`;
}

function legalCookies() {
  const row = (name, where, why, keep) => `<tr><th scope="row"><code>${name}</code></th><td>${where}</td><td>${why}</td><td>${keep}</td></tr>`;
  return `
  <p><b>Mochi n'utilise aucun cookie publicitaire, aucune mesure d'audience et aucun traceur de réseau social.</b> Il n'utilise que ce qui est strictement nécessaire à son fonctionnement. Ces éléments sont dispensés de consentement (article 82 de la loi Informatique et Libertés, lignes directrices de la CNIL) : c'est pourquoi aucun bandeau ne te demande d'accepter quoi que ce soit : une simple ligne en bas de chaque page t'en informe.</p>
  <h2>Ce qui est déposé sur ton appareil</h2>
  <div class="table-scroll"><table class="legal-table">
    <thead><tr><th>Nom</th><th>Type</th><th>À quoi ça sert</th><th>Durée</th></tr></thead>
    <tbody>
      ${row("mochi_sid", "Cookie (seulement si tu te connectes)", "Te garder connecté. Inaccessible aux scripts, envoyé uniquement à Mochi.", "30 jours, ou jusqu'à la déconnexion")}
      ${row("mochi-state-v2", "Stockage local du navigateur", "Ta progression en mode invité", "Jusqu'à ce que tu l'effaces")}
      ${row("mochi-user-…, mochi-sync-…", "Stockage local", "Copie de ta progression (compte) pour aller vite et fonctionner hors ligne, état de la synchronisation", "Jusqu'à la suppression du compte ou l'effacement du navigateur")}
      ${row("mochi-last-account", "Stockage local", "Te reconnaître hors ligne (appli installée)", "Effacé à la déconnexion")}
      ${row("mochi-ko-kbd", "Stockage local", "Se souvenir si le clavier coréen est ouvert", "Jusqu'à ce que tu l'effaces")}
      ${row("mochi-v…, mochi-audio", "Cache de l'application (service worker)", "Faire fonctionner le site hors ligne, garder l'audio déjà écouté", "Jusqu'à la mise à jour du site ou l'effacement du navigateur")}
    </tbody>
  </table></div>
  <h2>Les effacer</h2>
  <p>Tu peux tout effacer depuis les réglages de ton navigateur (« Effacer les données de navigation » ou « Données des sites » pour ce site). Attention : en mode invité, ta progression est effacée avec. Avec un compte, elle reste sur le serveur et revient à la prochaine connexion.</p>`;
}

// Crédits : sources et licences des données, polices et bibliothèques (CONTENU-PIPELINE)
function legalCredits() {
  const li = (what, src, lic) => `<li><b>${what}</b> : ${src} — <i>${lic}</i></li>`;
  return `
  <p>Les textes, livres et histoires de Mochi sont écrits pour Mochi (une partie avec l'aide d'une IA, puis relue par un humain) et publiés sous licence CC BY 4.0. Mochi s'appuie aussi sur ces ressources :</p>
  <h2>Listes de vocabulaire</h2>
  <ul>
    ${li("Coréen : « 한국어 학습용 어휘 목록 » (vocabulaire d'apprentissage du coréen, 2003)", "국립국어원 (Institut national de la langue coréenne), ordre de fréquence repris du Wiktionnaire coréen", "공공누리 type 1 (KOGL, mention de la source) ; Wiktionnaire : CC BY-SA")}
    ${li("Anglais : fréquences des mots", "wordfreq (Robyn Speer et collaborateurs)", "données CC BY-SA 4.0")}
    ${li("Anglais : formes de base des mots", "simplemma (Adrien Barbaresi)", "MIT")}
  </ul>
  <h2>Analyse de la langue</h2>
  <ul>${li("Analyse morphologique du coréen", "Kiwi / kiwipiepy (bab2min)", "LGPL-3.0")}</ul>
  <h2>Voix</h2>
  <ul>${li("Voix anglaises", "Kokoro (hexgrad)", "Apache 2.0")}${li("Voix coréenne", "MeloTTS (MyShell.ai)", "MIT")}</ul>
  <h2>Polices et bibliothèques</h2>
  <ul>
    ${li("Pretendard", "Kil Hyung-jin", "SIL Open Font License 1.1")}${li("Jua", "Woowahan Brothers", "SIL Open Font License 1.1")}${li("Fredoka", "Milena Brandão", "SIL Open Font License 1.1")}
    ${li("Répétition espacée", "ts-fsrs (open-spaced-repetition)", "MIT")}
  </ul>`;
}

function viewLegal(page) {
  const views = { mentions: legalMentions, cgu: legalCgu, confidentialite: legalPrivacy, cookies: legalCookies, credits: legalCredits };
  if (!views[page]) return viewNotFound();
  const todo = Object.values(LEGAL_INFO).some((v) => /^\[À COMPLÉTER/.test(v));
  return `<section class="view legal">
    <nav class="sub-nav" aria-label="Informations légales">${Object.entries(LEGAL_PAGES).map(([k, t]) => `<a class="${k === page ? "active" : ""}" href="#/legal/${k}" ${k === page ? 'aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
    <h1>${LEGAL_PAGES[page]}</h1>
    <p class="muted"><small>Dernière mise à jour : ${LEGAL_INFO.updated}</small></p>
    ${todo ? `<div class="card tip">⚠️ Certains champs sont encore à compléter par l'éditeur (surlignés).</div>` : ""}
    <div class="card legal-body">${views[page]()}</div>
  </section>`;
}

// Pied de page : liens légaux et une ligne discrète d'information sur les cookies.
// Les cookies strictement nécessaires sont dispensés de consentement : on informe, sans bandeau
// ni bouton (à revoir si un outil de mesure d'audience est ajouté un jour).
function legalFooter() {
  return `<footer class="site-footer">
    <p class="avis-line"><a class="lnk" href="#/avis">💬 Donner mon avis sur Mochi</a></p>
    <p class="cookie-line">🍪 Mochi n'utilise que des cookies nécessaires · <a class="lnk" href="#/legal/cookies">En savoir plus</a></p>
    <nav aria-label="Informations légales">${Object.entries(LEGAL_PAGES).map(([k, t]) => `<a href="#/legal/${k}">${t}</a>`).join("")}</nav><small class="muted">Mochi · version de test</small></footer>`;
}
// Ancien bandeau (« OK ») : on nettoie la clé qu'il laissait
try { localStorage.removeItem("mochi-notice"); } catch {}
