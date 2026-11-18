// Vraies voix : relais vers un moteur « OpenAI audio/speech » factice + cache disque
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };
const calls = [];
let engineDown = false;
const engine = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    calls.push({ url: req.url, body: JSON.parse(b) });
    if (engineDown) { res.writeHead(500); return res.end(); }
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
    } catch (e) { fails++; console.log("ERREUR", e); }
    console.log(fails ? `${fails} échec(s)` : "OK : vraies voix (TTS serveur)");
    server.close(); engine.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
  });
});
