// ============================================================
//  Mochi — feedback.js : « Donner mon avis » (phase de test avec des amis)
//  Page #/avis : type de retour, note, message, contact facultatif.
//  Envoyé à POST /api/feedback-site : enregistré en base et transmis par e-mail à l'éditeur.
//  Ouvert aux invités. Script classique chargé dans l'ordre par index.html.
// ============================================================
const AVIS_KINDS = [["avis", "💬", "Avis général"], ["bug", "🐞", "Un bug"], ["idee", "💡", "Une idée"], ["contenu", "📖", "Un texte, une traduction"]];
// Page d'où l'on vient (jointe au retour : utile pour un bug)
window.addEventListener("hashchange", (e) => {
  const from = (e.oldURL || "").split("#")[1];
  if (from && !from.startsWith("/avis")) ui.avisFrom = `#${from}`;
});

function viewFeedback() {
  const F = (ui.avis ||= { kind: "avis", rating: 0, sent: false, busy: false });
  if (F.sent) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "proud")}
    <h2>Merci, c'est envoyé ! 🍡</h2><p class="muted">Ton retour aide vraiment à améliorer Mochi.</p>
    <div class="wp-actions avis-done"><a class="btn" href="${esc(ui.avisFrom || "#/")}">Revenir où j'étais</a><button class="btn ghost" data-act="avis-again">Envoyer un autre retour</button></div></div></section>`;
  const lang = (ui.avisFrom || "").match(/#\/lang\/(en|ko)/)?.[1] || state.lastLang || "";
  return `<section class="view lesson-shell">
    <div class="avis-head">${mochi("small", "curious")}<div><h1 class="m-0">Donner mon avis</h1>
      <p class="muted mt-4 mb-0 mx-0">Un bug, une idée, un texte bizarre ? Dis-moi tout, je lis chaque message.</p></div></div>
    <form class="card avis-form" data-avis="1" data-lang="${esc(lang)}">
      <fieldset class="avis-kinds"><legend>C'est à propos de…</legend>
        ${AVIS_KINDS.map(([k, ico, label]) => `<label class="chip avis-kind ${F.kind === k ? "on" : ""}"><input type="radio" name="kind" value="${k}" ${F.kind === k ? "checked" : ""} data-act="avis-kind"/> ${ico} ${label}</label>`).join("")}
      </fieldset>
      <fieldset class="avis-stars"><legend>Ta note pour Mochi <small class="muted">(facultatif)</small></legend>
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star ${F.rating >= n ? "on" : ""}" data-act="avis-star" data-n="${n}" aria-label="${n} sur 5" aria-pressed="${F.rating === n}">★</button>`).join("")}
      </fieldset>
      <label class="avis-field"><span>Ton message</span>
        <textarea id="avis-message" name="message" class="input" rows="6" maxlength="3000" required placeholder="Qu'est-ce qui t'a plu, gêné, manqué ?">${esc(F.message || "")}</textarea></label>
      <label class="avis-field"><span>Ton e-mail, si tu veux une réponse <small class="muted">(facultatif)</small></span>
        <input name="contact" type="email" class="input" maxlength="254" autocomplete="email" value="${esc(F.contact ?? account?.email ?? "")}" placeholder="toi@exemple.fr"/></label>
      ${ui.avisFrom ? `<p class="muted m-0"><small>Page jointe au message : ${esc(ui.avisFrom)}</small></p>` : ""}
      <p class="form-err" hidden></p>
      <button class="btn" ${F.busy ? "disabled" : ""}>${F.busy ? "Envoi…" : "Envoyer mon avis"}</button>
      <p class="muted m-0"><small>Ton message est enregistré et transmis par e-mail à l'éditeur de Mochi (voir la <a class="lnk" href="#/legal/confidentialite">confidentialité</a>).</small></p>
    </form>
  </section>`;
}

Object.assign(actions, {
  "avis-kind": (el) => { avisKeep(); ui.avis.kind = el.value; render(); },
  "avis-star": (el) => { avisKeep(); const n = +el.dataset.n; ui.avis.rating = ui.avis.rating === n ? 0 : n; render(); },
  "avis-again": () => { ui.avis = null; render(); },
});
// Garde ce qui est déjà tapé avant un nouveau rendu
function avisKeep() {
  const f = document.querySelector?.("form[data-avis]");
  if (!f) return;
  ui.avis.message = f.querySelector("textarea")?.value ?? ui.avis.message;
  ui.avis.contact = f.querySelector("input[name=contact]")?.value ?? ui.avis.contact;
}
$app.addEventListener("submit", async (e) => {
  const form = e.target.closest?.("form[data-avis]");
  if (!form) return;
  e.preventDefault();
  avisKeep();
  const F = ui.avis, err = form.querySelector(".form-err");
  err.hidden = true; F.busy = true; render();
  try {
    await api("POST", "/api/feedback-site", { kind: F.kind, rating: F.rating || null, message: (F.message || "").trim(), contact: (F.contact || "").trim() || null, page: ui.avisFrom || null, lang: form.dataset.lang || null });
    F.sent = true; F.busy = false; render();
  } catch (er) {
    F.busy = false; render();
    const e2 = document.querySelector("form[data-avis] .form-err");
    if (e2) { e2.textContent = er.message; e2.hidden = false; } else toast(er.message);
  }
});
