// ============================================================
//  Mochi — profile.js : Profil, réglages, sécurité, connexion, admin, mot de passe oublié, « Pourquoi ça marche »
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// ---------- Profil & réglages ----------
function viewProfile() {
  const S = state.settings;
  const since = account ? new Date(account.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
  return `
  <section class="view">
    ${verifyBanner()}
    <div class="card profile-head">
      <div class="avatar-wrap">
        <div class="avatar">${displayAvatar()}</div>
        ${account ? `<label class="avatar-edit" title="Changer la photo">📷<input type="file" id="avatar-file" accept="image/*" hidden /></label>` : ""}
      </div>
      <div class="grow minw-220">
        <label class="muted fw-800 fs-09rem" for="name">Ton prénom</label><br/>
        <input id="name" class="input mt-6 w-full maxw-320" placeholder="Comment t'appelles-tu ?" value="${esc(state.name)}" maxlength="40" autocomplete="nickname" />
        ${account ? `
          <p class="muted acct-line">✉️ ${esc(account.email)} · Membre depuis le ${since}</p>
          <div class="wp-actions mt-8">${syncBadge()}
            ${account.avatar_url ? `<button class="mini" data-act="remove-photo">Retirer la photo</button>` : ""}
            <button class="mini" data-act="logout">Se déconnecter</button></div>`
        : features.portable ? `
          <div class="guest-cta"><p><b>💼 Version portable de Mochi.</b> Ta progression est enregistrée sur cet ordinateur (dossier « donnees » à côté du lanceur) : garde ce dossier pour la retrouver. Pas de compte ni d'amis dans cette version.</p>
            <a class="btn small" href="#/avis">💬 Donner mon avis</a></div>`
        : serverOn ? `
          <div class="guest-cta">
            <p><b>Tu es en mode invité.</b> Ta progression n'existe que dans ce navigateur. Crée un compte pour la sauvegarder, la retrouver sur tous tes appareils et ajouter une photo.</p>
            <a class="btn small" href="#/inscription">Créer un compte</a> <a class="btn ghost small" href="#/connexion">J'ai déjà un compte</a>
          </div>`
        : `<p class="muted acct-line"><small>Mode invité : ta progression reste dans ce navigateur. Pour les comptes, lance le serveur (<code>node server.js</code>).</small></p>`}
      </div>
    </div>

    <h2 class="section-title">Mon activité</h2>
    ${activityCard()}

    <h2 class="section-title">${account?.avatar_url ? "Avatar (si tu retires ta photo)" : "Choisis ton avatar"}</h2>
    <div class="choice-row">${AVATARS.map((a) => `<button class="choice avatar-choice ${a === state.avatar ? "active" : ""}" data-act="avatar" data-v="${a}" aria-label="${a === "mochi" ? "Mochi" : a}" ${a === state.avatar ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${avatarGlyph(a)}</button>`).join("")}</div>

    ${typeof lookCard === "function" ? lookCard() : ""}

    <h2 class="section-title">Objectif quotidien</h2>
    <div class="choice-row">${GOALS.map((g) => `<button class="choice ${g.min === state.goal ? "active" : ""}" data-act="goal" data-v="${g.min}">${g.label}<br/><span class="muted fs-085rem">${g.min} min / jour</span></button>`).join("")}</div>

    <h2 class="section-title">Où j'en suis</h2>
    <div class="lang-grid">
      ${Object.entries(LANGUAGES).map(([id, l]) => {
        const L = state.langs[id], h = L.seconds / 3600;
        const cov = coverage(id, TEXTS[id].flatMap((t) => t.parsed));
        return `<div class="card">
          <h3>${l.flag} ${l.name}</h3>
          <div class="stat-grid mt-12 mb-12 mx-0">
            <div class="stat"><span class="ico">⏱️</span><div><b>${num1(h)} h</b><small>cumulées</small></div></div>
            <div class="stat"><span class="ico">📒</span><div><b>${num0(knownCount(id))}</b><small>mots connus</small></div></div>
          </div>
          <p class="muted mt-0 mb-10 mx-0"><small>Tu comprends ~${pct(cov)} % des mots de nos ${id === "en" ? "dialogues" : "textes"}.</small></p>
          ${LEVEL_HOURS[id].steps.map(([lvl, hrs, txt]) => `<div class="lvl"><span>${lvl}</span><div class="bar"><span data-bar-w="${Math.min(100, (h / hrs) * 100)}"></span></div><small class="muted">${txt}</small></div>`).join("")}
        </div>`;
      }).join("")}
    </div>

    <h2 class="section-title">Réglages d'apprentissage</h2>
    <div class="card settings">
      <label>Rétention visée : <b>${pct(S.retention)} %</b>
        <input type="range" min="0.8" max="0.95" step="0.01" value="${S.retention}" data-set="retention" />
        <small class="muted">Plus haut = plus de révisions, moins d'oublis. 90 % est un bon équilibre.</small></label>
      <label>Nouvelles cartes par jour : <b>${S.newPerDay}</b>
        <input type="range" min="5" max="30" step="1" value="${S.newPerDay}" data-set="newPerDay" />
        <small class="muted">Au-delà de 15, les révisions s'accumulent vite.</small></label>
      <label>Mots transparents (anglais) comptés comme connus à : <b>${pct(S.cognateWeight)} %</b>
        <input type="range" min="0" max="1" step="0.1" value="${S.cognateWeight}" data-set="cognateWeight" /></label>
      <label class="row"><input type="checkbox" ${S.particleColors ? "checked" : ""} data-set="particleColors" /> Particules coréennes en couleur</label>
    </div>

    <h2 class="section-title">Affichage</h2>
    <div class="card settings">
      <label>Taille du texte : <b>${pct(S.textScale)} %</b>
        <input type="range" min="0.9" max="1.5" step="0.05" value="${S.textScale}" data-set="textScale" /></label>
      <label class="row"><input type="checkbox" ${S.zen ? "checked" : ""} data-set="zen" /> Mode lecture zen (aucun surlignage des mots dans le lecteur)</label>
      <div><span>Thème</span>
        <div class="choice-row mt-6" role="radiogroup" aria-label="Thème">${[["auto", "🖥️ Comme l'appareil"], ["light", "☀️ Clair"], ["dark", "🌙 Sombre"]].map(([v, l]) => `<button class="choice ${(S.theme || "auto") === v ? "active" : ""}" role="radio" aria-checked="${(S.theme || "auto") === v}" data-act="theme" data-v="${v}">${l}</button>`).join("")}</div></div>
    </div>

    <h2 class="section-title">Audio</h2>
    ${audioCard()}

    ${account ? `
    <h2 class="section-title">Sécurité du compte</h2>
    <div class="acct-grid">
      <form class="card form" data-form="password">
        <h3>Changer de mot de passe</h3>
        <input class="input" type="password" name="current" placeholder="Mot de passe actuel" autocomplete="current-password" required />
        <input class="input" type="password" name="next" placeholder="Nouveau (8 caractères min.)" autocomplete="new-password" minlength="8" required />
        <p class="form-err" hidden></p>
        <button class="btn small">Mettre à jour</button>
        <small class="muted">Tes autres appareils seront déconnectés.</small>
      </form>
      <div class="card">
        <h3>Appareils connectés</h3>
        <div id="sessions"><p class="muted">Chargement…</p></div>
        <button class="mini mt-10" data-act="logout-others">Déconnecter les autres appareils</button>
      </div>
    </div>` : ""}

    <div class="mt-36 d-flex gap-10 wrap">
      <button class="btn ghost small" data-act="export">Exporter mes données (JSON)</button>
      <button class="btn ghost small" data-act="reset">Réinitialiser ma progression</button>
      <a class="btn ghost small" href="#/pourquoi">🔬 Pourquoi ça marche ?</a>
      <button class="btn ghost small" data-tour="open">🧭 Revoir la visite guidée</button>
      <a class="btn ghost small" href="#/legal/confidentialite">🔒 Mes données et confidentialité</a>
      <a class="btn ghost small" href="#/avis">💬 Donner mon avis</a>
      ${isAdmin() ? `<a class="btn small" href="#/admin">🛠️ Tableau de bord admin</a>` : ""}
    </div>

    ${account ? `
    <details class="card danger">
      <summary><b>Supprimer mon compte</b></summary>
      <form class="form mt-12" data-form="delete">
        <p class="muted">Ton compte, ta photo et toute ta progression seront effacés définitivement du serveur.</p>
        <input class="input" type="password" name="password" placeholder="Confirme avec ton mot de passe" autocomplete="current-password" required />
        <p class="form-err" hidden></p>
        <button class="btn small danger-btn">Supprimer définitivement</button>
      </form>
    </details>` : ""}
  </section>`;
}

// Profil › Audio : quelles voix sont disponibles, laquelle utiliser, et quoi faire s'il n'y en a pas
function audioCard() {
  const S = state.settings;
  const rows = Object.entries(LANGUAGES).map(([id, l]) => {
    const sv = serverVoices(id), bv = voicesFor(id), src = audioSource(id), pref = S.voices?.[id] || "";
    const status = src === "server" ? `<span class="badge ok">🎙️ Voix neuronales du serveur (${sv.length})</span>`
      : src === "browser" ? `<span class="badge">🔈 Voix du navigateur (${bv.length})</span>`
      : `<span class="badge warn">🔇 Aucune voix ${{ ko: "coréenne", zh: "chinoise", ru: "russe" }[id] || "anglaise"}</span>`;
    const opts = [
      ...sv.map((v) => [v, `🎙️ ${v} (serveur)`]),
      ...bv.map((v) => [`browser:${v.name}`, `🔈 ${v.name}${/natural|neural|online|premium|enhanced/i.test(v.name) ? " ✨" : ""}`]),
    ];
    return `<div class="voice-row">
      <div class="audio-head"><b>${l.flag} ${l.name}</b> ${status}</div>
      ${opts.length ? `<div class="audio-ctl">
        <select class="input" data-voice="${id}" aria-label="Voix ${l.name}"><option value="">Automatique (la meilleure trouvée)</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === pref ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
        <button class="btn ghost small" data-act="say" data-lang="${id}" data-text="${esc(VOICE_SAMPLE[id] || VOICE_SAMPLE.en)}">▶ Tester</button>
      </div>` : ""}
    </div>`;
  }).join("");
  const anyMute = Object.keys(LANGUAGES).some((id) => !audioSource(id));
  return `<div class="card settings">
    ${rows}
    <label>Vitesse de lecture : <b>${pct(S.speed)} %</b>
      <input type="range" min="0.6" max="1.2" step="0.05" value="${S.speed}" data-set="speed" /></label>
    <details class="audio-help" ${anyMute ? "open" : ""}>
      <summary><b>Pas de son, ou une voix robotique ?</b></summary>
      <p class="muted">Sans voix serveur, Mochi utilise les voix installées sur ton appareil. Pour en ajouter :</p>
      <ul class="muted">
        <li><b>Le plus simple</b> : ouvre Mochi dans <b>Microsoft Edge</b> (voix « Natural » coréennes et anglaises, gratuites, même sous Linux) ou <b>Google Chrome</b> (voix « Google »).</li>
        <li><b>Windows</b> : Paramètres › Heure et langue › Voix › Ajouter des voix › coréen.</li>
        <li><b>macOS / iPhone</b> : Réglages › Accessibilité › Contenu énoncé › Voix › coréen (Yuna) et anglais.</li>
        <li><b>Android</b> : Paramètres › Synthèse vocale › Moteur Google › installer les données coréennes.</li>
        <li><b>Linux (Chromium, Firefox)</b> : installe <code>speech-dispatcher</code> et <code>espeak-ng</code>, puis redémarre le navigateur. Ça marche, mais la voix est très robotique.</li>
      </ul>
      <p class="muted"><small>Les meilleures voix sont celles du serveur (Kokoro, MeloTTS…) : voir SETUP.md, section « Vraies voix ».</small></p>
    </details>
  </div>`;
}

// Suivi d'activité : calendrier des 17 dernières semaines + totaux
function activityCard() {
  const H = state.history;
  const daySum = (d) => Object.values(H[d] || {}).reduce((a, x) => ({ sec: a.sec + x.sec, rev: a.rev + x.rev, prod: a.prod + x.prod, read: a.read + x.read }), { sec: 0, rev: 0, prod: 0, read: 0 });
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - 16 * 7); // lundi, 16 semaines avant
  const cells = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = today(d), x = daySum(key), min = Math.round(x.sec / 60);
    const lvl = !x.sec && !x.rev ? 0 : min < 5 ? 1 : min < 15 ? 2 : min < 30 ? 3 : 4;
    cells.push(`<span class="hm l${lvl}" title="${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} : ${min} min, ${plural(x.rev, "révision", "révisions")}"></span>`);
  }
  const days = Object.keys(H).filter((d) => daySum(d).sec || daySum(d).rev);
  const tot = Object.keys(H).reduce((a, d) => { const x = daySum(d); return { sec: a.sec + x.sec, prod: a.prod + x.prod, read: a.read + x.read }; }, { sec: 0, prod: 0, read: 0 });
  const week = Array.from({ length: 7 }, (_, i) => daySum(today(new Date(Date.now() - i * 864e5))).sec).reduce((a, b) => a + b, 0);
  return `<div class="card">
    <div class="stat-grid">
      <div class="stat"><span class="ico">📅</span><div><b>${days.length}</b><small>jours actifs</small></div></div>
      <div class="stat"><span class="ico">⏱️</span><div><b>${num1(tot.sec / 3600)} h</b><small>au total</small></div></div>
      <div class="stat"><span class="ico">🗓️</span><div><b>${Math.round(week / 60)} min</b><small>ces 7 derniers jours</small></div></div>
      <div class="stat"><span class="ico">🧠</span><div><b>${state.logs.length}</b><small>révisions</small></div></div>
      <div class="stat"><span class="ico">💬</span><div><b>${tot.prod}</b><small>phrases produites</small></div></div>
      <div class="stat"><span class="ico">📖</span><div><b>${tot.read}</b><small>lectures</small></div></div>
    </div>
    <div class="heatmap" aria-label="Activité des 17 dernières semaines">${cells.join("")}</div>
    <div class="hm-legend muted"><small>Moins</small>${[0, 1, 2, 3, 4].map((l) => `<span class="hm l${l}"></span>`).join("")}<small>Plus</small></div>
  </div>`;
}

