# PEDAGOGIE.md — Règles pédagogiques du site d'apprentissage de langues

> **Pour Claude Code :** ce fichier décrit les principes d'apprentissage sur lesquels repose le site et la façon de les implémenter. Chaque fonctionnalité doit respecter ces règles. Quand une règle est marquée **[OBLIGATOIRE]**, ne pas la contourner sans le demander. Adapte les exemples de code à la stack existante du projet (ne change pas de framework).
>
> Langues ciblées pour l'instant : **anglais** et **coréen**. Public principal : **francophones**.
>
> La section 6 contient le contenu de la page publique « Pourquoi ça marche », avec les sources (section 7).

---

## 0. Vue d'ensemble : la boucle d'apprentissage

Tout le site s'organise autour d'une **boucle quotidienne** en 4 temps :

```
1. INPUT       → l'utilisateur lit / écoute un contenu court, calibré à son niveau (~95 % de mots connus)
2. CAPTURE     → les mots/expressions inconnus deviennent des cartes de révision (en contexte, avec audio)
3. RÉVISION    → révisions espacées planifiées par FSRS (rappel actif, pas relecture)
4. PRODUCTION  → l'utilisateur écrit / dit une phrase, reçoit une correction reformulée (recast)
```

Chaque session doit toucher au minimum les étapes 1, 3 et 4. L'étape 2 est automatique ou en un clic.

---

## 1. Répétition espacée + rappel actif

**Pourquoi :** c'est le principe avec les preuves les plus solides. Une méta-analyse de 29 études montre un gros avantage de la pratique de rappel espacée sur la pratique massée (g = 0,74). Le type d'espacement (croissant ou uniforme) compte peu : l'essentiel est d'espacer et de faire *récupérer* la réponse de mémoire.

### Règles

