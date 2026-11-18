// Charge les scripts du site (liste de index.html) dans un bac à sable Node, sans navigateur :
// sert aux outils qui doivent utiliser EXACTEMENT les mêmes fonctions que le client
// (ex. spokenSentences pour la pré-génération de l'audio).
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const ROOT = path.join(__dirname, "..");
function loadSite(dir = ROOT) {
  const el = () => ({ value: "", innerHTML: "", textContent: "", classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], focus() {} });
  const store = {};
  const ctx = {
    console: { ...console, log() {}, warn() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, Date, Math, JSON, URL, Blob: function () {}, Promise, AbortController,
    fetch: async () => { throw new Error("hors ligne"); },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] },
    location: { hash: "" }, addEventListener() {}, confirm: () => true, scrollTo() {},
    document: { getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, style: { setProperty() {} } }, body: { dataset: {}, classList: { toggle() {} } }, addEventListener() {}, hidden: false },
    FSRS: { createEmptyCard: (d) => ({ due: d }), fsrs: () => ({}) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const files = [...fs.readFileSync(path.join(dir, "index.html"), "utf8").matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((f) => !f.startsWith("vendor/"));
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
  return { run: (code) => vm.runInContext(code, ctx), ctx, timers: (on) => { ctx.setTimeout = on ? setTimeout : () => 0; ctx.clearTimeout = on ? clearTimeout : () => {}; } };
}
module.exports = { loadSite };
