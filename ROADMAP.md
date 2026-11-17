# ROADMAP.md : fonctionnalités à venir

> Liste des fonctionnalités à ajouter à Mochi, **classées par importance**.
> Chaque feature doit respecter `PEDAGOGIE.md` (checklist §9). Quand une feature touche la motivation ou le social, relire §8 : **la gamification ne doit jamais récompenser une mauvaise pratique**.
>
> Effort : 🟢 petit (≤ 1 jour) · 🟡 moyen (quelques jours) · 🔴 gros (1 semaine et plus)

---

## Vue d'ensemble

| Priorité | Feature | Effort | Dépend de |
|---|---|---|---|
| **P0** | Mise en ligne sécurisée (HTTPS, sauvegardes) | 🟡 | — |
| **P0** | Mot de passe oublié + vérification de l'e-mail | 🟡 | service d'e-mail |
| ~~**P0**~~ | ~~Synchro sans perte entre appareils~~ ✅ fait | 🟡 | — |
| ~~**P1**~~ | ~~Feedback de production par LLM~~ ✅ fait | 🔴 | backend |
| **P1** | Vraies voix (TTS neuronal / audio natif) | 🟡 | backend |
| **P1** | Beaucoup plus de contenu (textes, dialogues) | 🔴 | — |
| **P1** | Nouveaux types d'exercices (5 faits, d'autres à venir) | 🟡 | — |
| **P1** | Analyseur morphologique coréen côté serveur | 🟡 | backend |
| **P1** | Génération de textes calibrés par LLM | 🔴 | LLM + analyseur |
| **P2** | Liste d'amis | 🟡 | comptes |
| **P2** | Défis entre amis | 🟡 | liste d'amis |
| **P2** | Reconnaissance vocale (exercices oraux) | 🔴 | backend |
| **P2** | Optimisation FSRS par utilisateur | 🟡 | historique de révisions |
| **P2** | Rappels et notifications | 🟡 | PWA |
| **P2** | Application installable (PWA) + hors ligne | 🟡 | — |
| **P3** | Classements entre amis, badges | 🟢 | amis |
| **P3** | Import de contenus perso (articles, sous-titres) | 🔴 | analyseur |
| **P3** | Nouvelles langues | 🔴 | contenu |
| **P3** | Espace prof / classe | 🔴 | comptes |
| **P3** | Accessibilité et traduction de l'interface | 🟡 | — |

---

## P0 : indispensable avant d'ouvrir le site au public

### Mise en ligne sécurisée 🟡
- Hébergement (VPS, Fly.io, Railway…) derrière un reverse proxy HTTPS (Caddy ou nginx), avec `COOKIE_SECURE=1`.
- Sauvegarde automatique quotidienne de `data/` (base SQLite + photos), avec une restauration testée.
- En-têtes de sécurité complets (Content-Security-Policy), logs d'erreurs, page de statut.
- Pages légales : mentions légales, politique de confidentialité (RGPD : export et suppression déjà disponibles).

### Mot de passe oublié + vérification de l'e-mail 🟡
- Envoi d'e-mails transactionnels (Resend, Postmark, SMTP).
- Lien de réinitialisation à usage unique, valable environ 30 minutes, avec un jeton haché en base.
- Vérification de l'adresse à l'inscription (sans bloquer l'usage : bandeau de rappel).

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
Reste : un cache des réponses, et un jeu d'évaluation plus large (aujourd'hui 10 phrases) pour comparer les moteurs et les prompts.

