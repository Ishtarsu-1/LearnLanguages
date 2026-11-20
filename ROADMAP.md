# ROADMAP.md : fonctionnalités à venir (v2)

> Liste des fonctionnalités à ajouter à Mochi, **classées par importance**.
> Chaque feature doit respecter `PEDAGOGIE.md` (checklist §9, et les nouveaux principes §12 à §16) ainsi que `CHARTE-GRAPHIQUE.md` pour tout ce qui est visuel.
> Quand une feature touche la motivation ou le social, relire §8 et §16 : **la gamification ne doit jamais récompenser une mauvaise pratique, ni culpabiliser l'utilisateur**.
>
> Effort : 🟢 petit (≤ 1 jour) · 🟡 moyen (quelques jours) · 🔴 gros (1 semaine et plus)
> Coût : 🆓 réalisable gratuitement (voir la section « Stack 100 % gratuite ») · 💶 coût récurrent probable

---

## Ce qui change dans la v2

- **Nouveaux principes pédagogiques** issus de la recherche, ajoutés à `PEDAGOGIE.md` : thèmes plutôt que catégories (§12), alternance des points de grammaire (§13), écoute multi-voix (§14), lecture extensive et lecture + écoute (§15), règles de motivation (§16).
- **Nouvelles features** : test de niveau, thèmes et situations, bibliothèque de lectures graduées, mode histoire, collection de Mochis, série flexible, quêtes hebdomadaires, paires minimales multi-voix, ordre d'introduction des mots anti-interférence.
- **Sécurité remontée en P0** : la limitation des tentatives de connexion en mémoire (ancienne dette technique) passe en P0.
- **Une section « Stack 100 % gratuite »** : un outil gratuit pour chaque besoin, avec ses limites.
- **Une charte graphique** dans un fichier à part : `CHARTE-GRAPHIQUE.md`.

---

## v0.5 (19 novembre 2026) : avant et pendant la bêta entre amis

