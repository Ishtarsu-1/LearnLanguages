// Mochi vivant (MOCHI.md §7) : pas d'erreur ni de violation de CSP, réactions, pause quand l'onglet est caché
const { test, expect } = require("@playwright/test");
const { prepare, settle } = require("./helpers");

test("Mochi vivant : respire, réagit, se met en pause", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/#/"); await settle(page);
  const live = page.locator(".hero .mochi.live");
  await expect(live).toHaveCount(1);
  await expect(live).toHaveClass(/breathe/);

  // Tap : il s'écrase puis passe par « surprised » (et ne déclenche rien d'autre : pas de requête)
  const posts = []; page.on("request", (r) => { if (r.method() === "POST") posts.push(r.url()); });
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

  expect(posts.filter((u) => /\/api\/live\//.test(u))).toEqual([]);
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

// Saveurs vivantes (M5) : la saveur portée colore Mochi ; les effets restent à côté de Mochi
test("Mochi vivant : saveur portée et effets bien placés", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/#/"); await settle(page);
  const live = page.locator(".hero .mochi.live");
  await expect(live).toHaveCount(1);
  await page.evaluate(() => { state.settings.flavor = "cafe"; applyFlavor(); });
  const fill = await live.locator(".mo-body").evaluate((n) => getComputedStyle(n).fill);
  expect(fill).toBe("rgb(185, 221, 176)");
  // Ni le logo, ni la collection de saveurs ne prennent la saveur portée
  const logo = await page.locator("#logo-o .mo-body").evaluate((n) => getComputedStyle(n).fill);
  expect(logo).not.toBe("rgb(185, 221, 176)");
  // Une étoile (placée par un groupe) doit apparaître près du coin haut droit de Mochi, pas en (0, 0)
  const pos = await page.evaluate(async () => {
    mochiSparkles(1);
    await new Promise((r) => setTimeout(r, 250));
    const s = MochiLive.el.querySelector(".mo-star"), b = MochiLive.el.getBoundingClientRect(), r = s.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - b.left) / b.width, y: (r.top + r.height / 2 - b.top) / b.height };
  });
  expect(pos.x).toBeGreaterThan(0.6); expect(pos.y).toBeLessThan(0.45);
  // Chaque détail de saveur s'exécute sans erreur
  await page.evaluate(() => { for (const id of Object.keys(MOCHI_FLAVOR_FX)) mochiFlavorDetail(id); for (const g of Object.keys(MOCHI_GESTURES)) MOCHI_GESTURES[g](); });
  await page.waitForTimeout(400);
  await live.screenshot({ path: "test-results/mochi-saveur.png" });
  await page.evaluate(() => { delete state.settings.flavor; applyFlavor(); });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});

// Accessoires : porter un accessoire dans le profil l'affiche tout de suite sur Mochi
// (régression : le Mochi vivant d'avant le rendu, sans l'accessoire, était remis en place)
test("Mochi : un accessoire porté s'affiche tout de suite", async ({ page }) => {
  const all = ["bow", "beanie", "scarf", "cap", "crown", "glasses", "headphones", "chef", "hanbok"];
  const errors = await prepare(page, { settings: { tourDone: true, lookSeen: all } });
  await page.goto("/#/profil"); await settle(page);
  const preview = page.locator(".look-preview .mochi");
  await page.locator('[data-act="acc-wear"][data-id="beanie"]').click();
  await expect(preview.locator(".mo-acc .acc-beanie")).toHaveCount(1);
  await page.locator('[data-act="acc-wear"][data-id="glasses"]').click();
  await expect(preview.locator(".mo-face-acc .acc-glasses")).toHaveCount(1);
  await expect(preview.locator(".mo-acc .acc-beanie")).toHaveCount(1);
  await page.waitForTimeout(900);
  await preview.screenshot({ path: "test-results/mochi-accessoires.png" });
  // Retirer : il disparaît
  await page.locator('[data-act="acc-wear"][data-id="beanie"]').click();
  await expect(preview.locator(".acc-beanie")).toHaveCount(0);
  // Sur l'accueil aussi
  await page.goto("/#/"); await settle(page);
  await expect(page.locator(".hero .mochi.live .acc-glasses")).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});
