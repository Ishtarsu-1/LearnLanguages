// ============================================================
//  Mochi — pinyin.js : chinois, « Pinyin & tons » (l'équivalent du module Hangul)
//  Le chinois se lit avec le pinyin au-dessus des caractères ; avant tout, il faut entendre et
//  reconnaître les 4 tons. 6 courtes séances : les tons, les initiales (3), les finales, les
//  changements de ton. Chaque séance : écouter les exemples, puis un quiz d'écoute.
//  Repères écrits POUR DES FRANCOPHONES (comme le Hangul, §6) : l'audio passe d'abord.
//  Pas de blocage : les textes restent ouverts (le pinyin s'affiche au-dessus des mots).
//  Script classique chargé dans l'ordre par index.html.
// ============================================================
// item : [caractère, pinyin, repère pour un francophone]
const PINYIN_DAYS = [
  { title: "Les quatre tons", sub: "mā má mǎ mà ma", kind: "tones", items: [
    ["妈", "mā", "1er ton : haut et plat, comme une note tenue (« maman »)"],
    ["麻", "má", "2e ton : montant, comme un « hein ? » étonné (« chanvre »)"],
    ["马", "mǎ", "3e ton : bas, il descend puis remonte un peu (« cheval »)"],
    ["骂", "mà", "4e ton : descendant et sec, comme un « non ! » (« gronder »)"],
    ["吗", "ma", "ton neutre : court et léger (particule de question)"],
  ] },
  { title: "Initiales (1)", sub: "b p m f · d t n l", kind: "sounds", items: [
    ["爸", "bà", "b = un p SANS souffle (proche du p français)"], ["怕", "pà", "p = p soufflé (un petit « h » après)"],
    ["妈", "mā", "m comme en français"], ["饭", "fàn", "f comme en français"],
    ["大", "dà", "d = un t SANS souffle"], ["他", "tā", "t = t soufflé"],
    ["你", "nǐ", "n comme en français"], ["来", "lái", "l comme en français"],
  ] },
  { title: "Initiales (2)", sub: "g k h · j q x", kind: "sounds", items: [
    ["哥", "gē", "g = un k SANS souffle"], ["看", "kàn", "k = k soufflé"], ["喝", "hē", "h = un « r » raclé doux, au fond de la gorge"],
    ["鸡", "jī", "j ≈ « dj » doux, la langue contre les dents du bas"], ["去", "qù", "q ≈ « tch » soufflé (jamais un « k » !)"], ["小", "xiǎo", "x ≈ entre « s » et « ch », sourire aux lèvres"],
  ] },
  { title: "Initiales (3)", sub: "zh ch sh r · z c s", kind: "sounds", items: [
    ["中", "zhōng", "zh ≈ « dj » avec la langue retroussée vers le palais"], ["吃", "chī", "ch ≈ « tch » soufflé, langue retroussée"], ["是", "shì", "sh ≈ « ch » français, langue retroussée"],
    ["人", "rén", "r ≈ entre le « j » de « jour » et un r anglais"], ["在", "zài", "z ≈ « dz »"], ["菜", "cài", "c ≈ « ts » soufflé (jamais un « k » !)"], ["四", "sì", "s comme en français"],
  ] },
  { title: "Les finales", sub: "a o e i u ü · ai ao ou · an ang", kind: "sounds", items: [
    ["爱", "ài", "ai ≈ « aïe »"], ["北", "běi", "ei ≈ « eille » de « bouteille »"], ["好", "hǎo", "ao ≈ « ao » (un a qui glisse vers o)"], ["走", "zǒu", "ou ≈ « ô-ou »"],
    ["女", "nǚ", "ü = le « u » français de « lune »"], ["我", "wǒ", "uo ≈ « wo »"], ["三", "sān", "an : a + n bien prononcé"], ["忙", "máng", "ang : a + « ng » de « parking »"],
  ] },
  { title: "Changements de ton", sub: "3e + 3e · 不 · 一", kind: "sandhi", items: [
    ["你好", "ní hǎo", "deux 3es tons à la suite : le premier devient un 2e ton (écrit nǐ hǎo)", "nǐ hǎo"],
    ["很好", "hén hǎo", "même règle : hěn + hǎo → hén hǎo", "hěn hǎo"],
    ["不是", "bú shì", "不 (bù) devient bú devant un 4e ton", "bù shì"],
    ["不好", "bù hǎo", "devant les tons 1, 2 et 3, 不 reste bù", "bú hǎo"],
    ["一起", "yì qǐ", "一 (yī) devient yì devant les tons 1, 2 et 3", "yī qǐ"],
    ["一个", "yí gè", "… et yí devant un 4e ton", "yì gè"],
  ] },
];
const TONE_NAMES = ["1er ton (ā)", "2e ton (á)", "3e ton (ǎ)", "4e ton (à)", "ton neutre"];
// Ton d'une syllabe de pinyin : 1 à 4, ou 5 (neutre)
function toneOf(py) {
  const marks = { 1: /[āēīōūǖ]/, 2: /[áéíóúǘ]/, 3: /[ǎěǐǒǔǚ]/, 4: /[àèìòùǜ]/ };
  for (const [t, re] of Object.entries(marks)) if (re.test(py)) return Number(t);
  return 5;
}

