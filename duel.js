// ============================================================
//  Mochi — duel.js : duel en direct entre amis (« ⚡ Duel »)
//  Un mot s'affiche, le premier qui écrit sa traduction marque un point, premier à 5.
//  Temps réel : EventSource sur /api/live/stream (le serveur arbitre, voir live.js).
//  #/duel/<id> : salle d'attente, compte à rebours, manches, résultat, revanche.
//  Script classique chargé dans l'ordre par index.html.
// ============================================================
const live = { es: null, invites: [], typed: "", wrong: false };

// Connexion au flux (une par onglet), seulement avec un compte et un serveur
function liveConnect() {
  if (typeof EventSource === "undefined" || !account || live.es) return;
  live.es = new EventSource("/api/live/stream");
  live.es.onmessage = (e) => { let ev; try { ev = JSON.parse(e.data); } catch { return; } liveEvent(ev); };
  live.es.onerror = () => { if (!account) liveClose(); }; // reconnexion automatique sinon
}
function liveClose() { live.es?.close(); live.es = null; live.invites = []; }
setInterval(() => { if (account && !live.es) liveConnect(); else if (!account && live.es) liveClose(); }, 2000);

function liveEvent(ev) {
  if (ev.type === "invite") {
    if (!live.invites.some((m) => m.id === ev.match.id)) live.invites.push(ev.match);
    liveBanner();
    return;
  }
  if (ev.type !== "match") return;
  const m = ev.match;
  live.invites = live.invites.filter((x) => x.id !== m.id || m.status === "waiting");
  liveBanner();
  const prev = ui.duel;
  if (prev?.id !== m.id || prev.round?.n !== m.round?.n) { live.typed = ""; live.wrong = false; }
  ui.duel = m;
  // Le duel commence : on y emmène les deux joueurs
  if (m.status === "countdown" && !location.hash.startsWith(`#/duel/${m.id}`)) { location.hash = `#/duel/${m.id}`; return; }
  if (m.status === "cancelled" && prev?.status === "waiting" && location.hash.startsWith(`#/duel/${m.id}`)) toast(m.reason === "declined" ? "Ton ami ne peut pas jouer maintenant." : m.reason === "expired" ? "Pas de réponse : le duel est annulé." : "Duel annulé.");
  if (location.hash.startsWith(`#/duel/${m.id}`)) duelRender();
}
// Re-rendu sans perdre la saisie en cours ni le focus
function duelRender() {
  const inp = document.getElementById("duel-answer");
  if (inp) live.typed = inp.value;
  render();
  const again = document.getElementById("duel-answer");
  if (again) { again.value = live.typed; again.focus(); }
}

// ---------- Bandeau d'invitation (sur toutes les pages) ----------
function liveBanner() {
  if (typeof document.createElement !== "function") return;
  let el = document.getElementById("live-banner");
  const m = live.invites.find((x) => x.status === "waiting");
  if (!m) { el?.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "live-banner"; el.className = "live-banner card"; el.setAttribute("role", "alert"); document.body.append(el); }
  const from = m.players.find((p) => !p.me);
  el.innerHTML = `<span class="live-ico">⚡</span><div class="grow"><b>${esc(from.name)}</b> te défie en duel ! <small class="muted">${LANGUAGES[m.lang].flag} ${LANGUAGES[m.lang].name} · premier à ${m.target} points</small></div>
    <button class="btn small" data-live="join" data-id="${esc(m.id)}">Jouer</button><button class="btn ghost small" data-live="decline" data-id="${esc(m.id)}">Pas maintenant</button>`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest?.("[data-live]");
  if (!b) return;
  const id = b.dataset.id;
  live.invites = live.invites.filter((x) => x.id !== id); liveBanner();
  try {
    if (b.dataset.live === "join") { const r = await api("POST", `/api/live/${id}/join`, {}); ui.duel = r.match; location.hash = `#/duel/${id}`; }
    else await api("POST", `/api/live/${id}/cancel`, {});
  } catch (er) { toast(er.message); }
});

