// ============================================================
//  Mochi — accessoires cosmétiques (ROADMAP P2 « Mochi, la mascotte »)
//  Purement cosmétiques, jamais achetables. Chacun se gagne par une BONNE PRATIQUE
//  (quêtes, lecture, écoute, écriture, régularité…), jamais par du temps passé
//  à cliquer (PEDAGOGIE §16). Ta Mochi les porte partout sur le site.
//  Dessins en SVG dans le repère de mochi() (140 × 120), couleurs = jetons de la charte.
// ============================================================

// Statistiques utiles aux déblocages (les deux langues confondues)
function lookStats() {
  const langs = Object.values(state.langs), hist = Object.values(state.history).flatMap((d) => Object.values(d));
  const sum = (k) => hist.reduce((a, x) => a + (x[k] || 0), 0);
  return {
    quests: langs.reduce((a, L) => a + Object.values(L.quests || {}).filter(Boolean).length, 0),
    missions: langs.reduce((a, L) => a + Object.keys(L.books || {}).filter((k) => k.endsWith(":mission")).length, 0),
    reads: langs.reduce((a, L) => a + Object.keys(L.readTexts || {}).length, 0),
    ear: sum("ear"), prod: sum("prod"),
    weeks: Math.max(...Object.keys(LANGUAGES).map((l) => currentStreak(state.langs[l]))),
    hangul: state.langs.ko?.hangulDone ? 1 : 0,
  };
}

