# FEATURES.md : ce que Mochi sait faire aujourd'hui

> État du site au 19 novembre 2026. Pour la suite : `ROADMAP.md`. Pour l'installation : `SETUP.md`. Pour les principes pédagogiques : `PEDAGOGIE.md`.

**Mochi** est un site d'apprentissage de l'**anglais** et du **coréen** pour les francophones. Il repose sur une boucle quotidienne fondée sur la recherche : **lire et écouter → capturer les mots → réviser au bon moment → produire des phrases corrigées**.

---

## 🗂️ Vue d'ensemble

| Domaine | Fonctionnalités |
|---|---|
| Apprentissage | Session du jour, lecteur calibré, cartes en contexte, révisions FSRS, production corrigée, exercices, oreille |
| Coréen | Module Hangul (10 jours), 9 briques de grammaire, sélecteur de registre, particules en couleur |
| Anglais | Mots transparents, faux amis, prononciation |
| Correcteur IA | Claude (API) ou Ollama (local et gratuit), avec garde-fous et repli hors ligne ; plafond global quotidien, quota de 30 par compte, cache des réponses (90 jours), coût suivi dans l'admin |
| Comptes | Inscription, photo de profil, suivi d'activité, sécurité, synchronisation multi-appareils |
| Site | Responsive mobile et desktop, thème clair et sombre, page « Pourquoi ça marche » |
| Comptes | Mot de passe oublié (lien par e-mail, usage unique, 30 min), confirmation de l'adresse (bandeau non bloquant) |
| Motivation | Série hebdomadaire 5/7, quêtes de la semaine (3 par langue, +50 XP) |
| Appli | Installable (PWA), marche hors ligne (révisions, lecture), synchro au retour du réseau, audio des cartes dues pré-téléchargé |
| Admin | Comptes admin (`tools/admin.js`) : toutes les leçons ouvertes, tableau de bord `#/admin` (comptes, usage, appels IA du jour, taux de cache, coût estimé, fonctionnalités, contenu, accès direct) |
| Machine | `npm run doctor` : diagnostic de la machine serveur (système, processeur, RAM, carte NVIDIA ou Apple Silicon, Docker, Python / uv, Ollama, moteurs de voix chronométrés), profil (`gpu-large`, `gpu-small`, `apple`, `cpu`, `light`), commandes adaptées au système, incohérences signalées, `--write` (sauvegarde, sans toucher aux secrets) et `--pull` ; adaptation au démarrage (voix ou correcteur lents) ; bloc « Machine » dans l'admin. Jamais rien sur l'ordinateur des visiteurs |
| Sécurité | Content-Security-Policy stricte (aucun script ni style inline), `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS en HTTPS ; derrière Caddy, IP réelle du client lue seulement depuis un proxy de confiance (`TRUST_PROXY`, IPv6 regroupées par /64) |
| Thèmes | 8 thèmes de situation (café, rencontre, transports, cuisine, sport, séries, gaming, travail), 10 textes par langue, saveurs de Mochi à débloquer (10 mots solides), thèmes favoris, bibliothèque filtrable |
| Livres | Bibliothèque de lectures graduées : livres en chapitres (A1), questions de compréhension, chapitre suivant débloqué, mots inconnus en cartes |
| Histoire | Mode histoire (Mochi à Séoul / à Londres) : chapitres gradués, missions de conversation avec l'IA ou en mode guidé, déblocage par mots clés et grammaire |
| Clavier | Clavier coréen intégré (두벌식) sous chaque champ coréen : à l'écran ou avec le clavier physique (AZERTY ou QWERTY), syllabes composées automatiquement |
| Syllabes | Module Hangul en 10 jours (consonnes doubles, voyelles composées, 받침, écriture au clavier), atelier des syllabes (schéma du bloc, 7 sons finaux, décomposition d'un mot) |
| Ma Mochi | 9 accessoires cosmétiques (tête, cou, visage) gagnés par les bonnes pratiques (quêtes, lecture, écoute, écriture, régularité, Hangul), portés partout sur le site |
| Exercices | 12 types regroupés (écoute, écrit, grammaire, vocabulaire) : dictée, compréhension orale, phrase à trou, traduction corrigée par reformulation, bonne forme, bonne particule, remettre dans l'ordre, registre, ne pas confondre, associe, faux amis, mélange |
| Accueil | Visite guidée **interactive** à la première visite : un projecteur éclaire le vrai élément et l'utilisateur fait lui-même (choisir sa langue, ouvrir un texte, toucher un mot, l'ajouter aux révisions, aller dans S'entraîner) ; en coréen sans Hangul, elle montre l'alphabet. Passable, à revoir depuis l'accueil ou le profil |
| Mes mots | Dans Réviser : la liste de ses mots capturés, par langue, avec phrase d'origine (audio), traduction, statut (nouveau, à revoir aujourd'hui, prochaine révision, solide, en pause), recherche, tri, et « Retirer des révisions » (pause réversible, synchronisée) |
| Légal | Mentions légales, conditions d'utilisation (charte de bonne conduite), confidentialité RGPD (adaptée aux services actifs), cookies ; case obligatoire à l'inscription (version et date enregistrées) ; données temporaires purgées toutes les heures |
| Contenu | Chaîne de production (`CONTENU-PIPELINE.md`) : contenu dans `content/` (un fichier par texte, lexique, plan, listes de fréquence 국립국어원 / wordfreq), `content.data.js` généré ; plan par langue et `plan:suggest` (fréquence, anti-interférence, grammaire ≥ 3 textes) ; génération par LLM (`content:gen`, Ollama ou Anthropic, 2 variantes, réparation, relecture critique) ; annotation automatique (Kiwi pour le coréen, lemmatiseur pour l'anglais) ; vérification (`content:check`) ; relecture et publication dans `#/admin/contenu`, tableau de bord de couverture ; `content:release` (vérifier, construire, pré-générer l'audio) ; page « Crédits » |
| Audio | Voix du navigateur ou vraies voix du serveur (Kokoro, MeloTTS, cache disque), Profil › Audio : état, choix et test des voix, aide si aucune voix. **Sans attente** : tout l'audio pré-généré (`npm run tts:pregen`), moteurs préchauffés au démarrage, file par moteur où les clics passent avant le préchargement, 🔊 qui pulse pendant le chargement, voix de l'appareil après 5 s si le serveur tarde (la génération continue côté serveur) |

