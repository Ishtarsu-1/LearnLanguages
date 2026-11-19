# SETUP.md : installer et configurer Mochi

Ce guide explique comment lancer Mochi sur ta machine et comment activer le **correcteur IA** (la correction des phrases dans l'onglet « Produire »). Deux moteurs au choix :

| | **Claude** (API) | **Ollama** (local) |
|---|---|---|
| Prix | ~1 à 3 centimes par correction (Opus), ~0,05 avec Haiku | **Gratuit** |
| Qualité en coréen | Très bonne (registres, particules) | Correcte à moyenne, selon le modèle |
| Vitesse | Quelques secondes | ~20 s par correction sur CPU (section 6 bis) |
| Confidentialité | Phrases envoyées à Anthropic | Rien ne quitte ta machine |
| Pour un site en ligne | ✅ | Seulement avec un serveur qui a une carte graphique |

Pour développer gratuitement : **Ollama** (section 6 bis). Pour le site public : **Claude** (sections 3 à 6).

---

## 1. Prérequis

- **Node.js 22.5 ou plus récent** (`node --version` pour vérifier). Mochi utilise la base SQLite intégrée à Node, il n'y a rien d'autre à installer.
- **git**

## 2. Installer et lancer

```bash
git clone git@github.com:Ishtarsu-1/LearnLanguages.git
cd LearnLanguages
npm install        # installe le SDK Claude et zod (validation)
npm run doctor     # te dit quoi installer pour TA machine (voix, correcteur IA)
npm start          # → http://localhost:8000
```

**Lance `npm run doctor` : il te dit quoi installer pour ta machine.** Il détecte le système, le processeur, la mémoire, la carte graphique NVIDIA (ou Apple Silicon), Docker, Python 3.10 / uv, Ollama et les moteurs de voix (chronométrés), choisit un **profil**, puis affiche les commandes à copier, adaptées à ton système (PowerShell sous Windows). Il n'installe jamais rien tout seul.

| Profil | Machine | Voix anglaises | Voix coréennes | Correcteur IA |
|---|---|---|---|---|
| `gpu-large` | NVIDIA ≥ 12 Go | Kokoro, image **GPU** | MeloTTS `DEVICE=cuda` | Ollama `qwen2.5:14b-instruct` |
| `gpu-small` | NVIDIA 6 à 12 Go | Kokoro GPU | MeloTTS `cuda` | Ollama `qwen2.5:7b-instruct` |
| `apple` | Apple Silicon, ≥ 16 Go | Kokoro CPU | MeloTTS `DEVICE=mps` | Ollama 7B (Metal automatiquement) |
| `cpu` | pas de carte graphique utilisable | Kokoro CPU + **pré-génération obligatoire** | MeloTTS CPU + pré-génération | API Anthropic si clé, sinon Ollama 7B (lent) |
| `light` | < 8 Go de RAM | voix du navigateur, ou audio pré-généré ailleurs puis copié dans `data/tts/` | idem | API Anthropic si clé, sinon correcteur hors ligne |

Il signale aussi les incohérences : carte graphique présente mais Kokoro dans l'image CPU, Docker qui ne voit pas la carte, Ollama « 100% CPU » alors qu'il y a une carte, MeloTTS trop lent pour tourner sur la carte, `localhost` dans les adresses, mémoire juste…

```bash
npm run doctor -- --write   # écrit les variables recommandées dans .env
npm run doctor -- --pull    # propose de télécharger le modèle Ollama recommandé (o/N)
```

`--write` fait d'abord une copie de sauvegarde (`.env.bak-AAAAMMJJ-HHMM`), ne modifie que les lignes concernées (`TTS_*`, `MOCHI_LLM_PROVIDER`, `MOCHI_MODEL`, `OLLAMA_URL`), ne touche **jamais** aux secrets (`ANTHROPIC_API_KEY`, clés d'e-mail) et affiche le différentiel.

> Le diagnostic ne concerne que la machine qui **héberge** Mochi. Le site ne cherche jamais à connaître l'ordinateur des visiteurs.

**Au démarrage**, `npm start` s'adapte à la vitesse réelle des moteurs : si une voix met plus de 3 s pour une phrase courte, il le signale (« lance `npm run tts:pregen` ») et le site arrête de précharger l'audio et passe plus vite à la voix de l'appareil ; si Ollama met plus de 20 s à se charger, les élèves sont prévenus que la correction peut prendre un moment ; un moteur qui ne répond pas est simplement ignoré (voix du navigateur, correcteur hors ligne). Le tableau de bord admin (`#/admin`) montre le bloc **Machine** : profil, carte graphique, mémoire, état et vitesse de chaque moteur, audio déjà pré-généré par voix, et un bouton « Relancer le diagnostic ».

Ouvre **http://localhost:8000** dans ton navigateur. Le site fonctionne tout de suite : comptes, révisions, exercices et correcteur hors ligne. Seul le correcteur Claude demande une clé API (section suivante).

> Sans le serveur (par exemple avec `python3 -m http.server`), le site marche en **mode invité** : progression dans le navigateur, pas de comptes ni de correcteur Claude.

---

## 3. Obtenir une clé API Claude

