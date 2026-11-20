# MOCHI.md — Donner vie à Mochi

> **Pour Claude Code :** ce fichier décrit comment animer la mascotte Mochi. Il complète `CHARTE-GRAPHIQUE.md` (§1, §8, §9, §12) et `PEDAGOGIE.md` (§16), qui restent prioritaires en cas de conflit.
> Règles habituelles : un lot = un commit (ou plus), `npm test` + `npm run test:e2e` doivent passer, pas de nouvelle dépendance, CSP stricte conservée (pas de `style="…"` dans le HTML ; `element.style.setProperty()` et `element.animate()` sont autorisés), récap Discord selon `CLAUDE.md`.

---

## 0. Point de départ et principe

**Aujourd'hui** : `mochi(cls, mood, dressed)` dans `ui.js` renvoie un SVG **statique** (corps en `path`, joues, visage parmi 7 expressions de `MOCHI_FACES`, accessoires de `cosmetics.js`). Le mouvement se limite à deux animations CSS (`bob`, `hop`). Mochi est affiché à 48 endroits.

**Objectif** : Mochi doit avoir l'air **vivant** (il respire, cligne des yeux, regarde, réagit) sans jamais **distraire** l'apprentissage ni **culpabiliser** l'utilisateur.

**Technique choisie : SVG procédural + CSS + Web Animations API (WAAPI)**, dans un nouveau fichier `mochi-live.js`. Pas de bibliothèque d'animation :
- le SVG existant reste la base (saveurs, accessoires et expressions continuent de marcher) ;
- très léger (quelques Ko), fonctionne hors ligne, compatible avec la CSP stricte ;
- tout est piloté par du code : facile à relier aux événements de l'app.

**Alternatives écartées pour l'instant** (à reconsidérer seulement pour une refonte graphique complète) :
| Outil | Pour | Contre ici |
|---|---|---|
| Rive | Animations de qualité pro, machine à états intégrée | Éditeur à apprendre, moteur d'exécution en WebAssembly (la CSP devra autoriser le WebAssembly), Mochi à redessiner dans l'outil |
| Lottie | Beaucoup d'animations toutes faites | Créé avec After Effects, fichiers JSON lourds, peu interactif |
| Images animées (GIF, vidéo) | Simple | Lourd, pas de saveurs ni d'accessoires dynamiques, flou |

---

## 1. Les 12 principes d'animation à appliquer

On n'en garde que ceux qui comptent pour une petite boule de pâte de riz :
1. **Squash & stretch** : Mochi s'écrase en atterrissant et s'étire en sautant. Le **volume reste constant** : si `scaleY` vaut 0,9, `scaleX` vaut environ 1,1.
2. **Anticipation** : avant un saut, il s'écrase légèrement (100 ms).
3. **Suivi et chevauchement** : les accessoires (bonnet, écharpe) suivent avec un léger retard (40 à 80 ms) et un petit rebond.
4. **Ralentis** : jamais de mouvement linéaire. Utiliser `--ease-squish` et `--ease-out` de la charte.
5. **Arcs** : les déplacements suivent une courbe, pas une ligne droite.
6. **Exagération mesurée** : expressif pour les célébrations, discret le reste du temps.

---

## 2. Lot M1 — Rendre le SVG animable

Modifier `mochi()` dans `ui.js` **sans changer son API** (les 48 appels continuent de marcher) :
- Ajouter des groupes nommés pour animer chaque partie séparément :
  ```
  <svg class="mochi" data-mood="happy">
    <ellipse class="mo-shadow"/>            ← l'ombre rétrécit quand Mochi saute
    <g class="mo-rig">                       ← tout le personnage (sauts, inclinaison)
      <g class="mo-squash">                  ← écrasement / étirement (origine : bas du corps)
        <path class="mo-body"/>
        <g class="mo-cheeks">…</g>
        <g class="mo-face">                  ← déplacement du regard
          <g class="mo-eyes">…</g>           ← clignements (scaleY)
          <g class="mo-mouth">…</g>
        </g>
        <g class="mo-acc">…</g>             ← accessoires (léger retard)
      </g>
    </g>
    <g class="mo-fx"></g>                    ← étoiles, cœurs, « z », gouttes, confettis
  </svg>
  ```