---

## ☀️ 1. La session du jour (onglet « Aujourd'hui »)

Les 4 étapes de la boucle, avec leur état :
1. **📖 Lire & écouter** : le texte recommandé du jour et ton pourcentage de mots connus. **Débutant complet** (aucun texte à 80 % et moins de 50 mots connus) : jamais de texte illisible, l'étape propose à la place le test de niveau ou « 🌱 Mes 10 premiers mots » (les plus fréquents, chacun dans sa phrase avec son audio, révisés tout de suite). Retour à la lecture dès qu'un texte dépasse 80 %.
2. **🫳 Capturer** : nombre de mots ajoutés aux révisions aujourd'hui.
3. **🧠 Réviser** : cartes à revoir et nouvelles cartes.
4. **💬 Produire** : la phrase à écrire du jour.

**Série hebdomadaire 📅** (§16) : l'objectif est 5 séances complètes sur 7 jours, 2 jours de repos inclus. Rater un jour ne casse rien ; seule une semaine sous l'objectif remet la série à zéro. Une séance compte si elle contient les révisions dues (ou au moins 10) **et** une lecture ou une production : ouvrir l'appli ne suffit pas.
- Carte « Ma semaine » : 7 pastilles, message bienveillant, Mochi fait la sieste quand l'objectif est atteint.
- **Reprise en douceur** : après 4 jours d'absence ou plus, 20 révisions le premier jour, puis 40 par jour jusqu'à résorber le retard, sans nouvelles cartes en attendant.
- **Coréen, Hangul pas fini** : une seule action principale, « Commencer le jour 1 » (ou « Continuer : jour N ») ; « Je lis déjà le Hangul » et le test de niveau sont proposés en dessous, en secondaire.
- **Test de niveau 🧭** (facultatif, 5 min) proposé tant qu'aucune carte n'existe : en anglais, estimation de la taille du vocabulaire par tranches de fréquence avec des faux mots ; en coréen, lecture du Hangul par des mots d'emprunt puis quelques points de grammaire. Les mots et points connus sont validés d'office.

