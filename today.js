// ============================================================
//  Mochi — today.js : Session du jour, série, recast, accueil, tableau de bord d'une langue, quêtes, onglet Aujourd'hui
//  Script classique chargé dans l'ordre par index.html (voir la liste là-bas) :
//  les déclarations de haut niveau sont partagées entre les fichiers.
// ============================================================
// ---------- Session du jour, série, temps (§0, §8) ----------
function lastActiveDay(lang) {
  return Object.keys(state.history).filter((d) => d < today() && state.history[d][lang]).sort().pop() || null;
}
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);
function session(lang) {
  const L = state.langs[lang];
  if (L.session.date !== today()) {
    const backlog = dueCards(lang).length, last = lastActiveDay(lang);
    const away = last && daysBetween(last, today()) >= 4;
    if (!L.catchUp && away && backlog > CATCHUP_FIRST) { L.catchUp = true; L.session = { cap: CATCHUP_FIRST, welcomeBack: backlog }; }
    else if (L.catchUp && backlog > CATCHUP_DAILY) L.session = { cap: CATCHUP_DAILY };
    else { L.catchUp = false; L.session = {}; }
    Object.assign(L.session, { date: today(), input: false, review: false, production: false, captured: 0, reviewed: 0 });
  }
  return L.session;
}
// Une séance compte si elle contient les révisions dues (ou au moins 10) ET un input
// ou une production (§16). Ouvrir l'appli ne suffit pas.
function sessionComplete(lang) {
  const s = session(lang);
  const reviewOk = s.review || reviewCount(lang) === 0 || (s.reviewed || 0) >= 10;
  return reviewOk && (s.input || s.production);
}
function bumpSession(lang, key) {
  const s = session(lang);
  if (key === "captured") s.captured++; else s[key] = true;
  const L = state.langs[lang];
  if (sessionComplete(lang) && !L.fullDays[today()]) {
    L.fullDays[today()] = true;
    const w = weekly(L);
    toast(w.thisWeek === WEEK_GOAL ? `🍡 Semaine régulière réussie ! Série : ${plural(w.streak, "semaine", "semaines")}` : `✓ Séance complète · ${w.thisWeek}/${WEEK_GOAL} cette semaine`);
  }
  save();
}

// Série hebdomadaire (§16) : objectif 5 jours sur 7, 2 jours de repos inclus.
// Rater un jour ne casse rien ; seule une semaine sous l'objectif remet la série à zéro.
const WEEK_GOAL = 5;
function monday(d = new Date()) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function weekDays(L, mon) {
  const d = new Date(mon), out = [];
  for (let i = 0; i < 7; i++) { out.push({ day: today(d), done: !!L.fullDays[today(d)] }); d.setDate(d.getDate() + 1); }
  return out;
}
function weekly(L) {
  const mon = monday(), days = weekDays(L, mon);
  const thisWeek = days.filter((x) => x.done).length;
  let streak = thisWeek >= WEEK_GOAL ? 1 : 0;
  for (let i = 1; i < 520; i++) {
    mon.setDate(mon.getDate() - 7);
    if (weekDays(L, mon).filter((x) => x.done).length >= WEEK_GOAL) streak++; else break;
  }
  const left = days.filter((x) => x.day >= today()).length; // jours restants, aujourd'hui compris
  const todayDone = !!L.fullDays[today()];
  return { streak, thisWeek, days, resting: !todayDone && thisWeek >= WEEK_GOAL, reachable: thisWeek + left - (todayDone ? 1 : 0) >= WEEK_GOAL };
}
const currentStreak = (L) => weekly(L).streak;
const todayMin = (L) => (L.todayDate === today() ? Math.floor(L.todaySec / 60) : 0);

let lastActivity = 0;
["click", "keydown", "pointerdown"].forEach((ev) => addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));
setInterval(() => {
  const lang = currentLang();
  const listening = (current && !current.paused) || (hasSynth() && speechSynthesis.speaking);
  if (!lang || document.hidden || (Date.now() - lastActivity > 60000 && !listening)) return;
  const L = state.langs[lang];
  if (L.todayDate !== today()) { L.todayDate = today(); L.todaySec = 0; }
  L.seconds += 15; L.todaySec += 15;
  track(lang, "sec", 15);
  save();
}, 15000);
function currentLang() { const p = location.hash.split("/"); return p[1] === "lang" && LANGUAGES[p[2]] ? p[2] : null; }

