const vm = require("vm"), fs = require("fs"), path = require("path");
// Charge content.js + app.js dans un faux navigateur (DOM et FSRS simulés)
const dir = process.argv[2] || path.join(__dirname, "..");
const el = () => ({ value: "", innerHTML: "", textContent: "", classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], focus() {} });
const store = {};
const ctx = {
  console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Date, Math, JSON, URL, Blob: function () {},
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] },
  location: { hash: "" }, document: { getElementById: () => el(), querySelectorAll: () => [], documentElement: { dataset: {}, style: { setProperty() {} } }, body: { dataset: {}, classList: { toggle() {} } }, addEventListener() {}, hidden: false },
  addEventListener() {}, confirm: () => true, window: null, scrollTo() {},
};
// Bouchon FSRS minimal (même API que ts-fsrs pour ce qu'on utilise)
ctx.FSRS = {
  createEmptyCard: (d) => ({ due: d, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, state: 0, last_review: undefined }),
  fsrs: () => ({
    next: (c, now, g) => { const days = [0, 0.001, 1, 3, 8][g] * (c.reps + 1); return { card: { ...c, due: new Date(+now + days * 864e5), stability: days * 3, reps: c.reps + 1, state: 2, last_review: now }, log: { elapsed_days: 0, scheduled_days: days, state: c.state } }; },
    repeat: (c, now) => { const o = {}; for (const g of [1, 2, 3, 4]) o[g] = { card: { due: new Date(+now + [0, 0.001, 1, 3, 8][g] * 864e5) } }; return o; },
  }),
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["content.js", "app.js", "exercises.js", "placement.js", "library.js", "missions.js", "story.js", "keyboard.js", "hangul.js", "cosmetics.js", "tour.js", "legal.js"]) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
vm.runInContext(fs.readFileSync(path.join(__dirname, "client.tests.js"), "utf8"), ctx, { filename: "client.tests.js" });
if (vm.runInContext("fails", ctx)) process.exitCode = 1;
