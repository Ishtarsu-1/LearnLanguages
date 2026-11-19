// Parcours complet d'un débutant, sans compte et sans IA : choisir l'anglais → apprendre ses
// 10 premiers mots → lire un texte → réviser → produire une phrase (correcteur hors ligne).
const { test, expect } = require("@playwright/test");
const { prepare, settle } = require("./helpers");

test("parcours débutant en anglais", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await prepare(page);
  await page.goto("/#/");
  await page.locator('a.lang-card[href="#/lang/en"]').click();
  await settle(page);
  await expect(page).toHaveURL(/#\/lang\/en/);

  // Les premiers mots
  await page.goto("/#/lang/en/aujourdhui"); await settle(page);
  await page.locator('[data-act="learn-first"]').first().click();
  await settle(page);
  const cards = await page.evaluate(() => JSON.parse(localStorage.getItem("mochi-state-v2")).cards.filter((c) => c.lang === "en").length);
  expect(cards).toBeGreaterThanOrEqual(5);

  // Lire un texte jusqu'au bout
  await page.goto("/#/lang/en/lire/en-cafe"); await settle(page);
  await expect(page.locator(".s-text").first()).toBeVisible();
  await page.locator('[data-act="finish-read"]').click();
  await settle(page);

  // Réviser : afficher, noter, jusqu'à la fin de la séance
  await page.goto("/#/lang/en/revisions/go"); await settle(page);
  for (let i = 0; i < 40; i++) {
    if (await page.getByText("Révisions terminées").isVisible().catch(() => false)) break;
    const reveal = page.locator('[data-act="reveal"]');
    if (await reveal.isVisible().catch(() => false)) { await reveal.click(); continue; }
    const good = page.locator('[data-act="rate"][data-g="3"]');
    if (await good.isVisible().catch(() => false)) { await good.click(); continue; }
    await page.waitForTimeout(100);
  }
  await expect(page.getByText("Révisions terminées")).toBeVisible();

  // Produire une phrase : correction locale (pas de compte, pas d'IA)
  await page.goto("/#/lang/en/produire"); await settle(page);
  await page.locator("#prod-text").fill("I live next door.");
  await page.locator('[data-act="check-prod"]').click();
  await settle(page);
  await expect(page.locator('[data-act="check-prod"]')).toHaveCount(0);

  expect(errors, errors.join("\n")).toEqual([]);
});
