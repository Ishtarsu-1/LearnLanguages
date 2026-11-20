// ============================================================
//  Mochi — mochi-lines.js : les répliques de Mochi (MOCHI.md, lot M4)
//  Courtes (8 mots au plus), au ton de la charte §9 : encourageantes, jamais
//  culpabilisantes, un peu gourmandes. Interdits (§8) : tristesse, colère,
//  chantage affectif, compte à rebours, « tu m'as manqué ».
// ============================================================
const MOCHI_LINES = {
  morning: ["Bien dormi ? Moi j'ai rêvé de 떡볶이.", "Bonjour ! Un petit mot avec le café ?", "Le matin, la mémoire est toute fraîche."],
  afternoon: ["Une petite pause en douceur ?", "Cinq minutes, et c'est plié.", "J'ai gardé tes cartes au chaud."],
  evening: ["Une dernière page avant de dormir ?", "Le soir, on révise en douceur.", "Les mots du soir se gardent bien."],
  captured: ["Miam, un nouveau mot !", "Hop, dans le panier !", "Celui-là, je le garde pour toi."],
  wrong: ["Presque ! On la reverra.", "Pas grave, elle reviendra bientôt.", "Les erreurs aussi font apprendre."],
  streak: ["Tu es en feu (comme du kimchi).", "Trois de suite, joli !", "Ça s'enchaîne bien !"],
  hardRight: ["Celle-là, elle était coriace !", "Bravo, celle-là résistait !"],
  welcome: ["Content de te revoir !"],
  rest: ["Jour de repos, ta série est en sécurité."],
  done: ["Séance bouclée, bien joué !", "C'est fait pour aujourd'hui !"],
  milestone: ["Un vrai palier, bravo !", "Regarde, une nouvelle saveur !"],
  chapter: ["Chapitre terminé, bravo !"],
  week: ["Semaine régulière réussie !"],
  accessory: ["Oh, un nouvel accessoire !"],
  tease: ["Hé !"],
  pet: ["Hihi, ça chatouille."],
};
// Mochi parle parfois la langue apprise, seulement avec des mots déjà connus
const MOCHI_TARGET_LINES = {
  en: [{ t: "Good!", lemmas: ["good"], fr: "Bien !" }, { t: "Nice!", lemmas: ["nice"], fr: "Sympa !" }, { t: "Great!", lemmas: ["great"], fr: "Génial !" }, { t: "Well done!", lemmas: ["well", "do"], fr: "Bien joué !" }],
  ko: [{ t: "좋아요!", lemmas: ["좋다"], fr: "Super !" }, { t: "정말 좋아요!", lemmas: ["정말", "좋다"], fr: "Vraiment super !" }, { t: "반가워요!", lemmas: ["반갑다"], fr: "Content de te voir !" },
    { t: "재미있어요!", lemmas: ["재미있다"], fr: "C'est amusant !" }, { t: "맛있어요!", lemmas: ["맛있다"], fr: "C'est délicieux !" }],
};
const mochiLast = {};
// Une réplique au hasard, jamais deux fois la même de suite
function mochiLine(kind) {
  const list = MOCHI_LINES[kind] || [];
  if (list.length < 2) return list[0] || "";
  let i;
  do i = Math.floor(Math.random() * list.length); while (list[i] === mochiLast[kind]);
  return (mochiLast[kind] = list[i]);
}
function mochiTargetLine(lang) {
  const list = MOCHI_TARGET_LINES[lang];
  if (!list || !state.langs[lang]) return null;
  const stab = stabilityMap(lang);
  const ok = list.filter((x) => x.lemmas.every((l) => lemmaStatus(lang, l, stab) === "known"));
  return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
}
function mochiGreeting(h = new Date().getHours()) { return mochiLine(h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"); }
