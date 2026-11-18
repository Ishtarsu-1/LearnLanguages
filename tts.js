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
//    TTS_URL=http://localhost:8880/v1      base commune
//    TTS_URL_EN / TTS_URL_KO               base propre à une langue (prioritaire)
//    TTS_MODEL=kokoro                      champ « model » envoyé au moteur
//    TTS_VOICES_EN=af_heart,am_michael     voix proposées (2 à 6 conseillées pour §14)
//    TTS_VOICES_KO=...
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const LANGS = ["en", "ko"];
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

function create({ dir, env = process.env, fetchImpl = fetch, timeoutMs = 60e3 } = {}) {
  const conf = config(env);
  const pending = new Map(); // générations en cours (deux clics = un seul appel au moteur)
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

  async function generate(lang, voice, text) {
    const hit = cached(lang, voice, text);
    if (hit) return hit;
    const file = stem(lang, voice, text);
    if (pending.has(file)) return pending.get(file);
    const job = (async () => {
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
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, file + ext); // écriture atomique : jamais de fichier à moitié écrit dans le cache
      return file + ext;
    })().finally(() => pending.delete(file));
    pending.set(file, job);
    return job;
  }

  return { info, check, cached, generate, enabled: Object.keys(conf).length > 0 };
}

module.exports = { create, config, typeOf, MAX_CHARS };
