// ============================================================
//  Mochi — matériel de la machine qui HÉBERGE Mochi (CORRECTIFS v0.4, lot 8)
//  Partagé par tools/doctor.js (npm run doctor) et server.js (adaptation au démarrage,
//  bloc « Machine » de l'admin).
//
//  ⚠️ Uniquement la machine serveur. Le site ne cherche JAMAIS à connaître l'ordinateur
//  des visiteurs (ce serait du pistage) : côté navigateur, on s'adapte seulement à ce qu'il
//  expose déjà (voix disponibles, prefers-reduced-motion, thème, en ligne / hors ligne).
//
//  Sécurité : uniquement execFile avec des arguments FIXES (jamais exec, jamais de shell,
//  jamais de texte venant d'un utilisateur dans une commande), 5 s maximum par commande.
//  Une commande absente (ENOENT) n'est pas une erreur : c'est « non installé ».
// ============================================================
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const TIMEOUT = 5000;
const GB = 1024 ** 3;

// Lance une commande ; ne rejette jamais. { ok, stdout, missing }
function run(cmd, args, { execFileImpl = execFile, timeout = TIMEOUT } = {}) {
  return new Promise((resolve) => {
    try {
      execFileImpl(cmd, args, { timeout, windowsHide: true, encoding: "utf8" }, (err, stdout = "", stderr = "") => {
        if (err) return resolve({ ok: false, stdout: String(stdout), stderr: String(stderr), missing: err.code === "ENOENT", error: err.code || err.message });
        resolve({ ok: true, stdout: String(stdout) });
      });
    } catch (e) { resolve({ ok: false, stdout: "", missing: e.code === "ENOENT", error: e.message }); }
  });
}
async function getJson(fetchImpl, url, opts = {}) {
  try {
    const r = await fetchImpl(url, { ...opts, signal: AbortSignal.timeout(opts.timeout || TIMEOUT) });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json().catch(() => null) };
  } catch (e) { return { ok: false, error: e.cause?.code || e.name || e.message }; }
}

// « NVIDIA GeForce RTX 4060 Ti, 16380, 1200, 566.36 » (une ligne par carte)
function parseNvidia(stdout) {
  return String(stdout).trim().split(/\r?\n/).filter(Boolean).map((l) => {
    const [name, total, used, driver] = l.split(",").map((x) => x.trim());
    return { name, memTotalMB: Number(total) || 0, memUsedMB: Number(used) || 0, driver };
  }).filter((g) => g.name);
}

// Détection légère : système, processeur, mémoire, carte graphique (une commande rapide)
async function detectBasic({ execFileImpl, platform = os.platform(), arch = os.arch(), totalmem = os.totalmem(), freemem = os.freemem(), cpus = os.cpus(), release = os.release() } = {}) {
  const nv = await run("nvidia-smi", ["--query-gpu=name,memory.total,memory.used,driver_version", "--format=csv,noheader,nounits"], { execFileImpl });
  return {
    system: { platform, arch, release },
    cpu: { model: cpus[0]?.model?.trim() || "?", cores: cpus.length },
    ram: { total: totalmem, free: freemem },
    gpus: nv.ok ? parseNvidia(nv.stdout) : [],
    nvidiaSmi: nv.ok ? "ok" : nv.missing ? "absent" : "erreur",
    apple: platform === "darwin" && arch === "arm64",
  };
}