Spécification d'origine :
Remplace l'heuristique actuelle (comparaison avec des réponses de référence) pour pouvoir proposer des **phrases libres** (§4).
- Route serveur `POST /api/feedback` : la clé API ne doit jamais aller dans le navigateur.
- Prompt système conforme au §4 :
  - corrige sans changer le sens ;
  - sépare les erreurs de **grammaire**, de **vocabulaire** et de **registre** (registre vérifié selon l'interlocuteur indiqué, §6) ;
  - explique en français, seulement à la demande (bouton « Pourquoi ? ») ;
  - ne corrige pas les variantes acceptables ;
  - répond en JSON structuré (`recast`, `errors[]`, `explanation`) pour garder l'affichage avec surlignage.
- Garder l'heuristique actuelle en secours si le LLM ne répond pas.
- Les erreurs récurrentes détectées par le LLM alimentent les cartes ciblées (déjà en place pour les particules).
- Limite d'usage par utilisateur et par jour (coût), avec un cache des réponses.

### Vraies voix 🟡
La synthèse vocale du navigateur varie énormément d'un appareil à l'autre (§5 : audio natif ou TTS de haute qualité).
- Générer l'audio de chaque phrase avec un TTS neuronal, côté serveur ou au moment de la création du contenu, puis le stocker en fichiers (`audio_url` existe déjà dans le modèle de carte).
- Plusieurs voix par langue (homme / femme, jeune / âgé), surtout utile pour les dialogues.
- À terme : enregistrements de locuteurs natifs pour les contenus principaux.
- Lecteur : surlignage mot à mot synchronisé avec l'audio (timestamps).

### Beaucoup plus de contenu 🔴
4 textes par langue, c'est trop peu pour que le calcul de couverture (§3) ait du sens.
- Objectif : 50 textes ou plus par langue, du A1 au B1, avec beaucoup de dialogues (§7).
- Couvrir les ~1 000 mots les plus fréquents de chaque langue, avec des listes de fréquence.
- Coréen : du contenu qui reprend chaque point de grammaire de la phase 2, puis débloquer la phase 3 (반말, 합니다체, honorifiques).
- Outil interne d'annotation : coller un texte, obtenir les lemmes et particules (analyseur, voir plus bas), corriger à la main.

### Nouveaux types d'exercices 🟡
Faits (onglet « 🎯 Exercices », `exercises.js`) : ✅ dictée, ✅ remettre dans l'ordre, ✅ compréhension orale (audio → sens), ✅ choix du registre (coréen), ✅ faux amis (anglais).

Tous en **rappel actif** (§1), avec une phrase de contexte et de l'audio (§2) :
- ~~**Dictée**~~ ✅
- ~~**Remettre les mots dans l'ordre**~~ ✅
- **Traduction FR → langue cible** avec feedback reformulé (après le LLM).
- **Compréhension orale** : ✅ phrase par phrase ; reste un dialogue entier suivi de questions.
- ~~**Choix du registre** (coréen)~~ ✅
- **Conjugaison et terminaisons** en contexte (-아요 / -어요, passé, futur).
- **Paires minimales étendues** (§5) : davantage de sons, avec un score par son pour repérer les points faibles.
- **Mini-conversations** guidées (avec le LLM) : un scénario (commander au café, se présenter) et un objectif.

### Analyseur morphologique coréen 🟡
Obligatoire selon le §3 pour tout contenu qui n'est pas annoté à la main.
- Kiwi (`kiwipiepy`) ou Mecab-ko, exposé par une petite route serveur, éventuellement en microservice Python.
- Anglais : lemmatisation (spaCy, wink-nlp).
- Produit directement le format annoté de `content.js` (`surface=lemme`, `nom|particule`).

### Génération de textes calibrés par LLM 🔴
§3 : un texte sur mesure pour chaque utilisateur.
- Contraindre le LLM au vocabulaire connu, plus 3 à 8 mots nouveaux ciblés (les prochains mots fréquents).
- **Vérifier** la couverture réelle après génération avec l'analyseur, et régénérer si on sort de la fourchette 92-98 %.
- Sujets choisis par l'utilisateur (sport, cuisine, K-drama…) pour la motivation.

---

## P2 : social et motivation

### Liste d'amis 🟡
- Ajouter un ami par pseudo unique ou par lien d'invitation, avec une demande à accepter.
- Profil public minimal : photo, prénom, langues apprises, heures cumulées, mots connus. Ce qui est visible se règle dans les paramètres.
- Bloquer ou retirer un ami. Rien n'est public par défaut.
- Côté serveur : tables `friendships (user_id, friend_id, status, created_at)` et `usernames`.

### Défis entre amis 🟡
**Règle d'or (§8) : un défi ne doit jamais pousser à mal apprendre.** On ne fait pas de course à l'XP, qu'on pourrait gonfler en relisant ou en bâclant les cartes.

Défis qui récompensent les **bonnes pratiques** :
- **Semaine régulière** : faire sa session complète (input + révisions + production) 5 jours sur 7, ensemble ou en duel.
- **Zéro retard** : finir toutes ses révisions dues chaque jour pendant une semaine.
- **Objectif d'heures** : cumuler X heures à deux (défi coopératif, pas une compétition).
- **Mots solides** : gagner le plus de mots devenus « connus » (stabilité FSRS ≥ 7 jours), donc de vraie rétention, pas des cartes vues.
- **Défi d'écoute** : meilleur score aux paires minimales sur un même lot de sons.
- **Défi de production** : écrire une phrase sur un thème commun, puis voir celle de l'ami et sa version reformulée.

Mécanique :
- Créer un défi : type, durée (3, 7 ou 14 jours), ami(s) invité(s).
- Suivi en direct de la progression de chacun, notification à la fin, résultat dans l'historique.
- Côté serveur : tables `challenges` et `challenge_participants`. La progression est calculée côté serveur à partir des événements (révisions, sessions), jamais déclarée par le client.

### Reconnaissance vocale 🔴
- Exercices oraux : lire une phrase à voix haute, la transcription automatique (Whisper ou équivalent) est comparée au texte attendu.
- Shadowing amélioré : comparer le rythme et l'intonation (courbe de hauteur du modèle et de l'utilisateur côte à côte), en accord avec le §5 qui vise la prosodie et non la perfection de chaque son.
- Réponse orale aux cartes de production.