Fait (`AMELIORATIONS-v0.5.md`) : recentrage sur l'anglais et le coréen (chinois et russe « En test »), outillage de la chaîne de contenu pour produire en volume (plans de 40 unités, lexique relu dans l'admin, leçons des rejets, qualité par moteur), finitions vues à l'écran (mobile, pluriels, bibliothèque d'un débutant), bêta via Cloudflare (IP réelle, récapitulatif des avis, entonnoir et rétention), README et CI, tests Playwright, licences des voix.
**Vague 2 (20 novembre 2026)** : 16 brouillons de plus (anglais unités 5 à 8, coréen unités 3 à 6), avec questions. Plan coréen : 대하다, 위하다, 그러나, 사회, 따르다 (écrit soutenu) déplacés en A2-19 et remplacés par 경기, 연습하다, 팀, 늦다, 일찍, 이름 ; 게임 (A1-04) et les chiffres 삼 오 칠 천 층 (A1-06, nombres sino-coréens) ajoutés. A2-19 a maintenant 15 mots nouveaux : à répartir.
**Vague 1 (20 novembre 2026)** : 9 brouillons écrits à la main avec Claude et vérifiés (anglais : unités 1 à 4, coréen : unités 1 et 2), avec questions de compréhension, à relire dans `#/admin/contenu`. Les brouillons d'Ollama (qwen2.5 7B) répétaient chaque phrase : remplacés.
**En cours** : la production du contenu elle-même (vagues de 10 textes : génération, puis relecture humaine dans l'admin). Sans clé Anthropic, la génération passe par Ollama : lente sur processeur et souvent rejetée ; si le taux de rejet dépasse 40 %, passer sur Anthropic. Objectifs : 30 puis 50 textes par langue (étapes 2 et 3), puis 2 livres et 5 chapitres d'histoire de plus par langue. Aucune nouvelle langue avant l'étape 2.

## Vue d'ensemble

| Priorité | Feature | Effort | Coût | Dépend de |
|---|---|---|---|---|
| **P0** | Mise en ligne sécurisée (HTTPS, sauvegardes continues) (🟢 CSP + en-têtes, `TRUST_PROXY`, kit `deploy/` (Caddy, systemd, Litestream, timer), `npm run backup/restore`, test de restauration automatisé, `/api/health`, `docs/mise-en-ligne.md` ; reste : héberger, brancher R2, test de restauration en production) | 🟡 | 🆓 | — |
| ~~**P0**~~ | ~~Limitation des tentatives de connexion persistante~~ ✅ fait | 🟢 | 🆓 | — |
| ~~**P0**~~ | ~~Mot de passe oublié + vérification de l'e-mail~~ ✅ fait (reste : clé Resend à la mise en ligne) | 🟡 | 🆓 | service d'e-mail |
| ~~**P0**~~ | ~~Synchro sans perte entre appareils~~ ✅ fait | 🟡 | — | — |
| ~~**P1**~~ | ~~Feedback de production par LLM~~ ✅ fait (cache, plafond global ✅ ; reste : évaluer un modèle plus léger) | 🔴 | — | backend |
| ~~**P1**~~ | ~~Test de niveau à l'inscription~~ ✅ fait | 🟡 | 🆓 | — |
| ~~**P1**~~ | ~~Vraies voix (TTS neuronal, plusieurs voix)~~ ✅ fait : relais serveur, cache, pré-génération, préchauffage, file prioritaire, repli rapide (reste : installer les moteurs sur la machine de production, surlignage mot à mot) | 🟡 | 🆓 | backend |
| ~~**P1**~~ | ~~Le serveur détecte le matériel et s'adapte~~ ✅ fait (`npm run doctor`, profils, `--write`, adaptation au démarrage, bloc Machine ; CORRECTIFS v0.4 lot 8) | 🟡 | 🆓 | vraies voix |
| ~~**P1**~~ | ~~Analyseur morphologique coréen côté serveur~~ ✅ fait (Kiwi + lemmatiseur anglais, `tools/annotate.js`) | 🟡 | 🆓 | backend |
| **P1** | Beaucoup plus de contenu + thèmes et situations (🟢 thèmes faits, 🟢 chaîne de production prête ; reste : produire et relire le volume) | 🔴 | 🆓 | analyseur |
| ~~**P1**~~ | ~~Ordre d'introduction des nouveaux mots (anti-interférence)~~ ✅ fait | 🟢 | 🆓 | thèmes |
| ~~**P1**~~ | ~~Nouveaux types d'exercices + alternance~~ ✅ (12 types ; ✅ questions de compréhension après chaque texte ; reste : dialogue entier en écoute seule + questions) | 🟡 | 🆓 | — |
| ~~**P1**~~ | ~~Paires minimales multi-voix~~ ✅ (vraies voix du serveur quand elles existent, mots des paires pré-générés : 30/30 en anglais, 28/28 en coréen ; voix du navigateur sinon) | 🟡 | 🆓 | vraies voix |
| **P1** | Bibliothèque de lectures graduées (lecture + écoute) (🟢 moteur + 2 livres, ✅ surlignage mot à mot ; reste : volume) | 🔴 | 🆓 | contenu, voix |
| **P1** | Génération de textes calibrés par LLM (🟢 chaîne `content:gen` + vérification + relecture faite ; reste : textes à la demande par utilisateur) | 🔴 | 🆓/💶 | LLM + analyseur |
| ~~**P2**~~ | ~~Mochi, la mascotte, et la collection de Mochis~~ ✅ (saveurs par thème + accessoires) | 🟡 | 🆓 | charte graphique |
| ~~**P2**~~ | ~~Mochi vivant (`MOCHI.md`)~~ ✅ M1 à M4 + sons (respiration, regard, réactions, tap/caresse/étirement, bulles, réglages vivant/discret/immobile) ; reste M5 : saveurs animées, Mochi dans le Mochi Café (F2) et la carte à partager (F4) | 🟡 | 🆓 | mascotte |
| ~~**P2**~~ | ~~Série flexible + quêtes hebdomadaires~~ ✅ fait (reste : récompenses cosmétiques) | 🟡 | 🆓 | — |
| **P2** | Mode histoire (🟢 moteur + 5 chapitres par langue ; reste : la suite de l'histoire) | 🔴 | 🆓 | bibliothèque |
| ~~**P2**~~ | ~~Application installable (PWA) + hors ligne~~ ✅ fait | 🟡 | 🆓 | — |
| ~~**P2**~~ | ~~Rappels et notifications~~ ✅ Web Push (heure et jours au choix, 1 par jour au plus, jamais si la séance est faite ni les jours de repos ; clés VAPID par `doctor --write` ; reste : e-mail hebdomadaire) | 🟡 | 🆓 | PWA |
| ~~**P2**~~ | ~~Liste d'amis~~ ✅ fait (pseudo, demande ou lien d'invitation, blocage, stats masquables) | 🟡 | 🆓 | comptes |
| ~~**P2**~~ | ~~Défis entre amis~~ ✅ fait (semaine régulière, temps, révisions, mots solides, même chapitre ; calculés côté serveur ; reste : défis d'écoute et de production) | 🟡 | 🆓 | liste d'amis |
| **P2** | Reconnaissance vocale (exercices oraux) (🟢 étape 1 : « 🗣️ À voix haute » dans le lecteur, API Web Speech ; reste : exercices oraux dédiés, Whisper) | 🔴 | 🆓 | backend |
| **P2** | Optimisation FSRS par utilisateur | 🟡 | 🆓 | historique de révisions |
| **P2** | « Adapte ce texte à mon niveau » (v0.6 F1 : texte collé → réécrit à ~95 % de couverture par Ollama, privé, quota) | 🔴 | 🆓 | LLM + analyseur |
| **P2** | « Mochi Café » : mini-conversations jouées (v0.6 F2 : scénarios à objectifs, écrit ou oral, récapitulatif avec recasts) | 🔴 | 🆓 | LLM, reconnaissance vocale |
| ~~**P2**~~ | ~~Carnet d'erreurs~~ ✅ (v0.6 F3 : par type, explications relues, exemples tirés de ses phrases, « M'entraîner », vaincue après 3 réussites sur 3 jours, cartes ciblées) | 🟡 | 🆓 | correcteur |
| **P3** | « Ce que je sais faire » + carte de progression à partager (v0.6 F4 : capacités CECRL débloquées par des preuves, image PNG sans donnée personnelle) | 🟡 | 🆓 | thèmes, Mochi Café |
| **P3** | Tracé du Hangul au doigt (v0.6 F5 : ordre et sens des traits des 24 jamo ; chinois : Hanzi Writer, vérifier la licence des données) | 🟡 | 🆓 | — |
| **P3** | Révision mains libres, « mode métro » (v0.6 F6 : audio seul, Media Session, hors ligne) | 🟡 | 🆓 | vraies voix, PWA |
| **P3** | Duel asynchrone (v0.6 F7 : mêmes 10 mots, 48 h, arbitré par le serveur, sans XP) | 🟢 | 🆓 | duel |
| **P3** | Classements entre amis, badges | 🟢 | 🆓 | amis |
| **P3** | Import de contenus perso (articles, sous-titres) | 🔴 | 🆓 | analyseur |
| **P3** | Tandem FR ↔ KO / FR ↔ EN | 🔴 | 🆓 | amis, modération |
| **P3** | Nouvelles langues (🟢 chinois et russe ouverts : module d'écriture, 9 textes A1 chacun, voix serveur ; reste : plus de contenu, plans et listes de fréquence ; japonais, français, italien annoncés) | 🔴 | 🆓 | contenu |
| **P3** | Espace prof / classe | 🔴 | 🆓 | comptes |
| **P3** | Accessibilité et traduction de l'interface | 🟡 | 🆓 | charte graphique |

---

## P0 : indispensable avant d'ouvrir le site au public

### Mise en ligne sécurisée 🟡 🆓
🟢 Fait : `npm run backup` (copie cohérente à chaud par `VACUUM INTO`, vérifiée, photos incluses, rotation) et `npm run restore` (vérification, ancienne base mise de côté) ; test de restauration automatisé sur de vrais processus serveur (`tests/backup.test.js`) ; `GET /api/health` ; erreurs datées dans le journal ; kit `deploy/` (Caddyfile avec flux temps réel, service systemd durci, timer de sauvegarde quotidienne, `litestream.yml` vers R2) ; guides `docs/mise-en-ligne.md` (tunnel Cloudflare pour tester entre amis, ou serveur dédié) et `docs/restauration.md`. Reste : choisir l'hébergeur, brancher R2, faire le test de restauration sur la vraie production.
- Hébergement derrière un reverse proxy HTTPS. **Caddy** est le plus simple : il gère les certificats Let's Encrypt tout seul. Activer `COOKIE_SECURE=1`.
- Où héberger gratuitement : voir la section « Stack 100 % gratuite » (Oracle Cloud Always Free, avec ses limites).
- **Sauvegardes continues de la base SQLite avec Litestream** vers un stockage objet (Cloudflare R2, voir la stack gratuite). On peut restaurer la base à la seconde près au lieu de perdre jusqu'à une journée. Les photos et fichiers audio vont directement sur R2.
- Faire **un test de restauration** sur une machine vierge et le documenter dans `docs/restauration.md`. Une sauvegarde qu'on n'a jamais restaurée ne compte pas.
- ✅ En-têtes de sécurité : Content-Security-Policy stricte (`script-src 'self'`, `style-src 'self'` : aucun script ni style inline), `Referrer-Policy`, `Permissions-Policy` (micro pour le shadowing, rien d'autre), `Cross-Origin-Opener-Policy`, HSTS si `COOKIE_SECURE=1`.
- ✅ IP réelle du client derrière le proxy (`TRUST_PROXY`, dernière entrée de `X-Forwarded-For`, IPv6 par /64) : sans elle, la limitation des tentatives serait commune à tous les visiteurs. `HOST=127.0.0.1` en production. Section Caddy dans `SETUP.md`.
- Logs d'erreurs et page de statut (Uptime Kuma, auto-hébergé et gratuit).
- Pages légales : mentions légales et politique de confidentialité. Le RGPD (export et suppression) est déjà en place. **Lister chaque sous-traitant** qui reçoit des données (fournisseur de LLM, service d'e-mail, hébergeur). Les phrases écrites par les utilisateurs partent vers le LLM, et ça doit figurer dans la politique de confidentialité.

### ✅ Limitation des tentatives de connexion persistante (fait)
Fait : table `login_attempts` dans SQLite, une clé par IP et une par compte, freinage progressif (1 s, 2 s, 4 s…, plafonné à 60 s par compte et 15 min par IP), en-tête `Retry-After`, limite de 10 corrections par minute sur `POST /api/feedback`. Reste : l'appliquer à « mot de passe oublié » quand la route existera.

Spécification d'origine :
*(Ancienne dette technique, remontée en P0 : aujourd'hui, un simple redémarrage du serveur remet les compteurs à zéro.)*
- Stocker les compteurs dans SQLite (table `login_attempts (key, count, window_start)`), avec une clé par IP **et** par compte.
- Freinage progressif (attente croissante) plutôt que blocage sec, pour ne pas permettre de verrouiller le compte de quelqu'un d'autre.
- Appliquer la même limite à « mot de passe oublié » et à `POST /api/feedback`. Le quota LLM existe déjà, mais une limite par minute évite les rafales.

### ✅ Mot de passe oublié + vérification de l'e-mail (fait)
Fait : `mailer.js` (Resend, ou affichage dans le terminal en local), jetons aléatoires hachés à usage unique (30 min / 7 jours), réponse identique pour une adresse inconnue, demandes limitées, toutes les sessions fermées après une réinitialisation, bandeau non bloquant dans le profil. Reste : créer le compte Resend et vérifier le domaine à la mise en ligne.

- Envoi d'e-mails transactionnels avec **Resend** (offre gratuite, voir la stack) ou un SMTP.
- Lien de réinitialisation à usage unique, valable environ 30 minutes, avec un jeton haché en base.
- Vérification de l'adresse à l'inscription, sans bloquer l'usage (bandeau de rappel).
- Réponse identique que l'adresse existe ou non, pour ne pas révéler quels e-mails sont inscrits.

### ✅ Synchro sans perte entre appareils (fait)
- Route `POST /api/sync` : l'appareil envoie uniquement ce qui a changé et reçoit ce qui a changé ailleurs depuis son dernier passage (curseur `rev`).
- Une règle de fusion par type de donnée :
  - **révisions** : ajout seul, table `review_logs` (prête pour l'optimisation FSRS) ;
  - **cartes** : la version la plus récente gagne, carte par carte ;
  - **réglages** : la modification la plus récente gagne, clé par clé ;
  - **XP, temps, activité** : chaque appareil envoie des deltas, que le serveur additionne.
- Une modification faite pendant une requête n'est pas écrasée. Les modifications hors ligne partent au retour du réseau.
- Une réinitialisation se propage aux autres appareils (`epoch`). L'ancien format (un bloc JSON) est migré automatiquement.
- Tests multi-appareils : `tests/sync.test.js`.
- Reste à faire : prévenir l'utilisateur quand une de ses modifications a perdu face à une plus récente (rare : il faut modifier le même réglage sur deux appareils).

---

## P1 : le cœur pédagogique

### ✅ Feedback de production par LLM (fait)
Fait : `llm.js` + route `POST /api/feedback` (Claude Opus 5.5, sortie JSON structurée, modèle de secours en cas de refus), quota de 60 corrections par compte et par jour (`MOCHI_LLM_DAILY`), mode « Phrase libre », cartes ciblées créées à partir des particules corrigées, repli automatique sur le correcteur hors ligne. Activer avec `ANTHROPIC_API_KEY=… node server.js` (désactiver avec `MOCHI_LLM=off`).
Moteur gratuit et local : **Ollama** (`MOCHI_LLM_PROVIDER=ollama`, modèle par défaut `qwen2.5:7b-instruct`). Des garde-fous déterministes s'appliquent aux deux moteurs : registre -요 vérifié mécaniquement, cohérence du verdict, vraies particules uniquement. Évaluation réelle : `node tests/eval-llm.js` (9/10 avec Ollama sur CPU, ~22 s par correction).

Reste à faire :
- ✅ **Cache des réponses** : table `llm_cache`, clé = SHA-256 de (phrase normalisée + consigne + interlocuteur + registre + référence + langue + version du prompt + modèle), 90 jours. Une réponse en cache ne décompte pas le quota.
- ✅ **Plafond global** (`MOCHI_LLM_GLOBAL_DAILY`, 500 par défaut, compteur en base) : au-delà, correcteur hors ligne jusqu'à minuit. Quota par compte ramené à 30. Appels du jour, taux de cache et coût estimé dans `#/admin`.
- **Jeu d'évaluation plus large** : passer de 10 à au moins 100 phrases (50 coréen, 50 anglais), avec des erreurs de registre, de particules, des faux amis et des variantes correctes à **ne pas** corriger. Lancer `tests/eval-llm.js` à chaque changement de prompt ou de modèle.
- **Choisir le modèle selon le coût** : pour corriger une phrase courte, un modèle plus léger suffit souvent. `tests/eval-llm.js` affiche maintenant le modèle, le temps et le coût : lancer avec `MOCHI_MODEL=claude-sonnet-5-5` puis `claude-haiku-5-5` (clé API nécessaire) et reporter les scores dans `SETUP.md` avant de changer le défaut.
- **Feedback en attente** : avec Ollama, afficher tout de suite le résultat du correcteur hors ligne, puis le remplacer par la correction du LLM quand elle arrive. L'utilisateur n'attend jamais 22 s devant un écran vide.

### ✅ Test de niveau à l'inscription (fait)
Fait : `placement.js`, onglet « 🧭 Niveau » et proposition sur l'écran du jour. Le résultat final affiche « ~X % des mots de nos textes » plutôt qu'un pourcentage d'épisode de sitcom, qu'on ne sait pas mesurer honnêtement. Les tranches de fréquence anglaises sont une sélection approximative (6 mots par tranche) : à remplacer par wordfreq quand la liste de fréquence sera en place.

Spécification d'origine :
Le calcul de couverture du §3 ne veut rien dire si le site croit qu'un francophone ne connaît aucun mot d'anglais.
- **Anglais** : test adaptatif de taille de vocabulaire. On montre des mots par tranches de fréquence (1 000 premiers, 2 000…), l'utilisateur dit s'il les connaît. On mélange quelques **faux mots** pour détecter ceux qui cochent tout. On en déduit une estimation (« ~3 500 mots ») et on marque les tranches correspondantes comme connues.
- **Coréen** : trois questions suffisent (« Tu sais lire le Hangul ? », « Tu connais le 해요체 ? », « Tu as déjà étudié ? »), puis un mini-test de 2 minutes si nécessaire. La plupart des débutants commencent au module Hangul.
- Le résultat est modifiable à tout moment (« Je connais déjà ce mot » dans le lecteur).
- 5 minutes maximum, sautable. Le test sert aussi de **premier moment agréable** : afficher à la fin « Tu comprends déjà ~X % d'un épisode de sitcom ».

### ✅ Vraies voix (fait, CORRECTIFS v0.4 lot 7)
Fait : relais vers Kokoro / MeloTTS avec cache disque ; **pré-génération** de toutes les phrases fixes (`npm run tts:pregen`, liste partagée avec le client : `spokenSentences()`) ; préchauffage des moteurs au démarrage ; **file par moteur** (une génération à la fois, clics prioritaires sur le préchargement `p=low`) ; indicateur de chargement et repli sur la voix de l'appareil après 5 s ; délai serveur 15 s (`TTS_TIMEOUT_MS`) ; guide Windows et `tools/start-voices.*`. Reste : stocker l'audio sur R2, surlignage mot à mot.

Spécification d'origine :
La synthèse vocale du navigateur varie énormément d'un appareil à l'autre (§5 : audio natif ou TTS de haute qualité).
- Générer l'audio **au moment de la création du contenu** (pas à la volée), le stocker sur R2 et le servir via `audio_url`.
- **Coréen : MeloTTS** (licence MIT, tourne sur CPU). **Anglais : Kokoro** (licence Apache 2.0, plusieurs voix) ou MeloTTS (accents américain, britannique, australien, indien). Détails dans la stack gratuite.
- **Plusieurs voix par langue** : homme / femme, différents accents en anglais. C'est indispensable pour les paires minimales multi-voix (§14) et pour les dialogues.
- Lecteur : surlignage mot à mot synchronisé avec l'audio (timestamps). Il servira à la lecture + écoute (§15).
- À terme : enregistrements de locuteurs natifs pour les contenus principaux. Les phrases Tatoeba avec audio sous licence libre peuvent compléter, **en vérifiant la licence de chaque enregistrement**.

### Analyseur morphologique coréen 🟡 🆓
✅ Fait (CONTENU-PIPELINE, lot C2) : `tools/kiwi_server.py` (Kiwi, 127.0.0.1) et `tools/annotate.js` (coréen via Kiwi, anglais par un lemmatiseur JS) produisent le format annoté ; 100 % des lemmes et des particules retrouvés sur les textes annotés à la main ; `npm run doctor` le signale.
Obligatoire selon le §3 pour tout contenu qui n'est pas annoté à la main.
- **Kiwi** (`kiwipiepy`), exposé par une petite route serveur, éventuellement en microservice Python. Plus simple à installer que Mecab-ko.
- Anglais : lemmatisation (spaCy, wink-nlp).
- Produit directement le format annoté de `content.js` (`surface=lemme`, `nom|particule`).
- Bonus : l'analyseur alimente le surlignage des particules par fonction (voir `CHARTE-GRAPHIQUE.md` §5).

### Beaucoup plus de contenu + thèmes et situations 🔴 🆓 *(enrichi)*
🟡 En cours : la chaîne de production est en place (`content/`, plan, listes de fréquence, génération, vérification, relecture dans l'admin, `content:release` ; voir `CONTENU-PIPELINE.md` et SETUP.md 6 octies). Reste à produire et relire les textes (objectifs : 30 puis 50 par langue).
4 textes par langue, c'est trop peu pour que le calcul de couverture (§3) ait du sens.

**Volume**
- Objectif : 50 textes ou plus par langue, du A1 au B1, avec beaucoup de dialogues (§7).
- Couvrir les ~1 000 mots les plus fréquents de chaque langue avec des listes de fréquence. Coréen : **liste de vocabulaire d'apprentissage du 국립국어원** (environ 6 000 mots classés). Anglais : liste de fréquence libre (voir la stack gratuite).
- Coréen : du contenu qui reprend chaque point de grammaire de la phase 2, puis déblocage de la phase 3 (반말, 합니다체, honorifiques).
- Sources libres pour amorcer : **Tatoeba** (phrases sous CC BY 2.0 FR, attribution obligatoire), le **한국어기초사전** (dictionnaire d'apprentissage du coréen, API gratuite avec clé) pour les définitions et les exemples.

**Thèmes et situations** (réponse à « faut-il trier par catégories ? », détail dans `PEDAGOGIE.md` §12)
- Oui pour les **thèmes de situation** : « Au café », « Le sport », « Les transports », « Rencontrer quelqu'un », « Au travail », « K-drama & variétés », « Gaming », « Cuisine »… Un thème regroupe des mots qui *vont ensemble dans une scène* (commander, chaud, emporter, tasse, payer).
- Non pour les **listes de mots de même catégorie** apprises d'un coup : « 20 fruits », « les 12 couleurs », « gauche / droite », « les jours de la semaine ». Les apprendre ensemble crée de la confusion entre mots proches. On les répartit dans le temps (voir la feature suivante).
- « Vie de tous les jours » n'est pas un thème : c'est le **socle de fréquence** (les ~1 000 mots les plus courants), qui reste prioritaire pour tout le monde. Les thèmes viennent **en plus**, selon les centres d'intérêt choisis.
- Modèle de données : chaque lexème a `themes[]` (situations) et `semantic_group` (ex. `fruit`, `couleur`, `jour`). Chaque texte a `themes[]`.
- Interface : à l'inscription et dans les paramètres, l'utilisateur choisit 2 ou 3 thèmes. Le lecteur et la génération de textes les privilégient. Une page « Thèmes » montre la progression de chacun (mots solides / total).

**Fait** : 8 thèmes de situation (`THEMES`, avec leur saveur de Mochi), `themes[]` sur chaque texte, 12 nouveaux textes (6 par langue : transports, cuisine, sport, gaming, travail, séries), ~160 mots ajoutés au lexique, groupes anti-interférence étendus. Onglet « 🍡 Thèmes » : mots solides par thème, saveur débloquée à 10 mots solides, thèmes favoris (synchronisés). Bibliothèque : filtre par thème, favoris en tête à zone de couverture égale. Les mots d'un thème sont déduits de ses textes (le socle, présent dans 3 thèmes ou plus, n'appartient à aucun thème). Reste : le volume (50 textes par langue), le choix des thèmes à l'inscription, les paliers 50/100.

**Outil interne d'annotation** : coller un texte, obtenir les lemmes et particules (analyseur), les thèmes suggérés, corriger à la main.

### ✅ Ordre d'introduction des nouveaux mots (fait)
Fait : `SEMANTIC_GROUPS` et `CONFUSABLE` dans `content.js` (en attendant `semantic_group` / `confusable_with` par lexème), filtre dans `newCards()`. Reste : l'exercice de discrimination une fois les deux mots solides.

Spécification d'origine :
Application directe du §12.
- Règle du planificateur de nouvelles cartes : **au maximum 1 nouveau mot par `semantic_group` et par jour**. Un deuxième fruit attendra demain, même s'il est dans le même texte (il reste cliquable et traduisible dans le lecteur).
- Les paires d'opposés et les quasi-synonymes (gauche/droite, 오른쪽/왼쪽, 가르치다/배우다, *borrow/lend*) sont marqués `confusable_with` et jamais introduits le même jour.
- Une fois les deux mots solides (stabilité FSRS ≥ 7 jours), on peut proposer un exercice de **discrimination** qui les oppose volontairement.

### Nouveaux types d'exercices + alternance 🟡 🆓
Faits (onglet « 🎯 Exercices », `exercises.js`) : ✅ dictée, ✅ remettre dans l'ordre, ✅ compréhension orale (audio → sens), ✅ choix du registre (coréen), ✅ faux amis (anglais), ✅ **phrase à trou** (rappel écrit, indice à la demande), ✅ **traduis** FR → langue cible (recast par l'IA si connecté, sinon comparaison locale), ✅ **la bonne forme** (conjugaison / accord en contexte), ✅ **la bonne particule** (coréen : rôle + règle consonne/voyelle ; une erreur renforce le point de grammaire dans le Mélange), ✅ **ne pas confondre** (discrimination §12, ouvert seulement quand les deux mots d'une paire sont connus), ✅ **associe** (5 mots ↔ sens). Menu regroupé (Écoute · Écrit · Grammaire · Vocabulaire), Mélange recommandé.

Tous en **rappel actif** (§1), avec une phrase de contexte et de l'audio (§2) :
- ~~**Dictée**~~ ✅
- ~~**Remettre les mots dans l'ordre**~~ ✅
- **Traduction FR → langue cible** avec feedback reformulé (le LLM est maintenant prêt).
- **Compréhension orale** : ✅ phrase par phrase ; reste un dialogue entier suivi de questions.
- ~~**Choix du registre** (coréen)~~ ✅
- **Conjugaison et terminaisons** en contexte (-아요 / -어요, passé, futur).
- **Choisis la bonne particule** : phrase à trou, avec explication du rôle de la particule à la demande.
- **Paires minimales multi-voix** : voir la feature dédiée.
- **Mini-conversations** guidées (avec le LLM) : un scénario lié à un thème (commander au café, se présenter) et un objectif (« obtiens un café glacé à emporter »).

**Alternance (§13)** ✅ fait : mode « 🔀 Mélange » (par défaut) dans `exercises.js`, poids plus fort aux points récents et ratés (`grammarMiss`). Spécification : un point de grammaire nouveau est d'abord travaillé seul (quelques items), puis les séances suivantes **mélangent** les points déjà vus (ex. -았/었어요 + -(으)ㄹ 거예요 + 은/는 vs 이/가 dans la même série). Implémentation : `exercises.js` tire les items au hasard parmi les points de grammaire débloqués, avec un poids plus fort pour les points récents ou souvent ratés.

### Paires minimales multi-voix 🟡 🆓 *(✅ première version)*
Fait : au moins 4 « locuteurs » par langue (voix réelles de l'appareil, complétées par des variations de hauteur et de débit), réécoute des options, score par contraste (`earStats`) affiché dans l'onglet Oreille, tirage favorisant les contrastes faibles, nouvelles paires. Reste : de vraies voix TTS neuronales et natives (feature « Vraies voix »), et l'affichage des scores dans le profil.

Application du §14.
- L'utilisateur entend un mot et choisit entre deux options (ex. 달 / 딸 / 탈, 어 / 오, *ship / sheep*, *think / sink*).
- **Chaque mot est prononcé par plusieurs voix** (au moins 4 par langue grâce au TTS, puis des voix natives) et dans plusieurs mots différents, pas toujours le même enregistrement.
- Feedback immédiat (bonne ou mauvaise réponse + réécoute des deux).
- **Score par contraste** (ㄱ/ㅋ/ㄲ, ㅓ/ㅗ, th/s…) pour repérer les points faibles, affiché dans le profil.
- Sessions courtes (2 à 3 minutes), à glisser dans la séance du jour quand un contraste est faible.

### Bibliothèque de lectures graduées (lecture + écoute) 🔴 🆓 *(moteur ✅)*
Fait : `library.js` (livres en chapitres, niveau, thèmes, vocabulaire propre), chaque chapitre lu dans le lecteur habituel (audio des vraies voix, glossaire, shadowing), questions de compréhension après « J'ai fini » (erreurs reposées), chapitre suivant ouvert ensuite, mots inconnus du chapitre ajoutables en cartes, progression synchronisée (`books`), section « 📚 Livres gradués » dans Lire. Deux livres A1 de 3 chapitres : *The Lost Cat* et *새 친구*. Reste : le volume (livres A2/B1 de 300 à 2 000 mots), le surlignage mot à mot pendant l'écoute (Kokoro-FastAPI fournit des horodatages par mot).

Application du §15.
- Petits livres de 300 à 2 000 mots, classés par niveau (A1, A2, B1) et par thème, écrits pour rester dans la bonne couverture (~95-98 %).
- **Mode lecture + écoute** : l'audio joue et le mot en cours est surligné (timestamps des vraies voix).
- Après chaque chapitre : 2 ou 3 questions de compréhension rapides, et les mots inconnus proposés en cartes.
- La bibliothèque est la base du **mode histoire** (P2).
- Contenu : écrit à la main, généré par LLM puis relu (feature suivante), ou adapté de textes du domaine public.

### Génération de textes calibrés par LLM 🔴 🆓/💶
🟡 En cours : génération calibrée côté production (`npm run content:gen`, couverture vérifiée, 2 variantes + réparation, relecture critique, publication après relecture humaine). Reste : les textes à la demande pour chaque utilisateur.
§3 : un texte sur mesure pour chaque utilisateur.
- Contraindre le LLM au vocabulaire connu, plus 3 à 8 mots nouveaux ciblés (les prochains mots fréquents **du thème choisi**, en respectant la règle anti-interférence).
- **Vérifier** la couverture réelle après génération avec l'analyseur, et régénérer si on sort de la fourchette 92-98 %.
- Sujets choisis par l'utilisateur (ses thèmes).
- Les textes générés et validés vont dans un cache partagé : un texte A2 sur « Au café » pourra servir à d'autres utilisateurs avec un vocabulaire proche. Ça limite les appels et le coût.

---

## P2 : motivation et jeu *(section refondue)*

**Principe (§16)** : on vise les trois besoins qui entretiennent la motivation : **se sentir compétent** (voir ses progrès réels), **se sentir libre** (choisir ses thèmes et son rythme) et **se sentir relié** (amis, défis coopératifs). Les points et badges marchent, à condition de récompenser les bonnes pratiques. **Interdits** : monnaie payante, coffres aléatoires payants, notifications culpabilisantes, série qui s'effondre au premier jour manqué.

### Mochi, la mascotte, et la collection de Mochis 🟡 🆓 *(nouveau)*
- **Mochi**, une petite pâte de riz ronde et expressive (design dans `CHARTE-GRAPHIQUE.md` §8). Elle réagit aux actions : contente après une séance, concentrée pendant les révisions, endormie un jour de repos. **Jamais triste ni en colère** contre l'utilisateur.
- **Collection de saveurs** : chaque thème a sa saveur de Mochi (Matcha = « Au café », Sakura = « Rencontrer quelqu'un », Yuzu = « Sport », Ube = « K-drama »…). On débloque une saveur quand on atteint un palier de **mots solides** dans le thème (10, 50, 100), pas quand on a « vu » des cartes.
- **Mochidex** : une page avec toutes les saveurs (débloquées ou en silhouette) et la progression de chaque thème. C'est une façon visuelle et collectionnable de montrer la progression réelle.
- ✅ Accessoires cosmétiques (`cosmetics.js`, Profil › Ma Mochi) : nœud, bonnet, écharpe, casquette, couronne de fleurs, lunettes, casque audio, toque, col de hanbok. Chacun lié à une bonne pratique (1 / 3 / 6 quêtes, une mission, une semaine régulière, 10 lectures, 100 essais d'écoute, 30 phrases, Hangul terminé). Un par emplacement (tête, cou, visage), portés par Mochi partout sur le site, annoncés une fois quand ils sont gagnés. **Purement cosmétiques**, jamais achetables.

### Série flexible + quêtes hebdomadaires 🟡 🆓 *(série ✅)*
Fait : série hebdomadaire 5/7 (`fullDays`, migrée depuis l'ancienne série), carte « Ma semaine », Mochi endormie les jours de repos, nouvelle définition d'une séance complète, reprise en douceur après une absence (20 révisions puis 40/jour, sans nouvelles cartes). Quêtes faites : 3 par semaine et par langue parmi 6 (lire, écrire, paires de sons, révisions, minutes, séances complètes d'affilée), tirage identique sur tous les appareils, objectifs proportionnels à l'objectif du jour, +50 XP chacune. Les quêtes débloquent aussi les accessoires de Mochi (1, 3, 6 quêtes). Reste : les quêtes par thème (« Lis 3 textes du thème Café ») quand les thèmes existeront.

- **Série hebdomadaire plutôt que quotidienne** : l'objectif est « 5 jours sur 7 », comme le défi « Semaine régulière ». Une semaine réussie ajoute +1 à la série. Rater un jour ne casse rien : manquer une occasion n'empêche pas une habitude de se former (§16).
- **Jours de repos** : 2 par semaine, inclus d'office, présentés positivement (Mochi fait la sieste).
- **Une séance compte** si elle contient les révisions dues (ou au moins 10) **et** un input ou une production. Ouvrir l'app ne suffit pas.
- **Quêtes de la semaine** (3 par semaine, tirées parmi les bonnes pratiques) : « Lis 3 textes du thème Café », « Termine 5 séances de paires minimales », « Écris 10 phrases libres », « Zéro révision en retard 4 jours de suite ». Récompense : accessoires cosmétiques et XP.
- **Objectif du jour réglable** (5, 10, 20 minutes), avec la possibilité de le baisser sans pénalité. Un objectif trop ambitieux fait perdre la série plus souvent.

### Mode histoire 🔴 🆓 *(moteur ✅)*
Fait : `story.js` + `missions.js`. Onglet « 🎬 Histoire » : *모찌의 서울 일 년* et *Mochi in London*, 5 chapitres chacun (arrivée, logement, café du coin, cours de coréen / perdue dans Londres, soirée karaoké). Chaque chapitre : lecture graduée + questions + **mission de conversation** : jeu de rôle avec l'IA (`POST /api/roleplay`, scénario fixé côté serveur, recast de chaque réplique, indice, détection du but atteint, quota partagé avec le correcteur) ou **mode guidé** à choix (sans compte, sans IA, ou si elle ne répond pas). Chapitre suivant ouvert quand le précédent est fini (questions + mission), ses **mots clés en révision**, et (coréen) le **point de grammaire** du chapitre vu (-요, 은/는, 을/를). Grammaire coréenne suivie : -요, 은/는, 을/를, 이/가, 에. Reste : la suite de l'histoire (chapitres 6+, en suivant 에서, 도, les nombres, puis la phase 3).

- Un fil narratif par langue. Exemple coréen : Mochi part un an à Séoul (arrivée à l'aéroport, trouver son logement, premier jour de cours, le café du coin, la sortie au 노래방…). Exemple anglais : un stage à Londres ou un road trip.
- Chaque chapitre est une lecture graduée (bibliothèque), avec dialogues audio, quelques mots nouveaux et une mini-conversation finale avec le LLM (« Commande ton premier 아이스 아메리카노 »).
- Un chapitre se débloque quand le précédent est lu **et** que ses mots clés sont en révision. On ne peut pas le « farmer ».
- Les chapitres suivent la progression grammaticale (§6) : le mode histoire *est* le parcours, en plus motivant.

### ✅ Application installable + hors ligne (fait)
Fait : manifeste et icônes Mochi (dont « maskable »), service worker (`sw.js` : réseau d'abord pour l'appli, cache d'abord pour les polices, avatars et audio, API jamais en cache), démarrage hors ligne avec le dernier compte connu (la synchro reprend au retour du réseau), pré-téléchargement lent de l'audio des cartes dues sous 2 jours (vraies voix). Vérifié dans Chromium : rechargement hors ligne OK. Reste : bouton « Installer » dans l'interface.

- PWA : manifeste, icône (Mochi), service worker.
- Mode hors ligne : réviser dans le métro, synchroniser au retour du réseau (s'appuie sur la synchro du P0).
- Pré-télécharger l'audio des cartes dues dans les 2 prochains jours.
- ~~Embarquer ts-fsrs localement au lieu du CDN.~~ ✅ (`vendor/ts-fsrs-5.2.3.umd.js`)

### Rappels et notifications 🟡 🆓
- Notification « Tes révisions t'attendent » à l'heure choisie (Web Push, gratuit avec des clés VAPID).
- **Ton** : neutre ou encourageant, jamais culpabilisant. Exemples dans `CHARTE-GRAPHIQUE.md` §9. Au maximum 1 rappel par jour, aucun les jours de repos.
- E-mail hebdomadaire facultatif : heures, mots solides gagnés, saveurs débloquées, défis en cours.

### Liste d'amis 🟡 🆓
✅ Fait (`social.js`, `friends.js`, page `#/amis`) : pseudo unique, demande par pseudo à accepter, lien d'invitation (amis directement, lien renouvelable), retirer, bloquer (silencieux), profil visible des seuls amis (prénom, avatar, heures, mots solides par langue, masquables). Reste : profil avec Mochi habillée.
- Ajouter un ami par pseudo unique ou par lien d'invitation, avec une demande à accepter.
- Profil public minimal : Mochi (avec ses accessoires), prénom, langues apprises, heures cumulées, mots solides. Ce qui est visible se règle dans les paramètres.
- Bloquer ou retirer un ami. Rien n'est public par défaut.
- Côté serveur : tables `friendships (user_id, friend_id, status, created_at)` et `usernames`.

### Défis entre amis 🟡 🆓
✅ Fait : semaine régulière (chacun), temps ensemble et révisions ensemble (coopératif), mots solides (coopératif ou duel, progression depuis le début du défi), même chapitre ; 3, 7 ou 14 jours, 1 à 5 amis, invitation à accepter, carte dans Aujourd'hui. Progression calculée par le serveur à partir des données synchronisées, jamais d'XP à gagner. Reste : zéro retard, défis d'écoute et de production, notification de fin.
**Règle d'or (§8, §16) : un défi ne doit jamais pousser à mal apprendre.** On ne fait pas de course à l'XP, qu'on pourrait gonfler en relisant ou en bâclant les cartes. On privilégie le **coopératif**.

Défis qui récompensent les **bonnes pratiques** :
- **Semaine régulière** : faire sa séance complète (input + révisions + production) 5 jours sur 7, ensemble ou en duel.
- **Zéro retard** : finir toutes ses révisions dues chaque jour pendant une semaine.
- **Objectif d'heures** : cumuler X heures à deux (coopératif).
- **Mots solides** : gagner le plus de mots devenus « connus » (stabilité FSRS ≥ 7 jours), donc de vraie rétention, pas des cartes vues.
- **Défi d'écoute** : meilleur score aux paires minimales multi-voix sur un même lot de sons.
- **Défi de production** : écrire une phrase sur un thème commun, puis voir celle de l'ami et sa version reformulée.
- **Même chapitre** *(nouveau)* : lire le même chapitre du mode histoire dans la semaine et répondre aux questions.

Mécanique :
- Créer un défi : type, durée (3, 7 ou 14 jours), ami(s) invité(s).
- Suivi en direct de la progression de chacun, notification à la fin, résultat dans l'historique.
- Côté serveur : tables `challenges` et `challenge_participants`. La progression est calculée côté serveur à partir des événements (révisions, séances), jamais déclarée par le client.

### Reconnaissance vocale 🔴 🆓
- **Étape 1 (gratuite, rapide)** : l'API Web Speech du navigateur. Elle marche sur Chrome, Edge et Safari, et Firefox l'a ajoutée en version 160 avec une reconnaissance sur l'appareil. Prévoir un message clair si le navigateur ne la gère pas.
- **Étape 2** : Whisper auto-hébergé (whisper.cpp ou faster-whisper) pour un résultat identique partout. Attention, Whisper est nettement moins précis en coréen qu'en anglais. Des versions affinées pour le coréen existent : à tester avec un petit jeu d'évaluation avant de choisir.
- Exercices oraux : lire une phrase à voix haute, la transcription est comparée au texte attendu. Rester **tolérant** (la transcription automatique se trompe aussi) et ne jamais pénaliser l'utilisateur sur la base d'un seul mot mal reconnu.
- Shadowing amélioré : comparer le rythme et l'intonation (courbe de hauteur du modèle et de l'utilisateur côte à côte), en accord avec le §5.
- Confidentialité : l'audio n'est jamais stocké sans accord explicite, et la politique de confidentialité indique où il part.

### Optimisation FSRS par utilisateur 🟡 🆓
- Après environ 1 000 révisions, optimiser les paramètres FSRS sur l'historique de l'utilisateur (optimiseur `fsrs-rs` / `fsrs-optimizer`).
- Afficher la rétention réelle comparée à la rétention visée.

---

### ✅ Clavier coréen intégré (fait)
Sous chaque champ de saisie coréen, un bouton « ⌨️ 한글 » ouvre un clavier 두벌식 à l'écran (composition des syllabes, ⇧ pour les consonnes doubles, ⌫ lettre par lettre). Tant qu'il est ouvert, le clavier physique tape aussi en coréen à la position des touches coréennes (AZERTY ou QWERTY ; un clavier coréen du système n'est pas gêné). Repères des touches selon la vraie disposition de l'utilisateur quand le navigateur la donne. Choix mémorisé sur l'appareil.

## P3 : plus tard

- **Classements entre amis** (heures, mots solides), toujours basés sur des indicateurs honnêtes, et **badges** (premier texte lu, Hangul terminé, 100 mots solides, phase 2 franchie, première saveur débloquée).
- **Import de contenus perso** : coller un article, des sous-titres (.srt) ou des paroles, puis calculer la couverture et capturer les mots. Les paroles et sous-titres restent privés (droits d'auteur) : jamais partagés entre utilisateurs. La lecture des sous-titres en parallèle de la vidéo serait le Graal pour l'anglais.
- **Tandem** *(nouveau)* : mettre en relation un francophone qui apprend le coréen avec un Coréen qui apprend le français, pour échanger des corrections de phrases (pas de chat libre au début, pour limiter la modération). Ça répond au besoin de pratique avec des humains, surtout pour les niveaux de langue coréens.
- **Chinois** ✅ ouvert (novembre 2026) : module « Pinyin & tons » (`pinyin.js`), pinyin au-dessus des caractères, réponses en caractères ou en pinyin (`zh.js`), 9 textes A1, lexique avec pinyin, segmentation par le lexique dans `tools/annotate.js`, voix mandarin de Kokoro. Reste : liste de fréquence HSK et plan pour `content:gen`, livres et histoire, test de niveau.
- **Russe** ✅ ouvert (novembre 2026) : module « Alphabet cyrillique » (`cyrillic.js`), réponses en cyrillique ou en translittération (`ru.js`), 9 textes A1, accent tonique dans le glossaire, annotation par les formes connues (`tools/annotate.js`). Reste : un vrai analyseur morphologique (pymorphy3) pour produire du contenu, liste de fréquence et plan, livres et histoire. ✅ Voix : Piper (4 voix russes, `tools/piper_server.py`).
- **Nouvelles langues** : français, japonais, italien sont **annoncés sur l'accueil** (cartes « 🔒 Bientôt », non cliquables, liste `COMING_SOON` dans `state.js`). Japonais : même logique d'alphabet d'abord que le Hangul (kana). Pour en ouvrir une : la passer de `COMING_SOON` à `LANGUAGES` avec son contenu. Le code est déjà prévu pour (`LANGUAGES`, `LEXICON`, `TEXTS`).
- **Espace prof / classe** : un prof crée une classe, assigne des textes et suit la progression.
- **Accessibilité** : navigation au clavier complète, lecteurs d'écran, contraste (déjà calculé dans la charte), taille de texte réglable, police adaptée en option.
- **Interface en plusieurs langues** (aujourd'hui seulement en français).
- **Intégration continue** : lancer `node tests/run.js` à chaque push (GitHub Actions).

---

## Stack 100 % gratuite *(nouveau)*

Tout ce qu'il faut pour faire tourner Mochi sans payer, avec les limites à connaître. **Les offres gratuites changent souvent** : revérifier avant de s'engager, et toujours garder une solution de repli.

| Besoin | Outil gratuit | Limites / licence | Remarque |
|---|---|---|---|
| Serveur | **Oracle Cloud Always Free** (VM ARM Ampere A1) | Réduit en 2026 à **2 OCPU / 12 Go de RAM** (avant : 4 / 24). 200 Go de disque. | Suffisant pour Node + SQLite + Kiwi + génération TTS par lots. Ollama 7B y sera lent. Risque de récupération des instances inactives : garder les sauvegardes ailleurs. |
| Reverse proxy + HTTPS | **Caddy** | Open source, certificats Let's Encrypt automatiques | — |
| Stockage audio et photos | **Cloudflare R2** | 10 Go, 1 M d'écritures et 10 M de lectures par mois, **sortie de données gratuite** | ~10 Go = des dizaines de milliers de phrases en audio compressé (Opus/MP3 basse résolution). |
| Sauvegarde SQLite | **Litestream** → R2 | Open source | Sauvegarde continue, restauration à la seconde. |
| E-mails | **Resend** | 3 000 e-mails/mois, **100 par jour** maximum | Largement assez pour les mots de passe oubliés. L'e-mail hebdomadaire devra rester facultatif tant qu'on reste en gratuit. |
| TTS coréen | **MeloTTS** | Licence MIT, temps réel sur CPU, coréen + anglais (4 accents) | Générer à la création du contenu, pas à la volée. |
| TTS anglais | **Kokoro** (82M) | Licence Apache 2.0, très rapide, plusieurs voix | **Pas de coréen.** Éviter les voix Piper sans vérifier : le moteur est sous MIT mais beaucoup de voix sont réservées à un usage non commercial. |
| Reconnaissance vocale | **API Web Speech** du navigateur, puis **whisper.cpp / faster-whisper** | Web Speech : Chrome, Edge, Safari, Firefox 160+ | Whisper est moins bon en coréen : tester des modèles affinés. |
| LLM | **Ollama** (déjà en place) | Gratuit, local, lent sur CPU | L'offre gratuite de Gemini existe mais ses limites ont été fortement réduites en 2026, et Google peut utiliser les requêtes gratuites pour améliorer ses produits : **à éviter pour les phrases des utilisateurs** (RGPD). |
| Analyse morphologique | **Kiwi** (`kiwipiepy`) | Open source | — |
| Dictionnaire coréen | **한국어기초사전 Open API** (Institut national de la langue coréenne) | Gratuit avec clé, jusqu'à 50 000 requêtes/jour | Définitions, exemples, traductions. Mettre en cache, respecter les conditions d'utilisation. |
| Fréquence coréen | **Liste de vocabulaire d'apprentissage du 국립국어원** | Téléchargeable sur korean.go.kr | ~6 000 mots classés. |
| Fréquence anglais | **wordfreq** (bibliothèque Python) | Données sous licence ouverte (vérifier l'attribution) | Couvre aussi le coréen, utile pour croiser. |
| Phrases d'exemple | **Tatoeba** | Texte sous **CC BY 2.0 FR** (attribution obligatoire). Licence audio variable selon le contributeur. | Exports hebdomadaires. Afficher l'attribution sur une page « Crédits ». |
| Polices | **Pretendard** (texte), **Jua** (titres) | SIL OFL 1.1 | Auto-héberger via Fontsource. Voir la charte. |
| Icônes | **Lucide** | Licence ISC | — |
| Statistiques d'usage | **Umami** (auto-hébergé) | Open source, sans cookies tiers | Pour mesurer la rétention réelle. |
| Surveillance | **Uptime Kuma** (auto-hébergé) | Open source | Page de statut. |
| Notifications push | **Web Push** (clés VAPID) | Gratuit, standard du navigateur | Pas besoin de service tiers. |
| CI | **GitHub Actions** | Gratuit dans les limites du plan | `node tests/run.js` à chaque push. |

**Ce qui reste payant** : le nom de domaine (une dizaine d'euros par an) et, si on garde Claude pour le feedback, les appels à l'API (d'où le cache, le quota et le choix d'un modèle adapté).

---

## Dette technique à surveiller

- ✅ **Découpage d'`app.js`** (fait) : 12 scripts classiques chargés dans l'ordre par `index.html` (`state.js`, `sync.js`, `ui.js`, `audio.js`, `reader.js`, `fsrs-cards.js`, `today.js`, `lessons.js`, `profile.js`, `router.js`, `actions.js`, `app.js` pour le démarrage), sans bundler ni changement de comportement. Les tests lisent la liste dans `index.html` et vérifient que chaque script est servi et précaché. Prochaine étape possible : modules ES.
- ✅ **Styles inline migrés** (fait) : plus aucun `style="…"` dans les vues (classes utilitaires en fin de `styles.css`, `data-bar-w` / `data-vars` appliqués par le CSSOM dans `ui.js`) ; `'unsafe-inline'` retiré de la CSP. Un test vérifie qu'aucune vue n'en réintroduit.
- Les tests (`node tests/run.js`) simulent le navigateur et FSRS : il manque des tests dans un vrai navigateur (Playwright).
- ~~La limitation des tentatives de connexion est gardée en mémoire~~ → remontée en P0.
- ~~Les couleurs et tailles sont codées en dur~~ ✅ `tokens.css` + `styles.css` migré (plus aucune couleur en dur). Restent hors charte : ~~la navigation Aujourd'hui / Lire / Réviser / Profil~~ ✅ (reste : barre latérale sur ordinateur, aujourd'hui en haut), les icônes Lucide à la place des émojis, ~~le sélecteur clair / sombre explicite~~ ✅ (Profil › Affichage), les modales avec piège du focus.
- Attribution des contenus : dès qu'on importe des phrases Tatoeba ou des définitions du 한국어기초사전, stocker la source et la licence **par phrase** (`source`, `license`, `author`), pas seulement globalement.