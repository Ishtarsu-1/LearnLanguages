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
  - signale séparément les erreurs de grammaire, de vocabulaire et de **registre** (crucial en coréen, voir §6),
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
   - L'aide temporaire est écrite **pour des francophones**, pas en romanisation officielle (pensée pour l'anglais : son « u » se lirait comme dans « lune » alors que ㅜ se dit « ou »). Convention : ô fermé / o ouvert, ou, eu ; consonne + h = soufflée ; consonne doublée = tendue. L'audio passe d'abord, le repère écrit n'est qu'une aide (l'écrit influence la prononciation : Hayes-Harb & Barrios ; Bassetti 2008).
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

## 6 bis. Règles spécifiques au CHINOIS (mandarin, caractères simplifiés)

**Pourquoi :** le chinois a deux murs pour un francophone : les **tons** (le ton change le sens : 妈 mā « maman », 马 mǎ « cheval ») et l'**écriture** (des milliers de caractères, aucun lien direct avec la prononciation). Le FSI le classe, comme le coréen, parmi les langues les plus longues pour un anglophone (~2 200 h).

- **Les tons d'abord** : module « Pinyin & tons » (6 courtes séances : les 4 tons, les initiales, les finales, les changements de ton), avec l'audio en premier et des repères écrits **pour des francophones** (b = p sans souffle, q ≈ « tch » soufflé, ü = « u » de « lune »). Il est mis en avant dans « Aujourd'hui » mais **ne bloque pas** la lecture (contrairement au Hangul) : apprendre les caractères prend des années, on ne peut pas attendre de « savoir lire ».
- **Pinyin au-dessus des caractères** dans les textes (désactivable) : il sert d'échafaudage, comme les glossaires, et doit pouvoir disparaître quand l'apprenant progresse.
- **Écrire sans clavier chinois** : partout où l'on écrit, le pinyin (avec ou sans tons) est accepté au même titre que les caractères. On ne pénalise pas l'absence de méthode de saisie.
- **Écoute** : paires minimales de tons (妈/骂, 买/卖, 汤/糖…) et de consonnes difficiles (zh/z, q/ch, aspirées) dans « Oreille », sur plusieurs voix (§14).
- Pas de conjugaison : l'exercice « la bonne forme » ne s'applique pas ; la grammaire passe par l'ordre des mots, les classificateurs (个, 杯, 口) et les particules (了, 吗, 吧, 的).

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
- [ ] (Vocabulaire) Les nouveaux mots sont regroupés par **thème de situation**, et jamais deux mots du même `semantic_group` introduits le même jour (§12) ?
- [ ] (Grammaire) Après la première présentation, les points de grammaire sont-ils **mélangés** dans les exercices (§13) ?
- [ ] (Écoute) Les exercices de sons utilisent-ils **plusieurs voix** (§14) ?
- [ ] (Motivation) La feature récompense-t-elle une vraie progression, sans culpabiliser ni casser la série au premier jour manqué (§16) ?
- [ ] (Visuel) Elle respecte `CHARTE-GRAPHIQUE.md` ?

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

**6. Des mots appris par situations, pas par listes.**
Apprendre d'un coup des mots très proches (tous les fruits, gauche et droite) crée de la confusion. Regrouper des mots qui vont ensemble dans une même scène (au café : commander, chaud, à emporter) aide au contraire. Mochi organise donc le vocabulaire par thèmes de situation, et étale dans le temps les mots qui se ressemblent. Sources : [17], [18], [19]

**7. On mélange les exercices, et on écoute plusieurs voix.**
Alterner plusieurs points de grammaire dans une même séance aide à apprendre à choisir la bonne forme. Et entendre un même son prononcé par plusieurs voix entraîne efficacement l'oreille : c'est aujourd'hui considéré comme la méthode d'entraînement de la perception la mieux étayée par la recherche. Sources : [20], [21], [22]

**8. Lire beaucoup, avec l'audio.**
Lire de nombreux textes adaptés à son niveau fait progresser en vocabulaire et en vitesse de lecture. Le site propose une bibliothèque de lectures graduées, à lire en écoutant l'audio. Sources : [23], [24], [25]

**9. Une motivation honnête.**
Les éléments de jeu aident à apprendre, à condition de récompenser les vrais progrès. Et rater un jour n'empêche pas une habitude de se former : chez Mochi, ta série est hebdomadaire, avec des jours de repos, et la mascotte n'est jamais triste à cause de toi. Sources : [26], [27], [28], [29]

**10. Des objectifs honnêtes.**
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

---

# Partie 2 — Principes ajoutés (v2)

> Ces sections complètent les §1 à §8. La checklist du §9 a été mise à jour en conséquence. La numérotation continue après les sources (§11) pour ne pas casser les renvois existants dans `ROADMAP.md` et dans le code.

---

## 12. Vocabulaire : thèmes de situation, pas listes de catégories

**Pourquoi :** apprendre ensemble des mots de la même catégorie (« semantic clustering » : tous les vêtements, tous les fruits, les couleurs) tend à **gêner** l'apprentissage, parce que les mots proches se mélangent en mémoire (théorie de l'interférence). À l'inverse, regrouper des mots qui vont ensemble dans une même scène (« thematic clustering » : grenouille, vert, sauter, mare, glissant) tend à **faciliter** l'apprentissage. Les études récentes sont plus mitigées sur l'effet négatif des catégories, mais elles montrent que les mots proches provoquent plus d'erreurs de confusion, et que l'espacement peut réduire cette interférence.