// ---------- Page du duel ----------
function viewDuel(id) {
  if (!account) return viewNotFound();
  if (!ui.duel || ui.duel.id !== id) {
    if (ui.duelLoading !== id) { ui.duelLoading = id; api("GET", `/api/live/${encodeURIComponent(id)}`).then((r) => { ui.duel = r.match; }).catch((e) => { ui.duel = { id, error: e.message }; }).finally(() => { ui.duelLoading = null; if (location.hash.startsWith(`#/duel/${id}`)) render(); }); }
    return `<section class="view lesson-shell"><div class="card"><p class="muted">Chargement du duel…</p></div></section>`;
  }
  const m = ui.duel;
  if (m.error) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "sleepy")}<h2>Duel terminé</h2><p class="muted">${esc(m.error)}</p><a class="btn" href="#/amis">Retour aux amis</a></div></section>`;
  const me = m.players.find((p) => p.me), them = m.players.find((p) => !p.me), k = koCls(m.lang);
  const dots = (n) => `<span class="duel-dots">${Array.from({ length: m.target }, (_, i) => `<span class="${i < n ? "on" : ""}"></span>`).join("")}</span>`;
  const board = `<div class="duel-board">
    <div class="duel-player me">${socialAvatar(me)}<b>Toi</b>${dots(me.score)}</div>
    <div class="duel-vs">${me.score} – ${them.score}</div>
    <div class="duel-player">${socialAvatar(them)}<b>${esc(them.name)}</b>${dots(them.score)}</div></div>`;
  let body;
  if (m.status === "waiting") {
    const mine = m.players[0].me;
    body = mine ? `<div class="card empty">${mochi("small", "curious")}<h2>En attente de ${esc(them.name)}…</h2><p class="muted">Ton invitation est partie. Le duel commence dès que ${esc(them.name)} clique sur « Jouer » (2 minutes au plus).</p>
        <button class="btn ghost" data-act="duel-cancel">Annuler</button></div>`
      : `<div class="card empty">${mochi("small", "happy")}<h2>${esc(them.name)} te défie !</h2><p class="muted">${LANGUAGES[m.lang].flag} Un mot s'affiche, le premier qui écrit sa traduction en français marque un point. Premier à ${m.target}.</p>
        <button class="btn" data-act="duel-join">Jouer</button> <button class="btn ghost" data-act="duel-cancel">Pas maintenant</button></div>`;
  } else if (m.status === "countdown") {
    body = `${board}<div class="card duel-stage"><p class="muted">Prêt·e ? Traduis en français, le plus vite possible !</p><div class="duel-count" id="duel-count">${Math.max(1, Math.ceil((m.startsAt - Date.now()) / 1000))}</div></div>`;
  } else if (m.status === "playing" && m.round) {
    const r = m.round, res = r.result;
    const verdict = !res ? "" : res.winner === null ? `<p class="duel-result none">⏱️ Personne n'a trouvé. C'était : <b>${esc(res.answer)}</b></p>`
      : `<p class="duel-result ${res.winner === me.id ? "win" : "lose"}">${res.winner === me.id ? "✅ Point pour toi !" : `⚡ ${esc(them.name)} a été plus rapide`} · <b>${esc(res.answer)}</b></p>`;
    body = `${board}<div class="card duel-stage">
      <p class="muted m-0">Manche ${r.n} · traduis en français</p>
      <div class="duel-word ${k}">${esc(r.word)}</div>
      <button class="btn ghost small" data-act="say" data-text="${esc(r.word)}" data-lang="${m.lang}" aria-label="Écouter">🔊</button>
      ${res ? verdict : `<div class="duel-timer"><span id="duel-timer" data-bar-w="${Math.max(0, Math.min(100, ((r.endsAt - Date.now()) / 20000) * 100))}"></span></div>
        <form class="duel-form" data-duel="1"><input id="duel-answer" class="input ${live.wrong ? "shake" : ""}" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="80" placeholder="ta traduction…" aria-label="Ta traduction en français"/>
        <button class="btn">Valider</button></form>${live.wrong ? `<p class="duel-wrong">Pas tout à fait, essaie encore !</p>` : ""}`}
    </div>
    <p class="center"><button class="btn text" data-act="duel-cancel">Abandonner</button></p>`;
  } else if (m.status === "finished") {
    const won = m.winner === me.id, tie = m.winner === null;
    body = `${board}<div class="card empty duel-end">${mochi("small", won ? "proud" : "happy")}
      <h2>${tie ? "Égalité !" : won ? "Victoire ! 🎉" : `Bravo à ${esc(them.name)} !`}</h2>
      <p class="muted">${m.reason === "forfeit" ? (won ? `${esc(them.name)} a quitté la partie.` : "Tu as quitté la partie.") : tie ? "Aussi forts l'un que l'autre." : won ? "Tu as été le plus rapide." : "La revanche ? Ces mots sont maintenant frais dans ta tête 😉"}</p>
      <div class="wp-actions duel-actions"><button class="btn" data-act="duel-rematch">⚡ Revanche</button><a class="btn ghost" href="#/amis">Retour</a></div></div>
      ${m.history.length ? `<h2 class="section-title">Les mots du duel</h2><div class="card"><table class="admin-table"><tbody>${m.history.map((h) => `<tr><th scope="row" class="${k}">${esc(h.word)}</th><td>${esc(h.fr)}</td><td>${h.winner === null ? "⏱️" : h.winner === me.id ? "✅ toi" : `⚡ ${esc(them.name)}`}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  } else {
    body = `<div class="card empty">${mochi("small", "sleepy")}<h2>Duel annulé</h2><a class="btn" href="#/amis">Retour aux amis</a></div>`;
  }
  return `<section class="view lesson-shell duel">
    <div class="lesson-top"><a class="close" href="#/amis" aria-label="Retour">←</a><div class="grow"><h1 class="fs-1-5rem">⚡ Duel · ${LANGUAGES[m.lang].flag} ${LANGUAGES[m.lang].name}</h1></div></div>
    ${body}</section>`;
}
// Minuteur et compte à rebours : mis à jour sans re-rendu (la saisie reste intacte)
setInterval(() => {
  const m = ui.duel;
  if (!m || !location.hash.startsWith?.(`#/duel/${m.id}`)) return;
  const t = document.getElementById("duel-timer");
  if (t && m.round && !m.round.result) t.style?.setProperty?.("width", `${Math.max(0, Math.min(100, ((m.round.endsAt - Date.now()) / 20000) * 100))}%`);
  const c = document.getElementById("duel-count");
  if (c && m.startsAt) c.textContent = String(Math.max(1, Math.ceil((m.startsAt - Date.now()) / 1000)));
}, 200);

