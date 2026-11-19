// Toutes les pages, en 1280, 390 et 320 px : aucune erreur JavaScript, aucune violation de CSP,
// aucun défilement horizontal (la barre du haut ne déborde jamais).
const { test, expect } = require("@playwright/test");
const { prepare, settle, overflow } = require("./helpers");

const LANGS = ["en", "ko", "zh", "ru"];
const TABS = ["aujourdhui", "lire", "histoire", "themes", "pratique", "revisions", "exercices", "produire", "mots", "oreille"];
const ROUTES = [
  "#/", "#/pourquoi", "#/profil", "#/connexion", "#/inscription", "#/avis", "#/amis", "#/legal/mentions", "#/legal/confidentialite", "#/legal/credits",
  ...LANGS.flatMap((l) => TABS.map((t) => `#/lang/${l}/${t}`)),
  "#/lang/en/fauxamis", "#/lang/en/niveau", "#/lang/ko/parcours", "#/lang/ko/hangul/1", "#/lang/ko/niveau", "#/lang/zh/pinyin", "#/lang/zh/pinyin/1", "#/lang/ru/alphabet", "#/lang/ru/alphabet/1",
  "#/lang/en/lire/en-cafe", "#/lang/ko/lire/ko-cafe", "#/lang/zh/lire/zh-cafe", "#/lang/ru/lire/ru-cafe", "#/lang/en/livre/en-lost-cat",
];
// Coréen : Hangul terminé (pages derrière le module) ; anglais et coréen déjà commencés : les compteurs
// 🧠 et 📅 de la barre du haut sont affichés (c'est là que la barre débordait sur mobile)
const START = { langs: { ko: { hangulDone: true, started: true, fullDays: { "2026-11-18": true } }, en: { started: true, fullDays: { "2026-11-17": true, "2026-11-18": true } } } };

for (const [w, h] of [[1280, 800], [390, 844], [320, 640]]) {
  test(`toutes les pages à ${w} px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = await prepare(page, START);
    const problems = [];
    for (const r of ROUTES) {
      await page.goto(`/${r}`);
      await settle(page);
      const o = await overflow(page);
      if (o.sw > o.w) problems.push(`${r} : défilement horizontal (${o.sw} > ${o.w} px)`);
      const csp = await page.evaluate(() => window.__csp.splice(0));
      for (const c of csp) problems.push(`${r} : CSP ${c}`);
      for (const e of errors.splice(0)) problems.push(`${r} : ${e}`);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
