# CHARTE-GRAPHIQUE.md — Identité visuelle de Mochi

> **Pour Claude Code :** ce fichier définit l'identité visuelle et le ton de Mochi. Toute nouvelle interface utilise les **variables CSS du §11** (jamais de couleur, taille ou rayon codés en dur). Les règles marquées **[OBLIGATOIRE]** ne se contournent pas sans le demander.
> Tous les contrastes de couleurs indiqués ont été **calculés** selon la formule WCAG 2.x. Si tu changes une couleur, recalcule le contraste.

---

## 1. Concept

**Mochi = doux, rond, rassurant, un peu gourmand.**
Le nom vient du gâteau de riz moelleux. Toute l'identité découle de cette image : des formes rondes, des couleurs de saveurs (sakura, matcha, yuzu, ube), des animations qui « rebondissent » comme une pâte molle.

Quatre mots pour guider chaque décision :

| Mot | En pratique | À éviter |
|---|---|---|
| **Doux** | Coins arrondis, ombres légères, fond crème chaud | Noir pur, angles vifs, rouge agressif |
| **Clair** | Une action principale par écran, beaucoup d'espace | Écrans chargés, 5 boutons de même importance |
| **Encourageant** | Mochi célèbre les progrès réels, ton bienveillant | Culpabilisation, compte à rebours, vies perdues |
| **Honnête** | On montre la vraie progression (mots solides, couverture) | Confettis pour tout et n'importe quoi, faux sentiment d'urgence |

Positionnement visuel : plus calme et plus « adulte » que Duolingo, plus chaleureux qu'Anki. Une app qu'on a envie d'ouvrir le soir dans son lit.

---

## 2. Logo

- **Logotype** : `mochi` en minuscules, police **Jua** (§6). Le premier « o » est remplacé par le **visage de Mochi** (deux points pour les yeux, petite bouche, joues roses).
- **Version coréenne** (page coréenne, réseaux sociaux coréens) : `모찌` en Jua, avec Mochi à côté.
- **Icône d'app / favicon** : Mochi seule, de face, sur fond `--sakura-500` (ou crème en version claire). Fichiers : `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (zone de sécurité de 20 % sur chaque bord), `favicon.svg`.
- **Zone de protection** : autour du logo, au moins la hauteur du « m ».
- **Taille minimale** : 24 px de haut à l'écran.
- **Couleurs autorisées** : encre `--ink` sur fond clair, `--ink` (version sombre) sur fond sombre, blanc sur `--sakura-600`.
- **Interdits** : déformer, ajouter une ombre portée, changer la police, mettre le logo sur une photo chargée, utiliser un dégradé arc-en-ciel.

---

## 3. Couleurs de base

### Mode clair

| Rôle | Nom | Hex | Contraste vérifié |
|---|---|---|---|
| Fond de page | Crème de riz | `#FFF9F3` | — |
| Surface (cartes) | Blanc | `#FFFFFF` | — |
| Surface secondaire | Farine | `#F6EEE6` | — |
| Bordure | Pâte | `#E8DCCF` | décorative |
| Texte principal | Encre | `#2A2230` | 14,7:1 sur le fond |
| Texte secondaire | Encre douce | `#665A6B` | 6,2:1 sur le fond, 5,65:1 sur Farine |
| **Couleur de marque** | Sakura 600 | `#C2386A` | 4,9:1 sur le fond ; texte blanc dessus : 5,2:1 |
| Sakura décoratif | Sakura 500 | `#E0628F` | 3,2:1 → **jamais pour du texte**, seulement illustrations et grandes surfaces |
| Succès / « connu » | Matcha 700 | `#2F7A52` | 5,0:1 ; texte blanc dessus : 5,2:1 |
| Grammaire / registre | Ube 600 | `#6E4FBF` | 5,7:1 ; texte blanc dessus : 5,9:1 |
| Récompenses / surlignage | Yuzu 400 | `#F4C04A` | fond uniquement ; texte encre dessus : 9,1:1 |
| Info / anglais | Myrtille 600 | `#2F5FC4` | 5,7:1 ; texte blanc dessus : 5,9:1 |
| Coréen | Kaki 700 (감) | `#A64A0C` | 5,6:1 ; texte blanc dessus : 5,8:1 |
| Erreur | Cerise 600 | `#C7353A` | 5,0:1 ; texte blanc dessus : 5,3:1 |
| Avertissement | Miel 700 | `#8F5A0B` | 5,5:1 ; texte blanc dessus : 5,8:1 |