## 📖 2. Lire & écouter (onglet « Lire »)

- **Calcul de couverture** : pour chaque texte, le site calcule le pourcentage de mots que **tu** connais et le classe :
  - 🎯 **zone idéale** : 92 à 98 % ;
  - 😌 **fluidité** : plus de 98 % ;
  - 💪 **un peu dur** : 90 à 92 % ;
  - 📖 **avec glossaire** : moins de 90 %.
- **Lecteur** :
  - touche un mot pour voir sa traduction et sa forme de base, puis l'ajouter aux révisions ou le marquer comme connu ;
  - glossaire automatique des mots inconnus quand le texte est trop dur, avec un bouton « Tout ajouter » ;
  - code couleur : mot nouveau (pointillé), en révision (surligné), transparent, particule coréenne (violet, désactivable).
- **Audio** (voix du serveur si configurées, sinon synthèse vocale du navigateur) :
  - écouter tout le texte, avec la phrase en cours surlignée ;
  - écouter une seule phrase, à la vitesse 0,75×, 1× ou 1,25× ;
  - masquer le texte pour une écoute pure ;
  - traduction de chaque phrase sur demande (🇫🇷).
- **Mode shadowing 🎙️** : tu t'enregistres en répétant **en même temps** que la voix, puis tu réécoutes le modèle, ta voix, ou les deux à la suite.
- **Contenu** : 10 textes par langue, surtout des dialogues, rangés par thème de situation :
  - 🇬🇧 Au café, La nouvelle voisine, Le week-end, À la bibliothèque, Dans le bus, On cuisine ce soir, Un match de foot, Une partie en ligne, Premier jour au bureau, Une série à voir ;
  - 🇰🇷 Au café, Se présenter, Ma famille, Le week-end, Dans le métro, Le kimchi-jjigae, Le sport, On joue ?, Au bureau, Un K-drama (registre poli 해요체).

## 🧠 3. Révisions (onglet « Réviser »)

- **Algorithme FSRS** (ts-fsrs) : chaque carte revient juste avant que tu l'oublies.
- **Rappel actif** : tu essaies de te souvenir **avant** de voir la réponse.
- **4 boutons** (À revoir, Difficile, Bien, Facile), chacun affichant le délai avant la prochaine révision. Raccourcis clavier : Espace pour afficher la réponse, 1 à 4 pour noter.
- **Cartes toujours en contexte** : chaque carte garde sa phrase d'origine et son audio. 4 types :
  - 👁️ **Reconnaissance** : le mot surligné dans sa phrase, à traduire ;
  - ✍️ **Production** : la phrase à trou, écrire le mot ;
  - 🎧 **Écoute** : audio seul, retrouver le sens ;
  - 🎯 **Point faible** : une particule souvent ratée, à compléter.
- Les cartes de production et d'écoute **se débloquent** après 2 réussites en reconnaissance sur des révisions réellement espacées.
- Nombre de nouvelles cartes par jour plafonné (12 par défaut), rétention visée réglable (80 à 95 %).
- **Anti-interférence** (§12) : jamais deux nouveaux mots de la même catégorie (boissons, nombres, famille…) ni deux contraires (early/late, 아버지/어머니) le même jour. Les autres attendent le lendemain.
- Boutons colorés avec icône (↺ 〰 ✓ ⚡) et raccourcis 1 à 4 ; `R` pour réécouter la phrase.
- **Historique complet** de chaque révision, exportable en JSON.