1. **Crée un compte** sur la console Claude : **https://platform.claude.com**
2. **Ajoute des crédits** : menu *Billing* (Facturation), puis ajoute un moyen de paiement et achète quelques crédits (5 $ suffisent largement pour tester).
3. **Fixe une limite de dépense** (fortement conseillé) : dans *Limits*, mets un plafond mensuel, par exemple 10 $. Tu ne pourras pas dépasser ce montant, même en cas de bug.
4. **Crée la clé** : *Settings*, puis *API Keys*, puis *Create Key*. Donne-lui un nom (par exemple `mochi-local`).
5. **Copie la clé tout de suite** : elle commence par `sk-ant-…` et ne s'affiche **qu'une seule fois**. Si tu la perds, supprime-la et recrées-en une.

> 🔒 **La clé est un secret, comme un mot de passe bancaire.** Ne la colle jamais dans le code, dans un commit, sur Discord ou dans une capture d'écran. Si elle fuit, supprime-la immédiatement dans la console (*API Keys*, puis *Delete*) et crée-en une nouvelle.

## 4. Donner la clé à Mochi

**Méthode conseillée : fichier `.env`**

```bash
cp .env.example .env
```

Ouvre `.env` et colle ta clé :

```
ANTHROPIC_API_KEY=sk-ant-ta-cle-ici
```

Puis relance le serveur avec `npm start`. Le fichier `.env` est dans le `.gitignore` : il ne sera **jamais** commité.

**Autre méthode : variable d'environnement, juste pour une session**

```bash
ANTHROPIC_API_KEY=sk-ant-ta-cle-ici npm start
```

## 5. Vérifier que ça marche

1. Ouvre http://localhost:8000 et **crée un compte** (le correcteur Claude est réservé aux comptes).
2. Choisis une langue, puis l'onglet **💬 Produire**, puis **✍️ Phrase libre**.
3. Écris une phrase avec une petite faute, par exemple en coréen `저는 커피을 좋아해`, et clique sur **Vérifier**.
4. Sous la correction, tu dois voir **« ✨ Corrigé par Claude · N correction(s) restante(s) aujourd'hui »**.

Si tu vois plutôt **« Correcteur hors ligne (…) »**, le message entre parenthèses donne la cause (voir la section Dépannage).

---

## 6. Combien ça coûte ?

Par défaut, le correcteur utilise **Claude Opus 5.5** (4 $ par million de tokens en entrée, 20 $ par million en sortie). Une correction, c'est une phrase courte plus les consignes, soit **environ 1 à 3 centimes** (estimation : le coût réel dépend de la longueur de la réponse et de la réflexion du modèle). Tu peux suivre la dépense exacte dans la console, onglet *Usage*.

Protections déjà en place :
- **30 corrections maximum par compte et par jour** (`MOCHI_LLM_DAILY` pour changer).
- **Plafond global : 500 appels à l'IA par jour pour tout le site** (`MOCHI_LLM_GLOBAL_DAILY`). Au-delà, et jusqu'à minuit (UTC), les corrections passent par le correcteur hors ligne avec un message honnête : « Le correcteur IA fait une pause pour aujourd'hui, voici la correction simplifiée ». Le compteur est en base : un redémarrage ne le remet pas à zéro. Avec Opus, 500 appels ≈ 5 à 15 $ par jour au pire.
- **Cache des réponses** : une même phrase (aux espaces près) pour le même exercice, le même interlocuteur et la même langue n'appelle l'IA qu'une fois. Les réponses sont gardées 90 jours, et une réponse servie depuis le cache **ne décompte pas** le quota. Changer de modèle ou modifier le prompt invalide automatiquement les anciennes réponses.
- Une correction qui échoue n'est **pas** décomptée.
- Les invités n'ont pas accès au correcteur Claude.
- Le **tableau de bord admin** (`#/admin`) affiche les appels du jour, le taux de réponses servies depuis le cache et une estimation du coût du jour (calculée à partir des jetons réellement consommés).
- Ajoute à ça la **limite de dépense** de la console (étape 3).

Pour réduire le coût, tu peux choisir un modèle moins cher dans `.env`, en échange d'une qualité de correction peut-être moindre (surtout pour les nuances de registre en coréen) :

```
MOCHI_MODEL=claude-sonnet-5-5   # environ 2 fois moins cher
MOCHI_MODEL=claude-haiku-5-5    # environ 40 fois moins cher
```

### Choisir le modèle : évaluation

Ne change pas le modèle par défaut à l'aveugle : `tests/eval-llm.js` fait corriger 10 phrases typiques d'apprenants (vraies fautes, phrases justes à ne pas sur-corriger, registre coréen) et donne un score, le temps et le coût moyens.

```bash
node --env-file=.env tests/eval-llm.js                                   # Opus (défaut)
MOCHI_MODEL=claude-sonnet-5-5 node --env-file=.env tests/eval-llm.js
MOCHI_MODEL=claude-haiku-5-5  node --env-file=.env tests/eval-llm.js
```

Si un modèle plus léger obtient **le même score** qu'Opus, mets-le dans `MOCHI_MODEL`.

| Modèle | Score | Temps moyen | Coût moyen |
|---|---|---|---|
| `claude-opus-5-5` | à mesurer | | |
| `claude-sonnet-5-5` | à mesurer | | |
| `claude-haiku-5-5` | à mesurer | | |
| Ollama `qwen2.5:7b-instruct` (CPU, 18/11/2026) | 9/10 | 21,8 s | gratuit |

> L'évaluation consomme quelques centimes par modèle. Elle n'a pas encore été lancée (aucune clé API sur la machine de développement) : le défaut reste Opus en attendant.

---

## 6 bis. Correcteur gratuit et local avec Ollama

