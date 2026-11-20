# commande.md : les commandes de Mochi

Toutes les commandes se lancent depuis le dossier du projet. Celles qui commencent par `npm run` lisent `.env` toutes seules. Pour le détail de chaque étape, voir `SETUP.md`.

---

## 🚀 Lancer et vérifier le site

| Commande | À quoi elle sert |
|---|---|
| `npm install` | Installe les dépendances (une fois, puis après chaque mise à jour de `package.json`). |
| `npm start` | Lance le site sur http://localhost:8000. Préchauffe les voix et Ollama en arrière-plan. |
| `npm test` | Lance tous les tests (site, comptes, synchro, correcteur, voix, matériel, contenu). À faire avant chaque commit. |
| `npm run doctor` | Diagnostic de la machine : carte graphique, RAM, Docker, Ollama, voix, analyseur Kiwi. Affiche les commandes à copier. Ne change rien. |
| `npm run doctor -- --write` | Écrit les réglages recommandés dans `.env`, avec une copie de sauvegarde. Ne touche jamais aux clés secrètes existantes ; crée les clés VAPID des rappels si elles manquent. |
| `npm run doctor -- --pull` | Propose de télécharger le modèle Ollama recommandé. |

## 💾 Sauvegardes et mise en ligne

| Commande | À quoi elle sert |
|---|---|
| `npm run backup` | Sauvegarde vérifiée de la base + photos de profil, même site allumé (dans `data/backups`, 14 gardées). |
| `npm run backup -- --list` | Liste les sauvegardes. |
| `npm run restore -- mochi-20261119-033012 --yes` | Restaure une sauvegarde (site **arrêté**) ; l'ancienne base est mise de côté. |
| `curl http://127.0.0.1:8000/api/health` | Le site et sa base répondent-ils ? (pour Uptime Kuma) |
| `npm run portable` | Version portable pour un ami (Windows) : un dossier + un zip dans `dist/`, il double-clique sur « Lancer Mochi ». `-- --os mac` / `-- --os linux`, `-- --with-feedback` (avis relayés à ton site de bêta, `FEEDBACK_ENDPOINT`), `-- --with-mail-key` (clé Resend dans le paquet, avis par e-mail direct : zip pour des proches seulement). `-- --os mobile` : iPhone et Android (site sans serveur à glisser sur Netlify Drop, puis « Ajouter à l'écran d'accueil »). Voir `docs/beta.md`. |
| `cloudflared tunnel --url http://localhost:8000` | Adresse https publique temporaire pour faire tester tes amis (voir `docs/mise-en-ligne.md`). |

## 👤 Comptes administrateurs

| Commande | À quoi elle sert |
|---|---|
| `node tools/admin.js list` | Liste les admins. |
| `node tools/admin.js add prenom@exemple.fr` | Rend admin un compte existant : toutes les leçons ouvertes, accès à `#/admin` et `#/admin/contenu`. |
| `node tools/admin.js remove prenom@exemple.fr` | Retire les droits d'admin. |

## 🔊 Voix (audio)

| Commande | À quoi elle sert |
|---|---|
| `tools/start-voices.sh` (Linux/macOS) · `tools\start-voices.ps1` (Windows) | Démarre les vraies voix : Kokoro (anglais, Docker) et MeloTTS (coréen). À relancer après un redémarrage du PC. |
| `npm run tts:pregen` | Génère d'avance l'audio de toutes les phrases du site, pour chaque voix. Reprend là où il s'est arrêté. |
| `npm run tts:pregen -- --dry-run` | Compte seulement : combien de phrases sont déjà en cache et combien restent à générer. |
| `npm run tts:pregen -- --lang en --voices af_heart,bf_emma` | Seulement une langue ou certaines voix. |

## 🧠 Correcteur IA (Ollama, local)

| Commande | À quoi elle sert |
|---|---|
| `ollama serve` | Démarre Ollama s'il ne tourne pas déjà. |
| `ollama pull qwen2.5:7b-instruct` | Télécharge le modèle local utilisé par défaut. |
| `ollama ps` | Montre le modèle chargé et s'il tourne sur la carte graphique ou le processeur. |

---

## ✍️ Produire du contenu (CONTENU-PIPELINE)

Le chemin complet :
**plan → génération → vérification → relecture dans l'admin → publication → release**

### 1. Les outils Python (une fois)

| Commande | À quoi elle sert |
|---|---|
| `uv venv --python 3.12 ~/mochi-nlp && source ~/mochi-nlp/bin/activate` | Crée l'environnement Python des outils de langue. |
| `uv pip install kiwipiepy wordfreq simplemma xlrd` | Installe l'analyseur coréen et les outils de fréquence. |
| `~/mochi-nlp/bin/python tools/kiwi_server.py` | **Démarre l'analyseur coréen Kiwi** (http://127.0.0.1:8882). Il doit tourner pour générer ou corriger du coréen. |
| `~/mochi-nlp/bin/python tools/freq_export.py` | Refait les listes de fréquence (`content/freq/en.tsv` et `ko.tsv`). Rarement utile : elles sont déjà commitées. |
| `~/mochi-nlp/bin/python tools/freq_export.py --lang ko --nikl liste.xls` | Coréen : reprend les niveaux A/B/C officiels du fichier .xls du 국립국어원. |