- `transform-box: fill-box` et `transform-origin` en CSS (origine au **bas du corps** pour l'écrasement, au centre des yeux pour les clignements).
- Séparer les yeux du reste du visage dans `MOCHI_FACES` pour pouvoir les faire cligner dans toutes les expressions (sauf `sleepy`, où ils sont déjà fermés).
- Option `mochi(cls, mood, dressed, { live: true })` : seul un Mochi « vivant » reçoit le moteur du lot M2. Par défaut, les petits Mochis (listes, Mochidex, avatars d'amis) restent **statiques**, pour la performance et le calme.

**Test** : tous les appels existants produisent un SVG valide avec les nouveaux groupes. Les tests visuels Playwright (`screenshots.spec.js`) ne changent pas pour un Mochi statique.

---

## 3. Lot M2 — Le moteur : `mochi-live.js`

Un petit module qui anime **un** Mochi vivant à la fois (le compagnon de la page en cours).

### 3.1 Vie au repos (idle)
| Comportement | Détail |
|---|---|
| **Respiration** | Animation CSS en boucle : `scale(1.02, 0.98)` ↔ `scale(1, 1)` sur `.mo-squash`, 3,2 s. L'ombre suit légèrement. |
| **Clignement** | Toutes les 2,5 à 6 s (aléatoire), yeux `scaleY(0.1)` pendant 120 ms. Parfois un double clignement (1 fois sur 6). |
| **Regard** | Les yeux et la bouche (`.mo-face`) se décalent de 3 px maximum vers le pointeur (ordinateur) ou vers l'élément qui a le focus (champ de réponse, bouton 🔊). Retour au centre après 2 s sans mouvement. |
| **Petits gestes** | Toutes les 20 à 40 s, un geste au hasard parmi : regarder à gauche puis à droite, petit saut sur place, pencher la tête. Jamais pendant une saisie ou une lecture audio. |
| **Endormissement** | Après 2 min sans interaction : passe en `sleepy` (avec « z » qui montent), se réveille au premier mouvement (`surprised` 400 ms, puis `happy`). Après 22 h (heure locale) : bâille de temps en temps. |

### 3.2 Réactions aux événements de l'app
Créer un petit bus d'événements (`mochiBus.emit("answer:right")`, etc.) appelé depuis les modules existants. Le moteur choisit la réaction :

| Événement | Réaction | Durée |
|---|---|---|
| Bonne réponse (révision, exercice) | Petit saut (anticipation, saut, atterrissage écrasé), expression `happy`, 1 étincelle | 500 ms |
| 3 bonnes réponses d'affilée | Saut plus haut + 3 étincelles | 700 ms |
| Mauvaise réponse | **Neutre** : penche la tête (`curious`), petit « hmm » (bulle optionnelle « On la reverra bientôt »). **Jamais triste.** | 600 ms |
| Audio en lecture | Se balance doucement au rythme (oscillation lente), oreilles imaginaires : petites notes ♪ dans `.mo-fx` | pendant la lecture |
| Le correcteur IA réfléchit | `thinking`, trois points qui s'allument tour à tour | pendant l'attente |
| Saisie dans un champ | Regarde le champ, `focused` | pendant la saisie |
| Mot capturé dans le lecteur | « Gobe » le mot : une petite pastille vole du mot vers Mochi (arc), il fait « miam » (joues qui gonflent) | 600 ms |
| Séance terminée | Grand saut + rotation complète + confettis aux couleurs des saveurs | 1,2 s |
| Palier (saveur débloquée, chapitre fini, semaine régulière) | `proud`, étoiles, puis il **change de saveur** sous les yeux de l'utilisateur (fondu de couleur du corps) | 1,5 s |
| Nouvel accessoire | L'accessoire tombe du haut et rebondit sur sa tête | 800 ms |
| Retour après une absence | `surprised` puis grand `happy`, bulle « Content de te revoir ! » | 1 s |
| Jour de repos | Dort, bulle « Jour de repos, ta série est en sécurité » | — |

Les célébrations (confettis, grand saut) sont **réservées aux vrais paliers** (charte §12) : pas après chaque carte.

### 3.3 Interactions directes
- **Tap / clic** : Mochi s'écrase sous le doigt (comme une vraie pâte) puis rebondit, expression `surprised` puis `happy`. 5 taps rapides : il rit (petits sauts en série) puis fait semblant de bouder 1 s (« Hé ! ») avant de sourire. Jamais vexé pour de vrai.
- **Caresse** (appui long ou va-et-vient du doigt) : yeux fermés de plaisir (`^ ^`), joues plus roses, petit cœur.
- **Glisser** (ordinateur et mobile) : on peut le tirer un peu, il s'étire comme de la pâte et revient avec un rebond élastique quand on lâche. Déplacement limité à 40 px.
- Ces interactions ne rapportent **rien** (pas d'XP) : c'est juste du plaisir.

### 3.4 Machine à états
```
idle ⇄ attentive (saisie, focus)
idle → reacting (événement) → idle
idle → sleepy (inactivité) → waking → idle
idle → celebrating (palier) → idle
```
- Une réaction en cours n'est **pas interrompue** par une réaction de moindre priorité (priorités : célébration > réponse > geste au repos).
- File d'attente de 3 réactions maximum : au-delà, on ne garde que la plus importante.

### 3.5 Performance
- Animer **uniquement** `transform` et `opacity` (pas de modification du `d` des chemins en boucle, pas de filtres SVG animés).
- Une seule boucle `requestAnimationFrame` (pour le regard), arrêtée quand le Mochi n'est pas visible (`IntersectionObserver`) ou que l'onglet est en arrière-plan (`visibilitychange`).
- Minuteurs (clignements, gestes) suspendus dans les mêmes cas.
- Objectif : moins de 1 ms par image en moyenne sur un téléphone d'entrée de gamme. Vérifier avec l'onglet Performance du navigateur.

---

## 4. Lot M3 — Calme, accessibilité et réglages

- **`prefers-reduced-motion: reduce`** : pas de respiration, de sauts, de confettis ni de suivi du regard. Seulement les changements d'expression, avec un fondu de 150 ms. Les clignements restent (mouvement minuscule), sauf si l'option « Mochi immobile » est cochée.
- **Mode calme pendant l'apprentissage** : pendant la lecture d'un texte, une révision ou un exercice, Mochi est **petit**, dans un coin, et ne fait que respirer, cligner et réagir aux réponses. Pas de gestes au hasard qui attirent l'œil.
- **Réglages** (Profil › Mochi) : « Mochi vivant » (par défaut), « Mochi discret » (respiration et réactions seulement), « Mochi immobile » (statique). Sons : désactivés par défaut (voir lot M5).
- Le SVG reste `aria-hidden="true"`. Les bulles importantes (« Content de te revoir ») sont aussi lues par les lecteurs d'écran via la zone `aria-live="polite"` existante, sans doublon avec les toasts.
- Rien ne clignote plus de 3 fois par seconde.

---

## 5. Lot M4 — Bulles et personnalité

- **Bulles contextuelles** courtes (8 mots maximum), au ton de la charte §9 : encourageant, jamais culpabilisant, petit humour autour de la nourriture.
- Fichier `mochi-lines.js` : répliques par situation, avec plusieurs variantes tirées au hasard (et jamais deux fois la même de suite). Exemples :
  - accueil le matin : « Bien dormi ? Moi j'ai rêvé de 떡볶이. » ;
  - mot capturé : « Miam, un nouveau mot ! » ;
  - mauvaise réponse : « Presque ! On la reverra. » ;
  - longue série de bonnes réponses : « Tu es en feu (comme du kimchi). » ;
  - bonne réponse à une carte difficile : « Celle-là, elle était coriace ! ».
- Au maximum **1 bulle toutes les 2 minutes** hors événements importants (pendant les exercices, les bulles de réponse « Bien joué ! », « Pas loin ! », « Tu t'améliores ! » après une erreur : 1 toutes les 20 s), et aucune pendant la lecture d'un texte ou l'écoute d'un audio.
- **Mochi parle la langue apprise** de temps en temps, avec des mots déjà connus de l'utilisateur seulement (« 잘했어요! » si 잘하다 est connu), avec la traduction au survol.
- **Interdits (charte §8)** : tristesse, colère, chantage affectif, compte à rebours, « tu m'as manqué » culpabilisant.

---

## 6. Lot M5 — Finitions (facultatif)

- **Sons** (désactivés par défaut, réglables) : petit « pouic » au tap, « miam » à la capture, petite fanfare aux paliers. Fichiers `.ogg` très courts créés pour Mochi (ou sous licence libre, crédités).
- **Saveurs vivantes** : chaque saveur a un petit détail animé (feuille de sakura qui tombe de temps en temps, grain de sésame qui brille, bulle de matcha…).
- **Mochi dans le Mochi Café** (F2 de la v0.6) : il réagit aux objectifs atteints pendant la conversation.
- **Mochi dans la carte à partager** (F4) : il apparaît avec son expression `proud` et ses accessoires.

---

## 7. Tests

- `tests/client.tests.js` :
  - le moteur passe bien par les états attendus pour une suite d'événements (bonne réponse → `reacting` → `idle`) ;
  - une mauvaise réponse ne déclenche **jamais** une expression autre que `curious`, `focused` ou `happy` ;
  - avec `prefers-reduced-motion`, aucune animation de mouvement n'est créée (`element.animate` simulé) ;
  - en mode « Mochi immobile », aucun minuteur n'est actif.
- `tests/e2e/` :
  - aucune erreur JavaScript ni violation de CSP avec un Mochi vivant ;
  - le moteur se met en pause quand l'onglet est caché ;
  - capture d'écran de chaque expression (référence visuelle).

---

## Checklist

- [x] M1 : SVG en groupes nommés, yeux séparés, option `{ live: true }`, appels existants inchangés
- [x] M2 : respiration, clignements, regard, gestes, endormissement
- [x] M2 : réactions aux événements via `mochiBus`, priorités et file d'attente
- [x] M2 : tap, caresse, étirement
- [x] M2 : uniquement `transform` / `opacity`, pause hors écran et onglet caché
- [x] M3 : mouvement réduit, mode calme pendant l'apprentissage, réglages « vivant / discret / immobile »
- [x] M4 : bulles contextuelles, répliques variées, Mochi qui parle avec des mots connus
- [ ] M5 (facultatif) : ✅ sons (Web Audio, sans fichier) ; ✅ saveurs vivantes (saveur portée, Profil › Ma Mochi) ; reste : intégrations Mochi Café (F2) et carte à partager (F4), qui n'existent pas encore
- [x] Tests unitaires et e2e, `FEATURES.md` et `ROADMAP.md` à jour