[Ollama](https://ollama.com) fait tourner un modèle de langage sur ton propre ordinateur.

1. **Installe Ollama** (s'il n'est pas déjà là : `ollama --version`) : suis les instructions de https://ollama.com/download pour ton système, puis vérifie qu'il tourne avec `curl http://127.0.0.1:11434/api/version`.
2. **Télécharge le modèle** (4,7 Go) :
   ```bash
   ollama pull qwen2.5:7b-instruct
   ```
3. **Configure Mochi** dans `.env` :
   ```
   MOCHI_LLM_PROVIDER=ollama
   # MOCHI_MODEL=qwen2.5:7b-instruct   # c'est déjà le modèle par défaut avec Ollama
   ```
4. Relance `npm start`. Le terminal affiche `correcteur : Ollama (qwen2.5:7b-instruct)`.
5. **Mesure la qualité sur ta machine** (gratuit avec Ollama). Mesuré sur un i7-13620H, sans carte graphique, avec 23 Go de RAM : **9/10** et **~22 s par correction** (la première, qui charge le modèle, est plus lente). La seule erreur ratée est une nuance (에 → 에서) que Claude, lui, repère.
   ```bash
   MOCHI_LLM_PROVIDER=ollama node tests/eval-llm.js
   ```
   Le script soumet 10 phrases d'apprenants (anglais et coréen, avec et sans fautes) et affiche le score et le temps moyen par correction.

**Quel modèle choisir ?** Ça dépend de ta mémoire vive :

| Machine | Modèle conseillé | Taille |
|---|---|---|
| 8 Go de RAM | `qwen2.5:3b-instruct` (rapide, mais faible en coréen) | 1,9 Go |
| 16 Go de RAM, sans carte graphique | `qwen2.5:7b-instruct` (**défaut**) | 4,7 Go |
| 32 Go ou plus, ou une carte graphique de 12 Go et plus | `qwen2.5:14b-instruct` (meilleur coréen, plus lent sur CPU) | 9 Go |

Qwen est l'une des familles de petits modèles les plus solides en coréen. Les modèles de 3 milliards de paramètres sont trop faibles pour juger les registres.

> 💡 **Carte graphique NVIDIA :** si ton PC portable en a une, installe son pilote. Ollama l'utilisera automatiquement et les corrections seront 5 à 10 fois plus rapides. Vérifie avec `nvidia-smi`.

Bon à savoir :
- La **première** correction est plus lente : le modèle se charge en mémoire. Il y reste 30 minutes après la dernière utilisation.
- Si une correction dépasse 3 minutes, elle est abandonnée et le correcteur hors ligne prend le relais (`OLLAMA_TIMEOUT_MS` pour changer ce délai).
- Le quota de corrections par jour s'applique aussi (protège ton processeur).

## 6 ter. Vraies voix (facultatif, gratuit)

**Sans rien configurer**, Mochi lit les textes avec les voix **installées sur l'appareil** (synthèse du navigateur). La qualité dépend beaucoup du navigateur :

| Navigateur | Voix anglaises | Voix coréennes |
|---|---|---|
| **Microsoft Edge** (même sous Linux) | ✅ « Natural », très bonnes | ✅ SunHi, InJoon (Natural) |
| **Google Chrome** | ✅ « Google » | ✅ « Google 한국의 » |
| Safari (macOS, iPhone) | ✅ | ✅ Yuna (à télécharger dans les réglages d'accessibilité) |
| **Chromium / Firefox sous Linux** | ❌ aucune par défaut | ❌ aucune par défaut |

Sous Linux, Chromium et Firefox passent par `speech-dispatcher`. Sans lui, **aucun son**. Avec `sudo pacman -S speech-dispatcher espeak-ng` (ou `apt install speech-dispatcher espeak-ng`), puis un redémarrage du navigateur, le son marche, mais la voix est très robotique. Le **Profil › Audio** de Mochi indique quelles voix il trouve et permet d'en choisir une et de la tester.

**Voix du serveur (recommandé pour le site public).** Le serveur peut générer l'audio avec des moteurs neuronaux libres, puis garder chaque phrase en cache dans `data/tts/` (une phrase n'est générée qu'une seule fois). Tous les utilisateurs ont alors les mêmes bonnes voix, sur tous les appareils, et l'écoute multi-voix (§14) utilise de vrais locuteurs différents. N'importe quel moteur compatible « OpenAI audio/speech » convient.

**Anglais : Kokoro** (licence Apache 2.0, plusieurs voix américaines et britanniques, tourne sur CPU) :

```bash
docker run -d --restart unless-stopped -p 127.0.0.1:8880:8880 --name kokoro ghcr.io/remsky/kokoro-fastapi-cpu:latest
curl http://127.0.0.1:8880/health   # attendre qu'il réponde
```

**Coréen : MeloTTS** (licence MIT, CPU). Kokoro ne parle pas coréen. `tools/melotts_server.py` expose MeloTTS avec le même protocole :

MeloTTS demande **Python 3.10** (pas 3.12+). Avec `uv`, qui installe la bonne version tout seul :

```bash
uv venv --python 3.10 ~/melotts && source ~/melotts/bin/activate
uv pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu   # version CPU, évite ~3 Go de CUDA
uv pip install git+https://github.com/myshell-ai/MeloTTS.git
uv pip uninstall unidic && rm -rf ~/melotts/lib/python3.10/site-packages/unidic
uv pip install unidic-lite python-mecab-ko   # dictionnaires légers (évite le téléchargement d'unidic, ~500 Mo et très lent)
python tools/melotts_server.py      # → http://127.0.0.1:8881/v1
```

Au premier lancement, MeloTTS télécharge son modèle (~1 Go). Ensuite, une phrase prend moins d'une seconde sur CPU. La toute première après le démarrage prend ~3 s.

Puis dans `.env` :

```
TTS_URL_EN=http://127.0.0.1:8880/v1
TTS_VOICES_EN=af_heart,af_bella,am_michael,am_fenrir,bf_emma,bm_george
TTS_URL_KO=http://127.0.0.1:8881/v1
TTS_VOICES_KO=KR
TTS_MODEL_KO=melotts
# Chinois : Kokoro a aussi des voix mandarin, dans le même conteneur que l'anglais
TTS_URL_ZH=http://127.0.0.1:8880/v1
TTS_VOICES_ZH=zf_xiaobei,zf_xiaoxiao,zm_yunxi,zm_yunjian
# Russe : Piper (voir ci-dessous)
TTS_URL_RU=http://127.0.0.1:8883/v1
TTS_VOICES_RU=irina,denis,dmitri,ruslan
TTS_MODEL_RU=piper
```

**Voix russes avec Piper** (licence MIT, rapide sur processeur : ~0,3 s par phrase) :

```bash
uv venv --python 3.12 ~/piper && source ~/piper/bin/activate
uv pip install piper-tts
mkdir -p ~/piper/voices && cd ~/piper/voices
for v in irina denis dmitri ruslan; do for e in onnx onnx.json; do
  curl -L -o ru_RU-$v-medium.$e https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/$v/medium/ru_RU-$v-medium.$e
done; done
cd - && python tools/piper_server.py        # → http://127.0.0.1:8883/v1 (lancé aussi par tools/start-voices.sh)
```
Irina est une voix féminine ; Denis, Dmitri et Ruslan sont masculines. D'autres langues de Piper s'ajoutent de la même façon (fichiers `.onnx` dans `~/piper/voices`).

Relance `npm start`. La ligne de démarrage affiche `voix : en ×4, ko ×1`, et le Profil › Audio indique « 🎙️ Voix neuronales du serveur ». Si le moteur ne répond pas, Mochi repasse automatiquement sur la voix du navigateur.

- La liste exacte des voix Kokoro est disponible sur `http://127.0.0.1:8880/v1/audio/voices`. Mets-en 2 à 6, variées (homme, femme, accents), pour l'écoute multi-voix.
- Les voix Kokoro les mieux notées : `af_heart` (A), `af_bella` (A-), puis `bf_emma`, `am_michael`, `am_fenrir`, `bm_george` (préfixes : a = américain, b = britannique, f / m = femme / homme).
- Kokoro redémarre tout seul avec Docker. `tools/melotts_server.py`, lui, est à relancer après un redémarrage du PC.
- MeloTTS n'a qu'une voix coréenne : Mochi en fait 4 « locuteurs » en variant la hauteur et le débit.
- Mets toujours **`127.0.0.1`** dans les adresses, pas `localhost` : Kokoro et MeloTTS n'écoutent que sur `127.0.0.1`, et sous Windows, `localhost` est d'abord essayé en IPv6, ce qui ajoute du délai.
- La génération au clic est limitée à 40 phrases par minute et par adresse IP. Les phrases déjà en cache sont servies sans limite.
- Le cache se vide en supprimant `data/tts/`. Relance ensuite la pré-génération.

### Pré-générer tout l'audio (à faire après chaque ajout de contenu et avant chaque mise en ligne)

Le contenu est fixe : rien ne devrait être généré au premier clic (sur processeur, la première écoute d'une phrase peut prendre plusieurs secondes). Le script génère d'avance **toutes** les phrases que le site peut lire (textes, livres, histoire, missions, mots, oreille, grammaire, Hangul…), pour **chaque voix** configurée :

```bash
npm run tts:pregen -- --dry-run           # combien de phrases, combien déjà en cache
npm run tts:pregen                        # tout (≈ 600 phrases par voix en anglais, 540 en coréen)
npm run tts:pregen -- --lang en --voices af_heart,bf_emma
```

Il appelle les moteurs directement (pas besoin que le site tourne, pas de limite de débit), affiche la progression et le temps restant (`en · af_heart · 412/579 · reste ~6 min`), et reprend là où il s'est arrêté si tu l'interromps. La liste des phrases vient de la même fonction que le site (`spokenSentences()` dans `audio.js`) : les deux ne peuvent pas diverger. Seules les phrases imprévisibles (réponses de l'IA, phrase corrigée de l'apprenant, syllabes de l'atelier) restent générées au clic.

### Quand une voix tarde quand même

- Au démarrage, `npm start` **préchauffe** chaque moteur (une phrase courte pour charger le modèle) et affiche sa vitesse : `Voix en : prête (0,4 s) · Voix ko : prête (0,7 s)`, ou un avertissement clair si un moteur ne répond pas. Le site, lui, est disponible tout de suite.
- Les **clics passent avant le préchargement** : une seule génération à la fois par moteur, et la demande d'un clic passe devant toutes celles du préchargement en attente.
- Pendant le chargement, le bouton 🔊 pulse doucement. Si l'audio du serveur n'est pas arrivé au bout de **5 s**, le site lit la phrase avec la voix de l'appareil pour cette fois. Le serveur, lui, termine la génération : la phrase sera en cache au clic suivant.
- Le serveur abandonne une génération au bout de 15 s (`TTS_TIMEOUT_MS`).

### Windows (PowerShell)

Testé sur Windows 11 avec une carte NVIDIA. Lance d'abord `npm run doctor` : il détecte ta machine et affiche les commandes adaptées.

1. **Docker Desktop** avec le moteur **WSL 2**, et le **pilote NVIDIA** à jour. Vérifie la carte avec `nvidia-smi`.
2. **Kokoro sur la carte graphique** (bien plus rapide que l'image CPU) :
   ```powershell
   docker run -d --restart unless-stopped --gpus all -p 127.0.0.1:8880:8880 --name kokoro ghcr.io/remsky/kokoro-fastapi-gpu:latest
   ```
3. **MeloTTS** (Python 3.10, avec [uv](https://docs.astral.sh/uv/)) :
   ```powershell
   uv venv --python 3.10 $HOME\melotts
   & $HOME\melotts\Scripts\Activate.ps1      # si refusé : Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   uv pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121 --reinstall
   python -c "import torch; print(torch.cuda.is_available())"   # doit afficher True
   uv pip install git+https://github.com/myshell-ai/MeloTTS.git
   uv pip uninstall unidic; Remove-Item -Recurse -Force $HOME\melotts\Lib\site-packages\unidic
   uv pip install unidic-lite python-mecab-ko
   $env:DEVICE="cuda"; python tools\melotts_server.py
   ```
4. **Ollama pour Windows** (https://ollama.com/download) utilise la carte graphique tout seul. Vérifie avec `ollama ps` : la colonne doit indiquer **100% GPU**.
5. **Mesure la vitesse** d'une phrase (sous PowerShell, écris bien `curl.exe` : `curl` tout court est un alias d'une autre commande) :
   ```powershell
   curl.exe -s -o NUL -w "%{time_total} s`n" -X POST http://127.0.0.1:8880/v1/audio/speech -H "Content-Type: application/json" -d "{\"model\":\"kokoro\",\"input\":\"Hello there.\",\"voice\":\"af_heart\"}"
   ```

MeloTTS ne redémarre pas tout seul : après chaque redémarrage du PC, lance `tools\start-voices.ps1` (Windows) ou `tools/start-voices.sh` (Linux, macOS). Ils démarrent MeloTTS avec le bon environnement (et le conteneur Kokoro s'il est arrêté).

## 6 quater. E-mails (mot de passe oublié, vérification de l'adresse)

Mochi envoie deux sortes d'e-mails : le lien de **réinitialisation du mot de passe** (usage unique, 30 minutes) et le lien de **confirmation de l'adresse** (envoyé à l'inscription, valable 7 jours). La confirmation ne bloque rien : un bandeau dans le profil la rappelle.

- **En local, sans rien configurer** : les e-mails ne partent pas. Ils s'affichent dans le terminal du serveur, avec le lien à copier dans le navigateur.
- **Pour de vrai** : crée un compte gratuit sur **https://resend.com** (3 000 e-mails par mois), vérifie ton nom de domaine, crée une clé API, puis dans `.env` :

```
RESEND_API_KEY=re_ta_cle
MAIL_FROM=Mochi <bonjour@ton-domaine.fr>
PUBLIC_URL=https://ton-domaine.fr
```

**Sans nom de domaine** (tests entre amis) : si tu crées le compte Resend avec **ta propre adresse**, l'expéditeur de test `onboarding@resend.dev` (utilisé par défaut, sans `MAIL_FROM`) marche tout de suite, mais **uniquement vers cette adresse**. Parfait pour recevoir les retours des testeurs ; les e-mails de mot de passe oublié et de confirmation des autres comptes, eux, ne partiront qu'une fois un domaine vérifié.

**Retours des testeurs** (« 💬 Donner mon avis », page `#/avis`, lien dans le pied de page et le profil) : ouvert aussi aux invités, 5 envois par heure et par IP. Chaque retour est enregistré dans la base (table `site_feedback`, visible dans le tableau de bord admin) et envoyé, aux couleurs de Mochi, à l'adresse de `FEEDBACK_TO` ; « Répondre » répond directement au testeur s'il a laissé son e-mail.

```
FEEDBACK_TO=ton.adresse@exemple.fr
```

`PUBLIC_URL` sert à construire les liens des e-mails. Elle n'est jamais déduite de la requête : sinon, un attaquant pourrait faire pointer le lien de réinitialisation vers son propre site.

## 6 quinquies. Comptes administrateurs

Un admin accède à **toutes les leçons sans prérequis** (Hangul, grammaire, parcours) et au **tableau de bord** `#/admin` (lien en bas du profil) : comptes, usage du correcteur et des voix, état des fonctionnalités, quantité de contenu par langue, liens directs vers chaque leçon.

```bash
node tools/admin.js add prenom@exemple.fr      # le compte doit exister (inscription sur le site)
node tools/admin.js list
node tools/admin.js remove prenom@exemple.fr
```

Aucun mot de passe ne passe par cet outil : il modifie seulement le droit admin dans `data/mochi.db`. Recharge la page après coup.

## 6 sexies. Textes légaux (avant toute mise en ligne)

Les pages **Mentions légales, Conditions d'utilisation (avec la charte de bonne conduite), Confidentialité (RGPD) et Cookies** sont dans `legal.js` (liens en bas de chaque page, `#/legal/…`). Elles décrivent le fonctionnement réel du site, et la page Confidentialité s'adapte aux services activés : elle ne cite Anthropic que si le correcteur Claude est actif, et Resend seulement si les e-mails partent vraiment.

**À faire avant d'ouvrir le site**, en haut de `legal.js` (`LEGAL_INFO`) :
- `editor` : ton prénom et ton nom (l'éditeur du site) ;
- `contact` : une adresse e-mail de contact, qui sert aussi aux demandes RGPD ;
- `host` : où tourne le site. Exemple pour un tunnel Cloudflare : « l'ordinateur personnel de l'éditeur (France), rendu accessible via Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, États-Unis ».

Tant qu'un de ces champs n'est pas rempli, il est **surligné** sur les pages, avec un avertissement. Si tu modifies ces textes plus tard, change `LEGAL_INFO.version` et `TERMS_VERSION` (`server.js`).

Ce que le site fait déjà pour être en règle :
- case obligatoire à l'inscription (conditions, confidentialité, 15 ans ou accord parental), avec la date et la version enregistrées ;
- un seul cookie, strictement nécessaire (connexion), et ni mesure d'audience ni publicité : **aucun bandeau de consentement n'est requis**, seulement un message d'information ;
- export de la progression et suppression du compte depuis le profil ;
- données temporaires (adresses IP, e-mails des tentatives, sessions et liens expirés) purgées toutes les heures.

> Ce sont des modèles sérieux et fidèles au code, pas un avis juridique. Si le site devient public à grande échelle ou commercial, fais-les relire.

## 6 septies. Mise en ligne derrière Caddy

En production, Mochi tourne derrière un **reverse proxy** qui gère le HTTPS. Avec [Caddy](https://caddyserver.com) (certificat Let's Encrypt automatique), le `Caddyfile` tient en quatre lignes :

```caddyfile
mochi.example.fr {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8000
}
```

Et dans `.env` :

```
NODE_ENV=production
HOST=127.0.0.1
COOKIE_SECURE=1
TRUST_PROXY=127.0.0.1,::1
PUBLIC_URL=https://mochi.example.fr
```

- **`HOST=127.0.0.1`** : le serveur Node n'écoute que la machine elle-même. Personne ne peut le joindre sans passer par Caddy (et donc sans HTTPS). C'est la valeur par défaut quand `NODE_ENV=production`.
- **`TRUST_PROXY`** : derrière Caddy, toutes les requêtes arrivent de `127.0.0.1`. Sans cette variable, la limitation des tentatives (connexion, inscription, voix) serait **commune à tous les visiteurs** : 10 connexions ratées par n'importe qui freineraient tout le monde. Avec elle, Mochi lit l'adresse réelle dans l'en-tête `X-Forwarded-For`, mais **uniquement** si la requête vient d'un proxy listé, et prend la **dernière** adresse de l'en-tête (celle ajoutée par Caddy ; les précédentes peuvent être inventées par le client). Les adresses IPv6 sont regroupées par bloc `/64`.
- **`COOKIE_SECURE=1`** : cookie de session marqué `Secure`, et en-tête `Strict-Transport-Security` (HSTS) envoyé.
- Le serveur envoie aussi une **Content-Security-Policy** stricte (aucun script ni style inline, aucun domaine externe), `Permissions-Policy` (micro autorisé pour le shadowing, caméra et géolocalisation coupées) et `Cross-Origin-Opener-Policy`.

Si le serveur reçoit un `X-Forwarded-For` alors que `TRUST_PROXY` est vide, il l'ignore et l'écrit une fois dans la console : c'est le signe qu'il manque la variable.

## 6 octies. Produire du contenu (textes calibrés, relecture, publication)

Le contenu ne s'écrit plus dans le code : il vit dans **`content/`** (un fichier JSON par texte, livre, histoire ; le lexique ; le plan ; les listes de fréquence). Le site lit un seul fichier généré et commité, **`content.data.js`**. Détails de la démarche : `CONTENU-PIPELINE.md`.

```
plan (content/plan)  →  npm run content:gen  →  annotation + vérification automatiques
  →  relecture critique par l'IA  →  relecture humaine (#/admin/contenu)  →  Publier  →  npm run content:release
```

### Une fois : les outils Python (Kiwi, listes de fréquence)

L'analyseur coréen **Kiwi** est nécessaire pour annoter les textes coréens (l'anglais est annoté en JavaScript, rien à installer). On l'installe dans son propre environnement, `~/mochi-nlp` :

```bash
# Linux / macOS
uv venv --python 3.12 ~/mochi-nlp && source ~/mochi-nlp/bin/activate
uv pip install kiwipiepy wordfreq simplemma xlrd
python tools/kiwi_server.py               # → http://127.0.0.1:8882 (laisse ce terminal ouvert)
```

```powershell
# Windows (PowerShell)
uv venv --python 3.12 $HOME\mochi-nlp
& $HOME\mochi-nlp\Scripts\Activate.ps1
uv pip install kiwipiepy wordfreq simplemma xlrd
python tools\kiwi_server.py
```

`npm run doctor` indique si Kiwi répond. Il n'écoute que sur `127.0.0.1` (variable `KIWI_URL` si tu changes le port).

Les listes de fréquence (`content/freq/en.tsv`, `ko.tsv`) sont déjà commitées. Pour les refaire : `python tools/freq_export.py`. Le coréen suit l'ordre de fréquence de la liste du 국립국어원 ; ses niveaux A/B/C sont **estimés** par le rang. Pour les niveaux officiels, télécharge « 한국어 학습용 어휘 목록 » (fichier .xls) sur korean.go.kr, puis : `python tools/freq_export.py --lang ko --nikl chemin/vers/liste.xls`.

### Le plan : quoi écrire, dans quel ordre

`content/plan/en.json` et `ko.json` listent des **unités** (mots nouveaux, mots à réviser, point de grammaire, thème, nombre de textes). L'unité « socle » regroupe les textes écrits avant le plan. Pour proposer la suite :

```bash
npm run plan:suggest -- --lang ko                    # aperçu de 5 unités
npm run plan:suggest -- --lang ko --next 10 --write  # les ajoute au plan
```

Il prend les mots les plus fréquents pas encore couverts, jamais deux mots du même groupe ni deux contraires dans la même unité (§12), et le prochain point de grammaire vu dans moins de 3 textes (coréen : ordre du §6).

### Générer des brouillons

```bash
npm run content:gen -- --unit ko-A1-03                     # les textes d'une unité
npm run content:gen -- --next 5 --lang en                  # les 5 prochaines unités à écrire
npm run content:gen -- --next 5 --lang ko --engine anthropic   # meilleure qualité (clé ANTHROPIC_API_KEY)
npm run content:gen -- --unit ko-A1-03 --dry-run           # affiche seulement le prompt
```

Moteur par défaut : celui du correcteur (`MOCHI_LLM_PROVIDER`). **Ollama suffit pour des brouillons** sur le PC (≈ 3 min par texte avec qwen2.5:7b sur processeur, bien moins avec une carte graphique), mais un modèle 7B se trompe souvent en coréen : la vérification le montre en rouge. `--engine anthropic` (Claude Opus 5.5, ~quelques centimes par texte) donne des textes nettement plus justes.

Pour chaque texte : 2 variantes, annotation (Kiwi / lemmatiseur), vérification, un tour de réparation si la meilleure est encore rouge, puis un **deuxième appel** de relecteur natif qui signale les phrases peu naturelles (sans réécrire) et des traductions proposées pour les mots absents du lexique. Résultat : `content/drafts/<id>.json`.

### Vérifier

```bash
npm run content:check                        # tous les textes publiés + les brouillons
npm run content:check -- drafts/ko-a1-03-1.json --write   # un brouillon, rapport enregistré dedans
```

Rouge = bloquant (couverture < 90 %, mots hors programme, registre, romanisation, interférence, format) ; orange = avertissement (couverture hors 92-98 %, répétition, lexique, grammaire ciblée, longueur). Sur les textes publiés, toute erreur bloquante fait échouer la commande (et `npm test`).

### Relire et publier : `#/admin/contenu`

Connecté avec un compte admin (section 6 quinquies), **Profil › Tableau de bord › Relire et publier le contenu** :
- la **file** des brouillons, par unité du plan, avec leur pastille 🟢 🟠 🔴 ;
- un brouillon : chaque phrase (mots nouveaux surlignés, particules colorées), 🔊 pour l'écouter, ✏️ pour corriger (le texte est ré-annoté et re-vérifié aussitôt ; Kiwi doit tourner pour le coréen), les remarques du relecteur IA à **Accepter** ou **Ignorer**, le lexique à valider ;
- **Publier** (seulement sans bloquant et avec le lexique validé) : le texte passe dans `content/texts/…`, le lexique est complété, `content.data.js` est reconstruit (le site le prend au prochain chargement) et l'audio des nouvelles phrases est pré-généré en arrière-plan si des voix serveur sont configurées ;
- **Régénérer** (en arrière-plan, quelques minutes) ou **Rejeter** avec une raison (gardée dans `content/drafts/rejected.jsonl` pour améliorer le prompt).

L'onglet **Couverture** montre les textes par niveau et par thème, les mots fréquents couverts, la grammaire vue, les trous et l'avancement vers les objectifs.

Pense à **commiter** `content/` et `content.data.js` après une séance de relecture.

### Sortir une version : `npm run content:release`

```bash
npm run content:release              # vérifie → construit → pré-génère l'audio → rapport
npm run content:release -- --no-audio
```

### Envoyer l'audio sur le serveur de production

Le serveur en ligne n'a en général pas de carte graphique : on génère l'audio sur le PC (`content:release`) puis on **copie `data/tts/`** (fichiers immuables : on peut renvoyer sans risque, seuls les nouveaux partent).

```bash
# Linux / macOS : rsync (n'envoie que les nouveaux fichiers)
rsync -av --ignore-existing data/tts/ utilisateur@serveur:/srv/mochi/data/tts/
```

```powershell
# Windows : scp (OpenSSH, inclus dans Windows 10/11) ; ou WinSCP en glisser-déposer
scp -r data\tts\* utilisateur@serveur:/srv/mochi/data/tts/
```

```bash
# Vers Cloudflare R2 (ou tout stockage S3) avec rclone, après « rclone config » (type s3, fournisseur Cloudflare)
rclone copy data/tts r2:mochi-audio/tts --ignore-existing --progress
```

Le chemin côté serveur est `DATA_DIR/tts` (`./data/tts` par défaut). Ensuite, dans l'admin du serveur, le bloc « Machine » doit indiquer « Audio pré-généré : complet ✓ ».

## 7. Toutes les variables d'environnement

| Variable | Par défaut | Rôle |
|---|---|---|
| `MOCHI_LLM_PROVIDER` | `claude` | Moteur du correcteur : `claude` ou `ollama` |
| `ANTHROPIC_API_KEY` | — | Clé API Claude (moteur `claude`) |
| `MOCHI_MODEL` | `claude-opus-5-5`, ou `qwen2.5:7b-instruct` avec Ollama | Modèle utilisé pour les corrections |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Adresse d'Ollama |
| `OLLAMA_TIMEOUT_MS` | `180000` | Délai maximum d'une correction locale |
| `MOCHI_LLM_DAILY` | `30` | Corrections max par compte et par jour (les réponses du cache ne comptent pas) |
| `MOCHI_LLM_GLOBAL_DAILY` | `500` | Appels à l'IA max par jour pour tout le site ; au-delà, correcteur hors ligne |
| `MOCHI_LLM` | activé | Mettre `off` pour couper le correcteur IA |
| `TTS_URL`, `TTS_URL_EN`, `TTS_URL_KO` | — | Moteur de voix (section 6 ter) ; sans valeur, voix du navigateur |
| `TTS_VOICES_EN`, `TTS_VOICES_KO`, `TTS_VOICES_ZH`, `TTS_VOICES_RU` | — | Voix proposées, séparées par des virgules (chinois : voix `zf_…` / `zm_…` de Kokoro) |
| `TTS_MODEL`, `TTS_MODEL_EN`, `TTS_MODEL_KO` | `kokoro` | Champ `model` envoyé au moteur |
| `TTS_TIMEOUT_MS` | `15000` | Délai maximum d'une génération (une fois lancée) |
| `RESEND_API_KEY` | — | Envoi réel des e-mails (section 6 quater) ; sans clé, ils s'affichent dans le terminal |
| `MAIL_FROM` | `Mochi <onboarding@resend.dev>` | Expéditeur des e-mails |
| `FEEDBACK_TO` | — | Adresse qui reçoit les retours du formulaire « Donner mon avis » ; sans valeur, ils sont seulement enregistrés |
| `PUBLIC_URL` | `http://localhost:PORT` | Adresse du site, pour les liens envoyés par e-mail |
| `PORT` | `8000` | Port du serveur |
| `DATA_DIR` | `./data` | Base de données et photos de profil |
| `COOKIE_SECURE` | — | Mettre `1` quand le site est servi en HTTPS (active aussi HSTS) |
| `TRUST_PROXY` | — | Adresses des proxys de confiance, ex. `127.0.0.1,::1` (section 6 septies) |
| `HOST` | toutes les interfaces ; `127.0.0.1` si `NODE_ENV=production` | Adresse d'écoute du serveur |
| `KIWI_URL` | `http://127.0.0.1:8882` | Analyseur coréen pour la production de contenu (section 6 octies) |

## 8. Données et sauvegarde

Tout est dans **`data/`** : `mochi.db` (comptes, progression, révisions, amis, défis), `avatars/` (photos de profil) et `tts/` (cache audio, peut être supprimé). Ne commite jamais ce dossier (il est dans le `.gitignore`).

```bash
npm run backup                         # copie vérifiée de la base + photos, même serveur allumé (data/backups, 14 gardées)
npm run backup -- --list               # les sauvegardes disponibles
npm run restore -- mochi-20261119-033012 --yes   # serveur arrêté ; l'ancienne base est mise de côté
```

En production : copie **continue** vers Cloudflare R2 avec Litestream et sauvegarde quotidienne par un timer systemd (`deploy/`, `docs/mise-en-ligne.md`). Procédures de restauration et test : `docs/restauration.md`. Santé du service (pour Uptime Kuma) : `GET /api/health`.

**Mettre en ligne** (tunnel pour un test entre amis, ou serveur dédié avec Caddy, systemd, Litestream) : **`docs/mise-en-ligne.md`**.

## 9. Tests

```bash
npm test
```

Ils couvrent l'application, l'API des comptes, la synchronisation entre plusieurs appareils, le correcteur et la chaîne de contenu (migration sans perte, annotation ≥ 95 % des lemmes, textes piégés bloqués, publication). Claude y est simulé : **les tests ne consomment aucun crédit**.

---

## 10. Dépannage

| Message affiché | Cause et solution |
|---|---|
| « LLM non configuré (clé API manquante ou invalide) » | Pas de clé, ou clé erronée ou supprimée. Vérifie `.env`, puis relance `npm start` (le fichier n'est lu qu'au démarrage). |
| « Erreur du correcteur (400) » | Souvent des crédits épuisés. Vérifie *Billing* dans la console. |
| « Le correcteur est très sollicité… » | Limite de débit de l'API atteinte. Réessaie dans une minute. |
| « Tu as utilisé tes 60 corrections du jour » | Quota Mochi atteint. Il se remet à zéro chaque jour (UTC), sinon augmente `MOCHI_LLM_DAILY`. |
| « Correcteur désactivé » | `MOCHI_LLM=off` est défini : retire-le. |
| « Ollama ne répond pas sur … » | Ollama n'est pas lancé : `ollama serve` (ou `systemctl start ollama`). |
| « Modèle … absent : lance ollama pull … » | Le modèle n'est pas téléchargé : copie la commande affichée. |
| « Le modèle local a mis trop de temps » | Prends un modèle plus petit, ou augmente `OLLAMA_TIMEOUT_MS`. |
| « Réponse du modèle local illisible » | Le petit modèle s'est embrouillé : réessaie, ou prends un modèle plus gros. |
| « Phrases libres : connecte-toi » | Tu es en mode invité. Crée un compte ou connecte-toi. |
| Pas de bouton « Se connecter » | Tu n'es pas passé par `npm start` (site servi sans serveur). |
| `node: bad option: --env-file-if-exists` | Node est trop ancien : installe Node 22.5 ou plus récent. |