// Diagnostic complet (doctor, bouton de l'admin) : outils installés et moteurs, chronométrés
async function detect({ execFileImpl, fetchImpl = fetch, env = process.env, ...basicOpts } = {}) {
  const r = await detectBasic({ execFileImpl, ...basicOpts });
  const platform = r.system.platform;
  // Docker : présent, démarré, runtime NVIDIA ; image du conteneur Kokoro
  const di = await run("docker", ["info", "--format", "{{json .}}"], { execFileImpl });
  let info = null; try { info = di.ok ? JSON.parse(di.stdout) : null; } catch {}
  const ki = await run("docker", ["inspect", "-f", "{{.Config.Image}}", "kokoro"], { execFileImpl });
  r.docker = { installed: !di.missing, running: !!info, nvidia: !!(info && (info.Runtimes?.nvidia || /nvidia/i.test(JSON.stringify(info.Runtimes || {})))), kokoroImage: ki.ok ? ki.stdout.trim() : null };
  // Python 3.10 et uv
  const uv = await run("uv", ["--version"], { execFileImpl });
  const py = platform === "win32" ? await run("py", ["-3.10", "--version"], { execFileImpl }) : await run("python3.10", ["--version"], { execFileImpl });
  r.python = { uv: uv.ok ? uv.stdout.trim() : null, py310: py.ok ? (py.stdout || py.stderr || "").trim() || "Python 3.10" : null };
  const venv = env.MELOTTS_VENV || path.join(os.homedir(), "melotts");
  r.melottsVenv = fs.existsSync(path.join(venv, platform === "win32" ? "Scripts" : "bin")) ? venv : null;
  // Ollama : modèles installés, et chargé sur GPU ou CPU
  const ollamaUrl = (env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const tags = await getJson(fetchImpl, `${ollamaUrl}/api/tags`);
  const ps = tags.ok ? await getJson(fetchImpl, `${ollamaUrl}/api/ps`) : { ok: false };
  r.ollama = {
    url: ollamaUrl, up: tags.ok, models: tags.ok ? (tags.data?.models || []).map((m) => m.name) : [],
    loaded: ps.ok ? (ps.data?.models || []).map((m) => ({ name: m.name, gpuShare: m.size ? Math.round(((m.size_vram || 0) / m.size) * 100) : 0 })) : [],
  };
  // Moteurs de voix : une phrase courte, chronométrée
  r.voices = {};
  for (const [lang, text] of [["en", "Hello there."], ["ko", "안녕하세요."]]) {
    const U = lang.toUpperCase(), base = (env[`TTS_URL_${U}`] || env.TTS_URL || "").replace(/\/+$/, "");
    const voice = String(env[`TTS_VOICES_${U}`] || "").split(",")[0]?.trim();
    if (!base || !voice) { r.voices[lang] = { configured: false }; continue; }
    const t0 = Date.now();
    const g = await (async () => {
      try {
        const res = await fetchImpl(`${base}/audio/speech`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ model: env[`TTS_MODEL_${U}`] || env.TTS_MODEL || "kokoro", input: text, voice, response_format: "mp3" }) });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        await res.arrayBuffer(); return { ok: true };
      } catch (e) { return { ok: false, error: e.cause?.code || e.name || e.message }; }
    })();
    r.voices[lang] = { configured: true, base, up: g.ok, ms: g.ok ? Date.now() - t0 : null, error: g.error || null };
  }
  // Analyseur coréen pour la chaîne de contenu (CONTENU-PIPELINE, lot C2) : Kiwi
  const kiwiUrl = (env.KIWI_URL || "http://127.0.0.1:8882").replace(/\/+$/, "");
  const kh = await getJson(fetchImpl, `${kiwiUrl}/health`);
  const nlpVenv = env.NLP_VENV || path.join(os.homedir(), "mochi-nlp");
  r.nlp = { kiwiUrl, kiwiUp: !!(kh.ok && kh.data?.ok), venv: fs.existsSync(path.join(nlpVenv, platform === "win32" ? "Scripts" : "bin")) ? nlpVenv : null };
  r.anthropicKey = !!env.ANTHROPIC_API_KEY; // jamais la valeur
  r.urls = Object.fromEntries(["TTS_URL", "TTS_URL_EN", "TTS_URL_KO", "OLLAMA_URL"].filter((k) => env[k]).map((k) => [k, env[k]]));
  return r;
}

// ---------- Profils ----------
const PROFILES = {
  "gpu-large": "Carte graphique NVIDIA ≥ 12 Go",
  "gpu-small": "Carte graphique NVIDIA de 6 à 12 Go",
  apple: "Mac Apple Silicon (≥ 16 Go)",
  cpu: "Processeur seul",
  light: "Petite machine (< 8 Go de RAM)",
};
const bestGpuMB = (r) => Math.max(0, ...(r.gpus || []).map((g) => g.memTotalMB));
function chooseProfile(r) {
  const vram = bestGpuMB(r), ram = r.ram.total / GB;
  if (vram >= 12 * 1024) return "gpu-large";
  if (vram >= 6 * 1024) return "gpu-small";
  if (r.apple && ram >= 15.5) return "apple"; // 16 Go annoncés ≈ 15,x Go vus par le système
  if (ram < 7.5) return "light";
  return "cpu";
}

