// ============================================================
//  Mochi — e-mails transactionnels (mot de passe oublié, vérification de l'adresse)
//  ROADMAP P0. Deux modes :
//   - RESEND_API_KEY défini : envoi réel via l'API HTTP de Resend (offre gratuite) ;
//   - sinon (développement) : l'e-mail est affiché dans la console du serveur,
//     avec le lien cliquable. Rien ne part sur Internet.
//  MAIL_FROM : expéditeur, par ex. "Mochi <bonjour@ton-domaine.fr>" (domaine vérifié chez Resend).
// ============================================================
function create({ env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const key = env.RESEND_API_KEY || "";
  const from = env.MAIL_FROM || "Mochi <onboarding@resend.dev>";
  const outbox = []; // derniers e-mails (mode console), utile pour les tests

  async function send({ to, subject, text, html }) {
    if (!key) {
      outbox.push({ to, subject, text });
      if (outbox.length > 50) outbox.shift();
      if (env.MAIL_QUIET !== "1") log(`\n✉️  [e-mail non envoyé : RESEND_API_KEY absent] → ${to}\n   ${subject}\n${text.split("\n").map((l) => `   ${l}`).join("\n")}\n`);
      return;
    }
    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(15e3),
    });
    if (!r.ok) throw new Error(`Resend : HTTP ${r.status}`);
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

module.exports = { create, mails };
