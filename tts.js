// ============================================================
//  Mochi — vraies voix (ROADMAP P1 « Vraies voix », PEDAGOGIE.md §5 et §14)
//  Facultatif : sans configuration, le site utilise la synthèse du navigateur.
//
//  Le serveur relaie vers n'importe quel moteur TTS qui parle le protocole
//  « OpenAI audio/speech » (POST {base}/audio/speech → MP3 ou WAV) : Kokoro-FastAPI
//  pour l'anglais, tools/melotts_server.py pour le coréen, etc. Chaque phrase n'est générée qu'une fois puis gardée
//  dans DATA_DIR/tts (le contenu des textes est fixe, le cache se remplit vite).
//
//  Variables d'environnement (voir SETUP.md, section « Vraies voix ») :
//    TTS_URL=http://127.0.0.1:8880/v1      base commune (127.0.0.1, pas localhost : voir SETUP.md)
//    TTS_URL_EN / TTS_URL_KO               base propre à une langue (prioritaire)
//    TTS_MODEL=kokoro                      champ « model » envoyé au moteur
//    TTS_VOICES_EN=af_heart,am_michael     voix proposées (2 à 6 conseillées pour §14)
//    TTS_VOICES_KO=...
//    TTS_TIMEOUT_MS=15000                  délai max d'une génération (une fois lancée)
//
//  File d'attente par moteur (CORRECTIFS v0.4, lot 7.3) : une génération à la fois par
//  moteur (Kokoro et MeloTTS traitent de toute façon une phrase à la fois), et deux
//  priorités : "high" (clic de l'utilisateur) passe devant toutes les "low" en attente
//  (préchargement, pré-génération). Une même phrase n'est générée qu'une fois.
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const LANGS = ["en", "ko", "zh", "ru"];
const MAX_CHARS = 300;
const VOICE_RE = /^[A-Za-z0-9_.:+-]{1,64}$/;

function config(env = process.env) {
  const out = {};
  for (const lang of LANGS) {
    const U = lang.toUpperCase();
    const base = (env[`TTS_URL_${U}`] || env.TTS_URL || "").replace(/\/+$/, "");
    const voices = String(env[`TTS_VOICES_${U}`] || "").split(",").map((v) => v.trim()).filter((v) => VOICE_RE.test(v));
    if (base && voices.length) out[lang] = { base, voices, model: env[`TTS_MODEL_${U}`] || env.TTS_MODEL || "kokoro" };
  }
  return out;
}

// Format d'après les premiers octets (on ne fait pas confiance au moteur)
function audioExt(buf) {
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") return ".wav";
  if (buf.toString("ascii", 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return ".mp3";
  return null;
}
const typeOf = (file) => (file.endsWith(".wav") ? "audio/wav" : "audio/mpeg");

function create({ dir, env = process.env, fetchImpl = fetch, timeoutMs = Number(env.TTS_TIMEOUT_MS) || 15e3 } = {}) {
  const conf = config(env);
  const pending = new Map(); // fichier → tâche (deux demandes = un seul appel au moteur)
  const queues = new Map();  // moteur (URL de base) → { busy, items: [tâche] }
  if (Object.keys(conf).length) fs.mkdirSync(dir, { recursive: true });

  // Ce que le client a besoin de savoir : les voix disponibles par langue
  const info = () => Object.fromEntries(Object.entries(conf).map(([l, c]) => [l, c.voices]));

  // Vérifie la demande ; renvoie un message d'erreur ou null
  function check(lang, voice, text) {
    if (!conf[lang]) return "Pas de voix serveur pour cette langue.";
    if (!conf[lang].voices.includes(voice)) return "Voix inconnue.";
    if (typeof text !== "string" || !text.trim() || text.length > MAX_CHARS) return "Texte invalide.";
    return null;
  }
  // Fichier de cache sans extension ; on essaie .mp3 puis .wav (MeloTTS renvoie du WAV)
  const stem = (lang, voice, text) => path.join(dir, crypto.createHash("sha256").update(`${conf[lang].model}\n${lang}\n${voice}\n${text.trim()}`).digest("hex"));
  const cached = (lang, voice, text) => { const s = stem(lang, voice, text); return [".mp3", ".wav"].map((e) => s + e).find((f) => fs.existsSync(f)) || null; };

  // Appel au moteur (une tâche de la file)
  async function synth(lang, voice, text, file) {
    const c = conf[lang];
    const r = await fetchImpl(`${c.base}/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: c.model, input: text.trim(), voice, response_format: "mp3", speed: 1 }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new Error(`moteur TTS : HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 64) throw new Error("moteur TTS : réponse vide");
    const ext = audioExt(buf);
    if (!ext) throw new Error("moteur TTS : format audio inconnu");
    if (!file) return null; // préchauffage : rien à garder
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file + ext); // écriture atomique : jamais de fichier à moitié écrit dans le cache
    return file + ext;
  }
  const queueOf = (lang) => { const b = conf[lang].base; if (!queues.has(b)) queues.set(b, { busy: false, items: [] }); return queues.get(b); };
  function pump(q) {
    if (q.busy || !q.items.length) return;
    // La plus prioritaire, puis la plus ancienne
    let k = q.items.findIndex((t) => t.prio === "high");
    if (k < 0) k = 0;
    const task = q.items.splice(k, 1)[0];
    q.busy = true;
    task.started = true;
    (task.discard ? synth(task.lang, task.voice, task.text, null) : synth(task.lang, task.voice, task.text, task.file)).then(task.ok, task.ko).finally(() => { q.busy = false; pump(q); });
  }

  // Génère (ou retrouve) le fichier audio. prio : "high" (clic) ou "low" (préchargement).
  async function generate(lang, voice, text, prio = "high") {
    const hit = cached(lang, voice, text);
    if (hit) return hit;
    const file = stem(lang, voice, text);
    const same = pending.get(file);
    if (same) { if (prio === "high") same.prio = "high"; return same.promise; } // remonte une demande « low » en attente
    const task = { lang, voice, text, file, prio, started: false };
    task.promise = new Promise((ok, ko) => { task.ok = ok; task.ko = ko; }).finally(() => pending.delete(file));
    pending.set(file, task);
    const q = queueOf(lang);
    q.items.push(task);
    pump(q);
    return task.promise;
  }
  // Préchauffage (lot 7.2) : une phrase courte, jetée, pour charger le modèle avant le premier
  // clic. Passe par la file (une génération à la fois). Renvoie la durée en ms.
  const WARM = { en: ["Hi.", "Hello there."], ko: ["안녕.", "안녕하세요."], zh: ["你好。", "你好，我是麻糬。"] };
  async function warm(lang, n = 0) {
    const c = conf[lang], voice = c.voices[0], text = (WARM[lang] || ["Hi."])[n] || "Hi.";
    const q = queueOf(lang), t0 = Date.now();
    await new Promise((ok, ko) => {
      const task = { lang, voice, text, prio: "low", started: false, ok, ko, discard: true };
      q.items.push(task); pump(q);
    });
    return Date.now() - t0;
  }
  // Nombre de demandes en attente (pas encore lancées) pour le moteur d'une langue
  const waiting = (lang, prio) => (conf[lang] ? queueOf(lang).items.filter((t) => !prio || t.prio === prio).length : 0);

  return { info, check, cached, generate, waiting, warm, conf, enabled: Object.keys(conf).length > 0 };
}

module.exports = { create, config, typeOf, MAX_CHARS };
