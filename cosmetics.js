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
const ACCESSORIES = [
  { id: "bow", slot: "head", name: "Nœud", need: ["missions", 1, "Réussis une mission du mode histoire"],
    svg: `<path d="M30 40 l14 -8 l-2 14 z M30 40 l-14 -8 l2 14 z" class="acc-pink"/><circle cx="30" cy="40" r="4" class="acc-pink-dark"/>` },
  { id: "beanie", slot: "head", name: "Bonnet", need: ["quests", 1, "Réussis une quête de la semaine"],
    svg: `<path d="M34 42 C36 12 104 12 106 42 Z" class="acc-pink"/><rect x="30" y="38" width="80" height="11" rx="5.5" class="acc-pink-dark"/><circle cx="70" cy="13" r="7" class="acc-cream"/>` },
  { id: "scarf", slot: "neck", name: "Écharpe", need: ["quests", 3, "Réussis 3 quêtes de la semaine"],
    svg: `<path d="M16 94 C40 101 100 101 124 94 L123 102 C100 110 40 110 17 102 Z" class="acc-kaki"/><path d="M92 102 l5 15 h10 l-3 -16 z" class="acc-kaki"/><path d="M93 108 h11 M95 113 h10" class="acc-line-light"/>` },
  { id: "cap", slot: "head", name: "Casquette", need: ["quests", 6, "Réussis 6 quêtes de la semaine"],
    svg: `<path d="M40 40 C42 16 98 16 100 40 Z" class="acc-blue"/><path d="M95 37 C110 35 124 39 129 46 C116 47 104 45 95 43 Z" class="acc-blue-dark"/><circle cx="70" cy="19" r="3" class="acc-blue-dark"/>` },
  { id: "crown", slot: "head", name: "Couronne de fleurs", need: ["weeks", 1, "Réussis une semaine régulière (5 jours sur 7)"],
    svg: [[34, 44], [50, 33], [70, 28], [90, 33], [106, 44]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="6.5" class="${i % 2 ? "acc-cream" : "acc-pink"}"/><circle cx="${x}" cy="${y}" r="2.4" class="acc-yuzu"/>`).join("") },
  { id: "glasses", slot: "face", name: "Lunettes rondes", need: ["reads", 10, "Lis 10 textes ou chapitres"],
    svg: `<circle cx="57" cy="79" r="9" class="acc-frame"/><circle cx="83" cy="79" r="9" class="acc-frame"/><path d="M66 79 h8 M48 77 l-8 -3 M92 77 l8 -3" class="acc-frame"/>` },
  { id: "headphones", slot: "head", name: "Casque audio", need: ["ear", 100, "Fais 100 essais de paires de sons"],
    svg: `<path d="M22 72 C20 22 120 22 118 72" class="acc-band"/><rect x="12" y="60" width="16" height="24" rx="7" class="acc-ube"/><rect x="112" y="60" width="16" height="24" rx="7" class="acc-ube"/>` },
  { id: "chef", slot: "head", name: "Toque de chef", need: ["prod", 30, "Écris 30 phrases (onglet Produire)"],
    svg: `<rect x="44" y="30" width="52" height="14" rx="3" class="acc-cream"/><path d="M44 32 C30 30 30 8 50 12 C54 0 86 0 90 12 C110 8 110 30 96 32 Z" class="acc-cream"/>` },
  { id: "hanbok", slot: "neck", name: "Col de hanbok", need: ["hangul", 1, "Termine le module Hangul"],
    svg: `<path d="M18 95 C40 102 100 102 122 95 L121 104 C100 111 40 111 19 104 Z" class="acc-ube"/><path d="M50 97 L70 108 L90 97" class="acc-line-light"/><path d="M82 103 L77 119 M82 103 L89 118" class="acc-ribbon"/><path d="M82 103 C74 96 67 101 72 106 C76 109 80 106 82 103 Z M82 103 C88 97 95 101 91 106 C88 109 84 106 82 103 Z" class="acc-pink"/>` },
];
const SLOTS = { head: "Tête", neck: "Cou", face: "Visage" };
const accessoryById = (id) => ACCESSORIES.find((a) => a.id === id);
const accUnlocked = (a, st = lookStats()) => isAdmin() || st[a.need[0]] >= a.need[1];
const myLook = () => state.settings.look || {};

// Calque d'accessoires ajouté par mochi() (ui.js). La tête suit la forme de Mochi selon l'humeur.
const HEAD_DY = { proud: -6, sleepy: 15 };
function mochiAccessories(mood) {
  const look = myLook(), st = lookStats();
  return Object.entries(look).map(([slot, id]) => {
    const a = accessoryById(id);
    if (!a || a.slot !== slot || !accUnlocked(a, st)) return "";
    const dy = slot === "head" ? HEAD_DY[mood] || 0 : mood === "sleepy" ? 4 : 0;
    return `<g class="acc acc-${a.id}" transform="translate(0 ${dy})">${a.svg}</g>`;
  }).join("");
}

// Profil › Ma Mochi
function lookCard() {
  const st = lookStats(), look = myLook();
  const got = ACCESSORIES.filter((a) => accUnlocked(a, st)).length;
  return `<h2 class="section-title">Ma Mochi</h2>
    <div class="card look-card">
      <div class="look-preview">${mochi("", "happy")}</div>
      <div class="grow minw-240">
        <p class="mt-0 mb-4 mx-0"><b>${got} / ${ACCESSORIES.length} accessoires</b></p>
        <p class="muted mt-0 mb-12 mx-0"><small>Ils se gagnent avec les bonnes habitudes, jamais en payant. Un accessoire par emplacement (${Object.values(SLOTS).join(", ").toLowerCase()}).</small></p>
        <div class="acc-grid">
          ${ACCESSORIES.map((a) => {
            const ok = accUnlocked(a, st), worn = look[a.slot] === a.id, [k, n, label] = a.need;
            return `<button class="acc-item ${worn ? "worn" : ""} ${ok ? "" : "locked"}" data-act="${ok ? "acc-wear" : "acc-locked"}" data-id="${a.id}" aria-pressed="${worn}" title="${esc(ok ? (worn ? "Retirer" : "Porter") : label)}">
              <svg viewBox="0 0 140 120" aria-hidden="true"><path d="M12 84 C12 40 38 24 70 24 C102 24 128 40 128 84 C128 104 106 106 70 106 C34 106 12 104 12 84 Z" class="acc-ghost"/><g class="acc">${a.svg}</g></svg>
              <b>${esc(a.name)}</b>
              <small class="muted">${ok ? (worn ? "Porté ✓" : SLOTS[a.slot]) : `🔒 ${Math.min(st[k], n)} / ${n}`}</small>
            </button>`;
          }).join("")}
        </div>
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
  toast(fresh.length === 1 ? `🎁 Nouvel accessoire pour Mochi : ${fresh[0].name} ! (Profil › Ma Mochi)` : `🎁 ${fresh.length} nouveaux accessoires pour Mochi ! (Profil › Ma Mochi)`);
}

Object.assign(actions, {
  "acc-wear": (el) => {
    const a = accessoryById(el.dataset.id);
    if (!a || !accUnlocked(a)) return;
    const look = { ...myLook() };
    if (look[a.slot] === a.id) delete look[a.slot]; else look[a.slot] = a.id;
    state.settings.look = look; save(); render();
  },
  "acc-locked": (el) => { const a = accessoryById(el.dataset.id); toast(`🔒 ${a.need[2]}`); },
});
