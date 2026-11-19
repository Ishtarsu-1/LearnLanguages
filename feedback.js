// ============================================================
//  Mochi — feedback.js : « Donner mon avis » (phase de test avec des amis)
//  Page #/avis : un ou plusieurs sujets (avis, bug, idée, contenu), chacun avec son message,
//  une note et un contact facultatifs.
//  Envoyé à POST /api/feedback-site : enregistré en base et transmis par e-mail à l'éditeur.
//  Ouvert aux invités. Script classique chargé dans l'ordre par index.html.
// ============================================================
// [id, icône, libellé, titre du champ, consigne]
const AVIS_KINDS = [
  ["avis", "💬", "Avis général", "Ton avis général", "Ce qui t'a plu, gêné, manqué…"],
  ["bug", "🐞", "Un bug", "Le bug", "Ce que tu faisais, ce qui s'est passé, ce que tu attendais (et sur quel appareil)."],
  ["idee", "💡", "Une idée", "Ton idée", "Une fonction, un exercice, un thème que tu aimerais voir…"],
  ["contenu", "📖", "Un texte, une traduction", "Le texte ou la traduction", "Quel texte, quelle phrase, et ce qui ne va pas."],
];
// Page d'où l'on vient (jointe au retour : utile pour un bug)
window.addEventListener("hashchange", (e) => {
  const from = (e.oldURL || "").split("#")[1];
  if (from && !from.startsWith("/avis")) ui.avisFrom = `#${from}`;
});