**Teintes pâles** (fonds de messages, surlignages) — texte de la couleur correspondante dessus, contraste vérifié :

| Teinte | Hex | Texte dessus |
|---|---|---|
| Cerise 50 | `#FDECEC` | Cerise 600 : 4,6:1 |
| Matcha 50 | `#E6F4EC` | Matcha 700 : 4,6:1 |
| Ube 50 | `#EFEAFB` | Ube 600 : 5,1:1 |
| Yuzu 100 | `#FFF1C7` | Encre : 13,6:1 |
| Myrtille 50 | `#EAF0FC` | Myrtille 600 : 5,2:1 |
| Kaki 50 | `#FDEEE2` | Kaki 700 : 5,1:1 |
| Miel 50 | `#FFF4DC` | Miel 700 : 5,3:1 |

### Mode sombre

Fond « nuit de Séoul » légèrement violet plutôt que noir pur (plus doux pour les yeux le soir).

| Rôle | Hex | Contraste vérifié |
|---|---|---|
| Fond de page | `#1B1720` | — |
| Surface | `#25202B` | — |
| Surface secondaire | `#2F2935` | — |
| Bordure | `#3D3544` | décorative |
| Texte principal | `#F4EDF6` | 15,4:1 sur le fond |
| Texte secondaire | `#B5AAB9` | 7,9:1 sur le fond |
| Sakura 300 | `#F28DB0` | 7,7:1 ; texte `#1B1720` dessus : 7,7:1 |
| Matcha 300 | `#7CCB9E` | 9,2:1 |
| Ube 300 | `#B9A2F0` | 8,0:1 |
| Yuzu 300 | `#F7D47A` | 12,3:1 |
| Myrtille 300 | `#8CB0F5` | 8,1:1 |
| Kaki 300 | `#F5A66B` | 8,9:1 |
| Cerise 300 | `#F28B8E` | 7,4:1 |
| Miel 300 | `#F2C36B` | 10,8:1 |

En mode sombre, les boutons pleins utilisent la couleur 300 avec le texte `#1B1720` (contraste ≥ 7:1).

### Règles d'usage [OBLIGATOIRE]

- **Une seule couleur d'action principale par écran** : Sakura. Les autres couleurs ont un **sens** (succès, grammaire, erreur…), elles ne servent pas à décorer.
- **La couleur ne porte jamais seule une information** : toujours une icône, un texte ou un style de soulignement en plus (daltonisme).
- Texte ≥ 4,5:1 sur son fond. Éléments d'interface (bordures de champs, icônes seules) ≥ 3:1.
- Jamais de noir pur `#000` ni de blanc pur en fond de page.

---

## 4. Couleurs fonctionnelles

### Boutons de révision FSRS

| Bouton | Couleur | Icône | Raccourci clavier |
|---|---|---|---|
| À revoir (`Again`) | Cerise 600 | ↺ | `1` |
| Difficile (`Hard`) | Miel 700 | 〰 | `2` |
| Bien (`Good`) | Matcha 700 | ✓ | `3` (ou `Espace`) |
| Facile (`Easy`) | Myrtille 600 | ⚡ | `4` |

« Bien » est le bouton par défaut, légèrement plus large que les autres.

### États des mots dans le lecteur