Sous Windows : `& $HOME\mochi-nlp\Scripts\Activate.ps1`, puis `python tools\kiwi_server.py`.

### 2. Le plan : quoi écrire

| Commande | À quoi elle sert |
|---|---|
| `npm run plan:suggest -- --lang ko` | Aperçu des 5 prochaines unités du plan : mots fréquents pas encore vus, grammaire, thème. |
| `npm run plan:suggest -- --lang en --next 10 --write` | Ajoute 10 unités à `content/plan/en.json`. |
| `npm run plan:suggest -- --lang ko --words 6` | Nombre de mots nouveaux par unité (5 par défaut). |

### 3. Générer des brouillons

| Commande | À quoi elle sert |
|---|---|
| `npm run content:gen -- --unit ko-A1-03` | Génère les textes d'une unité dans `content/drafts/`. |
| `npm run content:gen -- --next 5 --lang en` | Génère les textes des 5 prochaines unités qui n'en ont pas encore. |
| `… --engine anthropic` | Utilise Claude au lieu d'Ollama : bien meilleure qualité, payant, demande `ANTHROPIC_API_KEY`. |
| `… --model qwen2.5:14b-instruct` | Choisit un autre modèle. |
| `… --variants 3` | Nombre de variantes générées par texte : on garde la meilleure (2 par défaut). |
| `… --repair 2` | Nombre de tours de correction si la meilleure variante a encore des problèmes bloquants (1 par défaut). |
| `… --no-review` | Saute la relecture critique par l'IA (plus rapide). |
| `npm run content:gen -- --unit ko-A1-03 --only 2` | Régénère seulement le 2e texte de l'unité. |
| `npm run content:gen -- --unit ko-A1-03 --dry-run` | Affiche le prompt sans rien générer. |

### 4. Annoter et vérifier

| Commande | À quoi elle sert |
|---|---|
| `npm run content:annotate -- --lang ko "커피가 정말 맛있어요."` | Annote une phrase au format Mochi (`커피\|가 정말 맛있어요=맛있다.`). |
| `npm run content:annotate -- --eval` | Compare l'annotation automatique aux textes annotés à la main (taux de lemmes et de particules retrouvés). |
| `npm run content:check` | Vérifie tous les textes publiés et tous les brouillons : 🟢 OK, 🟠 avertissement, 🔴 bloquant. Échoue si un texte **publié** a un problème bloquant. |
| `npm run content:check -- drafts/ko-a1-03-1.json` | Vérifie un seul fichier. |
| `npm run content:check -- --write` | Enregistre le rapport dans chaque brouillon. |

### 5. Relire et publier (dans le navigateur)

| Adresse | À quoi elle sert |
|---|---|
| `#/admin/contenu` | File des brouillons à relire, triés par unité du plan. |
| `#/admin/contenu/<id>` | Un brouillon : écouter, corriger, accepter ou ignorer les remarques de l'IA, valider le lexique, **Publier**, **Régénérer**, **Rejeter**. |
| `#/admin/contenu/couverture` | Tableau de bord : textes par niveau et par thème, mots fréquents couverts, grammaire, trous, objectifs. |

### 6. Construire et sortir une version

| Commande | À quoi elle sert |
|---|---|
| `npm run content:build` | Reconstruit `content.data.js` depuis `content/`. À lancer après toute modification à la main dans `content/`. Publier depuis l'admin le fait tout seul. |
| `npm run content:build -- --check` | Vérifie seulement que `content.data.js` est à jour. |
| `npm run content:release` | Tout d'un coup : vérification → build → audio des nouvelles phrases → rapport. |
| `npm run content:release -- --no-audio` | Pareil, sans générer l'audio. |

### 7. Envoyer l'audio sur le serveur en ligne

| Commande | À quoi elle sert |
|---|---|
| `rsync -av --ignore-existing data/tts/ utilisateur@serveur:/srv/mochi/data/tts/` | Linux/macOS : envoie seulement les nouveaux fichiers audio. |
| `scp -r data\tts\* utilisateur@serveur:/srv/mochi/data/tts/` | Windows (ou WinSCP en glisser-déposer). |
| `rclone copy data/tts r2:mochi-audio/tts --ignore-existing --progress` | Vers Cloudflare R2 (après `rclone config`). |

---

## 🗂️ Git (après une séance de travail)

| Commande | À quoi elle sert |
|---|---|
| `git status` | Voir ce qui a changé. |
| `git add content content.data.js` | Ajouter le contenu publié et le fichier généré. |
| `git commit -m "Contenu : 5 textes coréens A1"` | Enregistrer. |

---

## ⚡ Routine type pour produire du contenu

```bash
~/mochi-nlp/bin/python tools/kiwi_server.py &                       # 1. analyseur coréen
npm start                                                           # 2. le site (autre terminal)
npm run content:gen -- --next 3 --lang ko --engine anthropic        # 3. brouillons
# 4. relire et publier dans http://localhost:8000/#/admin/contenu
npm run content:release                                             # 5. vérification + audio
git add content content.data.js && git commit -m "Contenu : …"      # 6. enregistrer
```
