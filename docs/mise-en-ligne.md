# Mettre Mochi en ligne

Deux chemins, selon le besoin :

| | **A. Tunnel depuis ton PC** | **B. Serveur dédié** |
|---|---|---|
| Pour | Faire tester quelques amis **aujourd'hui** | Ouvrir le site durablement |
| Prix | Gratuit | Gratuit (Oracle Cloud Always Free) ou ~4 €/mois (VPS) |
| Temps | 10 minutes | 1 à 2 heures la première fois |
| Limites | Ton PC doit rester allumé ; l'adresse change à chaque lancement (sauf tunnel nommé) | Aucune |

Les fichiers prêts à copier sont dans **`deploy/`**.

---

## A. Tunnel Cloudflare (test entre amis)

Cloudflare Tunnel donne une adresse **https** publique qui renvoie vers ton `localhost`, sans ouvrir de port sur ta box.

1. Installe `cloudflared` : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
   (Arch : `sudo pacman -S cloudflared` · Windows : `winget install Cloudflare.cloudflared`).
2. Lance le tunnel (dans un terminal à part) :
   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```
   Il affiche une adresse du type `https://mots-au-hasard.trycloudflare.com`.
3. Dans `.env` :
   ```
   PUBLIC_URL=https://mots-au-hasard.trycloudflare.com
   COOKIE_SECURE=1
   TRUST_PROXY=127.0.0.1,::1
   ```
   `TRUST_PROXY` est indispensable : sinon la limitation des tentatives serait commune à tous tes amis (ils arrivent tous par le tunnel).
4. Relance `npm start`, et envoie l'adresse à tes amis (avec ton lien d'invitation d'ami : Amis › Copier).
5. Dans `legal.js`, remplis `LEGAL_INFO.host` (exemple déjà écrit : « l'ordinateur personnel de l'éditeur, rendu accessible via Cloudflare, Inc. »).

> L'adresse `trycloudflare.com` change à chaque lancement. Pour une adresse fixe avec ton propre domaine : `cloudflared tunnel login`, puis un **tunnel nommé** (doc Cloudflare « Create a locally-managed tunnel »).

Pense à **sauvegarder** avant et après la session de test : `npm run backup`.

---

## B. Serveur dédié (Ubuntu / Debian)

Exemple avec un serveur gratuit **Oracle Cloud Always Free** (Ampere ARM, 4 cœurs, 24 Go) ou n'importe quel VPS. Sans carte graphique : correcteur IA par l'API Anthropic (ou Ollama sur CPU, lent), voix pré-générées sur ton PC puis copiées (SETUP.md, 6 octies).

### 1. Système et Node.js
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node --version                      # ≥ 22.5
sudo useradd --system --home /opt/mochi --shell /usr/sbin/nologin mochi
```
Pare-feu : n'ouvre que **22 (SSH), 80 et 443**. Chez Oracle, aussi dans la « Security List » du réseau.

### 2. Le code
```bash
sudo git clone <ton dépôt> /opt/mochi
cd /opt/mochi && sudo npm ci --omit=dev
sudo mkdir -p data && sudo chown -R mochi:mochi data content content.data.js
```

### 3. La configuration (`/opt/mochi/.env`)
```
NODE_ENV=production
HOST=127.0.0.1
PORT=8000
COOKIE_SECURE=1
TRUST_PROXY=127.0.0.1,::1
PUBLIC_URL=https://mochi.ton-domaine.fr
MOCHI_LLM_PROVIDER=claude
ANTHROPIC_API_KEY=...
RESEND_API_KEY=...
MAIL_FROM=Mochi <bonjour@ton-domaine.fr>
FEEDBACK_TO=ton.adresse@exemple.fr
```
`sudo chown mochi:mochi .env && sudo chmod 600 .env` (les clés ne doivent être lisibles que par le service).
Dans Resend, **vérifie ton domaine** : sinon les e-mails de tes utilisateurs ne partent pas.

### 4. Le service
```bash
sudo cp deploy/mochi.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mochi
curl -s http://127.0.0.1:8000/api/health        # {"ok":true,"db":"ok",…}
journalctl -u mochi -f                           # journal (erreurs datées)
```
Premier compte admin : inscris-toi sur le site, puis `sudo -u mochi node tools/admin.js add ton@email.fr`.

### 5. HTTPS avec Caddy
Fais pointer ton domaine (enregistrement A) vers l'IP du serveur, puis :
```bash
sudo apt install -y caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile     # remplace mochi.example.fr
sudo systemctl reload caddy
```
Caddy obtient le certificat tout seul. Le `flush_interval -1` du Caddyfile est nécessaire au **duel en direct** (flux en temps réel).

### 6. Sauvegardes : deux niveaux
**a. Continue avec Litestream → Cloudflare R2** (perte maximale : quelques secondes)
1. Cloudflare › R2 : crée un bucket `mochi-sauvegardes` (privé) et une clé API « Object Read & Write » limitée à ce bucket.
2. Installe Litestream (https://litestream.io/install/) puis :
   ```bash
   sudo cp deploy/litestream.yml /etc/litestream.yml
   sudo tee /etc/default/litestream >/dev/null <<'X'
   LITESTREAM_ACCESS_KEY_ID=...
   LITESTREAM_SECRET_ACCESS_KEY=...
   R2_ACCOUNT_ID=...
   X
   sudo chmod 600 /etc/default/litestream
   sudo systemctl enable --now litestream
   journalctl -u litestream -f                    # « replicating » sans erreur
   ```

**b. Quotidienne, sur le serveur** (base vérifiée + photos de profil, 14 jours) :
```bash
sudo cp deploy/mochi-backup.service deploy/mochi-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mochi-backup.timer
systemctl list-timers | grep mochi
```
Copie-les ailleurs de temps en temps (`rclone copy /opt/mochi/data/backups r2:mochi-sauvegardes/quotidiennes`).

Puis **fais le test de restauration** : `docs/restauration.md`. Une sauvegarde jamais restaurée ne compte pas.

### 7. Surveillance
- **Uptime Kuma** (auto-hébergé, gratuit) ou UptimeRobot (offre gratuite) : moniteur HTTP sur `https://mochi.ton-domaine.fr/api/health`, alerte par e-mail si ≠ 200.
- Erreurs : `journalctl -u mochi --since today | grep -E "Erreur|rejetée"`.

### 8. Mettre à jour
```bash
cd /opt/mochi && sudo -u mochi npm run backup
sudo git pull && sudo npm ci --omit=dev && sudo systemctl restart mochi
```

### 9. Avant d'ouvrir au public
- [ ] `LEGAL_INFO` rempli dans `legal.js` (éditeur, contact, **hébergeur**), puis `TERMS_VERSION` mis à jour dans `server.js`
- [ ] Domaine vérifié chez Resend
- [ ] `/api/health` surveillé
- [ ] Litestream « replicating » et sauvegarde quotidienne active
- [ ] Test de restauration fait et noté dans `docs/restauration.md`
- [ ] Clés (`.env`, `/etc/default/litestream`) en `chmod 600`
