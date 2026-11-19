// ============================================================
//  Mochi — mode histoire (ROADMAP P2) : Mochi part vivre un an à l'étranger.
//  Chaque chapitre = une lecture graduée (moteur de library.js) + questions +
//  une mission de conversation (missions.js) : avec l'IA si elle est disponible,
//  sinon en mode guidé (réponses au choix). Un chapitre s'ouvre quand le précédent
//  est fini ET que ses mots clés sont en révision ; en coréen, il suit aussi la
//  progression de grammaire (§6) : le mode histoire *est* le parcours, en plus motivant.
// ============================================================

// keywords : mots à mettre en révision avant le chapitre suivant
// grammar (coréen) : point de grammaire de la phase 2 requis pour ouvrir le chapitre
// Un fichier par histoire dans content/story/<langue>/, chargés par content.data.js.
const STORIES = CONTENT.stories;
for (const lang of Object.keys(STORIES)) for (const b of STORIES[lang]) registerBook(lang, b);

// ---------- Onglet « 🎬 Histoire » ----------
TABS.en.splice(1, 0, ["histoire", "🎬 Histoire"]);
TABS.ko.splice(2, 0, ["histoire", "🎬 Histoire"]);
TAB_VIEWS.histoire = (lang) => tabStory(lang);
// Coréen : comme lire et réviser, l'histoire, les thèmes et l'écoute des sons attendent le Hangul (§6)
GATED_TABS.push("histoire", "themes", "oreille");
function tabStory(lang) {
  return STORIES[lang].map((b) => {
    const done = b.chapters.filter((_, i) => chapterDone(lang, b, i)).length;
    return `<div class="card story-head">
        ${mochi("small", done ? "proud" : "curious")}
        <div><h2 class="section-title m-0"><span class="${koCls(lang)}">${esc(b.title)}</span></h2>
          <p class="muted mt-4 mb-8 mx-0">${esc(b.fr)} · ${done} / ${b.chapters.length} chapitres</p>
          <p class="m-0">${esc(b.summary)}</p></div>
      </div>
      <p class="muted"><small>Chaque chapitre : lire et écouter, 2 questions, puis une mission de conversation. Le suivant s'ouvre quand ses mots clés sont en révision${isKo(lang) ? " et que tu as vu le point de grammaire du chapitre (Parcours)" : ""}.</small></p>
      ${chapterList(lang, b)}`;
  }).join("");
}

// ---------- Mission : conversation avec l'IA, ou mode guidé ----------
function missionState(lang, b, i) {
  const key = `${b.id}:${i}`, M = MISSIONS[b.chapters[i].mission];
  if (ui.mission?.key !== key) ui.mission = { key, lang, mode: llmReady() ? "ai" : "guided", log: [{ who: "npc", text: M.opening[0], fr: M.opening[1] }], step: 0, wrong: null, order: null, loading: false, done: false, hint: "", showFr: {} };
  return ui.mission;
}
function viewMission(lang, b, i) {
  const lock = chapterLock(lang, b, i);
  if (lock || !quizDone(lang, b, i) && !isAdmin()) return `<section class="view lesson-shell"><div class="card empty">${mochi("small", "focused")}<h2>Pas encore</h2><p class="muted">${esc(lock || "Lis d'abord le chapitre et réponds aux questions.")}</p><a class="btn" href="#/lang/${lang}/livre/${b.id}">Retour</a></div></section>`;
  const M = MISSIONS[b.chapters[i].mission], S = missionState(lang, b, i), k = koCls(lang);
  const back = `#/lang/${lang}/livre/${b.id}`;
  const bubble = (m, j) => m.who === "npc"
    ? `<div class="bubble npc"><p class="${k}">${esc(m.text)}</p>
        <div class="b-tools"><button data-act="say" data-text="${esc(m.text)}" data-lang="${lang}" aria-label="Écouter">🔊</button><button data-act="mission-fr" data-j="${j}" aria-label="Traduction">🇫🇷</button></div>
        ${S.showFr[j] && m.fr ? `<p class="s-fr">${esc(m.fr)}</p>` : ""}</div>`
    : `<div class="bubble me"><p class="${k}">${esc(m.text)}</p>
        ${m.recast && m.recast !== m.text ? `<p class="recast">✏️ Plus naturel : <b class="${k}">${esc(m.recast)}</b>${m.note ? `<br/><small>${esc(m.note)}</small>` : ""}</p>` : ""}</div>`;
  let input = "";
  if (S.done) {
    input = `<div class="card celebrate">${mochi("small", "proud")}<div><h3>Mission réussie !</h3><p class="muted">+20 XP. ${i + 1 < b.chapters.length ? "Mets les mots clés en révision pour ouvrir le chapitre suivant." : "Tu as fini cette partie de l'histoire. La suite arrive bientôt !"}</p><a class="btn small" href="${back}">Continuer</a></div></div>`;
  } else if (S.mode === "ai") {
    input = `<form class="mission-form" data-mission="1">
        <textarea id="mission-text" class="input ${k}" rows="2" maxlength="300" placeholder="${isKo(lang) ? "한국어로 말해 보세요…" : "Say something in English…"}" ${S.loading ? "disabled" : ""}></textarea>
        <div class="wp-actions"><button class="btn" ${S.loading ? "disabled" : ""}>${S.loading ? "…" : "Envoyer"}</button>
          ${S.hint ? `<button type="button" class="btn ghost small" data-act="mission-hint">💡 Un indice</button>` : ""}
          <button type="button" class="btn ghost small" data-act="mission-mode" data-m="guided">Mode guidé</button></div>
        ${S.showHint && S.hint ? `<p class="card tip">💡 ${esc(S.hint)}</p>` : ""}
      </form>`;
  } else {
    const step = M.script[S.step];
    S.order ||= shuffle(step.choices.map((_, x) => x));
    input = `<p class="muted"><small>Choisis ta réplique :</small></p>
      <div class="choice-col">${S.order.map((x) => { const [t, good] = step.choices[x]; return `<button class="choice ${k} ${S.wrong === x ? "wrong" : ""}" data-act="mission-pick" data-x="${x}" ${S.wrong === x ? "disabled" : ""}>${esc(t)}</button>`; }).join("")}</div>
      ${S.wrong !== null ? `<p class="ko-msg">${esc(step.choices[S.wrong][2])}</p>` : ""}
      ${llmReady() ? `<button class="btn ghost small mt-10" data-act="mission-mode" data-m="ai">Parler librement avec l'IA</button>` : `<p class="muted"><small>Connecte-toi pour parler librement avec l'IA.</small></p>`}`;
  }
  return `<section class="view lesson-shell">
    <div class="lesson-top"><a class="close" href="${back}" aria-label="Quitter" data-act="stop">✕</a>
      <div class="grow"><h1 class="fs-1-3rem">${M.icon} ${esc(M.title)}</h1></div>
      <span class="tag">${S.mode === "ai" ? "✨ IA" : "🧭 Guidé"}</span></div>
    <div class="card tip">🎯 <b>Mission</b> : ${esc(M.goal_fr)}</div>
    <div class="chat" aria-live="polite">${S.log.map(bubble).join("")}${S.loading ? `<div class="bubble npc loading">${mochi("small", "thinking")}</div>` : ""}</div>
    ${input}
  </section>`;
}
function missionSucceeded(lang, b, i) {
  const L = state.langs[lang], key = `${b.id}:${i + 1}:mission`;
  ui.mission.done = true;
  if (!L.books[key]) { L.books[key] = true; L.xp += 20; }
  track(lang, "prod"); bumpSession(lang, "production"); save();
}
const missionCtx = () => { const S = ui.mission, lang = S.lang, [bookId, i] = [S.key.slice(0, S.key.lastIndexOf(":")), +S.key.slice(S.key.lastIndexOf(":") + 1)]; const b = bookById(lang, bookId); return { S, lang, b, i, M: MISSIONS[b.chapters[i].mission] }; };