async function duelInvite(friend, lang) {
  try {
    const r = await api("POST", "/api/live/invite", { friend, lang });
    ui.duel = r.match; location.hash = `#/duel/${r.match.id}`;
    if (!r.friendOnline) toast("Ton ami n'est pas sur Mochi en ce moment : il verra l'invitation s'il arrive dans les 2 minutes.");
  } catch (e) { toast(e.message); }
}
Object.assign(actions, {
  "duel-invite": (el) => duelInvite(+el.dataset.id, el.dataset.lang),
  "duel-join": async () => { try { ui.duel = (await api("POST", `/api/live/${ui.duel.id}/join`, {})).match; render(); } catch (e) { toast(e.message); } },
  "duel-cancel": async () => {
    const m = ui.duel;
    if (m.status !== "waiting" && !confirm("Abandonner le duel ? Ton ami gagne la partie.")) return;
    try { await api("POST", `/api/live/${m.id}/cancel`, {}); } catch (e) { toast(e.message); }
    if (m.status === "waiting") location.hash = "#/amis";
  },
  "duel-rematch": () => { const m = ui.duel, them = m.players.find((p) => !p.me); duelInvite(them.id, m.lang); },
});
$app.addEventListener("submit", async (e) => {
  if (!e.target.matches?.("form[data-duel]")) return;
  e.preventDefault();
  const inp = document.getElementById("duel-answer"), m = ui.duel, text = inp.value.trim();
  if (!text || !m?.round) return;
  try {
    const r = await api("POST", `/api/live/${m.id}/answer`, { round: m.round.n, text });
    if (!r.ok && !r.late) { live.wrong = true; live.typed = ""; inp.value = ""; duelRender(); setTimeout(() => { live.wrong = false; }, 600); }
  } catch (er) { toast(er.message); }
});
