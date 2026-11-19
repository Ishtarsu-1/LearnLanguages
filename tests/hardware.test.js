// Matériel du serveur (lot 8) : sorties de commandes simulées, aucune vraie commande lancée
const fs = require("fs"), path = require("path"), os = require("os");
const APP = path.join(__dirname, "..");
const hw = require(path.join(APP, "hardware.js"));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };
const GB = 1024 ** 3;
// Faux execFile : réponses par commande ; une commande absente → ENOENT
const fakeExec = (outputs) => (cmd, args, opts, cb) => {
  const calls = fakeExec.calls; calls.push([cmd, ...args]);
  if (!(cmd in outputs)) return setImmediate(() => cb(Object.assign(new Error("absent"), { code: "ENOENT" })));
  setImmediate(() => cb(null, outputs[cmd], ""));
};
fakeExec.calls = [];
const cpus = Array.from({ length: 8 }, () => ({ model: "CPU de test" }));
const basic = (outputs, o = {}) => hw.detectBasic({ execFileImpl: fakeExec(outputs), platform: "linux", arch: "x64", totalmem: 32 * GB, freemem: 8 * GB, cpus, release: "test", ...o });

(async () => {
  try {
    let r = await basic({ "nvidia-smi": "NVIDIA GeForce RTX 4060 Ti, 16380, 1200, 566.36\n" }, { platform: "win32", totalmem: 16 * GB });
    ok(r.gpus.length === 1 && r.gpus[0].memTotalMB === 16380 && r.gpus[0].driver === "566.36", "nvidia-smi lu " + JSON.stringify(r.gpus));
    ok(hw.chooseProfile(r) === "gpu-large", "RTX 4060 Ti 16 Go → gpu-large");
    let rec = hw.recommend(r);
    ok(rec.env.MOCHI_MODEL === "qwen2.5:14b-instruct" && rec.commands.some((c) => c.lines.some((l) => l.includes("--gpus all") && l.includes("kokoro-fastapi-gpu"))), "gpu-large : Kokoro GPU, Ollama 14B");
    ok(rec.commands.some((c) => c.lines.some((l) => l.includes("Activate.ps1"))), "Windows : commandes PowerShell");
    ok(fakeExec.calls.every(([cmd]) => cmd === "nvidia-smi"), "détection légère : une seule commande");
    r = await basic({ "nvidia-smi": "NVIDIA GeForce RTX 3060, 8192, 300, 550.1" });
    ok(hw.chooseProfile(r) === "gpu-small", "8 Go de VRAM → gpu-small");
    r = await basic({});
    ok(r.gpus.length === 0 && r.nvidiaSmi === "absent" && hw.chooseProfile(r) === "cpu", "nvidia-smi absent (ENOENT), 32 Go → cpu");
    rec = hw.recommend(r);
    ok(rec.commands.some((c) => /OBLIGATOIRE/.test(c.title)) && rec.commands.some((c) => c.lines.some((l) => l.includes("source ~/melotts/bin/activate"))), "cpu : pré-génération obligatoire, commandes bash");
    ok(hw.chooseProfile(await basic({}, { platform: "darwin", arch: "arm64", totalmem: 16 * GB })) === "apple", "darwin + arm64 → apple");
    ok(hw.recommend(await basic({}, { platform: "darwin", arch: "arm64", totalmem: 16 * GB })).commands.some((c) => /DEVICE=mps/.test(c.title)), "apple : MeloTTS en mps");
    r = await basic({}, { totalmem: 4 * GB });
    ok(hw.chooseProfile(r) === "light" && !hw.recommend(r).env.TTS_URL_EN, "4 Go de RAM → light, voix du navigateur");
    // Incohérences
    rec = hw.recommend({ ...(await basic({ "nvidia-smi": "RTX 4090, 24564, 0, 1" })), docker: { installed: true, running: true, nvidia: true, kokoroImage: "ghcr.io/remsky/kokoro-fastapi-cpu:latest" }, ollama: { up: true, url: "x", models: [], loaded: [{ name: "qwen2.5:14b-instruct", gpuShare: 0 }] }, urls: { TTS_URL_EN: "http://localhost:8880/v1" }, voices: {} });
    ok(rec.warnings.some((w) => /image CPU/.test(w)) && rec.warnings.some((w) => /100 % sur le processeur/.test(w)) && rec.warnings.some((w) => /localhost/.test(w)), "incohérences signalées : " + rec.warnings.length);
    // Analyseur coréen (chaîne de contenu) : commande proposée s'il ne répond pas
    const base = await basic({});
    ok(hw.recommend({ ...base, nlp: { kiwiUp: false, kiwiUrl: "x", venv: null } }).commands.some((c) => /Kiwi/.test(c.title) && c.lines.some((l) => /kiwipiepy/.test(l))), "Kiwi absent → commandes d'installation");
    ok(!hw.recommend({ ...base, nlp: { kiwiUp: true, kiwiUrl: "x", venv: "/v" } }).commands.some((c) => /Kiwi/.test(c.title)), "Kiwi joignable → rien à faire");
    // --write : sauvegarde, secrets intacts, seules les lignes concernées
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-env-"));
    const env = path.join(dir, ".env");
    fs.writeFileSync(env, "# Mon .env\nANTHROPIC_API_KEY=sk-ant-secret\nMOCHI_LLM_PROVIDER=claude\nTTS_URL_EN=http://localhost:8880/v1\nRESEND_API_KEY=re_secret\n");
    const res = hw.writeEnv(env, { ...hw.recommend(await basic({ "nvidia-smi": "RTX 4060 Ti, 16380, 1200, 566.36" })).env, ANTHROPIC_API_KEY: "volé", RESEND_API_KEY: "volé" }, { now: new Date(2026, 10, 18, 9, 5) });
    const after = fs.readFileSync(env, "utf8");
    ok(res.backup && path.basename(res.backup) === ".env.bak-20261118-0905" && fs.readFileSync(res.backup, "utf8").includes("MOCHI_LLM_PROVIDER=claude"), "copie de sauvegarde datée");
    ok(after.includes("ANTHROPIC_API_KEY=sk-ant-secret") && after.includes("RESEND_API_KEY=re_secret") && !after.includes("volé"), "--write ne touche jamais aux secrets");
    ok(after.includes("MOCHI_LLM_PROVIDER=ollama") && after.includes("TTS_URL_EN=http://127.0.0.1:8880/v1") && after.startsWith("# Mon .env"), "lignes concernées remplacées, le reste gardé");
    ok(res.diff.includes("- MOCHI_LLM_PROVIDER=claude") && res.diff.includes("+ MOCHI_LLM_PROVIDER=ollama"), "différentiel affiché");
    ok(!hw.writeEnv(env, { MOCHI_LLM_PROVIDER: "ollama" }).changed, "déjà à jour : rien n'est réécrit");
    fs.rmSync(dir, { recursive: true, force: true });
    // Sécurité : jamais de shell ni d'exec dans le code de détection
    const src = fs.readFileSync(path.join(APP, "hardware.js"), "utf8") + fs.readFileSync(path.join(APP, "tools", "doctor.js"), "utf8");
    ok(!/\bexec\(|execSync|shell:\s*true/.test(src), "execFile uniquement, sans shell");
  } catch (e) { fails++; console.log("ERREUR", e); }

  // Route admin : réservée aux admins, jamais dans /api/me
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-hw-"));
  const { server, db } = require(path.join(APP, "server.js"));
  server.listen(0, "127.0.0.1", async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = "";
    const call = async (method, url, body) => {
      const r = await fetch(base + url, { method, headers: { "X-Mochi": "1", "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });
      const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
      return { status: r.status, data: await r.json().catch(() => null) };
    };
    try {
      ok((await call("POST", "/api/admin/doctor")).status === 401, "invité : 401");
      await call("POST", "/api/signup", { email: "eleve@test.fr", password: "motdepasse1", accept: true });
      ok((await call("POST", "/api/admin/doctor")).status === 403, "/api/admin/doctor : 403 pour un non-admin");
      const me = await call("GET", "/api/me");
      ok(!("machine" in me.data) && !JSON.stringify(me.data).match(/gpu|ram|cpu|nvidia/i) && me.data.features.ttsSlow === false, "/api/me : rien sur la machine (seulement ttsSlow / llmSlow)");
      db.prepare("UPDATE users SET is_admin = 1 WHERE email = 'eleve@test.fr'").run();
      const st = await call("GET", "/api/admin/stats");
      ok(st.status === 200 && st.data.machine && Array.isArray(st.data.machine.cache), "admin : bloc Machine");
    } catch (e) { fails++; console.log("ERREUR", e); }
    console.log(fails ? `${fails} échec(s)` : "OK : matériel et diagnostic");
    server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
  });
})();