## 💬 4. Production (onglet « Produire »)

- **Mode guidé** : 7 exercices par langue (« Demande un thé poliment », « Dis que tu habites à Séoul »…). Ils sont choisis selon tes mots récents.
- **Mode phrase libre** (comptes) : un thème (ton week-end, ta famille, commander au café…), tu écris ce que tu veux.
- **Correction par reformulation** : on te montre la version naturelle de **ta** phrase, différences surlignées, plutôt qu'un simple « faux ».
- **Erreurs classées** : grammaire, vocabulaire, registre, orthographe.
- **Coréen** : l'interlocuteur est indiqué (serveur, inconnu, professeure…) et le **registre est vérifié** (-요 attendu ; le formel -니다 est accepté).
- Explication en français **seulement à la demande** (bouton « Pourquoi ? »), plus un mot d'encouragement.
- Les variantes correctes sont acceptées, sans sur-correction.
- **Erreurs récurrentes** : une particule ratée deux fois crée une carte de révision ciblée.

### Les correcteurs

| Correcteur | Quand | Particularités |
|---|---|---|
| **Claude** (API) | Compte connecté et clé configurée | Meilleure qualité, ~1 à 3 centimes par correction (Opus), modèle de secours en cas de refus |
| **Ollama** (local) | `MOCHI_LLM_PROVIDER=ollama` | Gratuit, rien ne quitte la machine. 9/10 sur l'évaluation, ~22 s par correction sur CPU |
| **Hors ligne** | Invité, ou correcteur IA indisponible | Comparaison avec des réponses types. Automatique, sans configuration |