### Optimisation FSRS par utilisateur 🟡
- Après environ 1 000 révisions, optimiser les paramètres FSRS sur l'historique de l'utilisateur (optimiseur `fsrs-rs` / `fsrs-optimizer`).
- Afficher la rétention réelle comparée à la rétention visée.

### Rappels et notifications 🟡
- Notification « Tes révisions t'attendent » à l'heure choisie (Web Push).
- E-mail hebdomadaire facultatif : heures, mots gagnés, défis en cours.
- Pas de notifications culpabilisantes ni de rappels en rafale.

### Application installable + hors ligne 🟡
- PWA : manifeste, icône, service worker.
- Mode hors ligne : réviser dans le métro, synchroniser au retour du réseau (s'appuie sur la synchro par événements du P0).
- Embarquer ts-fsrs localement au lieu du CDN.

---

## P3 : plus tard

- **Classements entre amis** (heures, mots solides), toujours basés sur des indicateurs honnêtes, et **badges** (premier texte lu, Hangul terminé, 100 mots connus, phase 2 franchie).
- **Import de contenus perso** : coller un article, des sous-titres de série (.srt) ou des paroles, puis calculer la couverture et capturer les mots. La lecture des sous-titres en parallèle de la vidéo serait le Graal pour l'anglais.
- **Nouvelles langues** : japonais (même logique d'alphabet d'abord que le Hangul), espagnol. Le code est déjà prévu pour (`LANGUAGES`, `LEXICON`, `TEXTS`).
- **Espace prof / classe** : un prof crée une classe, assigne des textes et suit la progression.
- **Accessibilité** : navigation au clavier complète, lecteurs d'écran, contraste, taille de texte réglable.
- **Interface en plusieurs langues** (aujourd'hui seulement en français).
- **Intégration continue** : lancer `node tests/run.js` à chaque push (GitHub Actions).

---

## Dette technique à surveiller

- `app.js` dépasse 1 400 lignes : le découper en modules (`fsrs`, `reader`, `review`, `account`…) quand on ajoutera un bundler ou des modules ES.
- Les tests (`node tests/run.js`) simulent le navigateur et FSRS : il manque des tests dans un vrai navigateur (Playwright).
- La limitation des tentatives de connexion est gardée en mémoire : elle se remet à zéro au redémarrage du serveur et ne fonctionne pas avec plusieurs instances.
