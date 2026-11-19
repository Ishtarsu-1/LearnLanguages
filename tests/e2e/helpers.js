// Outils communs : état de départ (visite guidée déjà vue), collecte des erreurs JS et des violations de CSP
const STATE_KEY = "mochi-state-v2";
async function prepare(page, extra = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`JS : ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|speechSynthesis/i.test(m.text())) errors.push(`console : ${m.text()}`); });
  await page.addInitScript(([key, extra]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ settings: { tourDone: true }, ...extra }));
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  }, [STATE_KEY, extra]);
  return errors;
}
async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
}
async function overflow(page) {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
}
module.exports = { prepare, settle, overflow };