- **[OBLIGATOIRE]** Utiliser l'algorithme **FSRS** (Free Spaced Repetition Scheduler) pour planifier les révisions. Ne pas coder SM-2 ni un intervalle fixe maison.
  - JS/TS : [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)
  - Python : [`py-fsrs`](https://github.com/open-spaced-repetition/py-fsrs)
  - Autres langages : voir l'organisation GitHub `open-spaced-repetition`.
- **[OBLIGATOIRE]** Les révisions sont du **rappel actif** : on montre l'indice (mot, audio ou phrase à trou), l'utilisateur doit produire ou retrouver la réponse **avant** de la voir. Jamais de « relis la liste ».
- Notation à 4 boutons compatible FSRS : `Again` / `Hard` / `Good` / `Easy`. Sur mobile, on peut simplifier à 2 boutons (`Again` / `Good`).
- Rétention cible par défaut : **0,90**, réglable dans les paramètres (0,80–0,95).
- Plafonner les **nouvelles cartes par jour** (défaut : 10–15) pour éviter l'avalanche de révisions.
- Stocker l'historique complet des révisions (pour pouvoir optimiser les paramètres FSRS par utilisateur plus tard).

### Modèle de données minimal (indicatif)

```
Card {
  id, user_id, lang ("en" | "ko"),
  lemma,                 // forme de base du mot
  surface_form,          // forme rencontrée dans le texte
  context_sentence,      // phrase d'origine (OBLIGATOIRE, voir §2)
  translation_fr,
  audio_url,
  source_content_id,     // contenu d'où vient la carte
  fsrs_state             // due, stability, difficulty, reps, lapses, state, last_review…
}

ReviewLog {
  id, card_id, user_id, rating, reviewed_at, elapsed_days, scheduled_days, state
}
```

---

## 2. Cartes en contexte, jamais de mots isolés

### Règles

- **[OBLIGATOIRE]** Toute carte contient la **phrase d'origine** et, si possible, l'**audio natif** de cette phrase.
- Recto possible : phrase avec le mot cible masqué (cloze), ou audio seul (carte d'écoute), ou traduction FR → produire le mot (carte de production).
- Générer au moins 2 types de cartes par mot important : **reconnaissance** (L2 → FR) et **production** (FR → L2), la seconde débloquée après quelques révisions réussies de la première.

---

## 3. Input compréhensible calibré (~95 %)

**Pourquoi :** on apprend en comprenant des messages, à condition de comprendre la grande majorité de ce qu'on lit ou entend (environ 90–98 % des mots). À 95 % de couverture, on tombe sur un mot inconnu tous les 20 mots ; à 98 %, un sur 50. Pour l'oral (conversations, séries, podcasts), environ 2 000–3 000 familles de mots suffisent à atteindre 95 % de couverture. Pour lire de l'écrit natif confortablement, il en faut 8 000–9 000.

### Règles

- **[OBLIGATOIRE]** Le site maintient un **modèle du vocabulaire connu** de chaque utilisateur (mots des cartes avec stabilité FSRS suffisante + mots marqués « connu »).
- **[OBLIGATOIRE]** Avant de proposer un contenu, calculer sa **couverture lexicale** pour cet utilisateur :
  `couverture = nb_tokens_connus / nb_tokens_total` (exclure noms propres et ponctuation).
- Recommander en priorité les contenus avec **couverture entre 0,92 et 0,98** (cible : 0,95).
  - < 0,90 → trop dur, ne pas proposer (ou proposer avec glossaire).
  - > 0,98 → bon pour la fluidité, mais pas prioritaire pour apprendre du nouveau.
- Afficher la couverture à l'utilisateur sous forme simple (« Tu connais ~95 % des mots de ce texte »).
- Si des contenus sont générés par LLM : contraindre la génération au vocabulaire connu + N mots nouveaux ciblés (N ≈ 3–8 par texte court), puis **vérifier** la couverture réelle après génération.
- Tokenisation :
  - Anglais : lemmatisation standard (ex. spaCy, wink-nlp, ou équivalent).
  - Coréen : **analyseur morphologique obligatoire** (le coréen colle particules et terminaisons aux mots). Ex. KoNLPy (Okt / Mecab-ko), Kiwi (`kiwipiepy`) ou équivalent. Compter le lemme, pas la forme fléchie.
- Clic/tap sur n'importe quel mot → traduction + bouton « ajouter aux révisions ».
- Progression du vocabulaire guidée par la **fréquence** : enseigner d'abord les mots les plus fréquents (listes de fréquence par langue).

### Nuance (à respecter dans le design)

L'input seul ne suffit pas : des critiques récentes de Krashen insistent sur le rôle de l'interaction, du feedback et de la pratique active. D'où les §1 et §4 : **l'input est le carburant, pas toute la machine.**

---

## 4. Production + feedback correctif

**Pourquoi :** une méta-analyse (Li, 2010) trouve un effet moyen du feedback correctif, maintenu dans le temps, et le feedback **implicite** (reformulation correcte) tient mieux dans le temps que le feedback explicite.

### Règles

- **[OBLIGATOIRE]** Chaque session contient au moins **un exercice de production** (écrire ou dire une phrase réutilisant des mots récemment appris).
- **[OBLIGATOIRE]** Le feedback se fait d'abord par **recast** : afficher la version corrigée et naturelle de la phrase de l'utilisateur, avec les différences surlignées. Pas de simple « Faux ».
- Explication grammaticale courte disponible **à la demande** (bouton « Pourquoi ? »), pas imposée.
- Pour le feedback libre (phrases ouvertes), utiliser un LLM avec un prompt qui :
  - corrige sans réécrire le sens,
  - signale séparément les erreurs de grammaire, de vocabulaire et de **registre** (crucial en coréen, voir §7),
  - répond en français pour les explications,
  - ne corrige pas les variantes acceptables (ne pas sur-corriger).
- Les erreurs récurrentes d'un utilisateur génèrent des cartes ciblées (ex. une particule souvent ratée → cartes cloze sur cette particule).

---

## 5. Écoute et shadowing

**Pourquoi :** les apps de langues aident surtout le vocabulaire et la grammaire en réception ; l'**écoute** est leur point faible par rapport aux cours (étude de 2025 sur 337 apprenants). Le shadowing (répéter l'audio en même temps que le locuteur) améliore la fluidité et la prosodie (rythme, intonation). Ses effets sur les sons isolés sont moins prouvés.

### Règles

- **[OBLIGATOIRE]** Audio natif (ou TTS de haute qualité) pour **tout** contenu et toute carte.
- Lecteur audio avec : vitesse 0,75× / 1× / 1,25×, répétition phrase par phrase, transcription masquable.
- **Mode shadowing** : l'audio joue phrase par phrase, l'utilisateur s'enregistre en même temps, puis réécoute les deux côte à côte. Objectif affiché : le **rythme et l'intonation**, pas la perfection de chaque son.
- Cartes d'écoute pure (audio → sens) en plus des cartes écrites.
- Les contenus audio comptent comme des contenus d'input (§3) et suivent la même règle de couverture.

---

## 6. Règles spécifiques au CORÉEN

**Pourquoi :** pour un anglophone, le FSI (l'institut de formation des diplomates américains) estime qu'il faut environ 2 200 heures de cours pour atteindre une compétence professionnelle en coréen. B1 (conversation sur des sujets du quotidien) demande plutôt 700–900 heures. L'alphabet (Hangul) est en revanche très facile : la plupart des apprenants le lisent en une semaine environ.

### Ordre du parcours débutant [OBLIGATOIRE]

1. **Module Hangul (≈ 7 jours)** — 14 consonnes + 10 voyelles de base, puis construction des blocs syllabiques. Très gamifié, feedback instantané.
   - **[OBLIGATOIRE] Aucune romanisation** dans le parcours après ce module (la romanisation peut apparaître uniquement comme aide temporaire *pendant* le module Hangul, puis disparaît).
2. **Registre poli 해요체 (terminaisons en -요)** comme registre **par défaut** de tout le contenu débutant.
3. **Particules de base** : 은/는, 이/가, 을/를, puis 에, 에서, 도, etc.
4. **Les deux systèmes de nombres** (natifs 하나, 둘… et sino-coréens 일, 이…) introduits tôt, avec leurs usages (heures, âge, prix, etc.).
5. Ensuite seulement : banmal (반말), registre formel 합니다체, honorifiques.

### Le « mur après le Hangul » — point critique

Après l'alphabet, trois systèmes arrivent en même temps : **particules, terminaisons verbales, niveaux de langue**. C'est là que beaucoup d'apprenants abandonnent, et le feedback est plus difficile à automatiser (les réponses dépendent souvent du contexte).

Règles pour le gérer :

- Introduire **un seul** nouveau point de grammaire à la fois, avec beaucoup d'input qui le contient (§3) avant de demander de le produire.
- Afficher une **barre de progression visible** sur cette phase (« Phase 2 : les briques de la phrase ») pour que l'utilisateur sache que c'est normal que ce soit dur.
- **Switcher de registre** : composant interactif qui montre une même phrase selon l'interlocuteur (ami / inconnu / supérieur / aîné). Exemple : « Tu as mangé ? » → 밥 먹었어? (ami) / 밥 먹었어요? (poli) / 진지 드셨어요? (honorifique, aîné).
- Le feedback LLM (§4) doit **toujours vérifier le registre** en fonction de l'interlocuteur indiqué dans l'exercice.
- Surligner les particules d'une couleur différente dans les textes débutants (désactivable).

### Autres règles coréen

- Ordre Sujet–Objet–Verbe : dans les explications, toujours montrer le découpage de la phrase avec ses particules.
- Prononciation : prévoir des exercices sur les sons difficiles pour les francophones (ㅓ vs ㅗ, ㅡ, consonnes simples / aspirées / tendues ㄱ ㅋ ㄲ, ㄹ) et sur les règles de liaison (enchaînement des consonnes finales).

---

## 7. Règles spécifiques à l'ANGLAIS (pour francophones)

- Exploiter les **mots transparents** (cognats FR/EN) pour proposer du vrai contenu très tôt : les compter comme « probablement connus » dans le calcul de couverture du §3 (pondération réglable), mais permettre à l'utilisateur de les marquer inconnus.
- Module **faux amis** (actually, eventually, library, sensible, etc.) sous forme de cartes dédiées.
- Accent sur **l'écoute et la prononciation** (§5), le vrai point faible typique des francophones : sons « th », voyelles longues/courtes, accent tonique des mots, formes faibles (gonna, wanna, etc.).
- Contenus prioritaires : formats conversationnels (dialogues, sitcoms, podcasts), qui demandent moins de vocabulaire (§3).

---

## 8. Motivation et objectifs réalistes

- Afficher les **heures d'apprentissage cumulées** et une estimation par niveau CECRL (ex. coréen B1 ≈ 700–900 h), plutôt que seulement une série de jours.
- Afficher le **nombre de mots connus** et la couverture estimée des contenus courants (« tu comprends ~X % d'un épisode de sitcom »).
- La gamification ne doit jamais récompenser une mauvaise pratique (ex. récompenser le fait de relire au lieu de réviser activement, ou de sauter les révisions dues).

---

## 9. Checklist pour toute nouvelle fonctionnalité

Avant de valider une feature, vérifier :

- [ ] Elle utilise le rappel actif plutôt que la relecture passive ?
- [ ] Les révisions passent par FSRS ?
- [ ] Le contenu proposé respecte la couverture ~95 % ?
- [ ] Les cartes ont une phrase de contexte (+ audio) ?
- [ ] Il y a une occasion de production avec feedback reformulé ?
- [ ] (Coréen) Pas de romanisation hors module Hangul, registre 해요체 par défaut, registre vérifié dans le feedback ?
- [ ] L'audio est présent ?

---

## 10. Contenu de la page publique « Pourquoi ça marche »

> **Pour Claude Code :** créer une page `/pourquoi` (ou équivalent selon le routing) avec le contenu ci-dessous. Ton : simple, accessible, pas de jargon inutile. Chaque section affiche ses sources en lien en bas de section (numéros renvoyant à la section 11).

### Titre : Pourquoi notre méthode fonctionne

**Intro :** On n'a rien inventé : le site applique ce que la recherche en apprentissage des langues et en sciences cognitives a montré de plus solide. Voici les principes, et d'où ils viennent.

**1. On révise au bon moment, pas en boucle.**
Revoir une notion à intervalles espacés, en essayant de s'en souvenir avant de voir la réponse, est bien plus efficace que de la répéter d'affilée. Une méta-analyse de 29 études trouve un effet fort en faveur de cette méthode. On utilise FSRS, un algorithme open source qui apprend ton rythme d'oubli et planifie tes révisions juste avant que tu oublies. Sources : [1], [2], [3]

**2. Tu lis et écoutes des contenus que tu comprends presque entièrement.**
Pour apprendre en lisant ou en écoutant, il faut comprendre la grande majorité des mots (environ 95 %). Trop de mots inconnus et on décroche ; pas assez et on n'apprend rien de neuf. Le site calcule, pour chaque texte, quel pourcentage de mots tu connais déjà, et te propose ceux qui tombent dans la bonne zone. Sources : [4], [5], [6]

**3. Tu pratiques, et on te corrige intelligemment.**
Comprendre ne suffit pas : produire des phrases et recevoir un retour fait progresser. Les études montrent que reformuler correctement ta phrase est particulièrement efficace sur la durée. C'est ce que fait le site après chaque exercice d'écriture. Sources : [7], [8]

**4. On travaille vraiment l'oreille.**
Les applis de langues aident bien pour le vocabulaire et la grammaire, mais moins pour l'écoute. C'est pour ça que tout le contenu a de l'audio, et qu'on propose le *shadowing* (répéter en même temps que le locuteur), qui améliore le rythme et l'intonation. Sources : [9], [10]

**5. Le coréen, dans le bon ordre.**
Le coréen demande du temps (environ 2 200 heures de cours selon l'institut de formation des diplomates américains pour un niveau professionnel). Mais son alphabet est l'un des plus simples au monde : la plupart des gens le lisent en une semaine environ. On commence donc par là, sans romanisation, puis on enchaîne avec le registre poli le plus utile au quotidien, et on t'accompagne dans la phase la plus difficile : particules, terminaisons et niveaux de politesse. Sources : [11], [12], [13], [14]

**6. Des objectifs honnêtes.**
On te montre tes heures d'apprentissage et le nombre de mots que tu connais, pas seulement une série de jours. Tu sais où tu en es, et ce qu'il reste. Sources : [5], [12]

---

## 11. Sources

1. Méta-analyse sur la pratique de rappel espacée (29 études, g = 0,74) — https://ifp.nyu.edu/?p=1511228
2. Kim & Webb (2022), méta-analyse de l'effet d'espacement en L2, cité dans Serrano & al. — https://pressto.amu.edu.pl/index.php/ssllt/article/download/35602/30649/76142
3. FSRS — documentation Anki sur ses algorithmes : https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm · présentation : https://concepts.dsebastien.net/concept/fsrs/ · code : https://github.com/open-spaced-repetition
4. Nation, I.S.P. (2006). *How Large a Vocabulary Is Needed for Reading and Listening?* Canadian Modern Language Review, 63(1) — https://openaccess.wgtn.ac.nz/articles/journal_contribution/How_large_a_vocabulary_is_needed_for_reading_and_listening_/12552221/1
5. Revue sur la couverture lexicale (95 % vs 98 %, besoins par type de contenu) — https://pmc.ncbi.nlm.nih.gov/articles/PMC8907927
6. Conti, G. (2025). Pourquoi l'input doit être compréhensible à 95–98 % — https://gianfrancoconti.com/2025/02/27/
7. Li, S. (2010). *The effectiveness of corrective feedback in SLA: A meta-analysis.* Language Learning, 60(2), 309–365 — https://peeref.com/works/63503189
8. Nguyen & Doan (2025). *Beyond comprehensible input: a neuro-ecological critique of Krashen's hypothesis.* Frontiers in Psychology — https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1636777/pdf
9. González-Fernández & de la Viña (2025). *The effectiveness of app-based and classroom-based instruction on L2 learning and motivation.* Language Learning & Technology — https://www.lltjournal.org/item-detail/1221/
10. Whitworth (2024). *Shadowing for pronunciation: a systematic review.* Université d'Oxford — https://ora.ox.ac.uk/objects/uuid:3104cae1-3a6b-400a-b173-de44384238d2
11. Korea Times — classement FSI du coréen — https://www.koreatimes.co.kr/www/nation/2023/11/113_240261.html
12. Estimation des heures par niveau en coréen — https://noun.town/blog/how-long-does-it-take-to-learn-korean/
13. Coréen pour débutants (Hangul d'abord, 해요체, particules) — https://www.languagebird.com/?p=12852
14. Le « mur après le Hangul » — https://www.hellotalk.com/en/blog/after-hangul-gap-in-korean-resources
15. Niveaux de langue et honorifiques en coréen — Korea Herald : https://www.koreaherald.com/article/3211101
16. Revue critique des études internes de Duolingo — https://callej.org/index.php/journal/article/download/419/347/1013