### Règles

- **[OBLIGATOIRE]** Le socle reste la **fréquence** (§3) : les ~1 000 mots les plus fréquents passent avant tout thème.
- Les **thèmes** sont des **situations** : « Au café », « Le sport », « Les transports », « Rencontrer quelqu'un », « Au travail », « K-drama & variétés », « Gaming », « Cuisine »… Un thème = des mots qui apparaissent ensemble dans une scène, de natures variées (noms, verbes, adjectifs, expressions).
- « Vie de tous les jours » n'est pas un thème : c'est le socle de fréquence.
- Chaque lexème porte `themes[]` (situations) et `semantic_group` (catégorie : `fruit`, `couleur`, `jour`, `direction`…). Les paires d'opposés et quasi-synonymes portent `confusable_with`.
- **[OBLIGATOIRE]** Le planificateur introduit **au maximum 1 nouveau mot par `semantic_group` et par jour**, et jamais deux mots `confusable_with` le même jour.
- Une fois les deux mots d'une paire confusable solides (stabilité FSRS ≥ 7 jours), un exercice de **discrimination** peut les opposer volontairement.
- L'utilisateur choisit 2 ou 3 thèmes favoris. La recommandation de textes (§3) et la génération par LLM les privilégient, sans jamais sortir de la fourchette de couverture.

---

## 13. Grammaire : présenter seul, puis alterner

