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
      const why = audioError(e);
      console.warn("Voix du serveur illisible :", why, e);
      // Repli sur les voix du navigateur s'il y en a ; sinon on dit la vraie raison
      if (voicesFor(lang).length) return browserSpeak(text, lang, speed, null);
      toast(`Voix du serveur illisible (${why}). Recharge la page ; si ça continue, signale ce message.`);
    });
  }
  return browserSpeak(text, lang, speed, who);
}
// Toutes les phrases FIXES que le site lit à voix haute, exactement comme elles sont passées à
// speak() (même texte, même coupe à 300 caractères que ttsUrl) : textes, livres, histoire,
// missions, mots, oreille, faux amis, registres, grammaire, Hangul, réponses types.
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
  return [...out.values()];
}
const MEDIA_ERR = { 1: "lecture annulée", 2: "erreur réseau", 3: "décodage impossible", 4: "format non pris en charge" };
const audioError = (e) => (e?.mediaCode ? `${MEDIA_ERR[e.mediaCode] || "erreur média"} ${e.mediaCode}${e.message ? ` : ${e.message}` : ""}` : `${e?.name || "Erreur"} : ${e?.message || e}`);
const defaultServerVoice = (lang) => { const sv = serverVoices(lang), pref = state.settings.voices?.[lang]; return sv.includes(pref) ? pref : sv[0]; };
const ttsUrl = (text, lang, voice) => `/api/tts?lang=${lang}&voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, 300))}`;
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
    const r = await fetch(ttsUrl(text, lang, voice), { credentials: "same-origin", signal: ctl?.signal });
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