// slot : un accessoire par emplacement. need : [statistique, seuil, libellé]
// Dessins dans le repère de mochi() (140 × 120) : le haut de la tête est en (70, 24), les yeux
// vers y = 79, le bas du corps en y = 106. Aplats + contour à l'encre de Mochi (charte §8).
const ACC_KNIT = [30, 38, 46, 54, 62, 70, 78, 86, 94, 102, 110].map((x) => `M${x} 42 v9`).join(" ");
const accFlower = (x, y, petal, i) => [0, 72, 144, 216, 288].map((a) => {
  const r = ((a + i * 20) * Math.PI) / 180;
  return `<circle cx="${(x + Math.cos(r) * 4.3).toFixed(1)}" cy="${(y + Math.sin(r) * 4.3).toFixed(1)}" r="3.9" class="${petal}"/>`;
}).join("") + `<circle cx="${x}" cy="${y}" r="2.7" class="acc-yuzu"/>`;
const CROWN_SPOTS = [[27, 46], [39, 33], [54, 25.5], [70, 23], [86, 25.5], [101, 33], [113, 46]];
const ACCESSORIES = [
  { id: "bow", slot: "head", name: "Nœud", need: ["missions", 1, "Réussis une mission du mode histoire"],
    svg: `<g transform="translate(98 34) rotate(16)">
      <path d="M-2 4 L-9 17 L-4.5 15.5 L-2.5 19.5 Z M2 4 L9 17 L4.5 15.5 L2.5 19.5 Z" class="acc-pink-dark"/>
      <path d="M0 0 C-5 -12 -22 -12 -20 0 C-22 12 -5 12 0 0 Z M0 0 C5 -12 22 -12 20 0 C22 12 5 12 0 0 Z" class="acc-pink"/>
      <path d="M-6 -3 C-10 -6 -14 -5 -15.5 -1.5 M6 -3 C10 -6 14 -5 15.5 -1.5" class="acc-line"/>
      <rect x="-4.5" y="-5.5" width="9" height="11" rx="3.5" class="acc-pink-dark"/></g>` },
  { id: "beanie", slot: "head", name: "Bonnet", need: ["quests", 1, "Réussis une quête de la semaine"],
    svg: `<path d="M27 46 C24 2 116 2 113 46 Z" class="acc-pink"/>
      <path d="M50 43 C47 28 52 17 60 11 M70 43 V8 M90 43 C93 28 88 17 80 11" class="acc-knit"/>
      <rect x="22" y="39" width="96" height="14" rx="7" class="acc-pink-dark"/><path d="${ACC_KNIT}" class="acc-line-light"/>
      <circle cx="70" cy="7" r="8" class="acc-cream"/><path d="M66 4 q2 -2 4 0 M69 9 q2 -2 4 0" class="acc-line-soft"/>` },
  { id: "scarf", slot: "neck", name: "Écharpe", need: ["quests", 3, "Réussis 3 quêtes de la semaine"],
    svg: `<path d="M97 100 L101 118 L113 116.5 L106 99 Z" class="acc-kaki"/><path d="M102.5 118 v3.5 M106.5 117.5 v3.5 M110.5 117 v3.5" class="acc-line"/>
      <path d="M100 106 l9 -1.4 M101.4 112 l9.4 -1.4" class="acc-line-light"/>
      <path d="M13 90 C40 99 100 99 127 90 L127 100.5 C100 109.5 40 109.5 13 100.5 Z" class="acc-kaki"/>
      <path d="M13 95.2 C40 104.2 100 104.2 127 95.2" class="acc-line-light"/>
      <ellipse cx="100" cy="102" rx="7" ry="6" class="acc-kaki-dark"/>` },
  { id: "cap", slot: "head", name: "Casquette", need: ["quests", 6, "Réussis 6 quêtes de la semaine"],
    svg: `<path d="M94 39 C111 34 128 38 133 46 C119 49.5 106 48 94 45 Z" class="acc-blue-deep"/>
      <path d="M33 44 C31 10 109 10 107 44 Z" class="acc-blue"/>
      <path d="M70 15 V44 M52 19 C47 28 46 36 47 44 M88 19 C93 28 94 36 93 44" class="acc-line-light"/>
      <circle cx="70" cy="15" r="3.5" class="acc-blue-deep"/><path d="M70 27 l1.8 3.6 4 .6 -2.9 2.8 .7 4 -3.6 -1.9 -3.6 1.9 .7 -4 -2.9 -2.8 4 -.6z" class="acc-yuzu"/>` },
  { id: "crown", slot: "head", name: "Couronne de fleurs", need: ["weeks", 1, "Réussis une semaine régulière (5 jours sur 7)"],
    svg: `<path d="M23 50 C29 27 50 20 70 20 C90 20 111 27 117 50" class="acc-vine"/>`
      + [[33, 38, -40], [47, 28, -22], [62, 22, -8], [78, 22, 8], [93, 28, 22], [107, 38, 40]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="4.5" ry="2.2" transform="rotate(${r} ${x} ${y})" class="acc-leaf"/>`).join("")
      + CROWN_SPOTS.map(([x, y], i) => accFlower(x, y - 1, ["acc-pink-soft", "acc-cream", "acc-ube-soft"][i % 3], i)).join("") },
  { id: "glasses", slot: "face", name: "Lunettes rondes", need: ["reads", 10, "Lis 10 textes ou chapitres"],
    svg: `<circle cx="57" cy="79" r="9.5" class="acc-lens"/><circle cx="83" cy="79" r="9.5" class="acc-lens"/>
      <path d="M51.5 74.5 q2.5 -3 6 -3 M77.5 74.5 q2.5 -3 6 -3" class="acc-shine"/>
      <circle cx="57" cy="79" r="9.5" class="acc-frame"/><circle cx="83" cy="79" r="9.5" class="acc-frame"/>
      <path d="M66.5 78 q3.5 -3.5 7 0 M47.5 77 L38 72.5 M92.5 77 L102 72.5" class="acc-frame"/>` },
  { id: "headphones", slot: "head", name: "Casque audio", need: ["ear", 100, "Fais 100 essais de paires de sons"],
    svg: `<path d="M19 70 C14 10 126 10 121 70" class="acc-band"/><path d="M19 70 C14 10 126 10 121 70" class="acc-band-in"/>
      <rect x="8" y="57" width="17" height="28" rx="8" class="acc-ube"/><rect x="115" y="57" width="17" height="28" rx="8" class="acc-ube"/>
      <rect x="20" y="61" width="6" height="20" rx="3" class="acc-ube-soft"/><rect x="114" y="61" width="6" height="20" rx="3" class="acc-ube-soft"/>
      <circle cx="15" cy="71" r="2.6" class="acc-yuzu"/><circle cx="125" cy="71" r="2.6" class="acc-yuzu"/>` },
  { id: "chef", slot: "head", name: "Toque de chef", need: ["prod", 30, "Écris 30 phrases (onglet Produire)"],
    svg: `<path d="M43 37 C27 35 27 9 48 12 C50 -4 90 -4 92 12 C113 9 113 35 97 37 Z" class="acc-cream"/>
      <path d="M57 36 C55 28 56 20 59 14 M70 36 V10 M83 36 C85 28 84 20 81 14" class="acc-line-soft"/>
      <rect x="41" y="33" width="58" height="13" rx="4" class="acc-cream"/><path d="M45 39.5 H95" class="acc-line-soft"/>` },
  { id: "hanbok", slot: "neck", name: "Col de hanbok", need: ["hangul", 1, "Termine le module Hangul"],
    svg: `<path d="M15 92 C40 100.5 100 100.5 125 92 L124 102.5 C100 111 40 111 16 102.5 Z" class="acc-ube"/>
      <path d="M50 97.5 L70 112 L90 97.5 L84 97 L70 106.5 L56 97 Z" class="acc-cream"/>
      <path d="M84 104 L79 120 M84 104 L92 119" class="acc-ribbon"/>
      <path d="M84 104 C75 95 66 101 73 107.5 C77 110.5 81.5 107.5 84 104 Z M84 104 C90 96.5 98 100.5 94 106.5 C91 110 86.5 107.5 84 104 Z" class="acc-pink"/>
      <circle cx="84" cy="104" r="2.6" class="acc-pink-dark"/>` },
];
const SLOTS = { head: "Tête", neck: "Cou", face: "Visage" };
const accessoryById = (id) => ACCESSORIES.find((a) => a.id === id);
// Un accessoire gagné le reste (lookSeen), même si la statistique redescend (série de semaines cassée…)
const accUnlocked = (a, st = lookStats()) => isAdmin() || (state.settings.lookSeen || []).includes(a.id) || st[a.need[0]] >= a.need[1];
const myLook = () => state.settings.look || {};

// Calque d'accessoires ajouté par mochi() (ui.js). La tête suit la forme de Mochi selon l'humeur.
// Décalages calés sur MOCHI_BODY (ui.js) : tête à y = 16 (fière), 24 (normale), 40 (endormie)
const HEAD_DY = { proud: -8, sleepy: 16 };
function mochiAccessories(mood, slots = null) {
  const look = myLook(), st = lookStats();
  return Object.entries(look).map(([slot, id]) => {
    const a = accessoryById(id);
    if (!a || a.slot !== slot || (slots && !slots.includes(slot)) || !accUnlocked(a, st)) return "";
    const dy = slot === "head" ? HEAD_DY[mood] || 0 : mood === "sleepy" ? 4 : 0;
    // Groupe extérieur : placement selon l'humeur ; groupe intérieur : animations (mochi-live.js)
    return `<g class="acc acc-${a.id}" transform="translate(0 ${dy})"><g class="acc-in">${a.svg}</g></g>`;
  }).join("");
}

// ---------- Saveur portée (MOCHI.md M5 « saveurs vivantes ») ----------
// La saveur se débloque par thème (lessons.js, themeProgress) ; on peut porter n'importe quelle
// saveur débloquée dans une des langues. « nature » = la couleur d'origine.
function flavorsUnlocked() {
  if (typeof themeProgress !== "function" || typeof THEMES === "undefined") return [];
  const ids = new Set();
  for (const lang of Object.keys(state.langs || {})) {
    if (!LANGUAGES[lang]) continue;
    try { for (const p of themeProgress(lang)) if (p.unlocked) ids.add(p.id); } catch { /* langue sans contenu */ }
  }
  return THEMES.filter((t) => isAdmin() || ids.has(t.id));
}
const wornFlavor = () => (typeof THEMES !== "undefined" && THEMES.find((t) => t.id === state.settings.flavor)) || null;
// Couleur de la saveur portée : attribut data-flavor sur <html>, les couleurs sont dans styles.css
// (seulement les Mochi : ni le logo, ni les avatars, ni la collection de saveurs)
function applyFlavor() {
  const root = document.documentElement, th = wornFlavor();
  if (root?.dataset) root.dataset.flavor = th ? th.id : "";
}
function flavorRow() {
  const got = flavorsUnlocked(), cur = state.settings.flavor || "";
  const opts = [{ id: "", flavor: "Nature", fill: "#FBF4EA" }, ...got];
  return `<p class="mt-14 mb-4 mx-0"><b>Saveur</b></p>
    <div class="choice-row" role="radiogroup" aria-label="Saveur de Mochi">${opts.map((t) => `<button class="choice flavor-choice ${cur === t.id ? "active" : ""}" role="radio" aria-checked="${cur === t.id}" data-act="mochi-flavor" data-v="${t.id}"><span class="flavor-dot" data-vars="--dot:${t.fill}"></span>${esc(t.flavor)}</button>`).join("")}</div>
    <p class="muted mt-4 mb-12 mx-0"><small>${got.length ? "Chaque saveur a son petit détail animé." : "Débloque une saveur avec les mots solides d'un thème (onglet Thèmes)."}</small></p>`;
}

// Profil › Ma Mochi
function lookCard() {
  const st = lookStats(), look = myLook();
  const got = ACCESSORIES.filter((a) => accUnlocked(a, st)).length;
  return `<h2 class="section-title">Ma Mochi</h2>
    <div class="card look-card">
      <div class="look-preview">${mochi("", "happy", true, { live: true })}</div>
      <div class="grow minw-240">
        <p class="mt-0 mb-4 mx-0"><b>${got} / ${ACCESSORIES.length} accessoires</b></p>
        <p class="muted mt-0 mb-12 mx-0"><small>Ils se gagnent avec les bonnes habitudes, jamais en payant. Un accessoire par emplacement (${Object.values(SLOTS).join(", ").toLowerCase()}).</small></p>
        <div class="acc-grid">
          ${ACCESSORIES.map((a) => {
            const ok = accUnlocked(a, st), worn = look[a.slot] === a.id, [k, n, label] = a.need;
            return `<button class="acc-item ${worn ? "worn" : ""} ${ok ? "" : "locked"}" data-act="${ok ? "acc-wear" : "acc-locked"}" data-id="${a.id}" aria-pressed="${worn}" title="${esc(ok ? (worn ? "Retirer" : "Porter") : label)}">
              <svg viewBox="0 -6 140 128" aria-hidden="true"><path d="${MOCHI_BODY.base}" class="mo-body"/>${MOCHI_FACES.happy.eyes}${MOCHI_FACES.happy.mouth}<g class="acc">${a.svg}</g></svg>
              <b>${esc(a.name)}</b>
              <small class="muted">${ok ? (worn ? "Porté ✓" : SLOTS[a.slot]) : `🔒 ${Math.min(st[k], n)} / ${n}`}</small>
            </button>`;
          }).join("")}
        </div>
        ${flavorRow()}
        <p class="mt-14 mb-4 mx-0"><b>Animation</b></p>
        <div class="choice-row" role="radiogroup" aria-label="Animation de Mochi">${[["live", "✨ Vivante"], ["calm", "🍃 Discrète"], ["still", "🪨 Immobile"]].map(([v, l]) => `<button class="choice ${(state.settings.mochiMode || "live") === v ? "active" : ""}" role="radio" aria-checked="${(state.settings.mochiMode || "live") === v}" data-act="mochi-mode" data-v="${v}">${l}</button>`).join("")}</div>
        <p class="muted mt-4 mb-12 mx-0"><small>Discrète : elle respire et réagit à tes réponses, sans gestes au hasard. Touche-la, caresse-la ou tire-la un peu : elle aime ça.</small></p>
        <label class="row"><input type="checkbox" ${state.settings.mochiSound ? "checked" : ""} data-set="mochiSound" /> Petits sons de Mochi (quand on la touche, capture, fin de séance)</label>
      </div>
    </div>`;
}

// Nouvel accessoire gagné : on le signale une fois (liste « vue » synchronisée)
function checkNewAccessories() {
  if (isAdmin()) return;
  const seen = state.settings.lookSeen || [], st = lookStats();
  const fresh = ACCESSORIES.filter((a) => !seen.includes(a.id) && accUnlocked(a, st));
  if (!fresh.length) return;
  state.settings.lookSeen = [...seen, ...fresh.map((a) => a.id)];
  save();
  if (typeof mochiBus !== "undefined") setTimeout(() => mochiBus.emit("accessory:new", { id: fresh[0].id }), 0); // après le rendu en cours
  toast(fresh.length === 1 ? `🎁 Nouvel accessoire pour Mochi : ${fresh[0].name} ! (Profil › Ma Mochi)` : `🎁 ${fresh.length} nouveaux accessoires pour Mochi ! (Profil › Ma Mochi)`);
}

Object.assign(actions, {
  "acc-wear": (el) => {
    const a = accessoryById(el.dataset.id);
    if (!a || !accUnlocked(a)) return;
    const look = { ...myLook() };
    const wearing = look[a.slot] !== a.id;
    if (wearing) look[a.slot] = a.id; else delete look[a.slot];
    state.settings.look = look; save(); render();
    if (wearing && typeof mochiBus !== "undefined") setTimeout(() => mochiBus.emit("accessory:worn", { id: a.id }), 0);
  },
  "mochi-flavor": (el) => {
    const id = el.dataset.v || "";
    if (id && !flavorsUnlocked().some((t) => t.id === id)) return;
    if (id) state.settings.flavor = id; else delete state.settings.flavor;
    save(); applyFlavor(); render();
    if (id && typeof mochiBus !== "undefined") setTimeout(() => mochiBus.emit("flavor:worn", { id }), 0);
  },
  "acc-locked": (el) => { const a = accessoryById(el.dataset.id); toast(`🔒 ${a.need[2]}`); },
});