// ---------- Diff & recast (§4) ----------
function lcs(a, b, key = (x) => x) {
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = key(a[i]) === key(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Array(n).fill(false), keepB = new Array(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (key(a[i]) === key(b[j])) { keepA[i] = keepB[j] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return { len: dp[0][0], keepA, keepB };
}
const normEn = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[.,!?;:"«»]/g, "").replace(/\s+/g, " ").trim();
const normKo = (s) => s.replace(/[.,!?;:"«»~\s。，！？、：；「」]/gu, "");
// Clé de comparaison d'une réponse : le chinois s'accepte en caractères ou en pinyin (zh.js)
const normFor = (lang) => (isZh(lang) ? zhKey : isKo(lang) ? normKo : lang === "ru" ? normRu : normEn);
// Russe tapé en cyrillique : comparaison stricte (seuls l'accent tonique et ё/е sont ignorés)
const normRu = (s) => normEn(String(s).normalize("NFD").replace(/\u0301/g, "").normalize("NFC").replace(/ё/g, "е"));
const hasLatin = (s) => /[a-z]/i.test(s);
// Deux réponses sont-elles la même ? Russe tapé en latin : translittération tolérante (ru.js)
function sameAnswer(lang, typed, expected) {
  if (lang === "ru" && (hasLatin(typed) || hasLatin(expected))) return ruKey(typed) === ruKey(expected);
  return normFor(lang)(typed) === normFor(lang)(expected);
}
// Renvoie {html de la version correcte, html de la phrase de l'utilisateur, similarité}
function recast(user, target, lang) {
  // Chinois tapé en pinyin : on compare les pinyins (sans tons) et on montre la phrase avec son pinyin
  if (isZh(lang) && /[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/.test(user)) {
    const a = [...zhKey(user)], b = [...zhKey(target)], r = lcs(a, b);
    return { tHtml: `${esc(target)}<br/><small class="muted">${esc(zhPinyin(target))}</small>`, uHtml: esc(user), sim: r.len / Math.max(a.length, b.length, 1) };
  }
  if (isCjk(lang)) {
    const a = [...normKo(user)], b = [...normKo(target)];
    const r = lcs(a, b);
    let j = 0;
    const tHtml = [...target].map((ch) => (/\s|[.,!?]/.test(ch) ? esc(ch) : r.keepB[j++] ? esc(ch) : `<ins>${esc(ch)}</ins>`)).join("");
    let i = 0;
    const uHtml = [...user].map((ch) => (/\s|[.,!?]/.test(ch) ? esc(ch) : r.keepA[i++] ? esc(ch) : `<del>${esc(ch)}</del>`)).join("");
    return { tHtml, uHtml, sim: r.len / Math.max(a.length, b.length, 1) };
  }
  const a = user.trim().split(/\s+/), b = target.trim().split(/\s+/);
  const r = lcs(a, b, lang === "ru" ? ruKey : normEn); // russe : un mot tapé en latin compte
  const tHtml = b.map((w, j) => (r.keepB[j] ? esc(w) : `<ins>${esc(w)}</ins>`)).join(" ");
  const uHtml = a.map((w, i) => (r.keepA[i] ? esc(w) : `<del>${esc(w)}</del>`)).join(" ");
  return { tHtml, uHtml, sim: r.len / Math.max(a.length, b.length, 1) };
}

// Analyse coréenne : registre + particules (heuristique ; un LLM pourra prendre le relais)
function koChecks(ex, user, targetWords) {
  const issues = { register: [], particles: [] };
  const words = user.replace(/[.,!?~]/g, " ").trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || "";
  if (ex.register === "haeyo") {
    if (/(니다|니까)$/.test(last)) issues.register.push({ ok: true, msg: "C'est du 합니다체 (formel) : correct, mais plus formel que nécessaire ici. Le registre attendu est le poli en -요." });
    else if (!last.endsWith("요")) issues.register.push({ msg: `${ex.who} : on termine par -요 (registre poli 해요체). Sans -요, c'est du 반말, réservé aux proches.` });
  }
  for (const tw of targetWords) {
    const pIdx = tw.segs.findIndex((s, i) => i > 0 && s.particle);
    if (pIdx < 1) continue;
    const stem = tw.segs.slice(0, pIdx).map((s) => s.surface).join("");
    const tail = tw.segs.slice(pIdx).map((s) => s.surface).join("");
    if (!tw.segs.slice(pIdx).every((s) => s.particle)) continue;
    const uw = words.find((w) => w.startsWith(stem));
    if (!uw) continue;
    const uTail = uw.slice(stem.length);
    if (uTail && uTail !== tail) issues.particles.push({ stem, got: uTail, want: tail, lemma: tw.segs[pIdx].lemmas[0], explain: LEXICON.ko[tw.segs[pIdx].lemmas[0]]?.fr });
  }
  return issues;
}

// ---------- Sélection de contenu ----------
function recentLemmas(lang) {
  return new Set(state.cards.filter((c) => c.lang === lang).sort((a, b) => b.created.localeCompare(a.created)).slice(0, 30).flatMap((c) => c.lemma.split(" + ")));
}
function currentExercise(lang) {
  if (!ui.prod || ui.prod.lang !== lang) ui.prod = { lang, mode: "guided", ex: pickExercise(lang), free: pickFree(lang), text: "", result: null, why: false };
  return ui.prod.ex;
}
function pickExercise(lang, skipId) {
  const recent = recentLemmas(lang), done = state.langs[lang].prodDone;
  const score = (ex) => ex.words.filter((w) => recent.has(w)).length * 10 - (done[ex.id] === today() ? 100 : 0) - (done[ex.id] ? 5 : 0) + Math.random();
  return [...PRODUCTION[lang]].filter((e) => e.id !== skipId).sort((a, b) => score(b) - score(a))[0];
}

// ============================================================
//  VUES
// ============================================================
function greeting() {
  const h = new Date().getHours();
  const base = h < 6 ? "Bonne nuit" : h < 18 ? "Bonjour" : "Bonsoir";
  return state.name ? `${base}, ${esc(state.name)}` : base;
}
const fsrsWarning = () => (HAS_FSRS ? "" : `<div class="card warn">⚠️ L'algorithme FSRS n'a pas pu être chargé. Les révisions sont désactivées.</div>`);

function langCard(id, exp = false) {
  const l = LANGUAGES[id], L = state.langs[id];
  return `
        <a class="lang-card ${id} ${exp ? "exp" : ""}" href="#/lang/${id}">
          <span class="deco">${l.deco}</span>
          <span class="flag">${l.flag}</span>
          <div><h2>${l.name}</h2><div class="hello ${koCls(id)}">${l.hello}</div></div>
          <p class="muted m-0">${l.tagline}</p>
          <div class="meta">
            ${exp ? `<span class="tag exp-tag">🧪 Expérimental · peu de contenu</span>` : `<span class="tag c">${num0(knownCount(id))} mots connus</span>`}
            <span class="tag">${L.started ? `⏱️ ${num1(L.seconds / 3600)} h` : "Débutant"}</span>
          </div>
        </a>`;
}
function viewHome() {
  const cont = state.lastLang && LANGUAGES[state.lastLang];
  return `
  <section class="view">
    <div class="hero">
      ${mochi("", "happy", true, { live: true, intro: "hello" })}
      <div>
        <span class="bubble">${greeting()} ! Je suis Mochi 🍡</span>
        <h1 class="mt-14">Quelle langue veux-tu <em>apprendre</em> aujourd'hui ?</h1>
        <p class="muted">Lire, réviser au bon moment, parler. Quelques minutes par jour.</p>
        ${cont ? `<a class="btn mt-18" href="#/lang/${state.lastLang}">Continuer ${cont.flag} ${cont.name}</a>` : ""}
      </div>
    </div>

    <h2 class="section-title">Choisis ta langue</h2>
    <div class="lang-grid">${Object.keys(LANGUAGES).filter(isStable).map((id) => langCard(id)).join("")}</div>
    ${Object.keys(LANGUAGES).some((id) => !isStable(id)) ? `<h2 class="section-title">🧪 En test</h2>
    <p class="muted mt-0">Ces langues sont toutes neuves : l'essentiel marche, mais il y a encore peu de textes.</p>
    <div class="lang-grid">${Object.keys(LANGUAGES).filter((id) => !isStable(id)).map((id) => langCard(id, true)).join("")}</div>` : ""}
    <p class="muted center more-langs"><small>D'autres langues arrivent. Une envie ? <a class="lnk" href="#/avis">Dis-le-nous</a>.</small></p>

    <h2 class="section-title">La boucle de chaque jour</h2>
    <div class="features">
      ${[
        ["📖", "1 · Lire & écouter", "Des textes dont tu connais déjà ~95 % des mots."],
        ["🫳", "2 · Capturer", "Un tap sur un mot inconnu : il devient une carte, avec sa phrase et l'audio."],
        ["🧠", "3 · Réviser", "Rappel actif, planifié par FSRS juste avant l'oubli."],
        ["💬", "4 · Produire", "Tu écris une phrase, on te renvoie la version naturelle."],
      ].map(([i, t, d]) => `<div class="card feature"><div class="ico">${i}</div><div><h3>${t}</h3><p class="muted">${d}</p></div></div>`).join("")}
    </div>
    <p class="mt-20 d-flex gap-10 wrap"><button class="btn ghost small" data-tour="open">🧭 Visite guidée du site</button><a class="btn ghost small" href="#/pourquoi">Pourquoi ça marche ? →</a></p>
  </section>`;
}

// ---------- Tableau de bord d'une langue ----------
const TABS = {
  en: [["aujourdhui", "☀️ Aujourd'hui"], ["lire", "📖 Lire"], ["themes", "🍡 Thèmes"], ["revisions", "🧠 Réviser"], ["produire", "💬 Produire"], ["mots", "📒 Mots"], ["oreille", "🎧 Oreille"], ["fauxamis", "🎭 Faux amis"]],
  ko: [["aujourdhui", "☀️ Aujourd'hui"], ["parcours", "🗺️ Parcours"], ["lire", "📖 Lire"], ["themes", "🍡 Thèmes"], ["revisions", "🧠 Réviser"], ["produire", "💬 Produire"], ["mots", "📒 Mots"], ["oreille", "🎧 Oreille"]],
};
// Vues des onglets (d'autres fichiers, comme exercises.js, peuvent en ajouter)
const TAB_VIEWS = {};
const GATED_TABS = ["lire", "revisions", "produire", "mots"]; // coréen : après le Hangul
const EX_TABS = ["exercices", "produire", "oreille"]; // Mochi se pose à gauche de l'exo (mochi-live.js)
// Admin (tools/admin.js) : toutes les leçons sont ouvertes, sans prérequis
const isAdmin = () => !!account?.is_admin;
const hangulGate = (lang) => isKo(lang) && !state.langs.ko.hangulDone && !isAdmin();
function gateCard() {
  const n = Object.keys(state.langs.ko.hangulDays).length;
  return `<div class="card empty">${mochi("small", "curious")}
    <h2>D'abord, le Hangul</h2>
    <p class="muted">L'alphabet coréen s'apprend en une semaine environ. Ensuite, plus aucune romanisation : tout se lit en Hangul.</p>
    <a class="btn" href="#/lang/ko/hangul/${Math.min(n + 1, HANGUL_DAYS.length)}">Jour ${Math.min(n + 1, HANGUL_DAYS.length)} du Hangul</a>
    <p><button class="linkish" data-act="skip-hangul">Je lis déjà le Hangul</button></p></div>`;
}

// ---------- Navigation d'une langue : 3 sections, pas un mur de boutons ----------
// Aujourd'hui (la séance guidée) · Lire (histoire, bibliothèque, thèmes) · S'entraîner (outils en cartes).
// Les identifiants d'onglets (#/lang/xx/revisions…) ne changent pas : les anciens liens marchent.
const READ_TABS = [["histoire", "🎬", "Histoire"], ["lire", "📚", "Bibliothèque"], ["themes", "🍡", "Thèmes"]];
const sectionOf = (tab) => (tab === "aujourdhui" ? "today" : READ_TABS.some(([k]) => k === tab) ? "read" : "practice");
// Outils de la section « S'entraîner » : nom en clair, à quoi ça sert, et un indicateur
function practiceTools(lang) {
  const L = state.langs[lang], due = reviewCount(lang), mine = state.cards.filter((c) => c.lang === lang).length;
  const K = state.langs.ko, hDone = Object.keys(K.hangulDays).length, gDone = KO_GRAMMAR.filter((g) => K.grammarDone[g.id]).length;
  const tools = [
    isKo(lang) && ["parcours", "🗺️", "Parcours", "L'alphabet puis la grammaire, un pas à la fois.", K.hangulDone ? `Grammaire ${gDone}/${KO_GRAMMAR.length}` : `Hangul ${hDone}/${HANGUL_DAYS.length}`],
    lang === "ru" && ["alphabet", "🔤", "Alphabet cyrillique", "Les 33 lettres, les fausses amies et l'accent tonique.", `${Object.keys(L.alphabetDays).length}/${CYR_DAYS.length} séances`],
    isZh(lang) && ["pinyin", "🎵", "Pinyin & tons", "Entendre et reconnaître les 4 tons, puis les sons du chinois.", `${Object.keys(L.pinyinDays).length}/${PINYIN_DAYS.length} séances`],
    ["revisions", "🧠", "Réviser", "Les mots à revoir aujourd'hui, au bon moment pour ne pas les oublier.", due ? `${due} à revoir` : "À jour ✓", due > 0],
    ["exercices", "🎯", "Exercices", "Dictée, phrases à remettre dans l'ordre, compréhension… tout mélangé.", ""],
    ["produire", "💬", "Écrire", "Écris une phrase : Mochi te propose une version plus naturelle.", ""],
    ["oreille", "🎧", "Écouter les sons", "Distingue les sons qui se ressemblent, avec plusieurs voix.", ""],
    lang === "en" && ["fauxamis", "🎭", "Faux amis", "Les mots qui ressemblent au français… mais ne veulent pas dire la même chose.", ""],
    ["mots", "📒", "Mes mots", "Tous les mots que tu apprends, et ceux que tu connais déjà.", mine ? `${mine} carte${mine > 1 ? "s" : ""}` : ""],
    ["en", "ko"].includes(lang) && ["niveau", "🧭", "Test de niveau", "5 minutes pour savoir où tu en es.", L.placement ? "Fait ✓" : ""],
  ];
  return tools.filter(Boolean);
}
// Une seule navigation principale par écran : le menu du haut (ordinateur) ou la barre
// du bas (mobile). Ici, seulement la sous-navigation de « Lire » et le retour d'un outil.
function langNav(lang, tab) {
  const sec = sectionOf(tab);
  const tool = sec === "practice" && tab !== "pratique" ? practiceTools(lang).find(([k]) => k === tab) : null;
  return `${sec === "read" ? `<nav class="sub-nav" aria-label="Lire">${READ_TABS.map(([k, ico, label]) => `<a class="${k === tab ? "active" : ""}" href="#/lang/${lang}/${k}" ${k === tab ? 'aria-current="page"' : ""}>${ico} ${label}</a>`).join("")}</nav>` : ""}
    ${tool ? `<div class="tool-head"><a class="lnk" href="#/lang/${lang}/pratique">← S'entraîner</a><h2>${tool[1]} ${tool[2]}</h2></div>` : ""}`;
}
function tabPractice(lang) {
  return `<p class="muted mt-0 mb-14 mx-0">Choisis un exercice. Pas d'idée ? <a class="lnk" href="#/lang/${lang}/aujourdhui">La séance du jour</a> te guide pas à pas.</p>
    <div class="tool-grid">
      ${practiceTools(lang).map(([k, ico, title, desc, badge, hot]) => `<a class="card tool-card" href="#/lang/${lang}/${k}">
        <span class="tool-ico" aria-hidden="true">${ico}</span>
        <div><h3>${title}</h3><p class="muted">${desc}</p>${badge ? `<span class="tag ${hot ? "hot" : ""}">${badge}</span>` : ""}</div>
      </a>`).join("")}
    </div>`;
}

function viewLanguage(lang, tab) {
  const l = LANGUAGES[lang];
  const L = state.langs[lang];
  const p = Math.min(100, Math.round((todayMin(L) / state.goal) * 100));
  const gated = hangulGate(lang) && GATED_TABS.includes(tab);
  const body = gated ? gateCard() : (TAB_VIEWS[tab] || tabToday)(lang);
  const hours = L.seconds / 3600;
  const lvl = LEVEL_HOURS[lang].steps[0];

  return `
  <section class="view${EX_TABS.includes(tab) && !gated ? " ex-tab" : ""}">
    <div class="lang-header">
      <span class="flag" aria-hidden="true">${l.flag}</span>
      <div class="lang-title"><h1>${l.name}</h1><div class="muted native ${koCls(lang)}">${l.native}</div></div>
      <div class="right"><a class="btn ghost small" href="#/" aria-label="Changer de langue"><span class="long">Changer de langue</span><span class="short" aria-hidden="true">Changer</span></a></div>
    </div>
    <div class="dash-grid">
      <div>
        ${langNav(lang, tab)}
        ${fsrsWarning()}
        ${EX_TABS.includes(tab) && !gated ? '<span class="mochi-spot"></span>' : ""}
        ${body}
      </div>
      <aside class="side">
        <div class="card goal">
          <div class="ring" data-vars="--p:${p}" data-label="${todayMin(L)}/${state.goal}"></div>
          <div><h3>Objectif du jour</h3><p class="muted mt-4 mb-0 mx-0">${state.goal} min · <a href="#/profil" class="lnk">modifier</a></p></div>
        </div>
        <div class="card">
          <div class="stat-grid">
            <div class="stat"><span class="ico">⏱️</span><div><b>${num1(hours)} h</b><small>d'apprentissage</small></div></div>
            <div class="stat"><span class="ico">📒</span><div><b>${num0(knownCount(lang))}</b><small>mots connus</small></div></div>
            <div class="stat"><span class="ico">📅</span><div><b>${currentStreak(L)}</b><small>${currentStreak(L) >= 2 ? "semaines régulières" : "semaine régulière"}</small></div></div>
            <div class="stat"><span class="ico">⭐</span><div><b>${num0(L.xp)}</b><small>XP</small></div></div>
          </div>
        </div>
        ${weekCard(L)}
        ${questsCard(lang)}
        ${socialCard()}
        <div class="card">
          <h3>Vers le ${lvl[0]}</h3>
          <div class="bar mt-10 mb-6 mx-0"><span data-bar-w="${Math.min(100, (hours / lvl[1]) * 100)}"></span></div>
          <small class="muted">${num1(hours)} h sur ${num0(lvl[2])} estimées. C'est un marathon : chaque session compte.</small>
        </div>
      </aside>
    </div>
  </section>`;
}

// Semaine en cours : 7 pastilles, objectif 5 (§16). Jamais de compte à rebours.
function weekCard(L) {
  const w = weekly(L), names = ["L", "M", "M", "J", "V", "S", "D"];
  const msg = w.thisWeek >= WEEK_GOAL ? "Semaine réussie ! Les jours restants sont des jours de repos."
    : w.reachable ? `Encore ${plural(WEEK_GOAL - w.thisWeek, "jour", "jours")} cette semaine. 2 jours de repos sont inclus.`
    : "Cette semaine ne comptera pas pour la série, et ce n'est pas grave : chaque séance fait progresser.";
  return `<div class="card week">
    <h3>Ma semaine · ${w.thisWeek}/${WEEK_GOAL}</h3>
    <ol class="week-dots" aria-label="Séances complètes cette semaine">${w.days.map((d, i) => `<li class="${d.done ? "done" : ""} ${d.day === today() ? "today" : ""}" title="${d.day}${d.done ? " : séance complète" : ""}"><span aria-hidden="true">${d.done ? "✓" : names[i]}</span><span class="sr-only">${d.day} ${d.done ? "fait" : "pas fait"}</span></li>`).join("")}</ol>
    <small class="muted">${msg}</small>
  </div>`;
}

// ---------- Quêtes de la semaine (ROADMAP P2, PEDAGOGIE §16) ----------
// 3 quêtes par semaine et par langue, tirées parmi les bonnes pratiques. Le tirage dépend
// seulement de la semaine et de la langue : tous les appareils voient les mêmes quêtes sans
// rien synchroniser. Les objectifs suivent l'objectif du jour (5, 10, 15 ou 20 min).
// La progression se lit dans l'historique (state.history), déjà synchronisé.
const QUEST_XP = 50;
const QUESTS = [
  { id: "read", icon: "📖", base: 3, title: (n) => `Lis ${n} texte${n > 1 ? "s" : ""}`, count: (h) => h.read },
  { id: "prod", icon: "💬", base: 10, title: (n) => `Écris ${n} phrases`, count: (h) => h.prod },
  { id: "ear", icon: "🎧", base: 30, title: (n) => `Fais ${n} essais de paires de sons`, count: (h) => h.ear },
  { id: "rev", icon: "🧠", base: 80, title: (n) => `Fais ${n} révisions`, count: (h) => h.rev },
  { id: "min", icon: "⏱️", base: 60, title: (n) => `Pratique ${n} minutes`, count: (h) => Math.floor(h.sec / 60) },
  { id: "row", icon: "🔥", base: 4, scale: false, title: (n) => `Séance complète ${n} jours de suite`, count: (h, L, days) => { let best = 0, cur = 0; for (const d of days) { cur = L.fullDays[d] ? cur + 1 : 0; best = Math.max(best, cur); } return best; } },
];
function weekQuests(lang, mon = monday()) {
  const wk = today(mon), days = Array.from({ length: 7 }, (_, i) => today(new Date(+mon + i * 864e5))).filter((d) => d <= today());
  const L = state.langs[lang], f = Math.min(1.6, Math.max(0.6, state.goal / 10));
  const h = { read: 0, prod: 0, ear: 0, rev: 0, sec: 0 };
  for (const d of days) for (const k in h) h[k] += state.history[d]?.[lang]?.[k] || 0;
  // Tirage déterministe : on trie le catalogue selon un hachage (semaine, langue, quête)
  const rank = (q) => parseInt(fnv(`${wk}|${lang}|${q.id}`), 36);
  const picked = [...QUESTS].sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  return picked.map((q) => {
    const goal = q.scale === false ? q.base : Math.max(1, Math.round((q.base * f) / (q.base >= 10 ? 5 : 1)) * (q.base >= 10 ? 5 : 1));
    const n = Math.min(goal, q.count(h, L, days));
    const key = `${wk}:${q.id}`;
    return { ...q, key, goal, n, title: q.title(goal), done: n >= goal, claimed: !!L.quests[key] };
  });
}
function questsCard(lang) {
  const qs = weekQuests(lang), left = 7 - ((new Date().getDay() + 6) % 7) - 1;
  return `<div class="card quests">
    <h3>Quêtes de la semaine</h3>
    <ul>${qs.map((q) => `<li class="${q.done ? "done" : ""}">
      <span class="q-ico" aria-hidden="true">${q.claimed ? "✅" : q.icon}</span>
      <div class="q-body"><b>${esc(q.title)}</b>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${q.goal}" aria-valuenow="${q.n}" aria-label="${esc(q.title)}"><span data-bar-w="${(q.n / q.goal) * 100}"></span></div>
        <small class="muted">${q.n} / ${q.goal}</small></div>
      ${q.done && !q.claimed ? `<button class="btn small" data-act="quest-claim" data-k="${q.key}" data-l="${lang}">+${QUEST_XP} XP</button>` : ""}
    </li>`).join("")}</ul>
    <small class="muted">${qs.every((q) => q.claimed) ? "Toutes les quêtes sont faites, bravo ! Les prochaines arrivent lundi." : left > 0 ? `Nouvelles quêtes lundi (dans ${left} jour${left > 1 ? "s" : ""}).` : "Nouvelles quêtes demain."}</small>
  </div>`;
}

function stepCard(n, icon, title, done, desc, action) {
  return `<div class="card step ${done ? "done" : ""}">
    <div class="step-n">${done ? "✓" : n}</div>
    <div class="grow"><h3>${icon} ${title}</h3><p class="muted">${desc}</p></div>
    ${action || ""}
  </div>`;
}

Object.assign(TAB_VIEWS, { pratique: (l) => tabPractice(l), aujourdhui: (l) => tabToday(l), parcours: (l) => tabPath(l), lire: (l) => tabLibrary(l), themes: (l) => tabThemes(l), revisions: (l) => tabReviews(l), produire: (l) => tabProduce(l), mots: (l) => tabWords(l), oreille: (l) => tabEar(l), fauxamis: (l) => tabFauxAmis(l) });

// Débutant complet : aucun texte lisible (< 80 %) et presque aucun mot connu (PEDAGOGIE §3).
// On ne propose pas un texte à 12 % : d'abord le test de niveau ou les premiers mots.
const BEGINNER_COVERAGE = 0.8, BEGINNER_WORDS = 50, FIRST_WORDS = 10;
const isBeginner = (lang, best) => best.c < BEGINNER_COVERAGE && knownCount(lang) < BEGINNER_WORDS;

// Chinois / russe : tons ou alphabet pas encore commencés → c'est l'action principale (charte §3)
const scriptPending = (lang) => (isZh(lang) && !Object.keys(state.langs.zh.pinyinDays).length) || (lang === "ru" && !Object.keys(state.langs.ru.alphabetDays).length);
function tabToday(lang) {
  if (hangulGate(lang)) {
    // Coréen, Hangul pas fini : une seule action principale, le jour suivant du Hangul (charte §3)
    const n = Object.keys(state.langs.ko.hangulDays).length, next = Math.min(n + 1, HANGUL_DAYS.length);
    return `<div class="card phase hangul-first">
        <div class="phase-head"><b>Phase 1 · Le Hangul</b><span class="tag">${n} / ${HANGUL_DAYS.length} jours</span></div>
        <div class="bar"><span data-bar-w="${(n / HANGUL_DAYS.length) * 100}"></span></div>
        <p class="muted">L'alphabet coréen s'apprend en ${HANGUL_DAYS.length} petites séances. Ensuite, plus aucune romanisation : tout se lit en Hangul.</p>
        <a class="btn" href="#/lang/ko/hangul/${next}">${n ? `Continuer : jour ${next}` : "Commencer le jour 1"}</a>
      </div>
      <div class="card offer compact"><p class="muted"><b>Tu lis déjà le Hangul ?</b> Passe directement à la suite, ou fais le test de niveau.</p>
        <div class="wp-actions"><button class="btn ghost small" data-act="skip-hangul">Je lis déjà le Hangul</button>${placementPending(lang) ? `<a class="btn ghost small" href="#/lang/ko/niveau">Faire le test</a>` : ""}</div></div>`;
  }
  const s = session(lang);
  const best = rankedTexts(lang)[0];
  const due = reviewQueue(lang).length, fresh = newCards(lang).length;
  const hasCards = state.cards.some((c) => c.lang === lang);
  const reviewDone = s.review || due + fresh === 0;
  const ex = currentExercise(lang);
  const all = sessionComplete(lang);
  const w = weekly(state.langs[lang]);
  const beginner = isBeginner(lang, best);
  const step1Done = s.input || (beginner && s.firstWords);
  const nextStep = !step1Done ? 1 : !reviewDone ? 3 : !s.production ? 4 : 0;
  const step1 = !beginner
    ? stepCard(1, "📖", "Lire & écouter", s.input,
      `${esc(best.t.title)} · tu connais ~${pct(best.c)} % des mots${best.z.k === "gloss" ? " (avec glossaire)" : ""}.`,
      `<a class="btn small ${nextStep === 1 ? "" : "ghost"}" href="#/lang/${lang}/lire/${best.t.id}">Lire</a>`)
    : placementPending(lang)
      ? stepCard(1, "🧭", "Faire le test de niveau (5 min)", false,
        "Pour savoir quels mots tu connais déjà. Tu débutes vraiment ? Commence par tes premiers mots.",
        `<div class="step-acts"><a class="btn small" href="#/lang/${lang}/niveau">Faire le test</a><button class="btn ghost small" data-act="learn-first" data-l="${lang}">🌱 Mes ${FIRST_WORDS} premiers mots</button></div>`)
      : stepCard(1, "🌱", `Apprendre mes ${FIRST_WORDS} premiers mots`, step1Done,
        step1Done ? "Tes premiers mots sont dans tes révisions : chacun avec sa phrase et son audio." : "Les mots les plus fréquents d'abord, chacun dans sa phrase et avec son audio. Les textes deviendront lisibles très vite.",
        step1Done ? "" : `<button class="btn small ${scriptPending(lang) ? "ghost" : ""}" data-act="learn-first" data-l="${lang}">Apprendre</button>`);
  return `
    ${isZh(lang) && typeof pinyinTodayCard === "function" ? pinyinTodayCard() : ""}
    ${lang === "ru" && typeof cyrillicTodayCard === "function" ? cyrillicTodayCard() : ""}
    ${beginner ? "" : placementOffer(lang)}
    ${s.welcomeBack ? `<div class="card celebrate">${mochi("small", "happy", true, { live: true, intro: "welcome" })}<div><h3>Content de te revoir !</h3><p class="muted">On reprend en douceur : ${CATCHUP_FIRST} révisions aujourd'hui, le reste plus tard, réparti sur les prochains jours. Pas de nouvelles cartes en attendant.</p></div></div>` : ""}
    ${all ? `<div class="card celebrate">${mochi("small", w.thisWeek >= WEEK_GOAL ? "proud" : "happy", true, { live: true, intro: "done" })}<div><h3>Séance du jour bouclée</h3><p class="muted">${w.thisWeek}/${WEEK_GOAL} jours cette semaine. Tu peux continuer, mais l'essentiel est fait.</p></div></div>`
      : w.resting ? `<div class="card celebrate">${mochi("small", "sleepy", true, { live: true, intro: "rest" })}<div><h3>Jour de repos possible</h3><p class="muted">Objectif de la semaine atteint. Mochi fait la sieste, ta série est en sécurité. Tu peux quand même pratiquer si tu en as envie.</p></div></div>` : ""}
    ${step1}
    ${stepCard(2, "🫳", "Capturer", s.captured > 0, s.captured ? `${plural(s.captured, "mot capturé", "mots capturés")} aujourd'hui.` : "Pendant la lecture, touche un mot inconnu pour l'ajouter.", "")}
    ${stepCard(3, "🧠", "Réviser", reviewDone && hasCards, !hasCards ? "Pas encore de cartes : elles arrivent avec tes premiers mots." : due + fresh ? `${plural(due, "carte", "cartes")} à revoir, ${plural(fresh, "nouvelle", "nouvelles")}.` : "Rien à réviser pour l'instant.",
      due + fresh ? `<a class="btn small ${nextStep === 3 ? "" : "ghost"}" href="#/lang/${lang}/revisions/go">Réviser</a>` : "")}
    ${stepCard(4, "💬", "Produire", s.production, `« ${esc(ex.prompt)} »`, `<a class="btn small ${nextStep === 4 ? "" : "ghost"}" href="#/lang/${lang}/produire">Écrire</a>`)}
  `;
}
