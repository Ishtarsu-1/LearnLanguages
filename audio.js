// ============================================================
//  Mochi — audio.js : Voix (navigateur ou serveur), lecture, shadowing
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// ---------- Audio (§5, §14) ----------
// Deux sources, dans cet ordre :
//  1. les vraies voix du serveur (features.tts, voir tts.js), si l'admin en a configuré ;
//  2. la synthèse vocale du navigateur (speechSynthesis), qui dépend de l'appareil :
//     sous Linux, Chromium n'a souvent AUCUNE voix (il faut speech-dispatcher).
// Le profil (section Audio) montre ce qui est disponible et permet de choisir sa voix.
let voices = [];
const hasSynth = () => "speechSynthesis" in window;
function loadVoices() {
  if (!hasSynth()) return;
  const before = voices.length;
  voices = speechSynthesis.getVoices();
  if (voices.length !== before && location.hash.startsWith("#/profil")) route();
}
if (hasSynth()) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
const langOf = (v) => v.lang.replace("_", "-").toLowerCase();
// Toutes les voix du navigateur pour une langue (en, ko)
const voicesFor = (lang) => voices.filter((v) => langOf(v).startsWith(lang));
const serverVoices = (lang) => features.tts?.[lang] || [];
function pickVoice(code) {
  const lang = code.slice(0, 2), mine = voicesFor(lang), pref = String(state.settings.voices?.[lang] || "");
  return mine.find((v) => `browser:${v.name}` === pref) || mine.find((v) => /natural|neural|online|premium|enhanced|google/i.test(v.name)) || mine.find((v) => v.lang === code) || mine[0];
}
// Quelle source sera utilisée pour cette langue : "server", "browser" ou null (muet)
function audioSource(lang) {
  // Une voix du navigateur choisie explicitement l'emporte, si elle existe sur CET appareil
  // (le réglage est synchronisé : il peut venir d'un autre appareil).
  const pref = String(state.settings.voices?.[lang] || "");
  if (pref.startsWith("browser:") && voicesFor(lang).some((v) => `browser:${v.name}` === pref)) return "browser";
  if (serverVoices(lang).length) return "server";
  return voicesFor(lang).length ? "browser" : null;
}
// Au moins 4 « locuteurs » par langue (§14) : les vraies voix disponibles, complétées
// par des variations de hauteur et de débit si l'appareil ou le serveur en a moins de 4.
const TWEAKS = [[1, 1], [0.8, 0.95], [1.25, 1.05], [0.9, 0.9], [1.15, 1]];
function speakers(lang) {
  const sv = audioSource(lang) === "server" ? serverVoices(lang) : [];
  const vs = sv.length ? sv : voicesFor(lang), out = [];
  for (let i = 0; out.length < Math.max(4, vs.length); i++) {
    const real = vs.length > i, [pitch, rate] = real ? [1, 1] : TWEAKS[i % TWEAKS.length];
    out.push(sv.length ? { server: sv[i % sv.length], pitch, rate } : { voice: vs[i % (vs.length || 1)] || null, pitch, rate });
  }
  return out;
}
let current = null; // lecture en cours (élément Audio ou null)
let playToken = 0;   // chaque nouvelle lecture annule la précédente (même pendant le téléchargement)
const warnedMute = {};
let audioPlays = 0; // nombre de lectures lancées : le préchargement s'arrête dès qu'il change
let slowToastShown = false;
// Bouton qui a lancé la lecture (le dernier cliqué, s'il l'a été à l'instant) : il montre le chargement
const clickedButton = () => (ui.lastClick && Date.now() - ui.lastClick.t < 1500 ? ui.lastClick.el : null);
function speak(text, lang, speed = state.settings.speed, who = null) {
  stopSound();
  audioPlays++;
  if (audioSource(lang) === "server") {
    const voice = who?.server || defaultServerVoice(lang), token = playToken;
    return serverSpeak(text, lang, voice, speed * (who?.rate || 1), who && who.pitch !== 1, token, clickedButton()).catch((e) => {
      if (token !== playToken || e?.name === "AbortError") return; // interrompue par une autre lecture : pas une panne
      if (e?.name === "NotAllowedError") return; // lecture automatique bloquée avant toute interaction : le bouton 🔊 reste là
      // La voix du serveur tarde (première génération) : la voix de l'appareil pour cette fois.
      // Le serveur continue la génération : la phrase sera en cache au prochain clic.
      if (e?.name === "SlowVoice") {
        if (!slowToastShown) { slowToastShown = true; toast("La belle voix arrive, on utilise la voix de ton appareil en attendant."); }
        return browserSpeak(text, lang, speed, null);
      }
      // Version portable : la phrase n'a pas été pré-générée → voix de l'appareil, sans bruit
      if (/Pas d'audio/.test(e?.message || "")) {
        if (voicesFor(lang).length) return browserSpeak(text, lang, speed, null);
        if (!warnedMute[lang]) { warnedMute[lang] = true; toast("Pas d'audio pour cette phrase dans la version portable, et aucune voix sur cet appareil : voir Profil › Audio"); }
        return;
      }
      const why = audioError(e);
      console.warn("Voix du serveur illisible :", why, e);
      // Repli sur les voix du navigateur s'il y en a ; sinon on dit la vraie raison
      if (voicesFor(lang).length) return browserSpeak(text, lang, speed, null);
      toast(`Voix du serveur illisible (${why}). Recharge la page ; si ça continue, signale ce message.`);
    });
  }
  return browserSpeak(text, lang, speed, who);
}
// Phrase du bouton « Tester » (Profil › Audio)
const VOICE_SAMPLE = { en: "Hi! I'm Mochi. Nice to meet you.", ko: "안녕하세요! 저는 모찌예요.", zh: "你好！我是麻糬。", ru: "Привет! Я Мочи. Очень приятно!" };
// Toutes les phrases FIXES que le site lit à voix haute, exactement comme elles sont passées à
// speak() (même texte, même coupe à 300 caractères que ttsUrl) : textes, livres, histoire,
// missions, mots, oreille, faux amis, registres, grammaire, alphabets, test du profil, réponses types.
// tools/pregen-tts.js charge ce fichier et appelle cette fonction : l'audio pré-généré et les
// clics ne peuvent pas diverger. (Restent générées au clic : les répliques de l'IA, la phrase
// corrigée de l'apprenant, les syllabes composées dans l'atelier.)
function spokenSentences(lang) {
  const out = new Map(); // clé = texte tel que le serveur le met en cache (trim)
  const add = (t) => { if (typeof t !== "string") return; const sent = t.slice(0, 300); if (sent.trim()) out.set(sent.trim(), sent); };
  const sentences = (list) => (list || []).forEach((x) => add(x.text));
  for (const t of TEXTS[lang] || []) { sentences(t.parsed); t.parsed.forEach((x) => x.words.forEach((w) => w.segs.forEach((g) => add(g.surface)))); }
  if (typeof CHAPTER_TEXTS !== "undefined") for (const t of Object.values(CHAPTER_TEXTS[lang] || {})) sentences(t.parsed);
  if (typeof MISSIONS !== "undefined") for (const m of Object.values(MISSIONS)) {
    if (m.lang !== lang) continue;
    add(m.opening?.[0]); add(m.end?.[0]);
    for (const st of m.script || []) { add(st.npc?.[0]); for (const [text] of st.choices || []) add(text); }
  }
  Object.keys(LEXICON[lang] || {}).forEach(add);
  for (const p of EAR[lang]?.pairs || []) p.items.forEach(add);
  for (const n of EAR[lang]?.notes || []) for (const [a] of n.lines) add(a.replace(/[A-Z]{2,}/g, (m) => m.toLowerCase()));
  for (const ex of PRODUCTION[lang] || []) { add(plain(parseSentence(ex.target, lang))); (ex.accept || []).forEach(add); }
  if (lang === "en") for (const f of FAUX_AMIS) add(f.s);
  if (lang === "ko") {
    for (const p of REGISTERS.phrases) for (const [k] of REGISTERS.who) add(p[k]);
    for (const g of KO_GRAMMAR) g.examples.forEach((src) => add(toSentence(src, "ko").text));
    for (const d of HANGUL_DAYS) for (const it of d.items || []) add(d.kind === "jamo" ? it[2] : it[0]);
    for (const d of HANGUL_DAYS) for (const [w] of d.type || []) add(w);
  }
  if (lang === "ru" && typeof CYR_DAYS !== "undefined") { for (const d of CYR_DAYS) for (const it of d.items || []) add(it[2]); for (const [w] of CYR_STRESS_QUIZ) add(w); }
  if (lang === "zh" && typeof PINYIN_DAYS !== "undefined") { for (const d of PINYIN_DAYS) for (const [zh] of d.items || []) add(zh); for (const [zh] of PINYIN_TONE_WORDS) add(zh); }
  add(VOICE_SAMPLE[lang]);
  return [...out.values()];
}
const MEDIA_ERR = { 1: "lecture annulée", 2: "erreur réseau", 3: "décodage impossible", 4: "format non pris en charge" };
const audioError = (e) => (e?.mediaCode ? `${MEDIA_ERR[e.mediaCode] || "erreur média"} ${e.mediaCode}${e.message ? ` : ${e.message}` : ""}` : `${e?.name || "Erreur"} : ${e?.message || e}`);
const defaultServerVoice = (lang) => { const sv = serverVoices(lang), pref = state.settings.voices?.[lang]; return sv.includes(pref) ? pref : sv[0]; };
// Version mobile : audio pré-généré en fichiers statiques, nommés par audioKey (même calcul dans
// tools/portable.js). null : phrase non pré-générée → voix de l'appareil.
function audioKey(s) { // cyrb53 : empreinte rapide sur 53 bits, sans crypto (synchrone)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const staticAudioUrl = (text, lang, voice) => { const k = audioKey(`${lang}\n${voice}\n${text.slice(0, 300).trim()}`), ext = features.audio?.[k]; return ext ? `audio/${k}.${ext}` : null; };
const ttsUrl = (text, lang, voice) => features.static ? staticAudioUrl(text, lang, voice) : `/api/tts?lang=${lang}&voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, 300))}`;
// Délai avant de passer à la voix de l'appareil quand l'audio du serveur tarde (lot 7.4).
// Plus court si le serveur annonce des voix lentes (features.ttsSlow, lot 8.4).
const ttsFallbackMs = () => (features.ttsSlow ? 3000 : 5000);
const setBusy = (btn, on) => { if (!btn?.setAttribute) return; if (on) { btn.setAttribute("aria-busy", "true"); btn.classList.add("loading"); } else { btn.removeAttribute("aria-busy"); btn.classList.remove("loading"); } };
// Le fichier est d'abord téléchargé en entier (fetch → Blob), puis joué depuis la mémoire :
// plus de requêtes partielles (Range) entre le lecteur audio, le service worker et le serveur.
async function serverSpeak(text, lang, voice, rate, shiftPitch, token = playToken, btn = null) {
  // Repli seulement s'il existe une voix sur l'appareil ; sinon on attend le serveur
  const ctl = voicesFor(lang).length && typeof AbortController === "function" ? new AbortController() : null;
  let slow = false;
  const timer = ctl ? setTimeout(() => { slow = true; ctl.abort(); }, ttsFallbackMs()) : null;
  setBusy(btn, true);
  let blob;
  try {
    const u = ttsUrl(text, lang, voice);
    if (!u) throw new Error("Pas d'audio pour cette phrase");
    const r = await fetch(u, { credentials: "same-origin", signal: ctl?.signal });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw Object.assign(new Error(d.error || `HTTP ${r.status}`), { name: "Serveur" }); }
    blob = await r.blob();
  } catch (e) {
    if (slow) throw Object.assign(new Error("voix du serveur trop lente"), { name: "SlowVoice" });
    throw e;
  } finally { clearTimeout(timer); setBusy(btn, false); }
  if (token !== playToken) return; // une autre lecture a commencé pendant le téléchargement
  const src = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const a = new Audio(src);
    const done = (err) => { URL.revokeObjectURL(src); if (current === a) current = null; err ? reject(err) : resolve(); };
    a.playbackRate = Number.isFinite(rate) && rate > 0 ? Math.min(2, Math.max(0.5, rate)) : 1;
    if (shiftPitch) a.preservesPitch = false; // variation de « locuteur » pour §14
    current = a;
    a.onended = () => done();
    a.onpause = () => { if (a.currentTime < a.duration) done(); }; // arrêtée par stopSound : la promesse se termine
    a.onerror = () => done(Object.assign(new Error(a.error?.message || ""), { mediaCode: a.error?.code }));
    a.onplaying = () => followAudio(a, token);
    a.play().catch(done);
  });
}
function browserSpeak(text, lang, speed, who) {
  return new Promise((resolve) => {
    if (!hasSynth()) { toast("L'audio n'est pas disponible sur ce navigateur"); return resolve(); }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGUAGES[lang].speechLang;
    const v = who ? who.voice : pickVoice(u.lang);
    if (v) u.voice = v;
    else if (!warnedMute[lang]) {
      warnedMute[lang] = true;
      toast(`Aucune voix ${{ ko: "coréenne", zh: "chinoise", ru: "russe" }[lang] || "anglaise"} sur cet appareil : voir Profil › Audio`);
    }
    if (who) u.pitch = who.pitch;
    u.rate = 0.9 * speed * (who ? who.rate : 1);
    // Filet de sécurité : certains navigateurs (Chromium sans voix) ne déclenchent jamais onend
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(guard); resolve(); } };
    const guard = setTimeout(finish, 2500 + (text.length * 180) / (u.rate || 1));
    u.onend = u.onerror = () => { markWord(-1); finish(); };
    if (wordTrack) u.onboundary = (e) => { if (e.name === "word" || e.name === undefined) markWord(wordFromChar(e.charIndex)); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
function stopSound() {
  playToken++;
  markWord(-1);
  if (current) { const a = current; current = null; a.pause(); }
  if (hasSynth()) speechSynthesis.cancel();
}
function stopAudio() { stopSound(); if (ui.reader) ui.reader.playing = false; }

// ---------- Lire à voix haute (reconnaissance vocale du navigateur, ROADMAP P2 étape 1) ----------
// L'API Web Speech transcrit, Mochi compare avec la phrase : tolérant (la transcription se trompe
// aussi), jamais compté comme une erreur dans les révisions.
const SpeechRec = () => (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
const speechNorm = (s) => s.toLowerCase().normalize("NFC").replace(/[’']/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
// Mots de la phrase reconnus dans ce qui a été entendu (plusieurs transcriptions possibles)
function speechMatch(target, heard, lang) {
  const alts = [].concat(heard).map(speechNorm), flat = alts.map((h) => h.replace(/ /g, ""));
  const words = lang === "zh" ? [...speechNorm(target).replace(/ /g, "")] : speechNorm(target).split(" ").filter(Boolean);
  const hit = (w) => lang === "ko" || lang === "zh"
    // coréen : une terminaison ou une particule mal transcrite ne compte pas (서울에서 ≈ 서울에)
    ? flat.some((h) => h.includes(w) || (lang === "ko" && w.length > 1 && h.includes(w.slice(0, -1))))
    : alts.some((h) => ` ${h} `.includes(` ${w} `));
  const hits = words.map(hit);
  return { words, hits, score: words.length ? hits.filter(Boolean).length / words.length : 0 };
}
let speechBusy = null;
function listenSentence(lang, si) {
  const Rec = SpeechRec(), R = ui.reader;
  if (!Rec) return toast("Ton navigateur ne reconnaît pas la voix : essaie Chrome, Edge ou Safari.");
  if (speechBusy) { speechBusy.stop(); return; }
  const target = textById(lang, R.id).parsed[si].text, rec = new Rec();
  rec.lang = LANGUAGES[lang].speechLang; rec.interimResults = false; rec.maxAlternatives = 3;
  stopSound();
  R.listening = si; render();
  rec.onresult = (e) => {
    const heard = [...e.results[0]].map((a) => a.transcript);
    R.said = { ...(R.said || {}), [si]: { heard: heard[0], ...speechMatch(target, heard, lang) } };
  };
  rec.onerror = (e) => { if (e.error === "not-allowed") toast("Micro refusé 🎙️"); else if (e.error === "no-speech") toast("Je n'ai rien entendu : réessaie, un peu plus fort."); else if (e.error !== "aborted") toast(`Reconnaissance vocale indisponible (${e.error})`); };
  rec.onend = () => { speechBusy = null; R.listening = null; render(); };
  speechBusy = rec;
  try { rec.start(); } catch { speechBusy = null; R.listening = null; render(); }
}
// Résultat sous la phrase : mots reconnus en vert, les autres soulignés, et un mot gentil
function speechResult(s, said) {
  if (!said) return "";
  const msg = said.score >= 0.85 ? "Très bien ! 🎉" : said.score >= 0.5 ? "Presque ! Réécoute le modèle, puis réessaie." : "Réessaie plus lentement, mot par mot.";
  return `<div class="said"><p class="m-0">${said.words.map((w, i) => `<span class="${said.hits[i] ? "said-ok" : "said-miss"}">${esc(w)}</span>`).join(" ")}</p>
    <p class="muted m-0"><small>Entendu : « ${esc(said.heard || "…")} » · ${msg}</small></p></div>`;
}

// ---------- Surlignage mot à mot pendant la lecture (v0.6, lot 3) ----------
// Sans horodatage du moteur : estimation proportionnelle (syllabes en coréen et en chinois, lettres
// sinon, petite pause après la ponctuation). Voix du navigateur : événements « boundary » (exacts).
let wordTrack = null;
function trackWords(si, s, lang) {
  const weight = (w) => {
    const txt = w.segs.map((g) => g.surface).join("");
    const n = lang === "ko" ? (txt.match(/[\uac00-\ud7af]/g) || []).length : lang === "zh" ? [...txt].length : (txt.match(/\p{L}/gu) || []).length;
    return Math.max(1, n) + (/[,;:]/.test(w.post) ? 2 : /[.!?…]/.test(w.post) ? 3 : 0);
  };
  const ws = s.words.map(weight), total = ws.reduce((a, b) => a + b, 0) || 1;
  let acc = 0, pos = 0;
  const ends = ws.map((w) => (acc += w) / total);
  const starts = s.words.map((w) => { const surf = w.segs.map((g) => g.surface).join(""); const i = s.text.indexOf(surf, pos); if (i >= 0) pos = i + surf.length; return i < 0 ? pos : i; });
  return { si, ends, starts };
}
function markWord(wi) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".w.speaking").forEach((e) => e.classList.remove("speaking"));
  if (wordTrack && wi >= 0) document.querySelectorAll(`.w[data-s="${wordTrack.si}"][data-w="${wi}"]`).forEach((e) => e.classList.add("speaking"));
}
// Fraction écoulée de l'audio → mot (un peu de silence au début et à la fin des fichiers de voix)
const wordAt = (f) => { const i = wordTrack.ends.findIndex((e) => e > f); return i < 0 ? wordTrack.ends.length - 1 : i; };
function followAudio(a, token) {
  if (!wordTrack) return;
  const tick = () => {
    if (token !== playToken || a.paused || a.ended || !wordTrack) return markWord(-1);
    if (a.duration) markWord(wordAt(Math.max(0, (a.currentTime - 0.12) / Math.max(0.1, a.duration - 0.25))));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const wordFromChar = (c) => { let i = 0; while (i + 1 < wordTrack.starts.length && wordTrack.starts[i + 1] <= c) i++; return i; };
