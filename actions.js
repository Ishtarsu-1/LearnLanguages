// ============================================================
//  Mochi — actions.js : Interactions (data-act) et lecture des textes
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// ============================================================
//  INTERACTIONS
// ============================================================
async function playAll(lang) {
  const R = ui.reader, t = textById(lang, R.id);
  R.playing = true; render();
  for (let i = 0; i < t.parsed.length && R.playing; i++) {
    R.cur = i; render();
    document.getElementById(`s-${i}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    wordTrack = trackWords(i, t.parsed[i], lang);
    await speak(t.parsed[i].text, lang);
    wordTrack = null;
    await new Promise((r) => setTimeout(r, 350));
  }
  R.playing = false; R.cur = -1; render();
}

async function recordShadow(lang, si) {
  const t = textById(lang, ui.reader.id);
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return toast("L'enregistrement n'est pas disponible sur ce navigateur");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast("Micro refusé 🎙️"); }
  const rec = new MediaRecorder(stream), chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    stream.getTracks().forEach((tr) => tr.stop());
    const key = `${ui.reader.id}:${si}`;
    if (ui.recordings[key]) URL.revokeObjectURL(ui.recordings[key]);
    ui.recordings[key] = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
    render();
  };
  toast("🎙️ Répète en même temps !");
  rec.start();
  await speak(t.parsed[si].text, lang);
  setTimeout(() => rec.stop(), 900);
}
function playRec(key) { return new Promise((r) => { const a = new Audio(ui.recordings[key]); a.onended = a.onerror = r; a.play().catch(r); }); }

const actions = {
  say: (el) => speak(el.dataset.text, el.dataset.lang),
  locked: (el, e) => { e.preventDefault(); toast("🔒 Termine d'abord l'étape précédente"); },
  "skip-hangul": () => { if (confirm("Tu lis déjà le Hangul ? Le module sera marqué terminé et la romanisation disparaîtra.")) { state.langs.ko.hangulDone = true; save(); render(); } },
  register: (el) => { ui.registerWho = el.dataset.k; render(); },

  // Lecteur
  word: (el) => { const s = { s: +el.dataset.s, w: +el.dataset.w, g: +el.dataset.g }; ui.reader.sel = s; render(); },
  unsel: () => { ui.reader.sel = null; render(); },
  capture: () => {
    const lang = currentLang(), R = ui.reader, t = textById(lang, R.id);
    if (captureSeg(lang, t.parsed[R.sel.s], R.sel.w, R.sel.g, t.id)) toast("Ajouté aux révisions ✓");
    render();
  },
  "capture-all": () => {
    const lang = currentLang(), t = textById(lang, ui.reader.id);
    let n = 0;
    for (const { si, wi, gi } of unknownLemmas(lang, t.parsed).values()) if (captureSeg(lang, t.parsed[si], wi, gi, t.id)) n++;
    ui.reader.glossOpen = true; toast(`${plural(n, "carte ajoutée", "cartes ajoutées")} ✓`); render();
  },
  "mark-known": () => {
    const lang = currentLang(), R = ui.reader, seg = textById(lang, R.id).parsed[R.sel.s].words[R.sel.w].segs[R.sel.g];
    seg.lemmas.forEach((l) => { state.langs[lang].known[l] = true; delete state.langs[lang].unknown[l]; });
    save(); render();
  },
  "mark-unknown": () => {
    const lang = currentLang(), R = ui.reader, seg = textById(lang, R.id).parsed[R.sel.s].words[R.sel.w].segs[R.sel.g];
    seg.lemmas.forEach((l) => { delete state.langs[lang].known[l]; state.langs[lang].unknown[l] = true; });
    save(); render();
  },
  "play-all": () => playAll(currentLang()),
  stop: () => { stopAudio(); render(); },
  "play-s": async (el) => {
    const lang = currentLang(), si = +el.dataset.s, s = textById(lang, ui.reader.id).parsed[si];
    const track = trackWords(si, s, lang);
    wordTrack = track; await speak(s.text, lang); if (wordTrack === track) wordTrack = null;
  },
  fr: (el) => { const i = +el.dataset.s; ui.reader.fr[i] = !ui.reader.fr[i]; render(); },
  speed: (el) => { state.settings.speed = +el.dataset.v; save(); render(); },
  "toggle-hide": () => { ui.reader.hide = !ui.reader.hide; render(); },
  // Tableau de bord : mettre l'IA en pause / la réactiver (machine trop lente pour Ollama)
  "admin-llm": async (el) => {
    const on = el.dataset.on === "1";
    if (!on && !confirm("Mettre l'IA en pause ? Le correcteur passe hors ligne pour tout le monde, jusqu'à ce que tu la réactives.")) return;
    try { const r = await api("POST", "/api/admin/llm", { on }); features.llm = r.on; ui.admin = null; toast(r.on ? `IA réactivée (${r.engine}) ✓` : "IA en pause ⏸️"); render(); } catch (e) { toast(e.message); }
  },
  "toggle-shadow": () => { ui.reader.shadow = !ui.reader.shadow; render(); },
  "toggle-aloud": () => { if (!SpeechRec()) return toast("Ton navigateur ne reconnaît pas la voix : essaie Chrome, Edge ou Safari."); ui.reader.aloud = !ui.reader.aloud; render(); },
  "speak-check": (el) => listenSentence(currentLang(), +el.dataset.s),
  "toggle-particles": () => { state.settings.particleColors = !state.settings.particleColors; save(); render(); },
  "toggle-pinyin": () => { state.settings.pinyin = !state.settings.pinyin; save(); render(); },
  shadow: (el) => recordShadow(currentLang(), +el.dataset.s),
  "play-rec": (el) => playRec(`${ui.reader.id}:${el.dataset.s}`),
  "play-both": async (el) => { const lang = currentLang(); await speak(textById(lang, ui.reader.id).parsed[+el.dataset.s].text, lang); await playRec(`${ui.reader.id}:${el.dataset.s}`); },
  "finish-read": () => {
    const lang = currentLang(), L = state.langs[lang], id = ui.reader.id;
    if (!L.readTexts[id]) { L.readTexts[id] = true; L.xp += 5; }
    track(lang, "read");
    bumpSession(lang, "input");
    stopAudio();
    const t = textById(lang, id);
    if (t?.book) return finishChapter(lang, t);
    if (t?.questions?.length && L.books[`text:${id}`] === undefined) return void (location.hash = `#/lang/${lang}/lire/${id}/quiz`);
    location.hash = afterReading(lang);
  },

  // Révisions
  reveal: () => {
    const R = ui.review, a = document.getElementById("answer");
    if (a) R.typed = a.value.trim();
    R.revealed = true; render();
  },
  rate: (el) => {
    const R = ui.review, id = R.queue.shift();
    const card = rateCard(id, +el.dataset.g);
    if (card.due - new Date() < 20 * 60 * 1000) R.queue.push(id); // réapparaît dans la même séance
    else R.done++;
    R.revealed = false; R.typed = "";
    render();
    const next = state.cards.find((c) => c.id === R.queue[0]);
    if (next?.type === "listen") speak(next.context, next.lang);
  },

  // Production
  "check-prod": async () => {
    if (ui.prod.loading) return;
    const text = document.getElementById("prod-text").value.trim();
    if (!text) return toast("Écris d'abord une phrase ✍️");
    await checkProduction(currentLang(), text); render();
  },
  "next-ex": () => {
    const P = ui.prod, lang = currentLang();
    if (P.mode === "free") P.free = pickFree(lang, P.free?.prompt); else P.ex = pickExercise(lang, P.ex?.id);
    Object.assign(P, { text: "", result: null, why: false, llmError: null }); render();
  },
  "prod-mode": (el) => { Object.assign(ui.prod, { mode: el.dataset.v, text: "", result: null, why: false }); render(); },
  why: () => { ui.prod.why = !ui.prod.why; render(); },

  // Mots
  "toggle-known": (el) => { const L = state.langs[currentLang()]; L.known[el.dataset.l] = true; delete L.unknown[el.dataset.l]; save(); render(); },
  "toggle-unknown": (el) => { const L = state.langs[currentLang()]; delete L.known[el.dataset.l]; L.unknown[el.dataset.l] = true; save(); render(); },
  "add-frequent": () => {
    const n = addFrequent(currentLang(), 5);
    save(); toast(`${plural(n, "mot ajouté", "mots ajoutés")}, chacun avec sa phrase ✓`); render();
  },
  // Débutant complet : les premiers mots fréquents, puis on les découvre tout de suite (phrase + audio)
  "learn-first": (el) => {
    const lang = el.dataset.l, n = addFrequent(lang, FIRST_WORDS);
    if (!n) return toast("Pas de nouveau mot à apprendre pour l'instant.");
    session(lang).firstWords = true; // étape 1 validée (le test n'est plus proposé : il y a des cartes)
    save(); toast(`${n} premiers mots ajoutés, chacun avec sa phrase ✓`);
    location.hash = `#/lang/${lang}/revisions/go`;
  },
  "add-faux": () => {
    let n = 0;
    for (const f of FAUX_AMIS) {
      const i = f.s.toLowerCase().indexOf(f.lemma);
      if (i < 0) continue;
      if (addCard("en", { lemma: f.lemma, before: f.s.slice(0, i), surface: f.s.slice(i, i + f.lemma.length), after: f.s.slice(i + f.lemma.length), contextFr: f.sfr, fr: f.fr, source: "faux-amis", note: "Faux ami !" })) n++;
    }
    save(); toast(`${plural(n, "faux ami ajouté", "faux amis ajoutés")} ✓`); render();
  },

  // Oreille
  "ear-play": () => {
    const G = ui.ear, pair = EAR[G.lang].pairs[G.i];
    if (!G.target) { G.target = pair.items[Math.floor(Math.random() * pair.items.length)]; G.who = Math.floor(Math.random() * speakers(G.lang).length); }
    speak(G.target, G.lang, 0.85, speakers(G.lang)[G.who]); render();
  },
  "ear-replay": (el) => { const G = ui.ear; speak(el.dataset.w, G.lang, 0.85, speakers(G.lang)[G.who]); },
  "ear-pick": (el) => {
    const G = ui.ear; if (G.picked || !G.target) return;
    G.picked = el.dataset.w; G.n++;
    const good = G.picked === G.target; if (good) G.score++;
    const S = state.langs[G.lang].earStats, key = earKey(EAR[G.lang].pairs[G.i]);
    S[key] = { n: (S[key]?.n || 0) + 1, ok: (S[key]?.ok || 0) + (good ? 1 : 0) };
    track(G.lang, "ex"); track(G.lang, "ear"); save(); render();
  },
  "quest-claim": (el) => {
    const L = state.langs[el.dataset.l], q = weekQuests(el.dataset.l).find((x) => x.key === el.dataset.k);
    if (!q || !q.done || L.quests[q.key]) return;
    L.quests[q.key] = true; L.xp += QUEST_XP; save(); render();
    toast(weekQuests(el.dataset.l).every((x) => x.claimed) ? "Toutes les quêtes de la semaine sont faites ! 🎉" : `Quête réussie : +${QUEST_XP} XP ⭐`);
  },
  "ear-next": () => { const G = ui.ear; Object.assign(G, { i: pickPair(G.lang, G.i), target: null, picked: null }); render(); },

  // Quiz
  "quiz-pick": (el) => { const q = ui.quiz.qs[ui.quiz.queue[0]]; answerQuiz(el.dataset.o === q.answer, el.dataset.o); render(); },
  "quiz-next": () => { nextQuiz(); render(); },
  "build-l": (el) => { ui.quiz.build.l = el.dataset.x; render(); },
  "build-v": (el) => { ui.quiz.build.v = el.dataset.x; render(); },
  "build-f": (el) => { ui.quiz.build.f = el.dataset.x; render(); },
  "build-check": () => { const Q = ui.quiz, q = Q.qs[Q.queue[0]]; answerQuiz(composeHangul(Q.build.l, Q.build.v, q.finals ? Q.build.f : "") === q.target); render(); },
  "start-hangul": (el) => {
    const day = +el.dataset.day;
    startQuiz(`hangul-${day}`, hangulQuestions(day), () => {
      const K = state.langs.ko;
      if (!K.hangulDays[day]) { K.hangulDays[day] = true; K.xp += 10; }
      if (day === HANGUL_DAYS.length && !K.hangulDone) { K.hangulDone = true; toast("🎉 Hangul terminé ! La romanisation disparaît."); }
      save();
    });
    ui.quiz.started = true;
    const q = ui.quiz.qs[0]; if (q.autoplay || q.build) setTimeout(() => speak(q.audio, "ko"), 250);
    render();
  },
  "start-gram": (el) => {
    const g = KO_GRAMMAR.find((x) => x.id === el.dataset.id);
    startQuiz(`gram-${g.id}`, shuffle(g.quiz.map((q) => ({ ask: esc(q.fr), prompt: `<p class="q-sentence ko">${esc(q.q).replace("___", '<span class="blank">＿＿</span>')}</p>`, options: shuffle(q.o), answer: q.a, optCls: "ko", after: `<span class="ko">${esc(q.q.replace("___", q.a).replace(/^\(.*?\)\s*/, ""))}</span>` }))), () => {
      const K = state.langs.ko;
      if (!K.grammarDone[g.id]) { K.grammarDone[g.id] = true; K.xp += 10; g.lemmas.forEach((l) => (K.known[l] = true)); }
      save();
    });
    ui.quiz.started = true; render();
  },

  // Profil
  avatar: (el) => {
    state.avatar = el.dataset.v; save(); render();
    if (account) api("PATCH", "/api/me", { avatar_emoji: state.avatar }).then((d) => { account = d.user; }).catch((e) => toast(e.message));
  },
  "remove-photo": async () => {
    try { account = (await api("DELETE", "/api/avatar")).user; render(); toast("Photo retirée"); } catch (e) { toast(e.message); }
  },
  logout: async () => {
    await syncNow();
    if (sync.status === "error" && !confirm("Certaines modifications ne sont pas encore synchronisées et seront perdues sur cet appareil. Se déconnecter quand même ?")) return;
    try { await api("POST", "/api/logout"); } catch {}
    signOutLocal({ forget: true }); // rien ne reste sur un ordinateur partagé
    location.hash = "#/"; route(); toast("À bientôt ! 👋");
  },
  "logout-others": async () => {
    try { await api("POST", "/api/logout-others"); toast("Autres appareils déconnectés ✓"); loadSessions(); } catch (e) { toast(e.message); }
  },
  "theme-fav": (el) => {
    const id = el.dataset.t, cur = state.settings.themes;
    state.settings.themes = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    save(); render();
  },
  "lib-theme": (el) => { ui.libTheme = el.dataset.t || null; render(); },
  "admin-refresh": () => { ui.admin = null; render(); },
  "admin-doctor": async (el) => {
    el.disabled = true; el.textContent = "🩺 Diagnostic en cours…";
    try { const { machine } = await api("POST", "/api/admin/doctor"); if (ui.admin?.d) ui.admin.d.machine = machine; toast("Diagnostic terminé ✓"); }
    catch (e) { toast(e.message); }
    render();
  },
  "forgot-again": () => { ui.forgotSent = null; render(); },
  "resend-verify": async () => {
    try { const r = await api("POST", "/api/email/resend", {}); if (r.already) account.email_verified = true; toast(r.already ? "Adresse déjà confirmée ✓" : "E-mail renvoyé ✉️"); render(); }
    catch (e) { toast(e.message); }
  },
  "card-sort": (el) => { ui.cardSort = el.dataset.s; render(); },
  // Retirer = mettre en pause (réversible, et compatible avec la synchronisation entre appareils)
  "card-pause": (el) => {
    const lang = currentLang(), cards = state.cards.filter((c) => c.lang === lang && c.lemma === el.dataset.l);
    const pause = cards.some((c) => !c.paused);
    cards.forEach((c) => { if (pause) c.paused = true; else delete c.paused; });
    save(); render();
    toast(pause ? `« ${el.dataset.l} » retiré des révisions (tu peux le remettre)` : `« ${el.dataset.l} » remis en révision ✓`);
  },
  theme: (el) => { state.settings.theme = el.dataset.v; save(); render(); },
  goal: (el) => { state.goal = +el.dataset.v; save(); render(); toast("Objectif mis à jour 🎯"); },
  export: () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ cards: state.cards, review_logs: state.logs }, null, 2)], { type: "application/json" }));
    a.download = `mochi-${today()}.json`; a.click();
  },
  reset: () => {
    if (!confirm(account ? "Effacer toute ta progression, sur tous tes appareils ?" : "Effacer toute ta progression ?")) return;
    state = defaultState();
    if (account) { state.name = account.name; state.avatar = account.avatar_emoji; sync.meta.reset = true; sync.meta.snap = emptySnap(); sync.meta.times = {}; }
    save(); if (account) syncNow();
    location.hash = "#/"; toast("Progression réinitialisée");
  },
  jump: (el, e) => { e.preventDefault(); document.getElementById(`src-${el.dataset.n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); },
};

$app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || !el.dataset.act || !actions[el.dataset.act]) return;
  if (el.tagName === "BUTTON" || el.dataset.act === "locked" || el.dataset.act === "jump") e.preventDefault?.();
  ui.lastClick = { el, t: Date.now() }; // pour l'indicateur de chargement de l'audio (audio.js)
  actions[el.dataset.act](el, e);
});
let nameTimer;
$app.addEventListener("input", (e) => {
  if (e.target.id === "card-search") {
    const q = e.target.value.trim().toLowerCase(); let shown = 0;
    $app.querySelectorAll(".my-card").forEach((el) => { const hit = !q || el.dataset.search.includes(q); el.hidden = !hit; shown += hit; });
    const none = document.getElementById("card-none"); if (none) none.hidden = shown > 0;
    return;
  }
  if (e.target.id === "name") {
    state.name = e.target.value.trim(); save();
    if (account) { clearTimeout(nameTimer); nameTimer = setTimeout(() => api("PATCH", "/api/me", { name: state.name }).then((d) => { account = d.user; renderTopUser(); }).catch((er) => toast(er.message)), 600); }
  }
  const k = e.target.dataset.set;
  if (k) {
    const v = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value);
    state.settings[k] = v; save();
    if (k === "textScale" || k === "zen" || k === "particleColors") applyDisplay();
    const b = e.target.closest("label")?.querySelector("b");
    if (b) b.textContent = k === "newPerDay" ? v : `${pct(v)} %`;
  }
  if (e.target.dataset.voice) {
    const lang = e.target.dataset.voice;
    state.settings.voices = { ...state.settings.voices, [lang]: e.target.value || undefined };
    save();
    render();
  }
});
// Photo de profil : recadrée en carré 256 px dans le navigateur avant l'envoi
async function resizeImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choisis une image.");
  if (file.size > 20e6) throw new Error("Image trop lourde (20 Mo max).");
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  const webp = await new Promise((r) => c.toBlob(r, "image/webp", 0.85));
  return webp?.type === "image/webp" ? webp : new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
}
$app.addEventListener("change", async (e) => {
  if (e.target.id !== "avatar-file" || !e.target.files[0]) return;
  try {
    toast("Envoi de la photo…");
    const blob = await resizeImage(e.target.files[0]);
    account = (await api("POST", "/api/avatar", undefined, blob)).user;
    render(); toast("Photo mise à jour 📸");
  } catch (er) { toast(er.message || "Impossible de lire cette image"); }
});

// Formulaires : connexion, inscription, mot de passe, suppression
$app.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const err = form.querySelector(".form-err");
  const btn = form.querySelector("button");
  err.hidden = true; btn.disabled = true;
  try {
    const kind = form.dataset.form;
    if (kind === "signup") {
      await applyAuth(await api("POST", "/api/signup", { email: f.email.trim(), password: f.password, name: f.name, accept: f.accept === "on" }), { isNew: true });
      location.hash = "#/profil"; toast("Compte créé, bienvenue ! 🎉");
    } else if (kind === "login") {
      await applyAuth(await api("POST", "/api/login", { email: f.email.trim(), password: f.password }));
      location.hash = state.lastLang ? `#/lang/${state.lastLang}` : "#/"; toast(`Re-bonjour${account.name ? ", " + account.name : ""} ! 🍡`);
    } else if (kind === "forgot") {
      await api("POST", "/api/password/forgot", { email: f.email.trim() });
      ui.forgotSent = f.email.trim(); render();
    } else if (kind === "reset") {
      if (f.password !== f.confirm) throw new Error("Les deux mots de passe ne sont pas identiques.");
      await applyAuth(await api("POST", "/api/password/reset", { token: f.token, password: f.password }));
      history.replaceState?.(null, "", "#/profil"); route(); toast("Mot de passe changé, tu es connecté·e ✓");
    } else if (kind === "password") {
      await api("POST", "/api/password", { current: f.current, next: f.next });
      form.reset(); toast("Mot de passe mis à jour ✓"); loadSessions();
    } else if (kind === "delete") {
      if (!confirm("Supprimer définitivement ton compte et toute ta progression ?")) return;
      await api("DELETE", "/api/me", { password: f.password });
      signOutLocal({ forget: true }); location.hash = "#/"; route(); toast("Compte supprimé");
    }
  } catch (er) { err.textContent = er.message; err.hidden = false; }
  finally { btn.disabled = false; }
});

$app.addEventListener("keydown", (e) => {
  // Éléments cliquables non natifs (mots du lecteur) : Entrée ou Espace = clic
  if ((e.key === "Enter" || e.key === " ") && e.target.getAttribute?.("role") === "button" && e.target.dataset?.act) { e.preventDefault(); e.target.click(); return; }
  if (e.key !== "Enter") return;
  if (e.target.id === "answer") { e.preventDefault(); actions.reveal(); }
  if (e.target.id === "prod-text" && !e.shiftKey) { e.preventDefault(); actions["check-prod"](); }
});
document.addEventListener("keydown", (e) => {
  if (!ui.review || !location.hash.endsWith("/revisions/go") || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === " " && !ui.review.revealed) { e.preventDefault(); actions.reveal(); }
  else if (ui.review.revealed && ["1", "2", "3", "4"].includes(e.key)) actions.rate({ dataset: { g: e.key } });
  else if (e.key === "r" || e.key === "R") { const c = state.cards.find((x) => x.id === ui.review.queue[0]); if (c) speak(c.context, c.lang); }
});

window.addEventListener("hashchange", route);
