// Mochi vivant (MOCHI.md §7) : pas d'erreur ni de violation de CSP, réactions, pause quand l'onglet est caché
const { test, expect } = require("@playwright/test");
const { prepare, settle } = require("./helpers");

test("Mochi vivant : respire, réagit, se met en pause", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/#/"); await settle(page);
  const live = page.locator(".hero .mochi.live");
  await expect(live).toHaveCount(1);
  await expect(live).toHaveClass(/breathe/);

  // Tap : il s'écrase puis passe par « surprised »
  await live.click();
  await expect(live).toHaveAttribute("data-mood", "surprised");
  await expect(live).toHaveAttribute("data-mood", "happy", { timeout: 2000 });

  // Une bonne réponse le fait sauter (animation de transform via la Web Animations API)
  const jumped = await page.evaluate(() => { mochiBus.emit("answer:right"); return document.getAnimations().some((a) => a.effect?.getKeyframes().some((k) => k.transform)); });
  expect(jumped).toBe(true);

  // Onglet caché : minuteurs coupés, respiration en pause
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(live).toHaveClass(/paused/);
  expect(await page.evaluate(() => Object.keys(MochiLive.timers).filter((k) => k !== "reaction").length)).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(live).not.toHaveClass(/paused/);

  // Mochi immobile (Profil › Ma Mochi) : plus d'animation
  await page.evaluate(() => { state.settings.mochiMode = "still"; mochiDetach(); render(); });
  await expect(live).not.toHaveClass(/breathe/);
  expect(await page.evaluate(() => Object.keys(MochiLive.timers).length)).toBe(0);

  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});

test("Mochi vivant : mouvement réduit respecté", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = await prepare(page);
  await page.goto("/#/"); await settle(page);
  const live = page.locator(".hero .mochi.live");
  await expect(live).not.toHaveClass(/breathe/);
  const moved = await page.evaluate(() => { mochiBus.emit("session:done"); return document.getAnimations().filter((a) => a.effect?.target?.closest?.(".mochi.live") || a.effect?.target?.classList?.contains("mochi-crumb"))
    .map((a) => a.effect.getKeyframes().filter((k) => k.transform && !/scaleY/.test(k.transform)).map((k) => `${a.effect.target.getAttribute("class")}: ${k.transform}`)).flat(); });
  expect(moved).toEqual([]);
  expect(errors).toEqual([]);
});
