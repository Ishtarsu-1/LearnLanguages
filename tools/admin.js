#!/usr/bin/env node
// Gère les administrateurs de Mochi, directement dans la base (DATA_DIR, ./data par défaut).
//   node tools/admin.js list
//   node tools/admin.js add    prenom@exemple.fr
//   node tools/admin.js remove prenom@exemple.fr
// Un admin accède à toutes les leçons sans prérequis et au tableau de bord (#/admin).
// Le compte doit déjà exister (inscription normale sur le site). Aucun mot de passe ici.
// Lancer server.js une fois avant (il crée la colonne is_admin).
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const db = new DatabaseSync(path.join(DATA, "mochi.db"));
const [cmd, email] = process.argv.slice(2);
if (cmd === "list") {
  for (const u of db.prepare("SELECT email, name FROM users WHERE is_admin = 1").all()) console.log(`${u.email}${u.name ? ` (${u.name})` : ""}`);
} else if ((cmd === "add" || cmd === "remove") && email) {
  const r = db.prepare("UPDATE users SET is_admin = ? WHERE email = ?").run(cmd === "add" ? 1 : 0, email.trim());
  if (!r.changes) { console.error(`Aucun compte pour ${email}. Inscris-toi d'abord sur le site.`); process.exit(1); }
  console.log(cmd === "add" ? `✓ ${email} est admin (reconnecte-toi ou recharge la page).` : `✓ ${email} n'est plus admin.`);
} else {
  console.log("Usage : node tools/admin.js list | add <email> | remove <email>");
  process.exit(cmd ? 1 : 0);
}
