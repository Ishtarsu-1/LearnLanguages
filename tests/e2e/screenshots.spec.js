// Captures d'écran du README (docs/screenshots) : SCREENSHOTS=1 npm run test:e2e -- screenshots
const { test } = require("@playwright/test");
const { prepare, settle } = require("./helpers");
test.skip(!process.env.SCREENSHOTS, "seulement avec SCREENSHOTS=1");
test("captures du README", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepare(page, { langs: { ko: { hangulDone: true } } });
  const shot = async (hash, file, prep) => { await page.goto(`/${hash}`); await settle(page); if (prep) await prep(); await page.screenshot({ path: `docs/screenshots/${file}` }); };
  await shot("#/", "accueil.png");
  await page.goto("/#/lang/en/aujourdhui"); await settle(page); await page.locator('[data-act="learn-first"]').first().click(); await settle(page);
  await shot("#/lang/en/lire/en-cafe", "lecteur.png", async () => { await page.locator('.w[data-act="word"]').nth(4).click(); await settle(page); });
  await shot("#/lang/en/revisions/go", "revision.png", async () => { await page.locator('[data-act="reveal"]').click(); await settle(page); });
});