TABS.zh = [["aujourdhui", "☀️ Aujourd'hui"], ["pinyin", "🎵 Pinyin & tons"], ["lire", "📖 Lire"], ["themes", "🍡 Thèmes"], ["revisions", "🧠 Réviser"], ["produire", "💬 Produire"], ["mots", "📒 Mots"], ["oreille", "🎧 Oreille"]];
TAB_VIEWS.pinyin = () => tabPinyin();

function tabPinyin() {
  const P = state.langs.zh.pinyinDays, done = Object.keys(P).length;
  return `<div class="card phase">
      <div class="phase-head"><b>Pinyin & tons</b><span class="tag">${done} / ${PINYIN_DAYS.length} séances</span></div>
      <div class="bar"><span data-bar-w="${(done / PINYIN_DAYS.length) * 100}"></span></div>
      <p class="muted">En chinois, le ton change le sens : <b class="zh">妈</b> mā (maman) n'est pas <b class="zh">马</b> mǎ (cheval). Écoute d'abord, les repères écrits ne sont qu'une aide. Dans les textes, le pinyin s'affiche au-dessus des caractères (bouton « 拼 Pinyin » pour le masquer).</p>
    </div>
    <div class="day-grid">${PINYIN_DAYS.map((d, i) => {
      const ok = !!P[i + 1];
      return `<a class="day ${ok ? "done" : ""}" href="#/lang/zh/pinyin/${i + 1}"><small>Séance ${i + 1}${ok ? " ✓" : ""}</small><b>${esc(d.title)}</b><span>${esc(d.sub)}</span></a>`;
    }).join("")}</div>`;
}

function viewPinyin(n) {
  const i = Number(n) - 1, d = PINYIN_DAYS[i];
  if (!d) return viewNotFound();
  const key = `pinyin-${n}`;
  if (ui.quiz?.key === key && ui.quiz.started) return viewQuiz("#/lang/zh/pinyin", d.title);
  return `<section class="view lesson-shell">
    <div class="lesson-top"><a class="close" href="#/lang/zh/pinyin" aria-label="Quitter">✕</a><div class="grow"><small class="muted">Pinyin & tons · séance ${n} / ${PINYIN_DAYS.length}</small><h1 class="fs-1-4rem">${esc(d.title)}</h1></div></div>
    ${d.kind === "tones" ? `<div class="card tip">🎵 Écoute chaque syllabe plusieurs fois. Astuce : dessine le ton avec la main (plat, monte, creux, descend).</div>` : ""}
    <div class="py-grid">${d.items.map(([zh, py, hint]) => `<button class="card py-item" data-act="say" data-text="${esc(zh)}" data-lang="zh">
      <span class="py-zh zh">${esc(zh)}</span><b class="py-py">${esc(py)}</b><small class="muted">${esc(hint)}</small><span class="py-ear" aria-hidden="true">🔊</span></button>`).join("")}</div>
    <div class="center mt-20"><button class="btn" data-act="start-pinyin" data-day="${n}">Je m'entraîne</button></div>
  </section>`;
}

