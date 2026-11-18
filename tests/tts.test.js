// Vraies voix : relais vers un moteur « OpenAI audio/speech » factice + cache disque
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };
const calls = [];
let engineDown = false, engineDelay = 0;
const engine = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    calls.push({ url: req.url, body: JSON.parse(b) });
    if (engineDown) { res.writeHead(500); return res.end(); }
    if (engineDelay) return setTimeout(() => { const m = Buffer.alloc(200, 7); m.write("ID3", 0); res.writeHead(200); res.end(m); }, engineDelay);
    const body = JSON.parse(b);
    if (body.voice === "ko_b") { const w = Buffer.alloc(200); w.write("RIFF", 0); w.write("WAVE", 8); res.writeHead(200); return res.end(w); }
    if (body.input === "pas du son") { res.writeHead(200); return res.end(Buffer.alloc(200, 7)); }
    const m = Buffer.alloc(200, 7); m.write("ID3", 0); res.writeHead(200, { "Content-Type": "audio/mpeg" }); res.end(m);
  });
});
engine.listen(0, "127.0.0.1", () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-tts-"));
  process.env.TTS_URL = `http://127.0.0.1:${engine.address().port}/v1/`;
  process.env.TTS_VOICES_KO = "ko_a, ko_b";
  process.env.TTS_VOICES_EN = "af_heart,bad voice!";
  process.env.TTS_MODEL = "kokoro";
  const { server } = require(path.join(__dirname, "..", "server.js"));
  server.listen(0, "127.0.0.1", async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const tts = (q) => fetch(`${base}/api/tts?${new URLSearchParams(q)}`);
    try {
      const me = await (await fetch(base + "/api/me")).json();
      ok(JSON.stringify(me.features.tts) === JSON.stringify({ en: ["af_heart"], ko: ["ko_a", "ko_b"] }), "voix annoncées " + JSON.stringify(me.features));
      let r = await tts({ lang: "ko", voice: "ko_a", text: "안녕하세요" });
      ok(r.status === 200 && r.headers.get("content-type") === "audio/mpeg" && (await r.arrayBuffer()).byteLength === 200, "génération");
      ok(calls.length === 1 && calls[0].url === "/v1/audio/speech" && calls[0].body.voice === "ko_a" && calls[0].body.input === "안녕하세요" && calls[0].body.model === "kokoro", "appel moteur " + JSON.stringify(calls[0]));
      r = await tts({ lang: "ko", voice: "ko_a", text: "안녕하세요" });
      ok(r.status === 200 && calls.length === 1, "servi depuis le cache");
      ok(/max-age=31536000/.test(r.headers.get("cache-control")), "cache navigateur");
      ok((await tts({ lang: "ko", voice: "inconnue", text: "a" })).status === 400, "voix inconnue");
      ok((await tts({ lang: "fr", voice: "ko_a", text: "a" })).status === 400, "langue inconnue");
      ok((await tts({ lang: "ko", voice: "ko_a", text: "가".repeat(301) })).status === 400, "texte trop long");
      ok((await tts({ lang: "ko", voice: "ko_a", text: "  " })).status === 400, "texte vide");
      r = await tts({ lang: "ko", voice: "ko_b", text: "와브" });
      ok(r.status === 200 && r.headers.get("content-type") === "audio/wav", "WAV reconnu");
      ok((await tts({ lang: "ko", voice: "ko_a", text: "pas du son" })).status === 502, "réponse non audio refusée");
      engineDown = true;
      ok((await tts({ lang: "ko", voice: "ko_b", text: "실패" })).status === 502, "moteur en panne → 502");
      ok(fs.readdirSync(path.join(process.env.DATA_DIR, "tts")).every((f) => /\.(mp3|wav)$/.test(f)) , "pas de fichier temporaire laissé");
      engineDown = false;
      // limitation : 40 générations par minute et par IP (le cache n'est pas compté)
      let last;
      for (let i = 0; i < 41; i++) last = await tts({ lang: "en", voice: "af_heart", text: `phrase ${i}` });
      ok(last.status === 429 && last.headers.get("retry-after"), "limite de génération");
      ok((await tts({ lang: "ko", voice: "ko_a", text: "안녕하세요" })).status === 200, "le cache reste servi malgré la limite");
      // p=low (préchargement) : ne mange pas le quota des clics
      ok((await tts({ lang: "en", voice: "af_heart", text: "préchargée", p: "low" })).status === 200, "p=low compté à part");
      // Le client abandonne (repli après 5 s) : la génération continue et arrive en cache
      require(path.join(__dirname, "..", "server.js")).limiter.clearAttempts("tts:127.0.0.1"); // la limite de 40/min est atteinte plus haut
      engineDelay = 150;
      const ctl = new AbortController();
      const late = fetch(`${base}/api/tts?${new URLSearchParams({ lang: "ko", voice: "ko_a", text: "계속해요" })}`, { signal: ctl.signal }).catch(() => "abandon");
      setTimeout(() => ctl.abort(), 30);
      ok((await late) === "abandon", "client parti avant la fin");
      await new Promise((r) => setTimeout(r, 300));
      ok(fs.readdirSync(path.join(process.env.DATA_DIR, "tts")).length > 0 && require(path.join(__dirname, "..", "server.js")).tts.cached("ko", "ko_a", "계속해요"), "génération terminée côté serveur malgré l'abandon");
      // File trop longue de préchargements : 503
      const lows = await Promise.all(Array.from({ length: 24 }, (_, i) => tts({ lang: "ko", voice: "ko_b", text: `bas ${i}`, p: "low" }).then((r) => r.status)));
      ok(lows.includes(503) && lows.filter((x) => x === 200).length >= 20, "plus de 20 préchargements en attente → 503 " + lows.join(","));
      engineDelay = 0;
    } catch (e) { fails++; console.log("ERREUR", e); }
    await unitTests();
    console.log(fails ? `${fails} échec(s)` : "OK : vraies voix (TTS serveur)");
    server.close(); engine.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
  });
});

