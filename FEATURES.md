# FEATURES.md : ce que Mochi sait faire aujourd'hui

> État du site au 18 novembre 2026. Pour la suite : `ROADMAP.md`. Pour l'installation : `SETUP.md`. Pour les principes pédagogiques : `PEDAGOGIE.md`.

**Mochi** est un site d'apprentissage de l'**anglais** et du **coréen** pour les francophones. Il repose sur une boucle quotidienne fondée sur la recherche : **lire et écouter → capturer les mots → réviser au bon moment → produire des phrases corrigées**.

---

## 🗂️ Vue d'ensemble

| Domaine | Fonctionnalités |
|---|---|
| Apprentissage | Session du jour, lecteur calibré, cartes en contexte, révisions FSRS, production corrigée, exercices, oreille |
| Coréen | Module Hangul (7 jours), 9 briques de grammaire, sélecteur de registre, particules en couleur |
| Anglais | Mots transparents, faux amis, prononciation |
| Correcteur IA | Claude (API) ou Ollama (local et gratuit), avec garde-fous et repli hors ligne |
| Comptes | Inscription, photo de profil, suivi d'activité, sécurité, synchronisation multi-appareils |
| Site | Responsive mobile et desktop, thème clair et sombre, page « Pourquoi ça marche » |

---

## ☀️ 1. La session du jour (onglet « Aujourd'hui »)

Les 4 étapes de la boucle, avec leur état :
1. **📖 Lire & écouter** : le texte recommandé du jour et ton pourcentage de mots connus.
2. **🫳 Capturer** : nombre de mots ajoutés aux révisions aujourd'hui.
3. **🧠 Réviser** : cartes à revoir et nouvelles cartes.
4. **💬 Produire** : la phrase à écrire du jour.

**Série hebdomadaire 📅** (§16) : l'objectif est 5 séances complètes sur 7 jours, 2 jours de repos inclus. Rater un jour ne casse rien ; seule une semaine sous l'objectif remet la série à zéro. Une séance compte si elle contient les révisions dues (ou au moins 10) **et** une lecture ou une production : ouvrir l'appli ne suffit pas.
- Carte « Ma semaine » : 7 pastilles, message bienveillant, Mochi fait la sieste quand l'objectif est atteint.
- **Reprise en douceur** : après 4 jours d'absence ou plus, 20 révisions le premier jour, puis 40 par jour jusqu'à résorber le retard, sans nouvelles cartes en attendant.
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
- **Audio** (synthèse vocale du navigateur) :
  - écouter tout le texte, avec la phrase en cours surlignée ;
  - écouter une seule phrase, à la vitesse 0,75×, 1× ou 1,25× ;
  - masquer le texte pour une écoute pure ;
  - traduction de chaque phrase sur demande (🇫🇷).
- **Mode shadowing 🎙️** : tu t'enregistres en répétant **en même temps** que la voix, puis tu réécoutes le modèle, ta voix, ou les deux à la suite.
- **Contenu** : 4 textes par langue, surtout des dialogues :
  - 🇬🇧 Au café, La nouvelle voisine, Le week-end, À la bibliothèque ;
  - 🇰🇷 Au café, Se présenter, Ma famille, Le week-end (registre poli 해요체).

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

Garde-fous communs : verdict cohérent avec les erreurs, registre coréen vérifié sans IA, quota de 60 corrections par compte et par jour.

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

- **Phase 1 · Hangul (7 jours)** : voyelles, consonnes, voyelles en « y », aspirées, construction de syllabes, consonnes finales et premiers mots.
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
- **Photo de profil** (recadrée automatiquement), ou un avatar emoji au choix (8).
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

- **Responsive** : téléphone (barre de navigation en bas, onglets qui défilent) et ordinateur.
- **Charte graphique** (`CHARTE-GRAPHIQUE.md`) appliquée : jetons CSS (`tokens.css`), thème clair et sombre « nuit de Séoul » automatique, Sakura pour l'action principale, une couleur par langue (myrtille pour l'anglais, kaki pour le coréen), polices Pretendard et Jua auto-hébergées, logotype « mochi », mouvements « squish » et respect de `prefers-reduced-motion`.
- **Mascotte Mochi** : galet crème, 7 humeurs (contente, concentrée, fière, curieuse, pensive, endormie, surprise), jamais triste ni en colère.
- **Lecteur** : particules coréennes colorées **par fonction** (thème, sujet, objet, lieu) avec un style de soulignement différent pour chacune, mots activables au clavier, `lang` posé sur tout texte étranger.
- **Affichage** : taille du texte réglable (90 à 150 %), mode lecture zen sans surlignage.
- **Page « Pourquoi ça marche »** (`#/pourquoi`) : 9 principes de la méthode, avec 29 sources scientifiques.
- **Heures d'apprentissage** comptées automatiquement (temps actif uniquement).

---

## 🛠️ Côté technique

| | |
|---|---|
| Interface | HTML, CSS et JavaScript, sans framework ni étape de compilation (`index.html`, `app.js`, `exercises.js`, `placement.js`, `content.js`, `tokens.css`, `styles.css`). Polices dans `fonts/`, ts-fsrs dans `vendor/` : aucun appel à un CDN |
| Serveur | Node.js ≥ 22.5, SQLite intégré (`server.js`) |
| Correcteur | `llm.js` : SDK Claude + zod, ou Ollama |
| Révisions | ts-fsrs 5.2.3 (embarqué) |
| Sécurité | Mots de passe hachés, cookie de session protégé, protection contre les requêtes venues d'autres sites, tentatives de connexion limitées (freinage progressif stocké en base, qui survit aux redémarrages), images vérifiées, seuls les fichiers du site sont servis |
| Tests | `npm test` : 5 suites (application, API, synchronisation, correcteur, Ollama), sans appel payant. Plus `tests/eval-llm.js` pour évaluer un vrai modèle |

## ⚠️ Limites actuelles

- Audio par **synthèse vocale du navigateur** : la qualité varie selon l'appareil. Pas encore de voix natives.
- **Peu de contenu** : 4 textes par langue.
- Pas encore de **mot de passe oublié** ni de vérification de l'e-mail.
- Pas encore de **liste d'amis** ni de **défis**.
- Site **pas encore en ligne** (local uniquement).