Garde-fous communs : verdict cohérent avec les erreurs, registre coréen vérifié sans IA, quota de 30 corrections par compte et par jour (`MOCHI_LLM_DAILY`), **plafond global** de 500 appels par jour pour tout le site (`MOCHI_LLM_GLOBAL_DAILY` ; au-delà, correcteur hors ligne avec un message honnête jusqu'à minuit), **cache des réponses** (même phrase, même exercice, même interlocuteur : un seul appel, pas décompté du quota, gardé 90 jours).

## 🎯 5. Exercices (onglet « Exercices »)

Phrases tirées des textes où tu connais déjà la plupart des mots, toujours avec audio :
- 🔀 **Mélange** (par défaut, §13) : alterne les types d'exercices et, en coréen, les points de grammaire déjà vus, avec plus de poids pour les points récents et souvent ratés.
- ✍️ **Dictée** : écouter, écrire, voir les différences (bouton 🐢 lent).
- 🧩 **Remettre les mots dans l'ordre**.
- 🎧 **Compréhension orale** : audio seul, choisir la bonne traduction.
- 🙇 **Quel registre ?** (coréen) : choisir la bonne formulation selon l'interlocuteur.
- 🎭 **Faux amis** (anglais) : choisir le vrai sens en contexte.

## 🎧 6. Oreille & prononciation (onglet « Oreille »)

- **Paires minimales multi-voix** (§14) : on entend un mot, prononcé à chaque fois par l'une d'au moins 4 voix, tu choisis lequel. Réécoute des options, **score par contraste**, et les sons faibles reviennent plus souvent.
  - 🇬🇧 voyelles courtes / longues, th / s / f / z, h aspiré, w / v (16 paires) ;
  - 🇰🇷 ㅓ/ㅗ, ㅡ/ㅜ, ㅅ/ㅆ, consonnes simples, aspirées et tendues (달/탈/딸, 자다/차다/짜다, 방/빵…) (12 paires).
- **Notes avec audio** :
  - 🇬🇧 formes faibles (gonna, wanna…), accent tonique (PHOtograph, phoTOgraphy…) ;
  - 🇰🇷 enchaînement des consonnes (한국어 → [한구거]), prononciation du ㄹ.

## 📒 7. Mots (onglet « Mots »)

- **Modèle du vocabulaire connu** : un mot est « connu » si FSRS estime que tu le retiens au moins 7 jours, ou si tu l'as marqué toi-même.
- Liste des mots **par fréquence**, avec leur statut : connu, en révision, transparent, nouveau.
- Bouton « Apprendre les 5 prochains mots fréquents » : chacun est ajouté avec sa phrase d'exemple.
- Lexiques : 92 mots en anglais (dont 12 transparents), 66 en coréen.

## 🇰🇷 8. Parcours coréen (onglet « Parcours »)

- **Phase 1 · Hangul (10 jours)** : voyelles, consonnes, voyelles en « y », aspirées, consonnes doubles, voyelles composées, construction de syllabes, consonnes finales (받침), premiers mots et écriture au clavier.
  - Quiz d'association lettre ↔ son et son ↔ lettre ; les erreurs sont reposées jusqu'à la bonne réponse.
  - La **romanisation n'existe que dans ce module**, puis elle disparaît.
  - Le reste du coréen est verrouillé tant que le Hangul n'est pas fini (bouton « Je lis déjà le Hangul »).
- **Phase 2 · Les briques de la phrase** : 9 points débloqués **un par un**, chacun avec des exemples audio d'abord, puis un quiz :
  - registre poli -요, 은/는, 이/가, 을/를, 에, 에서, 도, nombres natifs, nombres sino-coréens ;
  - barre de progression et message rassurant (« c'est normal que ce soit dur »).
- **Phase 3** (verrouillée) : 반말, 합니다체, honorifiques.
- **Sélecteur de registre** : une même phrase dite à un ami, un inconnu, un supérieur ou un aîné (4 phrases).

## 🇬🇧 9. Spécificités anglais

- **Mots transparents** (coffee, hospital, university…) comptés comme « probablement connus » dans la couverture, avec un poids réglable de 0 à 100 %.
- **Onglet Faux amis** : 8 pièges (actually, eventually, library, sensible, attend, pretend, deception, rude), chacun avec sa phrase d'exemple et une carte de révision en un clic.

## 👤 10. Comptes & profil

- **Inscription et connexion** (e-mail et mot de passe). La progression faite en invité est **rattachée** au nouveau compte.
- **Photo de profil** (recadrée automatiquement), ou un avatar : **Mochi** par défaut (avec ses accessoires), ou un emoji au choix (8).
- **Mon activité** :
  - calendrier des 17 dernières semaines ;
  - jours actifs, heures totales, minutes sur 7 jours ;
  - nombre de révisions, de phrases produites, de lectures.
- **Où j'en suis** (par langue) :
  - heures cumulées et progression vers les niveaux (coréen B1 ≈ 700 à 900 h, anglais B1/B2) ;
  - mots connus, et « tu comprends ~X % de nos textes ».
- **Réglages** : rétention visée, nouvelles cartes par jour, poids des mots transparents, particules en couleur, objectif quotidien (5 à 20 min).
- **Sécurité** :
  - changement de mot de passe (qui déconnecte tes autres appareils) ;
  - liste des appareils connectés et bouton « déconnecter les autres » ;
  - déconnexion, et suppression du compte avec toutes ses données.
- **Mode invité** : tout fonctionne sans compte (la progression reste dans le navigateur), sauf la photo, les phrases libres et la synchronisation.

## ☁️ 11. Synchronisation multi-appareils

- Ta progression te suit sur tous tes appareils, **sans perte** quand deux appareils sont utilisés en même temps :
  - les révisions s'ajoutent (jamais écrasées) ;
  - chaque carte et chaque réglage garde sa version la plus récente ;
  - XP, temps et activité s'additionnent.
- Ce que tu fais hors ligne est envoyé au retour du réseau, et les changements des autres appareils arrivent toutes les minutes.
- Un badge indique l'état : synchronisé, en attente ou hors ligne.
- Une réinitialisation s'applique à tous les appareils. À la déconnexion, rien ne reste dans le navigateur.

## 🌐 12. Le site

- **Responsive** : une seule navigation par écran. Téléphone (< 768 px) : la barre du bas, en-tête de langue compact sur une ligne. Ordinateur : le menu du haut. Pastille des cartes à revoir sur « S'entraîner », `aria-current` sur l'entrée active.
- **Nombres au format français** : « 1,5 h », « 1 234 mots ».
- **Cookies** : une ligne discrète dans le pied de page (« Mochi n'utilise que des cookies nécessaires »), sans bandeau ni bouton : les cookies strictement nécessaires sont dispensés de consentement.
- **Charte graphique** (`CHARTE-GRAPHIQUE.md`) appliquée : jetons CSS (`tokens.css`), thème clair et sombre « nuit de Séoul » (automatique, ou forcé dans Profil › Affichage), Sakura pour l'action principale, une couleur par langue (myrtille pour l'anglais, kaki pour le coréen), polices Pretendard et Jua auto-hébergées, logotype « mochi », mouvements « squish » et respect de `prefers-reduced-motion`.
- **Mascotte Mochi** : galet crème, 7 humeurs (contente, concentrée, fière, curieuse, pensive, endormie, surprise), jamais triste ni en colère.
- **Lecteur** : particules coréennes colorées **par fonction** (thème, sujet, objet, lieu) avec un style de soulignement différent pour chacune, mots activables au clavier, `lang` posé sur tout texte étranger.
- **Affichage** : taille du texte réglable (90 à 150 %), mode lecture zen sans surlignage.
- **Page « Pourquoi ça marche »** (`#/pourquoi`) : 9 principes de la méthode, avec 29 sources scientifiques.
- **Heures d'apprentissage** comptées automatiquement (temps actif uniquement).

---

## 🛠️ Côté technique

| | |
|---|---|
| Interface | HTML, CSS et JavaScript, sans framework ni étape de compilation (`index.html` charge dans l'ordre des scripts classiques : `state.js`, `sync.js`, `ui.js`, `audio.js`, `reader.js`, `fsrs-cards.js`, `today.js`, `lessons.js`, `profile.js`, `router.js`, `actions.js`, `app.js` (démarrage), puis `exercises.js`, `placement.js`… ; `content.js` pour le contenu, `tokens.css` et `styles.css`). Polices dans `fonts/`, ts-fsrs dans `vendor/` : aucun appel à un CDN |
| Serveur | Node.js ≥ 22.5, SQLite intégré (`server.js`) |
| Correcteur | `llm.js` : SDK Claude + zod, ou Ollama |
| Révisions | ts-fsrs 5.2.3 (embarqué) |
| Sécurité | CSP stricte et en-têtes de sécurité, IP réelle derrière un proxy de confiance (`TRUST_PROXY`), mots de passe hachés, cookie de session protégé, protection contre les requêtes venues d'autres sites, tentatives de connexion limitées (freinage progressif stocké en base, qui survit aux redémarrages), images vérifiées, seuls les fichiers du site sont servis |
| Tests | `npm test` : 8 suites (application, API, voix, e-mails, synchronisation, correcteur, Ollama, matériel), sans appel payant. Plus `tests/eval-llm.js` pour évaluer un vrai modèle (score, temps, coût) |

## ⚠️ Limites actuelles

- **Voix** : le relais serveur (Kokoro pour l'anglais, MeloTTS pour le coréen, cache disque) est prêt, mais les moteurs restent à déployer sur la machine de production. Sans eux, c'est la synthèse vocale du navigateur, dont la qualité varie selon l'appareil.
- **Contenu encore léger** : 10 textes par langue, 2 livres, 5 chapitres d'histoire. Pas encore de textes « tout premiers pas » lisibles dès le jour 1.
- Pas encore de **liste d'amis** ni de **défis**.
- Site **pas encore en ligne** (local uniquement). La configuration derrière Caddy est documentée (`SETUP.md`).
- Le choix d'un modèle Claude plus léger attend l'évaluation (`tests/eval-llm.js`) avec une vraie clé API.
