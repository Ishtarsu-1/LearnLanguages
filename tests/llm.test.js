// Correcteur LLM : route serveur (Claude simulé, aucun appel réel) + client (fetch simulé)
const vm = require("vm"), fs = require("fs"), path = require("path"), os = require("os");
const APP = path.join(__dirname, "..");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-llm-"));
process.env.MOCHI_LLM_DAILY = "3";
const llm = require(path.join(APP, "llm.js"));
const { server } = require(path.join(APP, "server.js"));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };

let mode = "ok", calls = [];
llm.getFeedback = async (input) => {
  calls.push(input);
  if (mode === "down") throw new llm.LlmUnavailable("LLM non configuré (clé API manquante ou invalide).");
  return { verdict: "errors", recast: "저는 커피를 좋아해요.", errors: [
    { type: "grammaire", original: "커피을", correction: "커피를", particle: "를", explanation: "Après une voyelle, on met 를." },
    { type: "registre", original: "좋아해", correction: "좋아해요", particle: null, explanation: "Avec un inconnu, termine par -요." },
  ], explanation: "커피 finit par une voyelle : 를.", encouragement: "Tu y es presque !" };
};

server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { "X-Mochi": "1", "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    return { status: r.status, data: await r.json() };
  };
  const req = { lang: "ko", prompt: "Dis que tu aimes le café.", who: "À un inconnu", register: "haeyo", reference: "저는 커피를 좋아해요.", text: "저는 커피을 좋아해" };
  try {
    ok((await call("POST", "/api/feedback", req)).status === 401, "invité refusé");
    const su = await call("POST", "/api/signup", { email: "llm@test.fr", password: "motdepasse1", accept: true });
    ok(su.data.features.llm === true, "fonction annoncée au client");
    ok((await call("POST", "/api/feedback", { ...req, text: "x".repeat(501) })).status === 400, "texte trop long");
    ok((await call("POST", "/api/feedback", { ...req, lang: "fr" })).status === 400, "langue invalide");
    let r = await call("POST", "/api/feedback", req);
    ok(r.status === 200 && r.data.feedback.recast === "저는 커피를 좋아해요." && r.data.remaining === 2, "correction + quota restant");
    ok(calls.at(-1).text === "저는 커피을 좋아해" && calls.at(-1).register === "haeyo", "paramètres transmis");
    mode = "down";
    r = await call("POST", "/api/feedback", req); ok(r.status === 503 && /clé API/.test(r.data.error), "LLM indisponible → 503");
    mode = "ok";
    r = await call("POST", "/api/feedback", req); ok(r.data.remaining === 1, "échec non décompté");
    await call("POST", "/api/feedback", req);
    r = await call("POST", "/api/feedback", req); ok(r.status === 429, "quota quotidien atteint");

    // --- Client : correcteur Claude, cartes ciblées, repli hors ligne ---
    const store = {};
    const el = () => ({ value: "", innerHTML: "", classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], focus() {} });
    let fetchMode = "ok";
    const ctx = {
      console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Date, Math, JSON, URL, Blob: function () {}, Promise,
      localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] },
      location: { hash: "" }, document: { getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, style: { setProperty() {} } }, body: { dataset: {}, classList: { toggle() {} } }, addEventListener() {}, hidden: false },
      addEventListener() {}, confirm: () => true, scrollTo() {},
      fetch: async (url, opts) => {
        if (url === "/api/feedback") {
          if (fetchMode === "down") return { ok: false, status: 503, json: async () => ({ error: "LLM non configuré (clé API manquante ou invalide)." }) };
          return { ok: true, status: 200, json: async () => ({ feedback: await llm.getFeedback(JSON.parse(opts.body)), remaining: 10 }) };
        }
        if (url === "/api/sync") return { ok: true, status: 200, json: async () => ({ epoch: 0, cursor: 1, kv: [], cards: [], logs: [], counters: [] }) };
        throw new Error("hors ligne");
      },
      FSRS: { createEmptyCard: (d) => ({ due: d, stability: 0, state: 0, reps: 0 }), fsrs: () => ({}) },
    };
    ctx.window = ctx; vm.createContext(ctx);
    for (const f of ["content.js", "app.js", "exercises.js", "placement.js", "library.js", "missions.js", "story.js", "keyboard.js", "hangul.js", "cosmetics.js", "tour.js", "legal.js"]) vm.runInContext(fs.readFileSync(path.join(APP, f), "utf8"), ctx);
    const run = (c) => vm.runInContext(c, ctx);
    run(`account = { id: 9, email: "a@b.c", name: "", avatar_emoji: "🐰" }; features = { llm: true, engine: "Claude" }; sync.meta = { cursor: 0, epoch: 0, snap: emptySnap(), times: {} }; state.langs.ko.hangulDone = true;`);
    run(`location.hash = "#/lang/ko/produire"; route(); ui.prod.ex = PRODUCTION.ko.find((e) => e.id === "p-ko-3");`);
    for (let i = 0; i < 2; i++) { ctx.document.getElementById = (id) => (id === "prod-text" ? { value: "저는 커피을 좋아해" } : el()); run(`ui.prod.result = null`); await run(`actions["check-prod"]()`); }
    ok(run(`ui.prod.result.llm && !ui.prod.result.perfect && ui.prod.result.errors.length === 2`), "client : résultat Claude");
    const html = run(`tabProduce("ko")`);
    ok(html.includes("Corrigé par Claude") && html.includes("Registre") && html.includes("<ins>") && html.includes("Tu y es presque"), "client : rendu recast + erreurs + encouragement");
    ok(run(`state.cards.some((c) => c.type === "cloze" && c.surface === "를" && c.before === "저는 커피" && c.after === " 좋아해요.")`), "client : carte ciblée depuis la correction");
    ok(run(`state.langs.ko.session.production === true`), "client : session production");
    fetchMode = "down";
    run(`ui.prod.result = null; ui.prod.mode = "guided"`);
    ctx.document.getElementById = (id) => (id === "prod-text" ? { value: "저는 커피를 좋아해요." } : el());
    await run(`actions["check-prod"]()`);
    ok(run(`!ui.prod.result.llm && ui.prod.result.perfect && /clé API/.test(ui.prod.llmError)`), "client : repli sur le correcteur hors ligne");
    run(`ui.prod.result = null; ui.prod.mode = "free"`);
    await run(`actions["check-prod"]()`);
    ok(run(`ui.prod.result === null`), "client : phrase libre sans LLM → pas de faux résultat");
    run(`account = null`); ok(run(`tabProduce("ko")`).includes("Se connecter"), "client : phrase libre réservée aux comptes");
  } catch (e) { fails++; console.log("ERREUR", e); }
  console.log(fails ? `\n${fails} échec(s)` : "\nOK : correcteur LLM");
  server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
});