async function missionSend(text) {
  const { S, lang, b, i, M } = missionCtx();
  if (!text || S.loading || S.done) return;
  if (S.log.filter((m) => m.who === "me").length >= 12) { toast("Longue conversation ! Essaie le mode guidé pour finir la mission."); return; }
  S.log.push({ who: "me", text }); S.loading = true; S.showHint = false; render();
  try {
    const r = await api("POST", "/api/roleplay", { mission: b.chapters[i].mission, history: S.log.map(({ who, text }) => ({ who, text })) });
    const t = r.turn, me = S.log.at(-1);
    me.recast = t.recast; me.note = t.note_fr;
    S.log.push({ who: "npc", text: t.reply, fr: t.reply_fr });
    S.hint = t.hint_fr;
    if (t.goal_reached) missionSucceeded(lang, b, i);
    speak(t.reply, lang);
  } catch (e) {
    S.log.pop();
    toast(`${e.message} Tu peux passer en mode guidé.`);
  } finally { S.loading = false; render(); document.getElementById("mission-text")?.focus(); }
}

Object.assign(actions, {
  "mission-fr": (el) => { ui.mission.showFr[el.dataset.j] = !ui.mission.showFr[el.dataset.j]; render(); },
  "mission-hint": () => { ui.mission.showHint = true; render(); },
  "mission-mode": (el) => { const S = ui.mission; S.mode = el.dataset.m; if (S.mode === "guided") { S.log = S.log.slice(0, 1); S.step = 0; S.wrong = null; S.order = null; } render(); },
  "mission-pick": (el) => {
    const { S, lang, b, i, M } = missionCtx(), x = +el.dataset.x, step = M.script[S.step], [text, good] = step.choices[x];
    if (!good) { S.wrong = x; render(); return; }
    S.log.push({ who: "me", text }); S.wrong = null; S.order = null; S.step++;
    const next = M.script[S.step];
    const line = next ? next.npc : M.end;
    S.log.push({ who: "npc", text: line[0], fr: line[1] });
    speak(line[0], lang);
    if (!next) missionSucceeded(lang, b, i);
    render();
  },
});
// Envoi d'une réplique (formulaire hors data-form : il n'est pas géré par le gestionnaire des comptes)
$app.addEventListener("submit", (e) => {
  if (!e.target.matches?.("form[data-mission]")) return;
  e.preventDefault();
  const t = document.getElementById("mission-text");
  missionSend(t?.value.trim());
});
$app.addEventListener("keydown", (e) => {
  if (e.target.id === "mission-text" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); missionSend(e.target.value.trim()); }
});