function prettyUA(ua) {
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const o = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${b}${o ? ` · ${o}` : ""}`;
}
async function loadSessions() {
  try {
    const { sessions } = await api("GET", "/api/sessions");
    const el = document.getElementById("sessions");
    if (el) el.innerHTML = sessions.map((x) => `<div class="sess"><b>${esc(prettyUA(x.user_agent))}</b>${x.current ? ' <span class="tag">cet appareil</span>' : ""}<br/><small class="muted">Vu le ${new Date(x.last_seen_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small></div>`).join("");
  } catch {}
}

// ---------- Connexion / inscription ----------
function viewAuth(mode) {
  if (!serverOn) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "thinking")}<h2>Comptes indisponibles</h2>
    <p class="muted">Les comptes ont besoin du serveur Mochi. Lance <code>node server.js</code> puis ouvre <code>http://localhost:8000</code>.</p><a class="btn" href="#/">Continuer en invité</a></div></section>`;
  if (account) return `<section class="view lesson-shell"><div class="card empty">${displayAvatar("avatar")}<h2>Tu es connecté·e</h2><p class="muted">${esc(account.email)}</p><a class="btn" href="#/profil">Mon profil</a></div></section>`;
  const signup = mode === "inscription";
  const cards = state.cards.length, xp = Object.values(state.langs).reduce((a, L) => a + L.xp, 0);
  return `<section class="view lesson-shell">
    <div class="auth-head">${mochi("small")}<div><h1>${signup ? "Créer un compte" : "Content de te revoir !"}</h1>
      <p class="muted">${signup ? "Sauvegarde ta progression et retrouve-la partout." : "Connecte-toi pour retrouver ta progression."}</p></div></div>
    <form class="card form" data-form="${signup ? "signup" : "login"}">
      ${signup ? `<label>Prénom<input class="input" name="name" maxlength="40" autocomplete="nickname" value="${esc(state.name)}" placeholder="Comment t'appelles-tu ?" /></label>` : ""}
      <label>E-mail<input class="input" type="email" name="email" autocomplete="email" required /></label>
      <label>Mot de passe<input class="input" type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" ${signup ? 'minlength="8"' : ""} required />
        ${signup ? `<small class="muted">8 caractères minimum.</small>` : ""}</label>
      ${signup ? `<label class="row consent"><input type="checkbox" name="accept" required /> <span>J'accepte les <a class="lnk" href="#/legal/cgu" target="_blank">conditions d'utilisation</a> et la <a class="lnk" href="#/legal/confidentialite" target="_blank">politique de confidentialité</a>, et j'ai au moins 15 ans (sinon, l'accord d'un parent).</span></label>` : ""}
      <p class="form-err" hidden></p>
      <button class="btn">${signup ? "Créer mon compte" : "Se connecter"}</button>
      ${signup && (cards || xp) ? `<p class="muted center"><small>✨ Ta progression actuelle (${plural(cards, "carte", "cartes")}, ${xp} XP) sera rattachée à ton compte.</small></p>` : ""}
    </form>
    <p class="center muted">${signup ? `Déjà un compte ? <a class="lnk" href="#/connexion">Se connecter</a>` : `<a class="lnk" href="#/mot-de-passe-oublie">Mot de passe oublié ?</a> · Pas encore de compte ? <a class="lnk" href="#/inscription">Créer un compte</a>`}</p>
  </section>`;
}

// ---------- Tableau de bord admin ----------
// Contenu : calculé ici depuis content.js & co. Comptes et usage : GET /api/admin/stats.
function contentStats() {
  const sentences = (l) => TEXTS[l].reduce((a, t) => a + t.parsed.length, 0);
  return Object.keys(LANGUAGES).map((l) => ({
    lang: l,
    rows: [
      ["📖 Textes", TEXTS[l].length, `${sentences(l)} phrases`],
      ["📚 Livres gradués", BOOKS[l].length, `${BOOKS[l].reduce((a, b) => a + b.chapters.length, 0)} chapitres`],
      ["📒 Mots du lexique", Object.keys(LEXICON[l]).length, `${Object.keys(SEMANTIC_GROUPS[l] || {}).length} catégories, ${(CONFUSABLE[l] || []).length} paires de contraires`],
      ["💬 Exercices de production", PRODUCTION[l].length, `${(FREE_PROMPTS[l] || []).length} sujets libres`],
      ["🎧 Paires de sons", EAR[l].pairs.length, ""],
      ["🎯 Types d'exercices", Object.keys(EX_KINDS).length, "communs aux deux langues"],
      ...(l === "ko" ? [["🔤 Jours de Hangul", HANGUL_DAYS.length, ""], ["🧱 Points de grammaire", KO_GRAMMAR.length, `${Object.keys(REGISTERS).length} registres`], ["🧭 Test de niveau", KO_LOANS.length, "mots d'emprunt"]]
        : [["🎭 Faux amis", FAUX_AMIS.length, ""], ["🧭 Test de niveau", EN_BANDS.length * EN_BANDS[0].length, `${EN_BANDS.length} tranches + ${EN_FAKE.length} faux mots`]]),
    ],
  }));
}
// Bloc « Machine » (lot 8.5) : le serveur qui héberge Mochi, réservé aux admins
function machineCard(m) {
  if (!m) return "";
  const s = (ms) => (ms == null ? "" : `${num1(ms / 1000)} s`);
  const gb = (b) => `${num1(b / 1024 ** 3)} Go`;
  const eng = (x, name, what = "pour une phrase courte") => !x ? `<tr><th scope="row">${name}</th><td>—</td><td class="muted">non configuré</td></tr>`
    : `<tr><th scope="row">${name}</th><td>${x.ok ? "✅" : "❌"}</td><td class="muted">${x.ok ? `${s(x.ms)} ${what}` : esc(x.error || "ne répond pas")}</td></tr>`;
  const left = m.cache.reduce((n, c) => n + c.total - c.cached, 0);
  return `<h2 class="section-title">Machine</h2>
    <div class="card"><table class="admin-table"><tbody>
      <tr><th scope="row">Profil</th><td><b>${esc(m.profile || "…")}</b></td><td class="muted">${esc(m.label || "détection en cours")}</td></tr>
      <tr><th scope="row">Carte graphique</th><td>${m.gpus.length ? "✅" : "—"}</td><td class="muted">${m.gpus.map((g) => `${esc(g.name)} · ${num1(g.memUsedMB / 1024)} / ${num1(g.memTotalMB / 1024)} Go utilisés`).join(" | ") || "aucune carte NVIDIA détectée"}</td></tr>
      <tr><th scope="row">Mémoire vive</th><td></td><td class="muted">${m.ram ? `${gb(m.ram.total - m.ram.free)} / ${gb(m.ram.total)} utilisés` : ""}${m.cpu ? ` · ${esc(m.cpu.model)} (${m.cpu.cores} cœurs)` : ""}</td></tr>
      ${Object.keys(m.engines.tts).length ? Object.entries(m.engines.tts).map(([l, x]) => eng(x, `Voix ${LANGUAGES[l]?.flag || l}`)).join("") : eng(null, "Voix du serveur")}
      ${m.engines.llm ? eng(m.engines.llm, "Ollama", "pour charger le modèle au démarrage") : ""}
      ${m.engines.ttsSlow || m.engines.llmSlow ? `<tr><th scope="row">Adaptation</th><td>⚠️</td><td class="muted">${[m.engines.ttsSlow && "voix lentes : préchargement coupé, repli sur la voix de l'appareil après 3 s", m.engines.llmSlow && "correcteur lent : les élèves sont prévenus"].filter(Boolean).join(" · ")}</td></tr>` : ""}
    </tbody></table>
    ${m.cache.length ? `<h3 class="mt-16">Audio pré-généré</h3><table class="admin-table"><tbody>${m.cache.map((c) => `<tr><th scope="row">${LANGUAGES[c.lang]?.flag || c.lang} ${esc(c.voice)}</th><td>${num0(c.cached)} / ${num0(c.total)}</td><td class="muted">${c.total - c.cached ? `${num0(c.total - c.cached)} à pré-générer` : "complet ✓"}</td></tr>`).join("")}</tbody></table>
      ${left ? `<p class="muted"><small>Sur le serveur : <code>npm run tts:pregen</code></small></p>` : ""}` : ""}
    ${m.warnings.length ? `<ul class="mt-12">${m.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
    <p class="mt-12"><button class="btn ghost small" data-act="admin-doctor">🩺 Relancer le diagnostic</button>${m.at ? ` <small class="muted">dernier : ${new Date(m.at).toLocaleString("fr-FR")}</small>` : ""}</p></div>`;
}
// Bêta : entonnoir, rétention, abandons (agrégés, anonymes ; admins exclus)
function betaCard(b) {
  const S = b.steps, base = Math.max(S.signup, 1);
  const rows = [["Inscription", S.signup, S.signup], ["Langue choisie", S.lang, S.signup], ["Premier texte lu", S.read, S.signup], ["Première révision", S.review, S.signup],
    ["Revenu le lendemain", S.d1, b.elig.d1], ["Revenu à J+7 ou plus", S.d7, b.elig.d7]];
  const pctOf = (a, n) => (n ? Math.round((a / n) * 100) : 0);
  const D = b.drop, dTot = D.before_read + D.after_read + D.after_review + D.complete;
  return `<h2 class="section-title">Bêta : entonnoir et rétention</h2>
    <div class="card"><table class="admin-table"><tbody>${rows.map(([n, v, of]) => `<tr><th scope="row">${n}</th><td><div class="cov"><div class="bar"><span data-bar-w="${pctOf(v, base)}"></span></div><b>${v}</b></div></td><td class="muted">${of ? `${pctOf(v, of)} %${of !== S.signup ? ` des ${of} inscrits depuis assez longtemps` : ""}` : "—"}</td></tr>`).join("")}</tbody></table>
      ${Object.keys(b.retention).length ? `<h3 class="mt-16">Rétention par langue</h3><table class="admin-table"><tbody>${Object.entries(b.retention).map(([l, r]) => `<tr><th scope="row">${LANGUAGES[l]?.flag || ""} ${LANGUAGES[l]?.name || l}</th><td>J1 : ${r.d1[1] ? `${pctOf(...r.d1)} % (${r.d1[0]}/${r.d1[1]})` : "—"}</td><td>J7 : ${r.d7[1] ? `${pctOf(...r.d7)} % (${r.d7[0]}/${r.d7[1]})` : "—"}</td></tr>`).join("")}</tbody></table>` : ""}
      ${dTot ? `<h3 class="mt-16">Où s'arrêtent les séances (${plural(dTot, "jour actif", "jours actifs")})</h3><table class="admin-table"><tbody>
        <tr><th scope="row">Avant de lire</th><td>${pctOf(D.before_read, dTot)} %</td></tr><tr><th scope="row">Après la lecture</th><td>${pctOf(D.after_read, dTot)} %</td></tr>
        <tr><th scope="row">Après les révisions</th><td>${pctOf(D.after_review, dTot)} %</td></tr><tr><th scope="row">Jusqu'à la production</th><td>${pctOf(D.complete, dTot)} %</td></tr></tbody></table>` : ""}
      <p class="muted m-0"><small>Chiffres agrégés, sans nom. Les comptes admin ne sont pas comptés.</small></p></div>`;
}
function viewAdmin() {
  if (!isAdmin()) return viewNotFound();
  const A = ui.admin;
  if (!A) {
    ui.admin = { loading: true };
    api("GET", "/api/admin/stats").then((d) => { ui.admin = { d }; }).catch((e) => { ui.admin = { err: e.message }; }).finally(() => { if (location.hash === "#/admin") render(); });
  }
  const d = ui.admin.d, fmtDate = (x) => (x ? new Date(x).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" }) : "—");
  const kb = (b) => (b > 1e6 ? `${num1(b / 1e6)} Mo` : `${Math.round(b / 1e3)} Ko`);
  const stat = (ico, n, label) => `<div class="stat"><span class="ico">${ico}</span><div><b>${n}</b><small>${label}</small></div></div>`;
  const features = d ? [
    ["Correcteur IA (Produire)", d.llm.engine ? `✅ ${esc(d.llm.engine)}` : "❌ désactivé", d.llm.engine ? `Aujourd'hui : ${d.llm.today} / ${plural(d.llm.globalDaily, "appel", "appels")} à l'IA, ${plural(d.llm.cacheHits, "servie", "servies")} depuis le cache (${Math.round(d.llm.hitRate * 100)} %), coût estimé ${d.llm.cost.toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 2 })} · ${plural(d.llm.total, "appel", "appels")} au total · ${d.llm.daily} max / compte / jour · ${plural(d.llm.cacheSize, "réponse", "réponses")} en cache` : ""],
    ["Vraies voix", Object.keys(d.tts.voices).length ? `✅ ${Object.entries(d.tts.voices).map(([l, v]) => `${LANGUAGES[l].flag} ×${v.length}`).join(" ")}` : "🔈 navigateur", `${plural(d.tts.files, "phrase", "phrases")} en cache (${kb(d.tts.bytes)})`],
    ["E-mails", d.mail === "resend" ? "✅ Resend" : "🖥️ terminal (pas d'envoi)", d.mail === "resend" ? "" : "RESEND_API_KEY absent"],
    ["Appli installable / hors ligne", "serviceWorker" in (globalThis.navigator || {}) ? "✅" : "❌ navigateur non compatible", ""],
    ["FSRS (révisions espacées)", HAS_FSRS ? "✅ ts-fsrs 5.2.3" : "⚠️ non chargé", ""],
  ] : [];
  return `<section class="view">
    <h1>🛠️ Tableau de bord</h1>
    <p class="muted">Visible seulement par les admins. Toutes les leçons sont ouvertes pour toi, sans prérequis.</p>

    <h2 class="section-title">Comptes et usage</h2>
    ${ui.admin.err ? `<div class="card"><p class="form-err">${esc(ui.admin.err)}</p></div>` : !d ? `<div class="card"><p class="muted">Chargement…</p></div>` : `
    <div class="card"><div class="stat-grid admin-grid">
      ${stat("👥", d.users.total, "comptes")}${stat("✉️", d.users.verified, "adresses confirmées")}
      ${stat("🆕", `${d.users.new7} / ${d.users.new30}`, "nouveaux (7 j / 30 j)")}${stat("🔥", d.users.active7, "actifs sur 7 jours")}
      ${stat("🃏", d.cards.reduce((a, x) => a + x.n, 0), d.cards.map((x) => `${LANGUAGES[x.lang]?.flag || "?"} ${x.n}`).join(" · ") || "cartes")}${stat("🧠", d.reviews.total, "révisions enregistrées")}
    </div></div>

    <h2 class="section-title">Fonctionnalités</h2>
    <div class="card"><table class="admin-table"><tbody>${features.map(([n, st, info]) => `<tr><th scope="row">${n}</th><td>${st}</td><td class="muted">${info}</td></tr>`).join("")}</tbody></table></div>
    ${machineCard(d.machine)}
    ${d.beta ? betaCard(d.beta) : ""}
    ${d.feedback ? `<h2 class="section-title">Retours des testeurs (${d.feedback.total})</h2>
    <div class="card">${d.feedback.to ? "" : `<p class="muted"><small>FEEDBACK_TO absent de .env : les retours sont seulement enregistrés, pas envoyés par e-mail.</small></p>`}
      ${d.feedback.last.length ? `<table class="admin-table"><tbody>${d.feedback.last.map((f) => `<tr><th scope="row">${String(f.kind).split(",").map((k) => ({ avis: "💬", bug: "🐞", idee: "💡", contenu: "📖" })[k] || "💬").join("")} ${fmtDate(f.created_at)}${f.rating ? ` · ${"★".repeat(f.rating)}` : ""}</th>
        <td>${esc(f.message.length > 160 ? `${f.message.slice(0, 160)}…` : f.message)}${f.page ? `<br/><small class="muted">${esc(f.page)}</small>` : ""}</td>
        <td class="muted">${f.mailed ? "✉️ envoyé" : f.mail_error ? `⚠️ ${esc(f.mail_error)}` : "—"}</td></tr>`).join("")}</tbody></table>` : `<p class="muted m-0">Aucun retour pour l'instant.</p>`}</div>` : ""}`}

    <h2 class="section-title">Contenu</h2>
    <p><a class="btn small" href="#/admin/contenu">📝 Relire et publier le contenu</a> <a class="btn ghost small" href="#/admin/contenu/couverture">📊 Couverture</a></p>
    <div class="lang-grid">${contentStats().map((c) => `<div class="card"><h3>${LANGUAGES[c.lang].flag} ${LANGUAGES[c.lang].name}</h3>
      <table class="admin-table"><tbody>${c.rows.map(([n, v, info]) => `<tr><th scope="row">${n}</th><td><b>${v}</b></td><td class="muted">${info}</td></tr>`).join("")}</tbody></table></div>`).join("")}</div>

    <h2 class="section-title">Accès direct aux leçons</h2>
    <div class="card admin-links">
      <p><b>🇰🇷 Hangul</b> ${HANGUL_DAYS.map((x, i) => `<a class="chip" href="#/lang/ko/hangul/${i + 1}">J${i + 1}</a>`).join("")}</p>
      <p><b>🇰🇷 Grammaire</b> ${KO_GRAMMAR.map((g, i) => `<a class="chip ko" href="#/lang/ko/grammaire/${g.id}">${i + 1}. ${esc(g.title)}</a>`).join("")}</p>
      ${Object.keys(LANGUAGES).map((l) => `<p><b>${LANGUAGES[l].flag} Livres</b> ${BOOKS[l].map((b) => `<a class="chip" href="#/lang/${l}/livre/${b.id}">${b.icon} ${esc(b.title)}</a>`).join("")}</p>`).join("")}
      ${Object.keys(LANGUAGES).map((l) => `<p><b>${LANGUAGES[l].flag} Textes</b> ${TEXTS[l].map((t) => `<a class="chip" href="#/lang/${l}/lire/${t.id}">${esc(t.title)}</a>`).join("")}</p>`).join("")}
      <p><b>Onglets</b> ${Object.keys(LANGUAGES).flatMap((l) => TABS[l].map(([k, n]) => `<a class="chip" href="#/lang/${l}/${k}">${LANGUAGES[l].flag} ${n}</a>`)).join("")}</p>
    </div>

    ${d ? `<h2 class="section-title">Comptes (${d.list.length}${d.list.length === 100 ? "+" : ""})</h2>
    <div class="card table-scroll"><table class="admin-table users"><thead><tr><th>E-mail</th><th>Prénom</th><th>Inscrit</th><th>Dernière connexion</th><th>Cartes</th><th>Révisions</th></tr></thead><tbody>
      ${d.list.map((u) => `<tr><td>${esc(u.email)} ${u.admin ? "🛠️" : ""} ${u.verified ? "" : `<span title="adresse non confirmée">✉️?</span>`}</td><td>${esc(u.name)}</td><td>${fmtDate(u.created_at)}</td><td>${fmtDate(u.last_login_at)}</td><td>${u.cards}</td><td>${u.reviews}</td></tr>`).join("")}
    </tbody></table></div>` : ""}
    <p class="mt-20"><button class="btn ghost small" data-act="admin-refresh">↻ Actualiser</button></p>
  </section>`;
}

// ---------- Mot de passe oublié et vérification de l'adresse (ROADMAP P0) ----------
function viewForgot() {
  if (!serverOn) return viewAuth("connexion");
  const sent = ui.forgotSent;
  return `<section class="view lesson-shell">
    <div class="auth-head">${mochi("small", sent ? "happy" : "thinking")}<div><h1>Mot de passe oublié</h1>
      <p class="muted">On t'envoie un lien pour en choisir un nouveau.</p></div></div>
    ${sent ? `<div class="card"><p><b>C'est parti !</b> Si un compte existe pour <b>${esc(sent)}</b>, un e-mail vient d'y être envoyé.</p>
      <p class="muted">Le lien marche une seule fois, pendant 30 minutes. Pense à regarder dans les indésirables.</p>
      <button class="mini" data-act="forgot-again">Utiliser une autre adresse</button></div>`
    : `<form class="card form" data-form="forgot">
      <label>E-mail du compte<input class="input" type="email" name="email" autocomplete="email" required /></label>
      <p class="form-err" hidden></p>
      <button class="btn">Envoyer le lien</button>
    </form>`}
    <p class="center muted"><a class="lnk" href="#/connexion">Retour à la connexion</a></p>
  </section>`;
}
function viewReset(token) {
  if (!serverOn) return viewAuth("connexion");
  return `<section class="view lesson-shell">
    <div class="auth-head">${mochi("small")}<div><h1>Nouveau mot de passe</h1>
      <p class="muted">Tes autres appareils seront déconnectés.</p></div></div>
    <form class="card form" data-form="reset">
      <input type="hidden" name="token" value="${esc(token)}" />
      <label>Nouveau mot de passe<input class="input" type="password" name="password" autocomplete="new-password" minlength="8" required />
        <small class="muted">8 caractères minimum.</small></label>
      <label>Confirme-le<input class="input" type="password" name="confirm" autocomplete="new-password" minlength="8" required /></label>
      <p class="form-err" hidden></p>
      <button class="btn">Enregistrer et me connecter</button>
    </form>
  </section>`;
}
function viewVerify(token) {
  const V = ui.verify;
  if (!V || V.token !== token) {
    ui.verify = { token, status: "pending" };
    api("POST", "/api/email/verify", { token })
      .then(() => { ui.verify.status = "ok"; if (account) account.email_verified = true; })
      .catch((e) => { ui.verify.status = "err"; ui.verify.msg = e.message; })
      .finally(() => { history.replaceState?.(null, "", "#/verifier/ok"); ui.verify.token = "ok"; render(); });
  }
  const st = ui.verify.status;
  return `<section class="view lesson-shell"><div class="card empty">
    ${mochi("small", st === "ok" ? "proud" : st === "err" ? "surprised" : "thinking")}
    <h2>${st === "ok" ? "Adresse confirmée !" : st === "err" ? "Lien expiré" : "Vérification…"}</h2>
    <p class="muted">${st === "ok" ? "Merci. Tu pourras récupérer ton compte si tu oublies ton mot de passe." : st === "err" ? esc(ui.verify.msg) : ""}</p>
    ${st !== "pending" ? `<a class="btn" href="${account ? "#/profil" : "#/connexion"}">${account ? "Mon profil" : "Se connecter"}</a>` : ""}
  </div></section>`;
}
const verifyBanner = () => account && !account.email_verified
  ? `<div class="card verify-banner" role="status"><span aria-hidden="true">✉️</span><p><b>Confirme ton adresse e-mail.</b> On t'a envoyé un lien à ${esc(account.email)}. Sans ça, impossible de récupérer ton compte si tu oublies ton mot de passe.</p><button class="mini" data-act="resend-verify">Renvoyer l'e-mail</button></div>` : "";

// ---------- Page publique « Pourquoi ça marche » (§10, §11) ----------
const SOURCES = [
  ["Méta-analyse sur la pratique de rappel espacée (29 études, g = 0,74)", "https://ifp.nyu.edu/?p=1511228"],
  ["Kim & Webb (2022), méta-analyse de l'effet d'espacement en L2, cité dans Serrano et al.", "https://pressto.amu.edu.pl/index.php/ssllt/article/download/35602/30649/76142"],
  ["FSRS : documentation Anki, présentation et code", "https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm", [["présentation", "https://concepts.dsebastien.net/concept/fsrs/"], ["code", "https://github.com/open-spaced-repetition"]]],
  ["Nation, I.S.P. (2006). How Large a Vocabulary Is Needed for Reading and Listening? Canadian Modern Language Review, 63(1)", "https://openaccess.wgtn.ac.nz/articles/journal_contribution/How_large_a_vocabulary_is_needed_for_reading_and_listening_/12552221/1"],
  ["Revue sur la couverture lexicale (95 % vs 98 %, besoins par type de contenu)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC8907927"],
  ["Conti, G. (2025). Pourquoi l'input doit être compréhensible à 95–98 %", "https://gianfrancoconti.com/2025/02/27/"],
  ["Li, S. (2010). The effectiveness of corrective feedback in SLA: A meta-analysis. Language Learning, 60(2), 309–365", "https://peeref.com/works/63503189"],
  ["Nguyen & Doan (2025). Beyond comprehensible input: a neuro-ecological critique of Krashen's hypothesis. Frontiers in Psychology", "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1636777/pdf"],
  ["González-Fernández & de la Viña (2025). The effectiveness of app-based and classroom-based instruction on L2 learning and motivation. Language Learning & Technology", "https://www.lltjournal.org/item-detail/1221/"],
  ["Whitworth (2024). Shadowing for pronunciation: a systematic review. Université d'Oxford", "https://ora.ox.ac.uk/objects/uuid:3104cae1-3a6b-400a-b173-de44384238d2"],
  ["Korea Times : classement FSI du coréen", "https://www.koreatimes.co.kr/www/nation/2023/11/113_240261.html"],
  ["Estimation des heures par niveau en coréen", "https://noun.town/blog/how-long-does-it-take-to-learn-korean/"],
  ["Coréen pour débutants (Hangul d'abord, 해요체, particules)", "https://www.languagebird.com/?p=12852"],
  ["Le « mur après le Hangul »", "https://www.hellotalk.com/en/blog/after-hangul-gap-in-korean-resources"],
  ["Niveaux de langue et honorifiques en coréen : Korea Herald", "https://www.koreaherald.com/article/3211101"],
  ["Revue critique des études internes de Duolingo", "https://callej.org/index.php/journal/article/download/419/347/1013"],
  ["Tinkham, T. (1997). The effects of semantic and thematic clustering on the learning of second language vocabulary. Second Language Research, 13(2), 138–163", "https://synapsesocial.com/papers/W2038339147"],
  ["Tinkham, T. (1994). Thèse sur le regroupement sémantique et thématique", "https://ideals.illinois.edu/items/19069"],
  ["Nakata, T. & Suzuki, Y. (2019). Effects of massing and spacing on the learning of semantically related and unrelated words. Studies in Second Language Acquisition", "https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/F58BA8D70385603B9C42E408BFCB8A10/S0272263118000219a.pdf/effects-of-massing-and-spacing-on-the-learning-of-semantically-related-and-unrelated-words.pdf"],
  ["Pan, S. C. et al. (2019). The synergistic benefits of systematic and random interleaving for second language grammar learning. JARMAC", "https://sc-pan.github.io/pdf/PLPR_2019.pdf"],
  ["Pan, S. C. et al. (2024). Interleaved practice enhances grammar skill learning for similar and dissimilar tenses in Romance languages", "https://sc-pan.github.io/pdf/PRKL_2024.pdf"],
  ["Uchihara, T., Karas, M. & Thomson, R. I. High variability phonetic training (HVPT): A meta-analysis of L2 perceptual training studies. Studies in Second Language Acquisition", "https://resolve.cambridge.org/core/journals/studies-in-second-language-acquisition/article/high-variability-phonetic-training-hvpt-a-metaanalysis-of-l2-perceptual-training-studies/6ABB8C1F32D88D53EA8D05A4565E76F6/core-reader", [["perception → production (2024)", "https://www.cambridge.org/core/product/E38D8F5CE65DC708137B0E95F97C6BC7"]]],
  ["Liu, J. & Zhang, J. (2018). The Effects of Extensive Reading on English Vocabulary Learning: A Meta-analysis. English Language Teaching, 11(6)", "https://econpapers.repec.org/RePEc:ibn:eltjnl:v:11:y:2018:i:6:p:1"],
  ["Jeon, E.-Y. & Day, R. R. (2016). The effectiveness of ER on reading proficiency: A meta-analysis. Reading in a Foreign Language", "https://scholarspace.manoa.hawaii.edu/server/api/core/bitstreams/eebea128-afb4-47cd-8a16-453a7eff6ca1/content"],
  ["Étude sur l'apprentissage du vocabulaire en lisant et écoutant 10 lectures graduées", "https://core.ac.uk/download/215386265.pdf"],
  ["Lee, J.-Y. & Baek, M. (2023). Effects of Gamification on Students' English Language Proficiency: A Meta-Analysis on Research in South Korea. Sustainability, 15(14)", "https://mdpi.com/2071-1050/15/14/11325"],
  ["Étude sur les effets de la gamification de Duolingo sous l'angle de l'autodétermination (2026)", "https://jst-ud.vn/jst-ud/article/download/10685/6973/33542"],
  ["Duolingo, tests A/B sur les séries", "https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals", [["analyse critique", "https://uxmag.com/?p=20707"]]],
  ["Lally, P. et al. (2009/2010), formation des habitudes (UCL)", "https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit", [["résumé (jours manqués)", "https://jamesclear.com/new-habit"]]],
];
const WHY = [
  ["🧠", "On révise au bon moment, pas en boucle.", "Revoir une notion à intervalles espacés, en essayant de s'en souvenir avant de voir la réponse, est bien plus efficace que de la répéter d'affilée. Une méta-analyse de 29 études trouve un effet fort en faveur de cette méthode. On utilise FSRS, un algorithme open source qui apprend ton rythme d'oubli et planifie tes révisions juste avant que tu oublies.", [1, 2, 3]],
  ["📖", "Tu lis et écoutes des contenus que tu comprends presque entièrement.", "Pour apprendre en lisant ou en écoutant, il faut comprendre la grande majorité des mots (environ 95 %). Trop de mots inconnus et on décroche ; pas assez et on n'apprend rien de neuf. Le site calcule, pour chaque texte, quel pourcentage de mots tu connais déjà, et te propose ceux qui tombent dans la bonne zone.", [4, 5, 6]],
  ["💬", "Tu pratiques, et on te corrige intelligemment.", "Comprendre ne suffit pas : produire des phrases et recevoir un retour fait progresser. Les études montrent que reformuler correctement ta phrase est particulièrement efficace sur la durée. C'est ce que fait le site après chaque exercice d'écriture.", [7, 8]],
  ["🎧", "On travaille vraiment l'oreille.", "Les applis de langues aident bien pour le vocabulaire et la grammaire, mais moins pour l'écoute. C'est pour ça que tout le contenu a de l'audio, et qu'on propose le shadowing (répéter en même temps que le locuteur), qui améliore le rythme et l'intonation.", [9, 10]],
  ["🇰🇷", "Le coréen, dans le bon ordre.", "Le coréen demande du temps (environ 2 200 heures de cours selon l'institut de formation des diplomates américains pour un niveau professionnel). Mais son alphabet est l'un des plus simples au monde : la plupart des gens le lisent en une semaine environ. On commence donc par là, sans romanisation, puis on enchaîne avec le registre poli le plus utile au quotidien, et on t'accompagne dans la phase la plus difficile : particules, terminaisons et niveaux de politesse.", [11, 12, 13, 14]],
  ["🧩", "Les mots qui se ressemblent, étalés dans le temps.", "Apprendre d'un coup des mots très proches (tous les fruits, gauche et droite) crée de la confusion. Regrouper des mots qui vont ensemble dans une même scène (au café : commander, chaud, à emporter) aide au contraire. Mochi n'introduit donc jamais le même jour deux mots de la même catégorie, ni deux contraires.", [17, 18, 19]],
  ["🔀", "On mélange les exercices, et on écoute plusieurs voix.", "Alterner plusieurs points de grammaire dans une même séance aide à apprendre à choisir la bonne forme. Et entendre un même son prononcé par plusieurs voix entraîne efficacement l'oreille : c'est aujourd'hui considéré comme la méthode d'entraînement de la perception la mieux étayée par la recherche.", [20, 21, 22]],
  ["🍡", "Une motivation honnête.", "Les éléments de jeu aident à apprendre, à condition de récompenser les vrais progrès. Et rater un jour n'empêche pas une habitude de se former : chez Mochi, ta série est hebdomadaire, avec des jours de repos, et la mascotte n'est jamais triste à cause de toi.", [26, 27, 28, 29]],
  ["🎯", "Des objectifs honnêtes.", "On te montre tes heures d'apprentissage et le nombre de mots que tu connais, pas seulement une série de jours. Tu sais où tu en es, et ce qu'il reste.", [5, 12]],
];
function viewWhy() {
  return `<section class="view why-page">
    <h1>Pourquoi notre méthode fonctionne</h1>
    <p class="lead">On n'a rien inventé : le site applique ce que la recherche en apprentissage des langues et en sciences cognitives a montré de plus solide. Voici les principes, et d'où ils viennent.</p>
    ${WHY.map(([ico, t, d, refs], i) => `
      <article class="card why-item">
        <div class="ico">${ico}</div>
        <div><h2>${i + 1}. ${t}</h2><p>${d}</p>
        <p class="refs">Sources : ${refs.map((n) => `<a href="#src-${n}" data-act="jump" data-n="${n}">[${n}]</a>`).join(" ")}</p></div>
      </article>`).join("")}
    <h2 class="section-title">Sources</h2>
    <ol class="sources">${SOURCES.map(([t, url, more], i) => `<li id="src-${i + 1}">${esc(t)} : <a href="${url}" target="_blank" rel="noopener">lien</a>${(more || []).map(([l, u]) => ` · <a href="${u}" target="_blank" rel="noopener">${l}</a>`).join("")}</li>`).join("")}</ol>
  </section>`;
}

function viewNotFound() {
  return `<section class="view card empty">${mochi("", "curious")}<h2>Oups, page introuvable</h2>
    <p class="muted">Mochi s'est perdu…</p><a class="btn" href="#/">Retour à l'accueil</a></section>`;
}