const VOICES_EN = "af_heart,af_bella,am_michael,am_fenrir,bf_emma,bm_george";
const MODEL_BY_PROFILE = { "gpu-large": "qwen2.5:14b-instruct", "gpu-small": "qwen2.5:7b-instruct", apple: "qwen2.5:7b-instruct", cpu: "qwen2.5:7b-instruct" };

// Variables à écrire, commandes à copier (adaptées au système), avertissements
function recommend(r, profile = chooseProfile(r)) {
  const win = r.system.platform === "win32", gpu = profile.startsWith("gpu"), ram = r.ram.total / GB;
  const env = {}, commands = [], warnings = [], notes = [];
  const voicesOn = profile !== "light";
  if (voicesOn) Object.assign(env, { TTS_URL_EN: "http://127.0.0.1:8880/v1", TTS_VOICES_EN: VOICES_EN, TTS_URL_KO: "http://127.0.0.1:8881/v1", TTS_VOICES_KO: "KR", TTS_MODEL_KO: "melotts" });
  // Correcteur IA
  const model = MODEL_BY_PROFILE[profile];
  if (gpu || profile === "apple") Object.assign(env, { MOCHI_LLM_PROVIDER: "ollama", MOCHI_MODEL: model, OLLAMA_URL: "http://127.0.0.1:11434" });
  else if (r.anthropicKey) env.MOCHI_LLM_PROVIDER = "claude";
  else if (profile === "cpu") { Object.assign(env, { MOCHI_LLM_PROVIDER: "ollama", MOCHI_MODEL: model, OLLAMA_URL: "http://127.0.0.1:11434" }); notes.push("Ollama sur processeur : ~20 s par correction. Une clé Anthropic (ANTHROPIC_API_KEY) donnerait des corrections en quelques secondes."); }
  else notes.push("Sans carte graphique ni clé Anthropic : le correcteur hors ligne (réponses types) sera utilisé.");
  if (r.anthropicKey && env.MOCHI_LLM_PROVIDER === "ollama") notes.push("Tu as une clé Anthropic : MOCHI_LLM_PROVIDER=claude reste possible (payant, meilleure qualité en coréen).");

  // Commandes (jamais lancées automatiquement : à copier)
  const kokoroImg = gpu ? "ghcr.io/remsky/kokoro-fastapi-gpu:latest" : "ghcr.io/remsky/kokoro-fastapi-cpu:latest";
  const device = gpu ? "cuda" : profile === "apple" ? "mps" : "cpu";
  if (voicesOn) {
    commands.push({ title: `Voix anglaises : Kokoro (${gpu ? "carte graphique" : "processeur"})`, lines: [`docker run -d --restart unless-stopped ${gpu ? "--gpus all " : ""}-p 127.0.0.1:8880:8880 --name kokoro ${kokoroImg}`] });
    const torchIdx = gpu ? "https://download.pytorch.org/whl/cu121" : "https://download.pytorch.org/whl/cpu";
    if (r.melottsVenv) commands.push({ title: `Voix coréennes : MeloTTS (déjà installé dans ${r.melottsVenv}) : le lancer`, lines: [win ? "tools\\start-voices.ps1" : "tools/start-voices.sh"] });
    else commands.push({ title: `Voix coréennes : MeloTTS (DEVICE=${device})`, lines: win ? [
      "uv venv --python 3.10 $HOME\\melotts",
      "& $HOME\\melotts\\Scripts\\Activate.ps1",
      `uv pip install torch torchaudio --index-url ${torchIdx}${gpu ? " --reinstall" : ""}`,
      "uv pip install git+https://github.com/myshell-ai/MeloTTS.git",
      "uv pip uninstall unidic; Remove-Item -Recurse -Force $HOME\\melotts\\Lib\\site-packages\\unidic",
      "uv pip install unidic-lite python-mecab-ko",
      "tools\\start-voices.ps1",
    ] : [
      "uv venv --python 3.10 ~/melotts && source ~/melotts/bin/activate",
      ...(profile === "apple" ? ["uv pip install torch torchaudio"] : [`uv pip install torch torchaudio --index-url ${torchIdx}`]),
      "uv pip install git+https://github.com/myshell-ai/MeloTTS.git",
      "uv pip uninstall unidic && rm -rf ~/melotts/lib/python3.10/site-packages/unidic",
      "uv pip install unidic-lite python-mecab-ko",
      "tools/start-voices.sh",
    ] });
    commands.push({ title: profile === "cpu" ? "Pré-génération de l'audio (OBLIGATOIRE sur processeur)" : "Pré-génération de l'audio", lines: ["npm run tts:pregen"] });
  } else {
    notes.push("Voix : celles du navigateur. Ou pré-génère l'audio sur une machine plus puissante (npm run tts:pregen) puis copie son dossier data/tts/ ici.");
  }
  // Chaîne de contenu (facultatif : seulement pour produire des textes coréens)
  if (r.nlp && !r.nlp.kiwiUp) commands.push({ title: `Analyseur coréen Kiwi (production de contenu, facultatif)${r.nlp.venv ? ` : déjà installé dans ${r.nlp.venv}, le lancer` : ""}`, lines: r.nlp.venv
    ? [win ? "& $HOME\\mochi-nlp\\Scripts\\python.exe tools\\kiwi_server.py" : "~/mochi-nlp/bin/python tools/kiwi_server.py"]
    : win ? ["uv venv --python 3.12 $HOME\\mochi-nlp", "& $HOME\\mochi-nlp\\Scripts\\Activate.ps1", "uv pip install kiwipiepy", "python tools\\kiwi_server.py"]
      : ["uv venv --python 3.12 ~/mochi-nlp && source ~/mochi-nlp/bin/activate", "uv pip install kiwipiepy", "python tools/kiwi_server.py"] });
  if (env.MOCHI_LLM_PROVIDER === "ollama" && !r.ollama?.models?.includes(model)) commands.push({ title: `Correcteur IA : Ollama (${model})`, lines: [...(r.ollama?.up ? [] : [win ? "# Installe Ollama pour Windows : https://ollama.com/download" : "curl -fsSL https://ollama.com/install.sh | sh"]), `ollama pull ${model}`] });

  // Incohérences et mémoire
  const loaded = r.ollama?.loaded || [];
  if (gpu && r.docker?.kokoroImage && /-cpu/.test(r.docker.kokoroImage)) warnings.push("Carte graphique présente, mais Kokoro tourne dans l'image CPU : remplace-la par l'image GPU (commande ci-dessous, après docker rm -f kokoro).");
  if (gpu && r.docker?.installed && r.docker.running && !r.docker.nvidia) warnings.push(win ? "Docker ne voit pas la carte graphique : active le moteur WSL 2 de Docker Desktop et mets à jour le pilote NVIDIA." : "Docker ne voit pas la carte graphique : installe le NVIDIA Container Toolkit.");
  if (gpu && r.voices?.ko?.up && r.voices.ko.ms > 1500) warnings.push(`MeloTTS met ${(r.voices.ko.ms / 1000).toFixed(1)} s pour une phrase courte : il tourne sans doute sur le processeur (vérifie DEVICE=cuda et que torch.cuda.is_available() affiche True).`);
  if (gpu && loaded.some((m) => m.gpuShare === 0)) warnings.push("Ollama tourne à 100 % sur le processeur alors qu'il y a une carte graphique : mets à jour le pilote NVIDIA puis redémarre Ollama (vérifie avec « ollama ps »).");
  if (!gpu && loaded.length && ram < 24 && /14b/.test(loaded.map((m) => m.name).join())) warnings.push("Un modèle 14B sur processeur avec moins de 24 Go de RAM : très lent, et la mémoire est juste. Préfère qwen2.5:7b-instruct.");
  if (profile === "gpu-large" && ram < 20) notes.push("RAM : 16 Go suffisent (Ollama 14B, Kokoro et MeloTTS sont en mémoire graphique), à condition que tout tourne bien sur la carte.");
  if (profile === "cpu" && ram < 15.5) warnings.push("Moins de 16 Go de RAM : Ollama 7B + Kokoro + MeloTTS + navigateur, c'est juste. Préfère l'API Anthropic ou qwen2.5:3b-instruct.");
  for (const [k, v] of Object.entries(r.urls || {})) if (/localhost/.test(v)) warnings.push(`${k}=${v} : remplace localhost par 127.0.0.1 (sous Windows, localhost essaie d'abord l'IPv6, ce qui ajoute du délai).`);
  for (const [lang, v] of Object.entries(r.voices || {})) {
    if (v.configured && !v.up) warnings.push(`Voix ${lang} configurée (${v.base}) mais le moteur ne répond pas (${v.error}).`);
    if (v.up && v.ms > 3000) warnings.push(`Voix ${lang} lentes (${(v.ms / 1000).toFixed(1)} s par phrase) : lance npm run tts:pregen.`);
  }
  if (env.MOCHI_LLM_PROVIDER === "ollama" && r.ollama && !r.ollama.up) warnings.push(`Ollama ne répond pas sur ${r.ollama.url} : installe-le (https://ollama.com/download) ou lance « ollama serve ».`);
  else if (env.MOCHI_MODEL && r.ollama?.up && !r.ollama.models.includes(env.MOCHI_MODEL)) warnings.push(`Le modèle ${env.MOCHI_MODEL} n'est pas installé : ollama pull ${env.MOCHI_MODEL} (ou npm run doctor -- --pull).`);
  if (voicesOn && r.docker && !r.docker.installed) warnings.push(win ? "Docker Desktop n'est pas installé (nécessaire pour Kokoro)." : "Docker n'est pas installé (nécessaire pour Kokoro).");
  if (voicesOn && r.python && !r.python.uv) notes.push("uv n'est pas installé : https://docs.astral.sh/uv/ (il installe Python 3.10 tout seul pour MeloTTS).");
  return { profile, label: PROFILES[profile], env, commands, warnings, notes };
}