**Pourquoi :** l'alternance (« interleaving ») consiste à mélanger plusieurs catégories pendant l'entraînement au lieu de les travailler une par une. Plusieurs études l'ont montré bénéfique pour la grammaire d'une langue étrangère (conjugaison et choix des temps en espagnol, propositions relatives en anglais), avec un meilleur résultat quand on présente d'abord de façon systématique puis qu'on mélange au hasard pendant la pratique. Certains résultats sont nuls (pas d'avantage, mais pas de désavantage non plus).

### Règles

- Un nouveau point de grammaire est d'abord **présenté et pratiqué seul** (quelques items, avec beaucoup d'input qui le contient, §6).
- Ensuite, **[OBLIGATOIRE]** les séances d'exercices **mélangent** les points déjà vus (ex. 은/는 vs 이/가, -았/었어요 vs -(으)ㄹ 거예요, registres). L'utilisateur doit **choisir** la bonne forme, pas appliquer la même règle 10 fois de suite.
- Pondération du tirage : plus de poids aux points récents et aux points souvent ratés.
- L'alternance s'applique aussi aux révisions FSRS (c'est déjà le cas naturellement, les cartes dues étant mélangées). Ne pas trier les cartes dues par catégorie.

---

## 14. Écoute : entraînement multi-voix (HVPT)

**Pourquoi :** l'entraînement à la perception « à haute variabilité » (HVPT) fait écouter les sons cibles prononcés par **plusieurs locuteurs**, dans des mots variés, avec un retour immédiat. Une méta-analyse de 79 études trouve des effets moyens à grands sur la perception des sons d'une langue étrangère, et c'est aujourd'hui la méthode d'entraînement phonétique la mieux étayée. Une autre méta-analyse (31 études) montre que cet entraînement à la perception peut aussi améliorer la **prononciation** des sons travaillés, même sans exercice de prononciation.

### Règles

- **[OBLIGATOIRE]** Les exercices de discrimination de sons (paires minimales) utilisent **au moins 4 voix différentes** par langue (TTS multi-voix, puis voix natives), et chaque son dans **plusieurs mots**.
- Format : identification (« Tu as entendu 달, 딸 ou 탈 ? ») avec **retour immédiat** et réécoute des options.
- Contrastes prioritaires :
  - Coréen pour francophones : consonnes simples / aspirées / tendues (ㄱ ㅋ ㄲ, ㄷ ㅌ ㄸ, ㅂ ㅍ ㅃ, ㅈ ㅊ ㅉ, ㅅ ㅆ), voyelles ㅓ / ㅗ, ㅡ / ㅜ, ㅐ / ㅔ (souvent confondues même par les natifs : à garder pour plus tard), consonnes finales.
  - Anglais pour francophones : *th* / *s* / *z* / *f*, voyelles longues / courtes (*ship / sheep*, *full / fool*), *h* aspiré, *w* / *v*.
- Suivre un **score par contraste** et proposer automatiquement de courtes séances sur les contrastes faibles.
- Complémentaire du shadowing (§5) : le HVPT entraîne l'oreille, le shadowing le rythme et l'intonation.

---

## 15. Lecture extensive et lecture + écoute

**Pourquoi :** la lecture extensive (lire beaucoup de textes faciles, pour le sens) a des effets positifs sur le vocabulaire, la vitesse et la compréhension écrite, selon plusieurs méta-analyses. Les **lectures graduées** (vocabulaire contrôlé) jouent un rôle important. Une étude sur 10 lectures graduées lues **en écoutant l'audio** montre des gains de vocabulaire importants, en partie conservés trois mois plus tard, d'autant plus que les mots reviennent souvent et dans plusieurs textes. La recherche montre aussi qu'il faut **beaucoup** lire pour apprendre de nouveaux mots par ce seul moyen : la lecture complète les cartes, elle ne les remplace pas.

### Règles

- Une **bibliothèque** de lectures graduées par niveau et par thème, respectant la couverture du §3 (92-98 %).
- **Mode lecture + écoute** : audio synchronisé, mot en cours surligné.
- Écrire les textes pour que les mots cibles **reviennent plusieurs fois**, dans plusieurs textes différents (pas un seul passage).
- Après chaque chapitre : 2 ou 3 questions de compréhension et proposition des mots inconnus en cartes (§2).
- Pas de quiz long après la lecture : la lecture extensive doit rester agréable.

---

## 16. Motivation : règles de design

**Pourquoi :**
- La **théorie de l'autodétermination** explique la motivation durable par trois besoins : **autonomie** (choisir), **compétence** (se sentir progresser) et **lien social**. Plusieurs études sur les applis de langues la retrouvent, avec des résultats variables selon le besoin (pour Duolingo, une étude récente trouve que la compétence et le lien social comptent le plus).
- La **gamification** a un effet moyen positif sur l'apprentissage de l'anglais (méta-analyse coréenne, g ≈ 0,52), et les points, scores, badges et récompenses y ont un effet significatif. À nuancer : l'effet est plus faible dans les articles de revues que dans les mémoires.
- Les **séries** (« streaks ») motivent fortement via l'aversion à la perte, mais à double tranchant : l'utilisateur peut finir par optimiser le chiffre plutôt que l'apprentissage, et Duolingo a constaté que des objectifs quotidiens trop ambitieux faisaient perdre la série plus souvent.
- Une habitude met en moyenne **66 jours** à devenir automatique (de 18 à 254 jours selon les personnes), et **manquer une occasion ne compromet pas sérieusement** sa formation.

### Règles

- **[OBLIGATOIRE]** Toute récompense est liée à une **vraie progression** (mots solides, séance complète, texte lu et compris), jamais à du temps passé ou des cartes simplement vues.
- **[OBLIGATOIRE]** Série **hebdomadaire** (objectif 5 jours sur 7), jours de repos inclus. Rater un jour ne remet rien à zéro.
- **Autonomie** : l'utilisateur choisit ses thèmes, son objectif quotidien (réglable à la baisse sans pénalité), l'ordre des activités de la séance.
- **Compétence** : montrer des indicateurs concrets et compréhensibles (« tu comprends ~X % de cet épisode », « 120 mots solides », score par son).
- **Lien social** : défis **coopératifs** d'abord, compétitifs ensuite et seulement sur des indicateurs honnêtes (§8).
- **[OBLIGATOIRE]** Interdits : monnaie payante, coffres aléatoires, rachat de série payant, notifications culpabilisantes, mascotte triste ou en colère contre l'utilisateur, compte à rebours anxiogène.
- Retour après une absence : plafonner les révisions du jour et étaler le retard sur plusieurs jours.
- Mesurer : rétention à J7, J30 et J90 (Umami ou équivalent), et vérifier que les mécaniques de jeu font progresser les **mots solides**, pas seulement l'activité.

---

## 17. Sources (v2)

17. Tinkham, T. (1997). *The effects of semantic and thematic clustering on the learning of second language vocabulary.* Second Language Research, 13(2), 138–163 — résumé : https://synapsesocial.com/papers/W2038339147
18. Tinkham, T. (1994). Thèse sur le regroupement sémantique et thématique — https://ideals.illinois.edu/items/19069
19. Nakata, T. & Suzuki, Y. (2019). *Effects of massing and spacing on the learning of semantically related and unrelated words.* Studies in Second Language Acquisition — https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/F58BA8D70385603B9C42E408BFCB8A10/S0272263118000219a.pdf/effects-of-massing-and-spacing-on-the-learning-of-semantically-related-and-unrelated-words.pdf
20. Pan, S. C. et al. (2019). *The synergistic benefits of systematic and random interleaving for second language grammar learning.* JARMAC — https://sc-pan.github.io/pdf/PLPR_2019.pdf
21. Pan, S. C. et al. (2024). *Interleaved practice enhances grammar skill learning for similar and dissimilar tenses in Romance languages* — https://sc-pan.github.io/pdf/PRKL_2024.pdf
22. Uchihara, T., Karas, M. & Thomson, R. I. *High variability phonetic training (HVPT): A meta-analysis of L2 perceptual training studies.* Studies in Second Language Acquisition — https://resolve.cambridge.org/core/journals/studies-in-second-language-acquisition/article/high-variability-phonetic-training-hvpt-a-metaanalysis-of-l2-perceptual-training-studies/6ABB8C1F32D88D53EA8D05A4565E76F6/core-reader · et la méta-analyse perception → production (2024) : https://www.cambridge.org/core/product/E38D8F5CE65DC708137B0E95F97C6BC7
23. Liu, J. & Zhang, J. (2018). *The Effects of Extensive Reading on English Vocabulary Learning: A Meta-analysis.* English Language Teaching, 11(6) — https://econpapers.repec.org/RePEc:ibn:eltjnl:v:11:y:2018:i:6:p:1
24. Jeon, E.-Y. & Day, R. R. (2016). *The effectiveness of ER on reading proficiency: A meta-analysis.* Reading in a Foreign Language — https://scholarspace.manoa.hawaii.edu/server/api/core/bitstreams/eebea128-afb4-47cd-8a16-453a7eff6ca1/content
25. Étude sur l'apprentissage du vocabulaire en lisant et écoutant 10 lectures graduées — https://core.ac.uk/download/215386265.pdf
26. Lee, J.-Y. & Baek, M. (2023). *Effects of Gamification on Students' English Language Proficiency: A Meta-Analysis on Research in South Korea.* Sustainability, 15(14) — https://mdpi.com/2071-1050/15/14/11325
27. Étude sur les effets de la gamification de Duolingo sous l'angle de l'autodétermination (2026) — https://jst-ud.vn/jst-ud/article/download/10685/6973/33542
28. Duolingo, tests A/B sur les séries — https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals · analyse critique : https://uxmag.com/?p=20707
29. Lally, P. et al. (2009/2010), formation des habitudes (UCL) — https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit · résumé incluant le résultat sur les jours manqués : https://jamesclear.com/new-habit