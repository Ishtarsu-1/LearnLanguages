// Liste des scripts du site, dans l'ordre de chargement, lue dans index.html (source unique
// pour les tests : ajouter un fichier à index.html suffit). Les bibliothèques de vendor/ sont exclues.
const fs = require("node:fs"), path = require("node:path");
module.exports = (dir = path.join(__dirname, "..")) =>
  [...fs.readFileSync(path.join(dir, "index.html"), "utf8").matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((f) => !f.startsWith("vendor/"));