// ---------- Écriture du .env (avec accord : --write) ----------
// Seules ces clés peuvent être écrites. Les secrets (clés API, SMTP, Resend…) ne sont JAMAIS touchés.
const WRITABLE = /^(TTS_[A-Z_]+|MOCHI_LLM_PROVIDER|MOCHI_MODEL|OLLAMA_URL|OLLAMA_MODEL)$/;
const stamp = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
function writeEnv(file, wanted, { now = new Date() } = {}) {
  const exists = fs.existsSync(file);
  const before = exists ? fs.readFileSync(file, "utf8") : "";
  const lines = before ? before.split(/\r?\n/) : [];
  const diff = [], done = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (!m || !WRITABLE.test(m[1]) || !(m[1] in wanted)) continue;
    done.add(m[1]);
    const next = `${m[1]}=${wanted[m[1]]}`;
    if (lines[i] !== next) { diff.push(`- ${lines[i]}`, `+ ${next}`); lines[i] = next; }
  }
  const add = Object.entries(wanted).filter(([k]) => WRITABLE.test(k) && !done.has(k));
  if (add.length) {
    if (lines.length && lines.at(-1) !== "") lines.push("");
    lines.push(`# Ajouté par npm run doctor -- --write (${now.toLocaleDateString("fr-FR")})`);
    for (const [k, v] of add) { lines.push(`${k}=${v}`); diff.push(`+ ${k}=${v}`); }
  }
  if (!diff.length) return { changed: false, diff, backup: null };
  let backup = null;
  if (exists) { backup = `${file}.bak-${stamp(now)}`; fs.copyFileSync(file, backup); }
  fs.writeFileSync(file, lines.join("\n").replace(/\n*$/, "\n"));
  return { changed: true, diff, backup };
}

const fmtGB = (b) => `${(b / GB).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
module.exports = { run, parseNvidia, detectBasic, detect, chooseProfile, recommend, writeEnv, PROFILES, WRITABLE, fmtGB, GB };
