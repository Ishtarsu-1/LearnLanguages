#!/usr/bin/env node
// ============================================================
//  Sauvegarde et restauration de Mochi (ROADMAP P0 « Mise en ligne sécurisée »)
//    npm run backup                     copie cohérente de la base + photos de profil, serveur allumé
//    npm run backup -- --keep 30        garder les 30 dernières (14 par défaut)
//    npm run backup -- --dir /chemin    autre dossier de sauvegardes (BACKUP_DIR, défaut DATA_DIR/backups)
//    npm run backup -- --list           liste les sauvegardes
//    npm run restore -- <nom> --yes     restaure une sauvegarde (serveur ARRÊTÉ)
//  La base est copiée par « VACUUM INTO » : une copie complète et cohérente, même pendant que le
//  site tourne. Chaque sauvegarde est vérifiée (PRAGMA integrity_check) avant d'être gardée.
//  Le cache audio (data/tts) n'est pas sauvegardé : il se régénère (npm run tts:pregen).
//  En production, Litestream (deploy/litestream.yml) fait en plus une copie continue vers R2.
// ============================================================
const fs = require("node:fs"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DATA = () => path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15); // 20261119-104512
const NAME_RE = /^mochi-\d{8}-\d{6}$/;

function check(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const ok = db.prepare("PRAGMA integrity_check").get();
    const users = db.prepare("SELECT count(*) n FROM users").get().n;
    const cards = db.prepare("SELECT count(*) n FROM sync_cards").get().n;
    return { ok: Object.values(ok)[0] === "ok", users, cards };
  } finally { db.close(); }
}

function backup({ data = DATA(), dir = process.env.BACKUP_DIR || path.join(data, "backups"), keep = 14, now = new Date() } = {}) {
  const src = path.join(data, "mochi.db");
  if (!fs.existsSync(src)) throw new Error(`Pas de base à sauvegarder : ${src}`);
  const name = `mochi-${stamp(now)}`, out = path.join(dir, name);
  fs.mkdirSync(out, { recursive: true });
  const db = new DatabaseSync(src);
  try { db.exec(`PRAGMA busy_timeout = 10000; VACUUM INTO '${path.join(out, "mochi.db").replace(/'/g, "''")}'`); } finally { db.close(); }
  const c = check(path.join(out, "mochi.db"));
  if (!c.ok) { fs.rmSync(out, { recursive: true, force: true }); throw new Error("La copie de la base est corrompue : sauvegarde annulée."); }
  // Photos de profil (petits fichiers, noms uniques)
  const av = path.join(data, "avatars");
  let avatars = 0;
  if (fs.existsSync(av)) { fs.cpSync(av, path.join(out, "avatars"), { recursive: true }); avatars = fs.readdirSync(av).length; }
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ created: now.toISOString(), users: c.users, cards: c.cards, avatars }, null, 2) + "\n");
  // Rotation : on garde les `keep` plus récentes
  const all = list({ dir });
  for (const old of all.slice(keep)) fs.rmSync(path.join(dir, old.name), { recursive: true, force: true });
  return { name, dir: out, ...c, avatars, removed: Math.max(0, all.length - keep) };
}

function list({ data = DATA(), dir = process.env.BACKUP_DIR || path.join(data, "backups") } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => NAME_RE.test(n) && fs.existsSync(path.join(dir, n, "mochi.db")))
    .sort().reverse().map((name) => { let m = {}; try { m = JSON.parse(fs.readFileSync(path.join(dir, name, "manifest.json"), "utf8")); } catch {} return { name, ...m }; });
}

// Restauration : la base actuelle est mise de côté (jamais supprimée), puis remplacée
function restore(name, { data = DATA(), dir = process.env.BACKUP_DIR || path.join(data, "backups"), now = new Date() } = {}) {
  if (!NAME_RE.test(String(name))) throw new Error("Nom de sauvegarde invalide (ex. mochi-20261119-104512 ; npm run backup -- --list).");
  const src = path.join(dir, name, "mochi.db");
  if (!fs.existsSync(src)) throw new Error(`Sauvegarde introuvable : ${src}`);
  const c = check(src);
  if (!c.ok) throw new Error("Cette sauvegarde est corrompue : restauration refusée.");
  fs.mkdirSync(data, { recursive: true });
  const cur = path.join(data, "mochi.db"), aside = path.join(data, `before-restore-${stamp(now)}`);
  if (fs.existsSync(cur)) {
    fs.mkdirSync(aside, { recursive: true });
    for (const f of ["mochi.db", "mochi.db-wal", "mochi.db-shm"]) if (fs.existsSync(path.join(data, f))) fs.renameSync(path.join(data, f), path.join(aside, f));
  }
  fs.copyFileSync(src, cur);
  const av = path.join(dir, name, "avatars");
  if (fs.existsSync(av)) fs.cpSync(av, path.join(data, "avatars"), { recursive: true });
  return { ...c, aside: fs.existsSync(aside) ? aside : null };
}

if (require.main === module) {
  const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const dir = get("--dir");
  const opts = dir ? { dir: path.resolve(dir) } : {};
  try {
    if (a[0] === "restore") {
      const name = a[1];
      if (!a.includes("--yes")) {
        console.log(`Restaurer ${name} remplacera la base actuelle (elle sera mise de côté dans data/before-restore-…).\n⚠️  Arrête d'abord le serveur (systemctl stop mochi, ou Ctrl+C), puis relance avec --yes.`);
        process.exit(2);
      }
      const r = restore(name, opts);
      console.log(`✓ Restauré : ${r.users} compte(s), ${r.cards} carte(s).${r.aside ? ` Ancienne base gardée dans ${r.aside}` : ""}\n  Relance le serveur.`);
    } else if (a.includes("--list")) {
      const l = list(opts);
      if (!l.length) console.log("Aucune sauvegarde.");
      for (const b of l) console.log(`${b.name}  ${b.users ?? "?"} compte(s) · ${b.cards ?? "?"} carte(s) · ${b.avatars ?? 0} photo(s)`);
    } else {
      const r = backup({ ...opts, keep: Number(get("--keep", 14)) });
      console.log(`✓ Sauvegarde ${r.name} : ${r.users} compte(s), ${r.cards} carte(s), ${r.avatars} photo(s), base vérifiée${r.removed ? ` · ${r.removed} ancienne(s) supprimée(s)` : ""}\n  → ${r.dir}`);
    }
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
module.exports = { backup, restore, list, check };
