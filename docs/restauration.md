# Restaurer Mochi

> « Une sauvegarde qu'on n'a jamais restaurée ne compte pas. » (ROADMAP, P0)

Toutes les données sont dans `data/` : **`mochi.db`** (comptes, progression, amis, défis, retours) et **`avatars/`** (photos de profil). `data/tts/` est un cache audio : il se régénère avec `npm run tts:pregen` (ou se recopie depuis ton PC).

---

## 1. Depuis une sauvegarde quotidienne (`npm run backup`)

```bash
npm run backup -- --list                      # sauvegardes disponibles (la plus récente d'abord)
sudo systemctl stop mochi                     # ou Ctrl+C en local
sudo -u mochi npm run restore -- mochi-20261119-033012 --yes
sudo systemctl start mochi
curl -s http://127.0.0.1:8000/api/health
```

- La sauvegarde est **vérifiée** (`PRAGMA integrity_check`) avant d'être restaurée ; une sauvegarde abîmée est refusée.
- La base actuelle n'est jamais supprimée : elle est mise de côté dans `data/before-restore-<date>/`.
- Les photos de profil de la sauvegarde sont recopiées dans `data/avatars/`.

## 2. Depuis Litestream (R2), à la seconde près

Sur la machine à restaurer (Litestream installé, mêmes variables que dans `/etc/default/litestream`) :

```bash
sudo systemctl stop mochi litestream
set -a; . /etc/default/litestream; set +a
sudo mv /opt/mochi/data/mochi.db /opt/mochi/data/mochi.db.avant        # (+ -wal, -shm s'ils existent)
litestream restore -config /etc/litestream.yml -o /opt/mochi/data/mochi.db /opt/mochi/data/mochi.db
# à un instant précis :  … -timestamp 2026-11-19T10:15:00Z …
sudo chown mochi:mochi /opt/mochi/data/mochi.db
sudo systemctl start mochi litestream
```

Litestream ne sauvegarde que la base : les photos de profil viennent de la sauvegarde quotidienne (étape 1) ou d'une copie rclone.

## 3. Machine perdue : tout reconstruire

1. Nouvelle machine : `docs/mise-en-ligne.md`, étapes 1 à 3 (ne pas démarrer le service).
2. Base : étape 2 ci-dessus (Litestream), ou copie d'une sauvegarde quotidienne gardée ailleurs, puis `npm run restore`.
3. Démarrer, vérifier `/api/health`, se connecter avec un vrai compte, ouvrir « Réviser » : les cartes doivent être là.
4. Réactiver Litestream et la sauvegarde quotidienne.

---

## Test de restauration

### Automatique (à chaque `npm test`)
`tests/backup.test.js` rejoue tout le scénario sur de vrais processus serveur :
1. un serveur tourne, un compte écrit des cartes et de l'XP, une photo de profil existe ;
2. sauvegarde **pendant** que le serveur tourne ;
3. restauration dans un dossier **vierge** ;
4. un nouveau serveur démarre dessus : connexion avec le mot de passe, cartes et XP présentes, photo restaurée, `/api/health` à 200.

Il vérifie aussi : base actuelle mise de côté, rotation (N plus récentes), sauvegarde corrompue refusée, nom piégé refusé.

### Manuel, sur la vraie production (à faire avant l'ouverture, puis tous les 3 mois)
Sur une machine **vierge** (une autre VM, ou ton PC dans un dossier vide avec `DATA_DIR=/tmp/essai-restauration`) :

- [ ] Restaurer depuis **R2** (Litestream, section 2) et depuis la **dernière sauvegarde quotidienne** (section 1)
- [ ] `npm start`, `/api/health` à 200
- [ ] Se connecter avec un vrai compte, vérifier cartes, amis et défis
- [ ] Noter la date, la durée et les écarts ci-dessous

| Date | Source | Durée | Résultat / remarques |
|---|---|---|---|
| 2026-11-19 | Test automatique (`tests/backup.test.js`) | < 5 s | ✅ OK (sauvegarde à chaud, restauration sur dossier vierge, connexion, cartes, XP, photo) |
| | Litestream → R2, production | | à faire après la mise en ligne |