function viewFeedback() {
  const F = (ui.avis ||= { kinds: ["avis"], msgs: {}, rating: 0, sent: false, busy: false });
  if (F.sent) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "proud")}
    <h2>${{ copy: "Merci ! Ton avis est copié 🍡", share: "Merci ! 🍡", queued: "Merci ! Ton avis partira tout seul 🍡" }[F.offline] || "Merci, c'est envoyé ! 🍡"}</h2><p class="muted">${F.offline === "copy" ? "Colle-le dans un message à la personne qui t'a envoyé Mochi. " : F.offline === "queued" ? "Pas de réseau pour l'instant : il est gardé sur ce téléphone et sera envoyé dès que possible. " : ""}Ton retour aide vraiment à améliorer Mochi.</p>
    <div class="wp-actions avis-done"><a class="btn" href="${esc(ui.avisFrom || "#/")}">Revenir où j'étais</a><button class="btn ghost" data-act="avis-again">Envoyer un autre retour</button></div></div></section>`;
  const lang = (ui.avisFrom || "").match(/#\/lang\/(en|ko|zh|ru)/)?.[1] || state.lastLang || "";
  const chosen = AVIS_KINDS.filter(([k]) => F.kinds.includes(k));
  return `<section class="view lesson-shell">
    <div class="avis-head">${mochi("small", "curious")}<div><h1 class="m-0">Donner mon avis</h1>
      <p class="muted mt-4 mb-0 mx-0">Un bug, une idée, un texte bizarre ? Dis-moi tout, je lis chaque message.</p></div></div>
    <form class="card avis-form" data-avis="1" data-lang="${esc(lang)}">
      <fieldset class="avis-kinds"><legend>De quoi veux-tu parler ? <small class="muted">(un ou plusieurs sujets)</small></legend>
        ${AVIS_KINDS.map(([k, ico, label]) => `<label class="chip avis-kind ${F.kinds.includes(k) ? "on" : ""}"><input type="checkbox" name="kind" value="${k}" ${F.kinds.includes(k) ? "checked" : ""} data-act="avis-kind"/> ${F.kinds.includes(k) ? "✓ " : ""}${ico} ${label}</label>`).join("")}
      </fieldset>
      ${chosen.length ? chosen.map(([k, ico, , title, hint]) => `<label class="avis-field avis-part avis-${k}"><span>${ico} ${title}</span>
        <textarea data-kind="${k}" class="input" rows="${k === "avis" ? 5 : 4}" maxlength="3000" placeholder="${esc(hint)}">${esc(F.msgs[k] || "")}</textarea></label>`).join("")
        : `<p class="muted m-0">Choisis au moins un sujet ci-dessus.</p>`}
      <fieldset class="avis-stars"><legend>Ta note pour Mochi <small class="muted">(facultatif)</small></legend>
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star ${F.rating >= n ? "on" : ""}" data-act="avis-star" data-n="${n}" aria-label="${n} sur 5" aria-pressed="${F.rating === n}">★</button>`).join("")}
      </fieldset>
      <label class="avis-field"><span>Ton e-mail, si tu veux une réponse <small class="muted">(facultatif)</small></span>
        <input name="contact" type="email" class="input" maxlength="254" autocomplete="email" value="${esc(F.contact ?? account?.email ?? "")}" placeholder="toi@exemple.fr"/></label>
      ${ui.avisFrom ? `<p class="muted m-0"><small>Page jointe au message : ${esc(ui.avisFrom)}</small></p>` : ""}
      <p class="form-err" hidden></p>
      <button class="btn" ${F.busy || !chosen.length ? "disabled" : ""}>${F.busy ? "Envoi…" : chosen.length > 1 ? `Envoyer mes ${chosen.length} retours` : "Envoyer mon avis"}</button>
      <p class="muted m-0"><small>${features.portable && !features.feedbackEndpoint && !features.relay ? "Dans cette version, ton message reste sur cet appareil : « Exporter mes avis » pour l'envoyer à la main." : "Ton message est enregistré et transmis par e-mail à l'éditeur de Mochi"} (voir la <a class="lnk" href="#/legal/confidentialite">confidentialité</a>).</small></p>
      ${features.portable ? (features.static ? `<p class="m-0"><button type="button" class="btn ghost small" data-act="avis-export">📤 Exporter mes avis</button></p>` : `<p class="m-0"><a class="btn ghost small" href="/api/feedback-export" download="mochi-avis.json">📤 Exporter mes avis</a></p>`) : ""}
    </form>
  </section>`;
}

Object.assign(actions, {
  // Plusieurs sujets possibles : chaque case ouvre (ou ferme) son champ, le texte déjà tapé est gardé
  "avis-kind": (el) => {
    avisKeep();
    const K = ui.avis.kinds, k = el.value;
    ui.avis.kinds = K.includes(k) ? K.filter((x) => x !== k) : AVIS_KINDS.map(([x]) => x).filter((x) => x === k || K.includes(x));
    render();
    document.querySelector?.(`form[data-avis] textarea[data-kind="${k}"]`)?.focus();
  },
  "avis-star": (el) => { avisKeep(); const n = +el.dataset.n; ui.avis.rating = ui.avis.rating === n ? 0 : n; render(); },
  "avis-again": () => { ui.avis = null; render(); },
  "avis-export": () => avisExport(),
});
// Version mobile (pas de serveur) : l'avis part directement au site de bêta (features.feedbackEndpoint,
// une adresse, jamais une clé) ; sans réseau, il attend dans le téléphone et repart tout seul.
// Sans site de bêta : menu de partage du téléphone, ou à défaut copié.
const AVIS_QUEUE = "mochi-avis-attente", AVIS_LOG = "mochi-avis-historique";
const avisRead = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const avisWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v.slice(-50))); } catch {} };
async function avisPost(body) {
  const r = await fetch(`${features.feedbackEndpoint}/api/feedback-site`, { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json", "X-Mochi": "1" }, body: JSON.stringify(body) });
  if (r.ok) return true;
  if (r.status === 429 || r.status >= 500) return false; // réessayer plus tard
  throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`); // avis refusé : le dire
}
async function avisFlush() {
  if (!features.feedbackEndpoint) return;
  const q = avisRead(AVIS_QUEUE), left = [];
  for (const b of q) { try { if (!(await avisPost(b))) left.push(b); } catch (e) { if (e instanceof TypeError) left.push(b); } }
  if (left.length !== q.length) avisWrite(AVIS_QUEUE, left);
}
async function avisOffline(parts, F) {
  const body = { parts, rating: F.rating || null, contact: (F.contact || "").trim() || null, page: ui.avisFrom || null, lang: state.lastLang || null, source: "mobile", at: new Date().toISOString() };
  avisWrite(AVIS_LOG, [...avisRead(AVIS_LOG), body]);
  if (features.feedbackEndpoint) {
    let ok = false;
    try { ok = await avisPost(body); } catch (e) { if (!(e instanceof TypeError)) throw e; } // TypeError : pas de réseau
    if (!ok) avisWrite(AVIS_QUEUE, [...avisRead(AVIS_QUEUE), body]);
    F.offline = ok ? "sent" : "queued"; return;
  }
  const label = (k) => AVIS_KINDS.find(([x]) => x === k)?.[2] || k;
  const text = `Mochi (version mobile) : mon avis\n\n${parts.map((p) => `${label(p.kind)} :\n${p.message}`).join("\n\n")}${F.rating ? `\n\nNote : ${F.rating}/5` : ""}${ui.avisFrom ? `\nPage : ${ui.avisFrom}` : ""}`;
  F.offline = "share";
  if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e?.name === "AbortError") throw new Error("Envoi annulé : réessaie quand tu veux."); } }
  await navigator.clipboard.writeText(text); F.offline = "copy";
}
// Dernier recours : tous mes avis dans un fichier à envoyer à la main
function avisExport() {
  const blob = new Blob([JSON.stringify({ mochi: "avis", exported_at: new Date().toISOString(), avis: avisRead(AVIS_LOG) }, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "mochi-avis.json" });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
if (typeof window !== "undefined" && features.static) { window.addEventListener("online", () => avisFlush()); setTimeout(() => avisFlush(), 4000); }
// Garde ce qui est déjà tapé avant un nouveau rendu
function avisKeep() {
  const f = document.querySelector?.("form[data-avis]");
  if (!f) return;
  for (const t of f.querySelectorAll("textarea[data-kind]")) ui.avis.msgs[t.dataset.kind] = t.value;
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
    const parts = F.kinds.map((kind) => ({ kind, message: (F.msgs[kind] || "").trim() }));
    const empty = parts.find((p) => p.message.length < 3);
    if (empty) throw new Error(`Écris quelques mots pour « ${AVIS_KINDS.find(([k]) => k === empty.kind)[2]} », ou décoche ce sujet.`);
    if (features.static) { await avisOffline(parts, F); F.sent = true; F.busy = false; render(); return; }
    await api("POST", "/api/feedback-site", { parts, rating: F.rating || null, contact: (F.contact || "").trim() || null, page: ui.avisFrom || null, lang: form.dataset.lang || null });
    F.sent = true; F.busy = false; render();
  } catch (er) {
    F.busy = false; render();
    const e2 = document.querySelector("form[data-avis] .form-err");
    if (e2) { e2.textContent = er.message; e2.hidden = false; } else toast(er.message);
  }
});