// Les tons dans de vrais mots (séance 1)
const PINYIN_TONE_WORDS = [["好", "hǎo"], ["去", "qù"], ["人", "rén"], ["他", "tā"], ["是", "shì"], ["茶", "chá"]];
// Quiz d'écoute : reconnaître le ton (séance 1), la syllabe (initiales, finales), la bonne lecture (changements de ton)
function pinyinQuestions(n) {
  const d = PINYIN_DAYS[n - 1], qs = [];
  const audio = (zh) => `<button class="big-audio" data-act="say" data-text="${esc(zh)}" data-lang="zh">🔊</button>`;
  for (const [zh, py, , wrong] of d.items) {
    if (d.kind === "tones") qs.push({ ask: "Écoute : quel ton ?", prompt: audio(zh), options: TONE_NAMES.slice(0, 5), answer: TONE_NAMES[toneOf(py) - 1], audio: zh, audioLang: "zh", after: `${zh} = ${py}` });
    else if (d.kind === "sounds") {
      const others = shuffle(d.items.filter(([z]) => z !== zh)).slice(0, 2).map(([, p]) => p);
      qs.push({ ask: "Écoute : quelle syllabe ?", prompt: audio(zh), options: shuffle([py, ...others]), answer: py, audio: zh, audioLang: "zh", after: `${zh} = ${py}` });
    } else {
      qs.push({ ask: `Comment se prononce <b class="zh">${esc(zh)}</b> ?`, prompt: audio(zh), options: shuffle([py, wrong]), answer: py, audio: zh, audioLang: "zh" });
    }
  }
  // Séance des tons : aussi des syllabes déjà vues ailleurs (les tons dans de vrais mots)
  if (d.kind === "tones") for (const [zh, py] of PINYIN_TONE_WORDS) qs.push({ ask: "Écoute : quel ton ?", prompt: audio(zh), options: TONE_NAMES.slice(0, 4), answer: TONE_NAMES[toneOf(py) - 1], audio: zh, audioLang: "zh", after: `${zh} = ${py}` });
  return shuffle(qs);
}

Object.assign(actions, {
  "start-pinyin": (el) => {
    const n = +el.dataset.day;
    startQuiz(`pinyin-${n}`, pinyinQuestions(n), () => {
      const L = state.langs.zh;
      if (!L.pinyinDays[n]) { L.pinyinDays[n] = true; L.xp += 15; }
      save();
    });
    ui.quiz.started = true;
    render();
  },
});

// Carte « Aujourd'hui » : les tons d'abord (sans bloquer la lecture)
function pinyinTodayCard() {
  const n = Object.keys(state.langs.zh.pinyinDays).length;
  if (n >= PINYIN_DAYS.length) return "";
  return `<div class="card phase hangul-first">
    <div class="phase-head"><b>Pinyin & tons</b><span class="tag">${n} / ${PINYIN_DAYS.length} séances</span></div>
    <div class="bar"><span data-bar-w="${(n / PINYIN_DAYS.length) * 100}"></span></div>
    <p class="muted">${n ? "Continue : quelques minutes pour bien entendre les tons." : "En chinois, le ton change le sens d'un mot. Commence par apprendre à les entendre : 6 séances de quelques minutes."}</p>
    <a class="btn ${n ? "ghost" : ""}" href="#/lang/zh/pinyin/${n + 1}">${n ? `Séance ${n + 1}` : "Commencer : les quatre tons"}</a></div>`;
}
