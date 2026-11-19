// ============================================================
//  Mochi — e-mails transactionnels (mot de passe oublié, vérification de l'adresse)
//  ROADMAP P0. Deux modes :
//   - RESEND_API_KEY défini : envoi réel via l'API HTTP de Resend (offre gratuite) ;
//   - sinon (développement) : l'e-mail est affiché dans la console du serveur,
//  Aussi : retours des testeurs (formulaire « Donner mon avis ») envoyés à FEEDBACK_TO.
//     avec le lien cliquable. Rien ne part sur Internet.
//  MAIL_FROM : expéditeur, par ex. "Mochi <bonjour@ton-domaine.fr>" (domaine vérifié chez Resend).
// ============================================================
function create({ env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const key = env.RESEND_API_KEY || "";
  const from = env.MAIL_FROM || "Mochi <onboarding@resend.dev>";
  const outbox = []; // derniers e-mails (mode console), utile pour les tests

  async function send({ to, subject, text, html, replyTo }) {
    if (!key) {
      outbox.push({ to, subject, text, html, replyTo });
      if (outbox.length > 50) outbox.shift();
      if (env.MAIL_QUIET !== "1") log(`\n✉️  [e-mail non envoyé : RESEND_API_KEY absent] → ${to}\n   ${subject}\n${text.split("\n").map((l) => `   ${l}`).join("\n")}\n`);
      return;
    }
    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(15e3),
    });
    const d = typeof r.json === "function" ? await r.json().catch(() => ({})) : {};
    if (!r.ok) throw new Error(`Resend : HTTP ${r.status}${d?.message ? ` (${d.message})` : ""}`);
    return d?.id || null;
  }
  return { send, outbox, mode: key ? "resend" : "console" };
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Gabarits : texte brut + HTML minimal (lisible partout, couleurs de la charte)
function template({ hello, lines, button, link, footer }) {
  const text = `${hello}\n\n${lines.join("\n\n")}\n\n${button} : ${link}\n\n${footer}\n\n— Mochi 🍡`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#2A2230;line-height:1.6">
<p>${escHtml(hello)}</p>${lines.map((l) => `<p>${escHtml(l)}</p>`).join("")}
<p style="margin:28px 0"><a href="${escHtml(link)}" style="background:#C2386A;color:#fff;padding:12px 22px;border-radius:14px;text-decoration:none;font-weight:700">${escHtml(button)}</a></p>
<p style="color:#665A6B;font-size:14px">${escHtml(footer)}<br/>Lien : ${escHtml(link)}</p>
<p>— Mochi 🍡</p></div>`;
  return { text, html };
}

const mails = {
  reset: (name, link) => ({
    subject: "Réinitialiser ton mot de passe Mochi",
    ...template({
      hello: `Bonjour${name ? ` ${name}` : ""},`,
      lines: ["Quelqu'un (sans doute toi) a demandé à changer le mot de passe de ton compte Mochi.", "Le lien marche une seule fois, pendant 30 minutes."],
      button: "Choisir un nouveau mot de passe", link,
      footer: "Si ce n'est pas toi, ignore cet e-mail : ton mot de passe ne change pas.",
    }),
  }),
  verify: (name, link) => ({
    subject: "Confirme ton adresse e-mail Mochi",
    ...template({
      hello: `Bonjour${name ? ` ${name}` : ""} !`,
      lines: ["Bienvenue sur Mochi. Confirme ton adresse pour pouvoir récupérer ton compte si tu oublies ton mot de passe."],
      button: "Confirmer mon adresse", link,
      footer: "Le lien est valable 7 jours. Si tu n'as pas créé de compte, ignore cet e-mail.",
    }),
  }),
};

// ---------- Retour d'un testeur : e-mail aux couleurs de Mochi (CHARTE-GRAPHIQUE.md) ----------
// Couleurs de tokens.css en dur : un e-mail ne lit pas de CSS externe.
const C = { bg: "#FFF9F3", surface: "#FFFFFF", surface2: "#F6EEE6", border: "#E8DCCF", ink: "#2A2230", muted: "#665A6B", sakura: "#C2386A", sakura50: "#FDEFF4", matcha: "#2F7A52", matcha50: "#E6F4EC", yuzu: "#F4C04A", yuzu100: "#FFF1C7", cherry: "#C7353A", cherry50: "#FDECEC", ube: "#6E4FBF", ube50: "#EFEAFB" };
const KINDS = {
  avis: { label: "Avis général", icon: "💬", fg: C.matcha, bg: C.matcha50 },
  bug: { label: "Bug", icon: "🐞", fg: C.cherry, bg: C.cherry50 },
  idee: { label: "Idée", icon: "💡", fg: "#8F5A0B", bg: C.yuzu100 },
  contenu: { label: "Contenu (texte, traduction)", icon: "📖", fg: C.ube, bg: C.ube50 },
};
// Mochi en SVG inline : la mascotte de la charte (§8), saveur Sakura
const MOCHI_SVG = `<svg width="56" height="48" viewBox="0 0 56 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="28" cy="27" rx="26" ry="20" fill="#F6C1D3" stroke="${C.ink}" stroke-width="2"/><circle cx="20" cy="25" r="2.6" fill="${C.ink}"/><circle cx="36" cy="25" r="2.6" fill="${C.ink}"/><path d="M24 31 q4 4 8 0" stroke="${C.ink}" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="15" cy="31" rx="4" ry="2.4" fill="#E0628F" opacity=".6"/><ellipse cx="41" cy="31" rx="4" ry="2.4" fill="#E0628F" opacity=".6"/></svg>`;

function feedbackMail(f) {
  const k = KINDS[f.kind] || KINDS.avis;
  const stars = f.rating ? "★".repeat(f.rating) + "☆".repeat(5 - f.rating) : null;
  const who = f.name || f.email || f.contact || "Un·e testeur·se anonyme";
  const subject = `${k.icon} ${k.label} sur Mochi${f.rating ? ` · ${f.rating}/5` : ""} — ${who}`;
  const meta = [
    ["De", [f.name, f.email].filter(Boolean).join(" · ") || "invité (sans compte)"],
    ...(f.contact ? [["Pour répondre", f.contact]] : []),
    ["Page", f.page || "—"],
    ["Langue étudiée", f.lang || "—"],
    ["Date", f.date],
    ["Navigateur", f.userAgent || "—"],
  ];
  const text = `${k.icon} ${k.label}${stars ? ` · ${stars}` : ""}\n\n${f.message}\n\n${meta.map(([a, b]) => `${a} : ${b}`).join("\n")}\n\n— Mochi 🍡`;
  const font = "'Fredoka','Pretendard',system-ui,-apple-system,'Segoe UI',sans-serif";
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:${C.bg}">
<div style="background:${C.bg};padding:32px 12px;font-family:'Pretendard',system-ui,-apple-system,'Segoe UI',sans-serif;color:${C.ink};line-height:1.6">
 <div style="max-width:560px;margin:0 auto">
  <div style="text-align:center;margin-bottom:16px">${MOCHI_SVG}
   <div style="font-family:${font};font-size:26px;font-weight:700;color:${C.sakura};letter-spacing:.3px">Mochi</div>
   <div style="font-size:13px;color:${C.muted}">Un nouveau retour de testeur</div></div>
  <div style="background:${C.surface};border:1px solid ${C.border};border-radius:20px;padding:24px;box-shadow:0 4px 0 ${C.border}">
   <div style="margin-bottom:14px">
    <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${k.bg};color:${k.fg};font-weight:800;font-size:14px">${k.icon} ${escHtml(k.label)}</span>
    ${stars ? `<span style="display:inline-block;margin-left:8px;padding:6px 14px;border-radius:999px;background:${C.yuzu100};color:#8F5A0B;font-weight:800;font-size:14px;letter-spacing:2px">${stars}</span>` : ""}
   </div>
   <div style="font-family:${font};font-size:20px;font-weight:700;margin:4px 0 12px">${escHtml(who)} a écrit :</div>
   <div style="background:${C.sakura50};border-left:4px solid ${C.sakura};border-radius:12px;padding:16px 18px;font-size:16px;white-space:pre-wrap">${escHtml(f.message)}</div>
   <table role="presentation" style="width:100%;margin-top:18px;border-collapse:collapse;font-size:14px">
    ${meta.map(([a, b]) => `<tr><td style="padding:6px 12px 6px 0;color:${C.muted};font-weight:700;white-space:nowrap;vertical-align:top">${escHtml(a)}</td><td style="padding:6px 0;word-break:break-word">${escHtml(b)}</td></tr>`).join("")}
   </table>
   ${f.contact ? `<p style="margin:20px 0 0"><a href="mailto:${escHtml(f.contact)}" style="display:inline-block;background:${C.sakura};color:#fff;padding:12px 22px;border-radius:14px;text-decoration:none;font-weight:800">Répondre</a></p>` : ""}
  </div>
  <p style="text-align:center;font-size:13px;color:${C.muted};margin-top:18px">Retour n°${escHtml(String(f.id))} · aussi enregistré dans la base de Mochi<br/>— Mochi 🍡</p>
 </div></div></body></html>`;
  return { subject, text, html };
}

module.exports = { create, mails, feedbackMail, FEEDBACK_KINDS: Object.keys(KINDS) };