// --- File par moteur, priorités, délai, pré-génération (lot 7) : moteur simulé, sans HTTP ---
async function unitTests() {
  const ttsMod = require(path.join(__dirname, "..", "tts.js"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-ttsq-"));
  const order = [];
  const slowFetch = (delay) => async (url, opts) => {
    const input = JSON.parse(opts.body).input;
    order.push(input);
    await new Promise((r, ko) => { const t = setTimeout(r, delay); opts.signal?.addEventListener("abort", () => { clearTimeout(t); ko(Object.assign(new Error("délai dépassé"), { name: "TimeoutError" })); }); });
    const m = Buffer.alloc(100, 7); m.write("ID3", 0);
    return { ok: true, status: 200, arrayBuffer: async () => m };
  };
  const env = { TTS_URL_EN: "http://moteur/v1", TTS_VOICES_EN: "a,b" };
  let t = ttsMod.create({ dir, env, fetchImpl: slowFetch(40) });
  const done = [];
  const lows = [1, 2, 3, 4, 5].map((i) => t.generate("en", "a", `low ${i}`, "low").then(() => done.push(`low ${i}`)));
  const high = t.generate("en", "a", "clic", "high").then(() => done.push("clic"));
  ok(t.waiting("en", "low") === 4, "4 préchargements en attente derrière celui en cours");
  await Promise.all([...lows, high]);
  ok(order[0] === "low 1" && order[1] === "clic" && done.indexOf("clic") === 1, "le clic passe devant les préchargements : " + order.join(" > "));
  // Une demande « low » en attente remontée en « high »
  order.length = 0;
  const a = t.generate("en", "a", "x1", "low"), b = t.generate("en", "a", "x2", "low"), c = t.generate("en", "a", "x3", "low"), d = t.generate("en", "a", "x3", "high");
  await Promise.all([a, b, c, d]);
  ok(order.join() === "x1,x3,x2", "doublon high : remonté, généré une seule fois (" + order.join() + ")");
  // Délai : TTS_TIMEOUT_MS
  t = ttsMod.create({ dir, env: { ...env, TTS_TIMEOUT_MS: "30" }, fetchImpl: slowFetch(500) });
  const t0 = Date.now(); let err;
  try { await t.generate("en", "a", "trop lent"); } catch (e) { err = e; }
  ok(err && Date.now() - t0 < 300, "TTS_TIMEOUT_MS respecté");
  ok(ttsMod.create({ dir, env }).generate.length >= 3, "priorité en paramètre");
  // Pré-génération : une fois par (phrase, voix), puis plus rien
  const { pregen } = require(path.join(__dirname, "..", "tools", "pregen-tts.js"));
  const gdir = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-pregen-"));
  order.length = 0;
  t = ttsMod.create({ dir: gdir, env, fetchImpl: slowFetch(1) });
  const list = ["One.", "Two.", "Three."];
  let s = await pregen({ tts: t, sentences: () => list, log: () => {} });
  ok(s.generated === 6 && order.length === 6, `pré-génération : 3 phrases × 2 voix (${s.generated})`);
  s = await pregen({ tts: t, sentences: () => list, log: () => {} });
  ok(s.generated === 0 && s.cached === 6 && order.length === 6, "deuxième passage : rien à régénérer");
  s = await pregen({ tts: t, sentences: () => [...list, "Four."], opts: { voices: ["b"], dryRun: true }, log: () => {} });
  ok(s.todo === 1 && order.length === 6, "--voices et --dry-run");
  // spokenSentences = exactement ce que le lecteur passe à speak()
  const { loadSite } = require(path.join(__dirname, "..", "tools", "load-site.js"));
  const site = loadSite();
  const spoken = site.run(`state.langs.ko.hangulDone = true; globalThis.__said = []; speak = (t) => { __said.push(t.slice(0, 300)); return Promise.resolve(); };
    for (const lang of ["en", "ko"]) for (const t of TEXTS[lang]) { location.hash = "#/lang/" + lang + "/lire/" + t.id; route(); t.parsed.forEach((_, i) => actions["play-s"]({ dataset: { s: String(i) } })); }
    for (const lang of ["en", "ko"]) for (const t of Object.values(CHAPTER_TEXTS[lang])) t.parsed.forEach((x) => __said.push(x.text)); // livres et histoire : mêmes phrases parsées
    ({ said: __said, en: spokenSentences("en"), ko: spokenSentences("ko") })`);
  const all = new Set([...spoken.en, ...spoken.ko]);
  const missing = spoken.said.filter((x) => !all.has(x));
  ok(spoken.said.length > 100 && !missing.length, `lecteur : toutes les phrases lues sont pré-générables (${spoken.said.length} lues, manquantes : ${missing.slice(0, 3).join(" | ")})`);
  ok(spoken.en.length > 300 && spoken.ko.length > 300 && spoken.en.every((x) => x.length <= 300), "spokenSentences : anglais et coréen");
  // Client : la voix du serveur tarde → voix de l'appareil (3 s si le serveur annonce des voix lentes)
  const site2 = loadSite();
  site2.timers(true);
  const btn = { attrs: {}, cls: new Set(), setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, classList: { add: (c) => btn.cls.add(c), remove: (c) => btn.cls.delete(c) } };
  site2.ctx.__btn = btn;
  const t1 = Date.now();
  const res = await site2.run(`features = { tts: { en: ["af_heart"] }, ttsSlow: true }; voices = [{ lang: "en-US", name: "Appareil" }];
    globalThis.__fell = null; browserSpeak = (text) => { __fell = text; return Promise.resolve(); };
    fetch = (url, o) => new Promise((ok, ko) => o.signal.addEventListener("abort", () => ko(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    globalThis.__toasts = []; toast = (m) => __toasts.push(m);
    ui.lastClick = { el: __btn, t: Date.now() };
    const p = speak("Hello slow voice.", "en");
    globalThis.__busy = __btn.attrs["aria-busy"];
    p.then(() => ({ fell: __fell, toasts: __toasts, busyDuring: __busy, busyAfter: __btn.attrs["aria-busy"] }))`);
  const waited = Date.now() - t1;
  ok(res.fell === "Hello slow voice." && waited >= 2900 && waited < 4500, `repli sur la voix de l'appareil après 3 s (${waited} ms)`);
  ok(res.busyDuring === "true" && res.busyAfter === undefined, "🔊 en chargement (aria-busy) pendant l'attente, puis rétabli");
  ok(res.toasts.length === 1 && /La belle voix arrive/.test(res.toasts[0]), "message une seule fois");
  site2.timers(false);
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(gdir, { recursive: true, force: true });
}
