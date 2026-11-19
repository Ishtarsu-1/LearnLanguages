// ============================================================
//  Mochi — friends.js : amis et défis entre amis (ROADMAP P2)
//  #/amis              mes défis, mes amis, demandes, ajouter un ami, lien d'invitation
//  #/amis/defi[/<id>]  lancer un défi (avec un ami présélectionné)
//  #/ami/<code>        lien d'invitation reçu
//  La progression des défis vient du serveur (calculée depuis les données synchronisées).
//  Règle d'or (§8, §16) : coopératif d'abord, jamais d'XP à gagner, aucun message culpabilisant.
//  Script classique chargé dans l'ordre par index.html.
// ============================================================
const INVITE_KEY = "mochi-invite";
const flagOf = (l) => LANGUAGES[l]?.flag || "🌍";
const socialAvatar = (p) => (p.avatar_url ? `<img class="avatar-img friend-av" src="${esc(p.avatar_url)}" alt="" />` : `<span class="friend-av">${avatarGlyph(p.avatar || "mochi")}</span>`);

// Données : chargées à la demande, gardées 60 s (actions → rechargement)
function socialData(force) {
  if (!account) return null;
  const S = ui.social;
  if (!force && S && (S.loading || Date.now() - S.at < 60e3)) return S;
  ui.social = { ...(S || {}), loading: true, at: Date.now() };
  api("GET", "/api/friends").then((d) => { ui.social = { d, at: Date.now() }; if (account) account.social_pending = d.pending; })
    .catch((e) => { ui.social = { err: e.message, at: Date.now() }; })
    .finally(() => { if (/^#\/(amis|lang\/|profil)/.test(location.hash)) render(); });
  return ui.social;
}
async function socialPost(url, body, okMsg) {
  try { const r = await api("POST", url, body || {}); if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg); socialData(true); return r; }
  catch (e) { toast(e.message); return null; } finally { render(); }
}

// ---------- Un défi ----------
function challengeCard(c, { compact = false } = {}) {
  const who = (p) => `${esc(p.name)}${p.me ? " (toi)" : ""}`;
  let body = "";
  if (c.mode === "coop") {
    const pct = Math.min(100, Math.round((c.progress.value / c.progress.target) * 100));
    body = `<div class="cov"><div class="bar"><span data-bar-w="${pct}"></span></div><b>${num0(c.progress.value)} / ${num0(c.progress.target)}</b></div>
      ${compact ? "" : `<p class="muted m-0"><small>${c.people.map((p) => `${who(p)} : ${num0(p.value)}`).join(" · ")}</small></p>`}`;
  } else if (c.mode === "each") {
    const n = c.progress.perPerson;
    body = `<ul class="ch-people">${c.people.map((p) => `<li>${p.value >= n ? "✅" : "⏳"} ${who(p)} <span class="muted">· ${c.type === "chapter" ? (p.value ? "lu et compris" : "pas encore") : `${num0(p.value)} / ${n}`}</span></li>`).join("")}</ul>`;
  } else {
    body = `<ul class="ch-people">${c.people.map((p) => `<li>${c.progress.leaders.includes(p.id) ? "👑" : "🌱"} ${who(p)} <span class="muted">· ${plural(num0(p.value), "mot solide", "mots solides")}</span></li>`).join("")}</ul>`;
  }
  const status = c.state === "success" ? `<span class="zone ideal">Réussi 🎉</span>`
    : c.state === "finished" ? `<span class="zone">Terminé</span>`
    : `<span class="zone">${c.daysLeft} jour${c.daysLeft > 1 ? "s" : ""}</span>`;
  const end = c.state === "finished" ? (c.mode === "duel"
      ? (c.progress.leaders.length === 1 ? `<p class="m-0"><small>${esc(c.people.find((p) => p.id === c.progress.leaders[0])?.name || "")} a gagné le plus de mots solides. Bravo à vous deux pour ce que vous avez appris !</small></p>` : `<p class="m-0"><small>Égalité ! Beau travail à deux.</small></p>`)
      : `<p class="m-0"><small>Pas tout à fait l'objectif cette fois, mais chaque minute compte. On en relance un ? 🍡</small></p>`)
    : c.state === "success" ? `<p class="m-0"><small>Objectif atteint ensemble. Bravo ! 🍡</small></p>` : "";
  const what = c.type === "chapter" ? `${esc(c.refTitle)}` : c.mode === "coop" ? `${num0(c.target)} ${c.unit} à plusieurs` : c.mode === "each" ? `${c.progress.perPerson} ${c.unit} chacun` : `le plus de ${c.unit}`;
  return `<div class="card challenge ${c.state}">
    <div class="ch-head"><span class="ch-icon">${c.icon}</span><div class="grow"><b>${esc(c.title)}</b> <small class="muted">· ${c.lang ? flagOf(c.lang) : "🌍"} · ${c.mode === "duel" ? "duel" : c.mode === "coop" ? "ensemble" : "chacun"}</small><br/>
      <small class="muted">${what} · ${c.days} jours (${new Date(`${c.start}T12:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} → ${new Date(`${c.end}T12:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })})</small></div>${status}</div>
    ${body}${end}
    ${c.invited.length && !compact ? `<p class="muted m-0"><small>En attente : ${c.invited.map((p) => esc(p.name)).join(", ")}</small></p>` : ""}
    ${c.state === "active" && c.myStatus === "joined" ? `<div class="wp-actions">${challengeGo(c)}${compact ? "" : `<button class="btn ghost small" data-act="ch-leave" data-id="${c.id}">Quitter le défi</button>`}</div>` : ""}
  </div>`;
}

// Accès direct à l'exercice du défi
function challengeGo(c) {
  const lang = c.lang || (LANGUAGES[state.lastLang] ? state.lastLang : "en");
  const [href, label] = c.type === "chapter" ? [`#/lang/${lang}/lire/${String(c.ref).replace(":", "-")}`, "📖 Lire le chapitre"]
    : c.type === "reviews" || c.type === "solid" ? [`#/lang/${lang}/revisions/go`, "🔁 Réviser maintenant"]
    : [`#/lang/${lang}/aujourdhui`, "☀️ Faire ma séance"];
  return `<a class="btn small" href="${href}">${label}</a>`;
}

// ---------- Page « Amis et défis » ----------
function viewFriends(sub, arg) {
  if (features.portable) return `<section class="view"><div class="card empty">${mochi("small", "curious")}<h2>Amis et défis</h2>
    <p class="muted">Cette version portable de Mochi tourne seule sur ton ordinateur : les amis, les défis et les duels ont besoin de la version en ligne. Tout le reste marche ici !</p>
    <a class="btn" href="#/">Retour à l'accueil</a></div></section>`;
  if (!account) return `<section class="view"><div class="card empty">${mochi("small", "curious")}<h2>Amis et défis</h2>
    <p class="muted">Crée un compte (gratuit) pour ajouter des amis et vous lancer des défis : semaine régulière, temps ensemble, mots solides…</p>
    <a class="btn" href="#/inscription">Créer mon compte</a> <a class="btn ghost" href="#/connexion">J'ai déjà un compte</a></div></section>`;
  const S = socialData();
  if (S?.err) return `<section class="view"><div class="card"><p class="form-err">${esc(S.err)}</p></div></section>`;
  if (!S?.d) return `<section class="view"><div class="card"><p class="muted">Chargement…</p></div></section>`;
  if (sub === "defi") return viewNewChallenge(S.d, arg);
  const d = S.d;
  if (!d.me.username) return `<section class="view lesson-shell"><div class="card">
      <div class="avis-head">${mochi("small", "happy")}<div><h1 class="m-0">Choisis ton pseudo</h1><p class="muted mt-4 mb-0 mx-0">C'est grâce à lui que tes amis te trouvent. Ton e-mail, lui, reste privé.</p></div></div>
      <div class="friend-add mt-16"><input id="fr-username" class="input" maxlength="20" placeholder="ex. lea_92" autocomplete="off" autocapitalize="none" spellcheck="false"/>
      <button class="btn" data-act="fr-username">Valider</button></div>
      <p class="muted"><small>3 à 20 caractères : lettres minuscules sans accent, chiffres ou _.</small></p></div></section>`;
  const link = `${location.origin}/#/ami/${d.me.invite}`;
  return `<section class="view">
    <h1>👥 Amis et défis</h1>
    <p class="muted">Ton pseudo : <b>@${esc(d.me.username)}</b></p>

    ${d.challengeInvites.length ? `<h2 class="section-title">Invitations à un défi</h2>${d.challengeInvites.map((c) => `${challengeCard(c, { compact: true })}
      <div class="wp-actions ch-answer"><button class="btn small" data-act="ch-answer" data-id="${c.id}" data-a="1">Je participe</button><button class="btn ghost small" data-act="ch-answer" data-id="${c.id}" data-a="0">Non merci</button></div>`).join("")}` : ""}

    <h2 class="section-title">Mes défis</h2>
    ${d.challenges.length ? d.challenges.map((c) => challengeCard(c)).join("") : `<div class="card"><p class="muted m-0">Aucun défi en cours. ${d.friends.length ? "Lance-en un avec tes amis !" : "Ajoute d'abord un ami."}</p></div>`}
    ${d.friends.length ? `<p><a class="btn" href="#/amis/defi">⚔️ Lancer un défi</a></p>` : ""}

    ${d.incoming.length ? `<h2 class="section-title">Demandes reçues</h2><div class="card"><ul class="friend-list">${d.incoming.map((u) => `<li>${socialAvatar(u)}<div class="grow"><b>${esc(u.name)}</b> <small class="muted">@${esc(u.username)}</small></div>
      <button class="btn small" data-act="fr-respond" data-id="${u.id}" data-a="1">Accepter</button><button class="btn ghost small" data-act="fr-respond" data-id="${u.id}" data-a="0">Refuser</button><button class="btn text" data-act="fr-block" data-id="${u.id}" title="Bloquer">🚫</button></li>`).join("")}</ul></div>` : ""}

    <h2 class="section-title">Mes amis (${d.friends.length})</h2>
    ${d.friends.length ? `<p class="muted"><small>⚡ <b>Duel en direct</b> : un mot s'affiche, le premier qui écrit sa traduction marque un point, premier à 5 gagne. Ton ami doit être sur Mochi en même temps.</small></p>` : ""}
    ${d.friends.length ? `<div class="friend-grid">${d.friends.map((f) => `<div class="card friend">
      <div class="friend-top">${socialAvatar(f)}<div class="grow"><b>${esc(f.name)}</b><br/><small class="muted">@${esc(f.username)}</small></div></div>
      ${f.stats ? `<p class="friend-stats"><span>⏱️ ${num1(f.stats.hours)} h</span>${f.stats.langs.map((l) => `<span>${flagOf(l)} ${num0(f.stats.solid[l])} mots solides</span>`).join("")}</p>` : `<p class="muted"><small>Préfère garder ses stats pour lui·elle.</small></p>`}
      <div class="wp-actions">${Object.keys(LANGUAGES).map((l) => `<button class="btn small duel-btn" data-act="duel-invite" data-id="${f.id}" data-lang="${l}" title="Duel en direct en ${LANGUAGES[l].name.toLowerCase()}">⚡ Duel ${LANGUAGES[l].flag}</button>`).join("")}<a class="btn ghost small" href="#/amis/defi/${f.id}">⚔️ Défi</a><button class="btn ghost small" data-act="fr-remove" data-id="${f.id}" data-n="${esc(f.name)}">Retirer</button><button class="btn text" data-act="fr-block" data-id="${f.id}" title="Bloquer">🚫</button></div>
    </div>`).join("")}</div>` : `<div class="card"><p class="muted m-0">Pas encore d'ami ici. Envoie ton lien d'invitation !</p></div>`}

    <h2 class="section-title">Ajouter un ami</h2>
    <div class="card">
      <p class="m-0"><b>Par son pseudo</b></p>
      <div class="friend-add"><input id="fr-request" class="input" maxlength="21" placeholder="@pseudo" autocomplete="off" autocapitalize="none" spellcheck="false"/><button class="btn" data-act="fr-request">Envoyer la demande</button></div>
      <p class="mt-16 mb-0 mx-0"><b>Ou avec ton lien d'invitation</b> <small class="muted">(celui qui l'ouvre devient ton ami directement)</small></p>
      <div class="friend-add"><input id="fr-link" class="input" readonly value="${esc(link)}"/><button class="btn" data-act="fr-copy">Copier</button></div>
      <p class="m-0"><button class="btn text" data-act="fr-reset">↻ Créer un nouveau lien (l'ancien ne marchera plus)</button></p>
    </div>
    ${d.outgoing.length ? `<p class="muted"><small>Demandes envoyées : ${d.outgoing.map((u) => `@${esc(u.username)}`).join(", ")}</small></p>` : ""}

    <h2 class="section-title">Confidentialité</h2>
    <div class="card">
      <label class="row"><input type="checkbox" data-act="fr-share" ${d.me.shareStats ? "checked" : ""}/> <span>Montrer mes heures et mes mots solides à mes amis</span></label>
      <p class="muted m-0"><small>Personne d'autre que tes amis ne voit ton profil. Ton e-mail n'est jamais montré.</small></p>
      ${d.blocked.length ? `<p class="mt-12 mb-0 mx-0"><small>Comptes bloqués : ${d.blocked.map((u) => `@${esc(u.username || u.name)} <button class="btn text" data-act="fr-unblock" data-id="${u.id}">débloquer</button>`).join(" · ")}</small></p>` : ""}
    </div>
  </section>`;
}

// ---------- Lancer un défi ----------
function viewNewChallenge(d, preFriend) {
  const N = (ui.newCh ||= { type: "regular", mode: "each", days: 7, lang: state.lastLang || "all", target: null, ref: "", friends: preFriend ? [Number(preFriend)] : [] });
  if (preFriend && !N.friends.length) N.friends = [Number(preFriend)];
  const T = d.types[N.type];
  if (!T.modes.includes(N.mode)) N.mode = T.modes[0];
  if (T.needLang && N.lang === "all") N.lang = state.lastLang || "en";
  if (N.mode === "coop" && !T.targets.includes(N.target)) N.target = T.targets[1] ?? T.targets[0];
  const chapters = T.needRef ? allBooks(N.lang).flatMap((b) => b.chapters.map((ch, i) => ({ ref: `${b.id}:${i + 1}`, title: `${b.title} · ${i + 1}. ${ch.title}` }))) : [];
  if (T.needRef && !chapters.some((c) => c.ref === N.ref)) N.ref = chapters[0]?.ref || "";
  const chip = (act, val, on, label) => `<button type="button" class="chip ${on ? "on" : ""}" data-act="${act}" data-v="${esc(String(val))}" aria-pressed="${on}">${label}</button>`;
  const MODE = { coop: "🤝 Ensemble (on additionne)", each: "🙌 Chacun son objectif", duel: "⚔️ Duel (un seul ami)" };
  const ready = N.friends.length && (N.mode !== "duel" || N.friends.length === 1) && (!T.needRef || N.ref);
  return `<section class="view lesson-shell">
    <div class="lesson-top"><a class="close" href="#/amis" aria-label="Retour">←</a><div class="grow"><h1 class="fs-1-5rem">⚔️ Lancer un défi</h1></div></div>
    <p class="muted">Des défis qui récompensent les bonnes habitudes : pas d'XP à gagner, seulement de vrais progrès, mesurés par Mochi.</p>
    <div class="card ch-form">
      <h3>Le défi</h3>
      <div class="ch-types">${Object.entries(d.types).map(([k, t]) => `<button type="button" class="card ch-type ${N.type === k ? "on" : ""}" data-act="nc-type" data-v="${k}" aria-pressed="${N.type === k}">
        <span class="ch-icon">${t.icon}</span><b>${esc(t.title)}</b><small class="muted">${esc(CH_HELP[k])}</small></button>`).join("")}</div>
      ${T.modes.length > 1 ? `<h3>Comment</h3><div class="chips">${T.modes.map((m) => chip("nc-mode", m, N.mode === m, MODE[m])).join("")}</div>` : ""}
      <h3>Durée</h3><div class="chips">${[3, 7, 14].map((n) => chip("nc-days", n, N.days === n, `${n} jours`)).join("")}</div>
      <h3>Langue</h3><div class="chips">${[...(T.needLang ? [] : ["all"]), ...Object.keys(LANGUAGES)].map((l) => chip("nc-lang", l, N.lang === l, l === "all" ? "🌍 Toutes" : `${LANGUAGES[l].flag} ${LANGUAGES[l].name}`)).join("")}</div>
      ${N.mode === "coop" ? `<h3>Objectif à plusieurs</h3><div class="chips">${T.targets.map((v) => chip("nc-target", v, N.target === v, `${num0(v)} ${T.unit}`)).join("")}</div>` : ""}
      ${N.mode === "each" && T.perPerson ? `<p class="muted"><small>Objectif : ${T.perPerson[N.days]} ${T.unit} chacun en ${N.days} jours.</small></p>` : ""}
      ${T.needRef ? `<h3>Le chapitre</h3>${chapters.length ? `<select id="nc-ref" class="input" data-act="nc-ref">${chapters.map((c) => `<option value="${esc(c.ref)}" ${N.ref === c.ref ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select>` : `<p class="muted">Aucun chapitre dans cette langue.</p>`}` : ""}
      <h3>Avec qui</h3>
      <div class="chips">${d.friends.map((f) => chip("nc-friend", f.id, N.friends.includes(f.id), `${esc(f.name)}`)).join("")}</div>
      ${N.mode === "duel" && N.friends.length > 1 ? `<p class="form-err">Un duel se joue à deux : choisis un seul ami.</p>` : ""}
      <p class="mt-20"><button class="btn" data-act="nc-create" ${ready ? "" : "disabled"}>Lancer le défi</button></p>
      <p class="muted m-0"><small>Tes amis reçoivent une invitation. Le défi commence aujourd'hui.</small></p>
    </div>
  </section>`;
}
const CH_HELP = {
  regular: "Faire sa séance complète 5 jours sur 7, chacun de son côté.",
  time: "Cumuler du temps d'apprentissage à plusieurs.",
  reviews: "Faire ses révisions : on additionne celles de tout le monde.",
  solid: "Gagner des mots vraiment retenus (mémorisés pour 7 jours ou plus).",
  chapter: "Lire le même chapitre et répondre aux questions.",
};

// ---------- Lien d'invitation reçu ----------
function viewInviteLink(code) {
  if (!account) {
    try { localStorage.setItem(INVITE_KEY, code); } catch {}
    return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "happy")}<h2>On t'invite sur Mochi ! 🍡</h2>
      <p class="muted">Crée ton compte (ou connecte-toi) : vous serez amis automatiquement et vous pourrez vous lancer des défis.</p>
      <a class="btn" href="#/inscription">Créer mon compte</a> <a class="btn ghost" href="#/connexion">J'ai déjà un compte</a></div></section>`;
  }
  if (ui.inviteDone !== code) { ui.inviteDone = code; acceptPendingInvite(code); }
  return `<section class="view"><div class="card"><p class="muted">Ajout de ton ami…</p></div></section>`;
}
async function acceptPendingInvite(code) {
  try { localStorage.removeItem(INVITE_KEY); } catch {}
  try { const r = await api("POST", "/api/friends/invite", { code }); toast(`Vous êtes amis avec ${r.friend.name} ! 🎉`); }
  catch (e) { toast(e.message); }
  socialData(true);
  location.hash = "#/amis";
}
// Invitation ouverte avant d'avoir un compte : reprise juste après la connexion ou l'inscription
const _applyAuthBase = applyAuth;
applyAuth = async (...args) => {
  await _applyAuthBase(...args);
  let code = null; try { code = localStorage.getItem(INVITE_KEY); } catch {}
  if (code) setTimeout(() => acceptPendingInvite(code), 0);
};

// ---------- Carte « Défis » dans Aujourd'hui ----------
function socialCard() {
  if (!account || features.portable) return "";
  const S = socialData();
  const d = S?.d;
  if (!d) return "";
  const active = d.challenges.filter((c) => c.state === "active" || c.state === "success").slice(0, 2);
  if (!active.length && !d.pending) return `<div class="card social-mini"><h3>👥 Défis entre amis</h3><p class="muted m-0"><small>Motivez-vous à plusieurs : <a class="lnk" href="#/amis">${d.friends.length ? "lance un défi" : "ajoute un ami"}</a>.</small></p></div>`;
  return `<div class="card social-mini"><h3>👥 Défis${d.pending ? ` <span class="count-badge">${d.pending}</span>` : ""}</h3>
    ${active.map((c) => challengeCard(c, { compact: true })).join("")}
    <a class="btn ghost small" href="#/amis">${d.pending ? "Voir mes invitations" : "Tous mes défis"}</a></div>`;
}

Object.assign(actions, {
  "fr-username": () => socialPost("/api/friends/username", { username: document.getElementById("fr-username").value }, (r) => `Ton pseudo : @${r.username} ✓`),
  "fr-request": () => {
    const v = document.getElementById("fr-request").value.trim();
    if (!v) return toast("Écris le pseudo de ton ami.");
    socialPost("/api/friends/request", { username: v }, (r) => (r.friends ? "Vous êtes maintenant amis ! 🎉" : r.already ? "Vous êtes déjà amis." : "Demande envoyée ✓"));
  },
  "fr-respond": (el) => socialPost("/api/friends/respond", { id: +el.dataset.id, accept: el.dataset.a === "1" }, el.dataset.a === "1" ? "Nouvel ami ! 🎉" : "Demande refusée"),
  "fr-remove": (el) => { if (confirm(`Retirer ${el.dataset.n} de tes amis ?`)) socialPost("/api/friends/remove", { id: +el.dataset.id }, "Ami retiré"); },
  "fr-block": (el) => { if (confirm("Bloquer ce compte ? Il ne pourra plus t'envoyer de demande.")) socialPost("/api/friends/block", { id: +el.dataset.id }, "Compte bloqué"); },
  "fr-unblock": (el) => socialPost("/api/friends/unblock", { id: +el.dataset.id }, "Compte débloqué"),
  "fr-reset": () => { if (confirm("Créer un nouveau lien ? L'ancien ne marchera plus.")) socialPost("/api/friends/invite-reset", {}, "Nouveau lien créé ✓"); },
  "fr-copy": async () => {
    const v = document.getElementById("fr-link").value;
    try { await navigator.clipboard.writeText(v); toast("Lien copié ✓ Envoie-le à tes amis !"); }
    catch { document.getElementById("fr-link").select(); toast("Sélectionné : copie-le avec Ctrl+C"); }
  },
  "fr-share": (el) => socialPost("/api/friends/settings", { shareStats: el.checked }, el.checked ? "Tes amis voient tes stats" : "Tes stats sont masquées"),
  "ch-answer": (el) => socialPost(`/api/challenges/${+el.dataset.id}/respond`, { accept: el.dataset.a === "1" }, el.dataset.a === "1" ? "C'est parti ! 💪" : "Invitation refusée"),
  "ch-leave": (el) => { if (confirm("Quitter ce défi ?")) socialPost(`/api/challenges/${+el.dataset.id}/leave`, {}, "Tu as quitté le défi"); },
  "nc-type": (el) => { ui.newCh.type = el.dataset.v; render(); },
  "nc-mode": (el) => { ui.newCh.mode = el.dataset.v; render(); },
  "nc-days": (el) => { ui.newCh.days = +el.dataset.v; render(); },
  "nc-lang": (el) => { ui.newCh.lang = el.dataset.v; ui.newCh.ref = ""; render(); },
  "nc-target": (el) => { ui.newCh.target = +el.dataset.v; render(); },
  "nc-ref": (el) => { ui.newCh.ref = el.value; },
  "nc-friend": (el) => { const N = ui.newCh, id = +el.dataset.v; N.friends = N.friends.includes(id) ? N.friends.filter((x) => x !== id) : [...N.friends, id]; render(); },
  "nc-create": async () => {
    const N = ui.newCh, ref = document.getElementById("nc-ref")?.value || N.ref;
    const refTitle = document.getElementById("nc-ref")?.selectedOptions?.[0]?.textContent || "";
    const r = await socialPost("/api/challenges/new", { type: N.type, mode: N.mode, days: N.days, lang: N.lang, target: N.target, ref, refTitle, friends: N.friends }, "Défi lancé ! Tes amis ont reçu l'invitation 💌");
    if (r) { ui.newCh = null; location.hash = "#/amis"; }
  },
});
