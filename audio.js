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
function speak(text, lang, speed = state.settings.speed, who = null) {
  stopSound();
  if (audioSource(lang) === "server") {
    const voice = who?.server || defaultServerVoice(lang), token = playToken;
    return serverSpeak(text, lang, voice, speed * (who?.rate || 1), who && who.pitch !== 1, token).catch((e) => {
      if (token !== playToken || e?.name === "AbortError") return; // interrompue par une autre lecture : pas une panne
      if (e?.name === "NotAllowedError") return; // lecture automatique bloquée avant toute interaction : le bouton 🔊 reste là
      const why = audioError(e);
      console.warn("Voix du serveur illisible :", why, e);
      // Repli sur les voix du navigateur s'il y en a ; sinon on dit la vraie raison
      if (voicesFor(lang).length) return browserSpeak(text, lang, speed, null);
      toast(`Voix du serveur illisible (${why}). Recharge la page ; si ça continue, signale ce message.`);
    });
  }
  return browserSpeak(text, lang, speed, who);
}
const MEDIA_ERR = { 1: "lecture annulée", 2: "erreur réseau", 3: "décodage impossible", 4: "format non pris en charge" };
const audioError = (e) => (e?.mediaCode ? `${MEDIA_ERR[e.mediaCode] || "erreur média"} ${e.mediaCode}${e.message ? ` : ${e.message}` : ""}` : `${e?.name || "Erreur"} : ${e?.message || e}`);
const defaultServerVoice = (lang) => { const sv = serverVoices(lang), pref = state.settings.voices?.[lang]; return sv.includes(pref) ? pref : sv[0]; };
const ttsUrl = (text, lang, voice) => `/api/tts?lang=${lang}&voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, 300))}`;
// Le fichier est d'abord téléchargé en entier (fetch → Blob), puis joué depuis la mémoire :
// plus de requêtes partielles (Range) entre le lecteur audio, le service worker et le serveur.
async function serverSpeak(text, lang, voice, rate, shiftPitch, token = playToken) {
  const r = await fetch(ttsUrl(text, lang, voice), { credentials: "same-origin" });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw Object.assign(new Error(d.error || `HTTP ${r.status}`), { name: "Serveur" }); }
  const blob = await r.blob();
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
      toast(`Aucune voix ${lang === "ko" ? "coréenne" : "anglaise"} sur cet appareil : voir Profil › Audio`);
    }
    if (who) u.pitch = who.pitch;
    u.rate = 0.9 * speed * (who ? who.rate : 1);
    // Filet de sécurité : certains navigateurs (Chromium sans voix) ne déclenchent jamais onend
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(guard); resolve(); } };
    const guard = setTimeout(finish, 2500 + (text.length * 180) / (u.rate || 1));
    u.onend = u.onerror = finish;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
function stopSound() {
  playToken++;
  if (current) { const a = current; current = null; a.pause(); }
  if (hasSynth()) speechSynthesis.cancel();
}
function stopAudio() { stopSound(); if (ui.reader) ui.reader.playing = false; }