| État | Style | Pourquoi |
|---|---|---|
| **Inconnu** | Fond Yuzu 100 + soulignement **pointillé** encre douce | Attire l'œil sans crier |
| **En apprentissage** (carte FSRS active) | Soulignement **continu** Ube 600, 2 px | Rappelle qu'on l'étudie |
| **Connu** | Aucun style | Le texte reste lisible |
| **Survol / focus** | Fond Farine + contour Sakura 600 2 px | Indique qu'on peut cliquer |

Le surlignage peut se désactiver (« Mode lecture zen »).

### Correction reformulée (diff)

| Élément | Style |
|---|---|
| Mot retiré | Texte Cerise 600, **barré**, fond Cerise 50 |
| Mot ajouté ou corrigé | Texte Matcha 700, **gras**, fond Matcha 50 |
| Erreur de registre (coréen) | Texte Ube 600, fond Ube 50, icône 🎭 + étiquette « registre » |
| Variante acceptable | Texte Myrtille 600, icône ℹ︎, « Aussi correct : … » |

### Accents de langue

- **Anglais** : Myrtille 600 (onglet, pastille de langue, en-têtes de cours).
- **Coréen** : Kaki 700 (le kaki, 감, est un fruit emblématique de l'automne coréen).
- Pas de drapeaux comme seul repère (l'anglais n'appartient pas qu'à un pays) : pastille de couleur + code `EN` / `한`.

---

## 5. Surlignage des particules coréennes

Dans les textes débutants (désactivable, §6 de `PEDAGOGIE.md`), chaque particule a une couleur **et** un style de soulignement, pour rester lisible par les daltoniens :

| Fonction | Particules | Couleur (clair / sombre) | Soulignement |
|---|---|---|---|
| Thème | 은 / 는 | Myrtille 600 / 300 | continu |
| Sujet | 이 / 가 | Kaki 700 / 300 | double |
| Objet | 을 / 를 | Matcha 700 / 300 | ondulé |
| Lieu, temps, destinataire | 에 / 에서 / 에게 / 한테 | Ube 600 / 300 | pointillé |
| Autres | 도, 만, 의, 와/과, 하고, (으)로… | Encre douce | tirets |

- Au survol ou au tap : bulle avec le nom de la fonction en français (« particule de thème »).
- Légende repliable en haut du texte.
- Le Kaki sert aussi d'accent pour le coréen dans l'interface. Ce n'est pas gênant : les particules n'apparaissent que dans le texte, l'accent de langue que dans les menus.

---

## 6. Typographie

### Polices

| Usage | Police | Licence | Pourquoi |
|---|---|---|---|
| Texte, interface, lecteur | **Pretendard** (variable, 100-900) | SIL OFL 1.1 | Conçue pour le coréen **et** le latin dans la même police (dérivée d'Inter et de Source Han Sans) : le français, l'anglais et le Hangul ont le même rythme visuel. |
| Titres (latin), chiffres de célébration | **Fredoka** (variable, 300-700, titres en 600) | SIL OFL 1.1 | Arrondie et joueuse comme Jua, **avec les accents français** (Jua n'a que le latin de base : « é », « è », « à », « ç » tombaient dans une autre police). |
| Titres (Hangul), logo | **Jua** (400) | SIL OFL 1.1 | Arrondie et joueuse. Prend le relais automatiquement pour le Hangul dans les titres. Exactement l'esprit « Mochi ». |
| API, transcriptions phonétiques | Pretendard (ou Noto Sans en secours pour les symboles API manquants) | SIL OFL 1.1 | — |

```css
--font-sans: "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
--font-display: "Fredoka Variable", "Jua", "Pretendard Variable", Pretendard, sans-serif;
--font-logo: "Jua", "Fredoka Variable", sans-serif;
```

- **[OBLIGATOIRE]** Auto-héberger les polices (paquets Fontsource ou fichiers dans `/fonts`) : pas d'appel à un CDN tiers (vie privée, et ça marche hors ligne pour la PWA).
- Pretendard : utiliser la version à **sous-ensembles dynamiques** (*dynamic subset*). Une police coréenne complète pèse plusieurs Mo, les sous-ensembles ne chargent que les caractères affichés.
- `font-display: swap` partout.
- Fredoka et Jua : **jamais en texte courant**. Jua n'a qu'une graisse : `font-synthesis: none` sur les titres pour éviter un faux gras sur le Hangul.
- Jua n'a qu'une graisse : **jamais en texte courant**, seulement les titres de 24 px et plus, le logo et les gros chiffres.

### Échelle (base 16 px)

| Jeton | Taille | Graisse | Usage |
|---|---|---|---|
| `--text-xs` | 12 px | 500 | Légendes, crédits |
| `--text-sm` | 14 px | 400-500 | Texte secondaire, étiquettes |
| `--text-md` | 16 px | 400 | Texte d'interface |
| `--text-lg` | 18 px | 400 | **Lecteur, anglais** |
| `--text-xl` | 20 px | 400 | **Lecteur, coréen** ; recto des cartes |
| `--text-2xl` | 24 px | Jua | Titres de section |
| `--text-3xl` | 30 px | Jua | Titres de page |
| `--text-4xl` | 40 px | Jua | Célébrations, gros chiffres |
| `--text-hangul` | 96-128 px | 500 | Lettres du module Hangul |

### Règles pour le coréen [OBLIGATOIRE]

- **`word-break: keep-all`** sur tout texte coréen : sinon le navigateur coupe les mots au milieu (le coréen s'écrit avec des espaces entre groupes de mots, et la coupure par défaut se fait n'importe où).
- `line-height: 1.75` pour le coréen dans le lecteur (1,6 pour le latin). Le Hangul est dense et a besoin d'air.
- Pas d'italique sur le Hangul (il n'existe pas vraiment, le navigateur le déforme) : pour mettre en valeur, utiliser la graisse ou la couleur.
- Attribut `lang="ko"` ou `lang="en"` sur chaque bloc de texte étranger (lecteurs d'écran, césure, choix des glyphes).
- Module Hangul : afficher les lettres en très grand (`--text-hangul`), avec un contraste maximal (encre sur blanc) et, à la demande, la décomposition du bloc (ex. 한 = ㅎ + ㅏ + ㄴ) avec chaque lettre colorée.

### Lisibilité

- Largeur de lecture : 60-70 caractères maximum pour le latin, environ 35-40 syllabes pour le coréen (`max-width: 38rem` dans le lecteur).
- Taille de texte réglable dans les paramètres (90 % à 150 %), appliquée via `--text-scale`.

---

## 7. Espacements, formes, ombres

- **Grille de 4 px** : `--space-1` = 4 px, `--space-2` = 8, `--space-3` = 12, `--space-4` = 16, `--space-5` = 24, `--space-6` = 32, `--space-7` = 48, `--space-8` = 64.
- **Rayons généreux** (c'est un mochi) : `--radius-sm` 8 px (chips, champs), `--radius-md` 14 px (boutons), `--radius-lg` 20 px (cartes), `--radius-xl` 28 px (modales, cartes de révision), `--radius-full` pour les pastilles et avatars.
- **Ombres douces et chaudes** (teintées encre, jamais noires) :
  - `--shadow-1` : `0 1px 2px rgb(42 34 48 / 0.06), 0 2px 6px rgb(42 34 48 / 0.06)`
  - `--shadow-2` : `0 4px 12px rgb(42 34 48 / 0.08), 0 2px 4px rgb(42 34 48 / 0.05)`
  - `--shadow-3` : `0 12px 32px rgb(42 34 48 / 0.12)` (modales)
  - En mode sombre, on remplace les ombres par une bordure `--border` plus claire et une surface plus claire.
- **Mise en page** : mobile d'abord. Points de rupture : 480, 768, 1024, 1280 px. Contenu centré, largeur max 1120 px. Barre de navigation en bas sur mobile (4 onglets max : Aujourd'hui, Lire, S'entraîner, Profil), latérale sur ordinateur. Dans une langue, **3 sections seulement** (Aujourd'hui · Lire · S'entraîner) : jamais un mur de boutons de même poids. Lire a un sous-menu (Histoire, Bibliothèque, Thèmes) ; S'entraîner présente ses outils en grandes cartes avec une phrase qui dit à quoi chacun sert.
- **Zones tactiles** : au moins 44 × 44 px.

---

## 8. Mochi, la mascotte

### Construction

- Forme : un **galet rond légèrement plus large que haut** (environ 1,15:1), base un peu aplatie comme un mochi posé sur une assiette.
- Visage : deux yeux ronds (points encre), une petite bouche, deux joues roses (Sakura 500 à 60 % d'opacité). Le visage est placé **dans le tiers inférieur** (ça donne l'air mignon et « posé »).
- Pas de bras ni de jambes. Les émotions passent par la forme (écrasée, étirée, penchée), les yeux et de petits signes autour (étoiles, gouttes, « z »).
- Style : **aplats**, sans contour ou avec un contour encre très fin (1,5 px à 64 px de haut). Une ombre portée ovale pâle sous Mochi.
- Fichiers : SVG uniquement, un fichier par expression (`mochi-happy.svg`…), saveur appliquée via une variable CSS `--mochi-fill`.
- **[OBLIGATOIRE]** Mochi est un **personnage original**. Ne pas s'inspirer de personnages existants (mascottes d'autres apps, personnages de jeux vidéo ou de dessins animés).

### Saveurs (collection, voir `ROADMAP.md` « Mochidex »)

| Saveur | Remplissage | Thème associé (exemple) |
|---|---|---|
| Nature (de départ) | `#FBF4EA` | — |
| Sakura | `#F6C1D3` | Rencontrer quelqu'un |
| Matcha | `#B9DDB0` | Au café |
| Yuzu | `#F9DE8A` | Sport |
| Ube | `#CDB8EE` | K-drama & variétés |
| Myrtille | `#B9CBF3` | Voyages et transports |
| Kaki | `#F7C29A` | Cuisine |
| Sésame noir | `#5B5160` (yeux en crème) | Gaming |
| Injeolmi (soja grillé) | `#E7CC98` | Au travail |

Ces couleurs pastel sont **uniquement pour les illustrations** : jamais pour du texte.

### Expressions

| Expression | Quand | Description |
|---|---|---|
| Contente | Accueil, séance terminée | Yeux en arc (^ ^), petit rebond |
| Concentrée | Pendant les révisions | Yeux ronds, légèrement penchée en avant |
| Fière | Palier de mots solides, saveur débloquée | Étirée vers le haut, étoiles autour |
| Curieuse | Nouveau texte, nouveau thème | Penchée sur le côté, « ? » discret |
| Pensive | Le LLM corrige, chargement | Yeux vers le haut, trois petits points |
| Endormie | Jour de repos, nuit | Yeux fermés, « z », aplatie |
| Surprise | Bonne réponse difficile | Yeux grands ouverts, petite bouche ronde |

**Interdits [OBLIGATOIRE]** : Mochi n'est **jamais** triste, en colère, en pleurs ou blessée à cause de l'utilisateur. Pas de chantage affectif (« Mochi est triste que tu ne sois pas venu »). Après une erreur, Mochi reste neutre ou encourageante.

### Accessoires (récompenses cosmétiques)
Bonnet, écharpe, hanbok, casquette de baseball, lunettes rondes, casque audio, chapeau de chef, couronne de fleurs de cerisier… Un accessoire = un petit SVG superposé, ancré au sommet ou au bas de Mochi.

---

## 9. Ton et rédaction

- **Tutoiement**, phrases courtes, vocabulaire simple. Les explications de grammaire restent en français clair, sans jargon (ou le jargon est expliqué).
- **Encourageant sans mentir** : on félicite des progrès réels et précis (« +12 mots solides cette semaine ») plutôt que des généralités (« Tu es génial ! »).
- **Jamais culpabilisant** : pas de « Tu as abandonné », « Ta série va mourir », pas de compte à rebours anxiogène.
- Humour léger autorisé, surtout autour de la nourriture (Mochi aime manger).
- Les erreurs sont normales et utiles : on le dit.

| Situation | ✅ À écrire | ❌ À éviter |
|---|---|---|
| Rappel quotidien | « 14 cartes t'attendent. 5 minutes et c'est plié. » | « Tu vas perdre ta série !! » |
| Retour après 10 jours | « Content de te revoir ! On reprend en douceur : 20 révisions aujourd'hui, le reste plus tard. » | « Tu nous as manqué… 487 révisions en retard. » |
| Mauvaise réponse | « Presque ! Le bon mot était 사과. On le reverra bientôt. » | « Faux. » |
| Erreur de registre | « Correct, mais un peu familier pour un inconnu : 먹었어요 conviendrait mieux. » | « Erreur de politesse ! » |
| Palier atteint | « 100 mots solides en coréen. Tu comprends maintenant ~70 % d'un dialogue simple. » | « Bravo champion !!! 🎉🎉🎉 » |
| Erreur serveur | « Oups, la correction n'a pas pu se faire. Ta phrase est gardée, on réessaie dans un instant. » | « Erreur 500 » |
| Jour de repos | « Jour de repos. Mochi fait la sieste, ta série est en sécurité. » | — |

Retour après une longue absence : **limiter automatiquement** les révisions affichées (par exemple 20) et étaler le reste sur plusieurs jours, pour ne pas décourager.

---

## 10. Composants

### Boutons

| Variante | Style | Usage |
|---|---|---|
| Principal | Fond Sakura 600, texte blanc, `--radius-md`, hauteur 48 px | Une seule fois par écran (« Commencer la séance ») |
| Secondaire | Fond Surface, bordure `--border`, texte encre | Actions secondaires |
| Fantôme | Pas de fond, texte Sakura 600 | Liens d'action (« Pourquoi ? ») |
| Danger | Fond Cerise 600, texte blanc | Suppression de compte, réinitialisation (toujours avec confirmation) |

États : survol (fond plus foncé de 8 %), appui (« squish », §12), focus (contour 3 px `--focus-ring` à 2 px de distance), désactivé (opacité 0,45, curseur interdit).

### Carte de révision
- Surface blanche, `--radius-xl`, `--shadow-2`, padding 32 px, centrée, largeur max 560 px.
- Recto : la phrase en `--text-xl`, le mot cible en gras (ou masqué en cloze par un bloc arrondi Farine), bouton audio rond en haut à droite.
- Retournement : animation de 280 ms (§12). Verso : réponse, traduction, phrase complète, bouton « Pourquoi ? ».
- Barre des 4 boutons FSRS collée en bas sur mobile.

### Jauge de couverture (lecteur, bibliothèque)
- Barre horizontale arrondie de 8 px : portion connue en Matcha, en apprentissage en Ube, inconnue en Farine.
- Libellé : « Tu connais ~95 % des mots ». Zone idéale (92-98 %) signalée par une petite étiquette « Parfait pour toi ».

### Pastilles de progression (thèmes, Mochidex)
- Mochi de la saveur du thème (silhouette grise si pas encore débloquée) + nom du thème + « 42 / 100 mots solides » + mini-barre.

### Notifications à l'écran (toasts)
- En bas au centre sur mobile, en haut à droite sur ordinateur. `--radius-lg`, fond Surface, icône colorée selon le type, disparition après 4 s (ou bouton fermer). Jamais plus de 2 à la fois.

### Modales
- `--radius-xl`, `--shadow-3`, fond de page assombri à 40 %. Fermeture par `Échap`, clic à l'extérieur et bouton ✕. Le focus reste piégé dans la modale.

### Champs de saisie
- Hauteur 48 px, `--radius-sm`, bordure `--border` (3:1 minimum en mode focus : contour Sakura 600). Pour les réponses en coréen : `lang="ko"`, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`.

---

## 11. Variables CSS (à copier dans `tokens.css`)

```css
:root {
  /* Fonds et texte */
  --bg: #FFF9F3;
  --surface: #FFFFFF;
  --surface-2: #F6EEE6;
  --border: #E8DCCF;
  --ink: #2A2230;
  --ink-muted: #665A6B;

  /* Marque et saveurs */
  --sakura-600: #C2386A;
  --sakura-500: #E0628F;  /* décoratif uniquement */
  --matcha-700: #2F7A52;
  --matcha-50:  #E6F4EC;
  --ube-600:    #6E4FBF;
  --ube-50:     #EFEAFB;
  --yuzu-400:   #F4C04A;
  --yuzu-100:   #FFF1C7;
  --blue-600:   #2F5FC4;
  --blue-50:    #EAF0FC;
  --kaki-700:   #A64A0C;
  --kaki-50:    #FDEEE2;
  --cherry-600: #C7353A;
  --cherry-50:  #FDECEC;
  --honey-700:  #8F5A0B;
  --honey-50:   #FFF4DC;

  /* Rôles */
  --primary: var(--sakura-600);
  --on-primary: #FFFFFF;
  --success: var(--matcha-700);
  --grammar: var(--ube-600);
  --reward: var(--yuzu-400);
  --info: var(--blue-600);
  --error: var(--cherry-600);
  --warning: var(--honey-700);
  --lang-en: var(--blue-600);
  --lang-ko: var(--kaki-700);
  --focus-ring: var(--sakura-600);

  /* Particules coréennes */
  --particle-topic: var(--blue-600);
  --particle-subject: var(--kaki-700);
  --particle-object: var(--matcha-700);
  --particle-place: var(--ube-600);
  --particle-other: var(--ink-muted);

  /* Typographie */
  --font-sans: "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
  --font-display: "Jua", "Pretendard Variable", Pretendard, sans-serif;
  --text-scale: 1;
  --text-xs: calc(0.75rem * var(--text-scale));
  --text-sm: calc(0.875rem * var(--text-scale));
  --text-md: calc(1rem * var(--text-scale));
  --text-lg: calc(1.125rem * var(--text-scale));
  --text-xl: calc(1.25rem * var(--text-scale));
  --text-2xl: calc(1.5rem * var(--text-scale));
  --text-3xl: calc(1.875rem * var(--text-scale));
  --text-4xl: calc(2.5rem * var(--text-scale));
  --text-hangul: clamp(6rem, 18vw, 8rem);
  --leading-latin: 1.6;
  --leading-ko: 1.75;

  /* Espacements */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;

  /* Formes */
  --radius-sm: 8px; --radius-md: 14px; --radius-lg: 20px; --radius-xl: 28px; --radius-full: 999px;
  --shadow-1: 0 1px 2px rgb(42 34 48 / 0.06), 0 2px 6px rgb(42 34 48 / 0.06);
  --shadow-2: 0 4px 12px rgb(42 34 48 / 0.08), 0 2px 4px rgb(42 34 48 / 0.05);
  --shadow-3: 0 12px 32px rgb(42 34 48 / 0.12);

  /* Mouvement */
  --ease-squish: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 320ms;
}

[data-theme="dark"] {
  --bg: #1B1720;
  --surface: #25202B;
  --surface-2: #2F2935;
  --border: #3D3544;
  --ink: #F4EDF6;
  --ink-muted: #B5AAB9;

  --primary: #F28DB0;
  --on-primary: #1B1720;
  --success: #7CCB9E;
  --grammar: #B9A2F0;
  --reward: #F7D47A;
  --info: #8CB0F5;
  --error: #F28B8E;
  --warning: #F2C36B;
  --lang-en: #8CB0F5;
  --lang-ko: #F5A66B;
  --focus-ring: #F28DB0;

  --matcha-50: #1E3328;
  --ube-50: #2C2540;
  --cherry-50: #3A2226;
  --yuzu-100: #4A3F1E;

  --particle-topic: #8CB0F5;
  --particle-subject: #F5A66B;
  --particle-object: #7CCB9E;
  --particle-place: #B9A2F0;
  --particle-other: #B5AAB9;

  --shadow-1: none; --shadow-2: none; --shadow-3: 0 12px 32px rgb(0 0 0 / 0.4);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* reprendre les valeurs de [data-theme="dark"] */ }
}

:lang(ko) { word-break: keep-all; line-height: var(--leading-ko); }
```

---

## 12. Mouvement

- **« Squish »** (signature de Mochi) : à l'appui d'un bouton ou d'une carte, `scale(0.96)` puis retour à `1` avec un léger dépassement (`--ease-squish`, 200 ms). Mochi elle-même rebondit de la même façon quand elle est contente.
- Retournement de carte : 280 ms, `--ease-out`, rotation sur l'axe Y.
- Transitions de page : fondu + glissement de 8 px, 200 ms.
- **Célébrations** (confettis, Mochi qui saute) : **uniquement** pour les vrais paliers (saveur débloquée, chapitre terminé, semaine régulière réussie). Pas après chaque carte.
- **[OBLIGATOIRE]** Respecter `prefers-reduced-motion: reduce` : remplacer rebonds, rotations et confettis par de simples fondus.
- Rien ne clignote plus de 3 fois par seconde.

---

## 13. Iconographie et illustrations

- Icônes : **Lucide** (licence ISC), trait de 2 px, coins arrondis, taille 20 ou 24 px. Couleur : `currentColor`.
- Une icône seule (sans texte) a toujours un `aria-label`.
- Illustrations : même style plat que Mochi, palette des saveurs, pas de dégradés complexes. Décors simples (une tasse de café, un ticket de métro, une assiette) pour illustrer les thèmes.
- Pas de photos de personnes réelles. Pas de drapeaux comme seul repère de langue.

---

## 14. Accessibilité (récapitulatif) [OBLIGATOIRE]

- Contrastes du §3 respectés (texte ≥ 4,5:1, éléments d'interface ≥ 3:1).
- La couleur n'est jamais le seul repère (icônes, soulignements différents, textes).
- Navigation complète au clavier, focus toujours visible (`--focus-ring`, 3 px).
- Raccourcis clavier en révision (1-4, Espace, `R` pour réécouter).
- `lang` correct sur chaque texte étranger.
- Taille de texte réglable, mode sombre, mode « lecture zen » sans surlignage.
- Animations réduites si demandé.
- Sous-titres ou transcription pour tout audio.

---

## 15. Checklist avant de valider un écran

- [ ] Les couleurs, tailles, rayons et ombres viennent des variables du §11 ?
- [ ] Une seule action principale (Sakura) sur l'écran ?
- [ ] Contrastes OK en mode clair **et** sombre ?
- [ ] L'information ne repose pas sur la couleur seule ?
- [ ] Le texte coréen a `lang="ko"` et `word-break: keep-all` ?
- [ ] Les messages suivent le ton du §9 (jamais culpabilisant) ?
- [ ] Mochi n'est jamais triste ou en colère contre l'utilisateur ?
- [ ] `prefers-reduced-motion` respecté ?
- [ ] Testé sur mobile (zones tactiles ≥ 44 px) ?

---

## 16. Sources et licences

- Pretendard — SIL OFL 1.1 — https://github.com/orioncactus/pretendard
- Jua (Woowahan Brothers) — SIL OFL 1.1 — https://fonts.google.com/specimen/Jua (auto-hébergement : https://fontsource.org/fonts/jua)
- Lucide — licence ISC — https://lucide.dev
- Critères de contraste WCAG 2.x (4,5:1 texte, 3:1 éléments d'interface) — https://www.w3.org/TR/WCAG21/
