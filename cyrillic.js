// ============================================================
//  Mochi — cyrillic.js : russe, « Alphabet cyrillique » (l'équivalent du module Hangul)
//  33 lettres, dont beaucoup ressemblent à l'alphabet latin… parfois pour tromper (Р = r, Н = n).
//  6 courtes séances : lettres familières, fausses amies, nouvelles lettres (2), voyelles
//  mouillées et signes, accent tonique. Chaque séance : écouter les exemples, puis un quiz.
//  Repères écrits POUR DES FRANCOPHONES (§6 : l'audio passe d'abord, le repère est une aide).
//  Pas de blocage : les textes restent ouverts, mais la carte est mise en avant dans Aujourd'hui.
//  Script classique chargé dans l'ordre par index.html.
// ============================================================
// item : [lettre, son pour un francophone, mot exemple, sens du mot]
const CYR_DAYS = [
  { title: "Les lettres familières", sub: "А К М О Т Е", items: [
    ["А а", "a", "мама", "maman"], ["К к", "k", "кот", "chat"], ["М м", "m", "мы", "nous"], ["О о", "o (accentué)", "дом", "maison"],
    ["Т т", "t", "там", "là-bas"], ["Е е", "ié (comme dans « pied »)", "нет", "non"],
  ] },
  { title: "Les fausses amies", sub: "В Н Р С У Х", items: [
    ["В в", "v (pas b !)", "вода", "eau"], ["Н н", "n (pas h !)", "нос", "nez"], ["Р р", "r roulé (pas p !)", "рот", "bouche"],
    ["С с", "s (pas k !)", "сок", "jus"], ["У у", "ou (pas y !)", "суп", "soupe"], ["Х х", "kh, raclé comme la jota espagnole (pas x !)", "хор", "chœur"],
  ] },
  { title: "Nouvelles lettres (1)", sub: "Б Г Д З И Й Л П Ф", items: [
    ["Б б", "b", "брат", "frère"], ["Г г", "g (toujours dur, comme « gare »)", "год", "année"], ["Д д", "d", "да", "oui"], ["З з", "z", "зал", "salle"],
    ["И и", "i", "и", "et"], ["Й й", "y bref (« ail »)", "мой", "mon"], ["Л л", "l (plus sombre qu'en français)", "лук", "oignon"], ["П п", "p", "папа", "papa"], ["Ф ф", "f", "футбол", "football"],
  ] },
  { title: "Nouvelles lettres (2)", sub: "Ж Ц Ч Ш Щ Ы Э", items: [
    ["Ж ж", "j (comme « jour »)", "жить", "vivre"], ["Ц ц", "ts", "цирк", "cirque"], ["Ч ч", "tch", "чай", "thé"], ["Ш ш", "ch dur (« chat »)", "школа", "école"],
    ["Щ щ", "ch mouillé, long et doux", "щи", "soupe aux choux"], ["Ы ы", "i dur : dis « i » en reculant la langue", "мы", "nous"], ["Э э", "è (« fête »)", "это", "c'est"],
  ] },
  { title: "Voyelles mouillées et signes", sub: "Я Ю Ё Ь Ъ", items: [
    ["Я я", "ia (« iakoute »)", "я", "je"], ["Ю ю", "iou (« youpi »)", "юг", "sud"], ["Ё ё", "io, toujours accentué (souvent écrit е)", "ёж", "hérisson"],
    ["Ь ь", "signe mou : adoucit (mouille) la consonne d'avant", "мать", "mère"], ["Ъ ъ", "signe dur : petite pause, rare", "объект", "objet"],
  ] },
  { title: "L'accent tonique", sub: "о non accentué → a · consonnes finales", kind: "stress", items: [
    ["молоко́", "on dit « malakó » : un о sans accent se prononce presque a", "молоко", "lait"], ["вода́", "« vadá »", "вода", "eau"], ["хорошо́", "« kharachó »", "хорошо", "bien"],
    ["спаси́бо", "« spassíba »", "спасибо", "merci"], ["хлеб", "« khliep » : une consonne finale s'assourdit (б → p)", "хлеб", "pain"], ["друг", "« drouk » (г → k)", "друг", "ami"],
  ] },
];
// Accent : une syllabe plus forte et plus longue ; il n'est pas écrit dans les vrais textes (sauf manuels)
const CYR_STRESS_QUIZ = [["молоко", "молоко́", "мо́локо"], ["вода", "вода́", "во́да"], ["хорошо", "хорошо́", "хо́рошо"], ["спасибо", "спаси́бо", "спа́сибо"], ["сегодня", "сего́дня", "се́годня"], ["работа", "рабо́та", "ра́бота"]];

TABS.ru = [["aujourdhui", "☀️ Aujourd'hui"], ["alphabet", "🔤 Alphabet"], ["lire", "📖 Lire"], ["themes", "🍡 Thèmes"], ["revisions", "🧠 Réviser"], ["produire", "💬 Produire"], ["mots", "📒 Mots"], ["oreille", "🎧 Oreille"]];
TAB_VIEWS.alphabet = () => tabCyrillic();

function tabCyrillic() {
  const P = state.langs.ru.alphabetDays, done = Object.keys(P).length;
  return `<div class="card phase">
      <div class="phase-head"><b>Alphabet cyrillique</b><span class="tag">${done} / ${CYR_DAYS.length} séances</span></div>
      <div class="bar"><span data-bar-w="${(done / CYR_DAYS.length) * 100}"></span></div>
      <p class="muted">33 lettres, dont plusieurs « fausses amies » : <b class="ru">Р</b> se dit r, <b class="ru">Н</b> se dit n, <b class="ru">В</b> se dit v. En quelques séances, tu lis tout. Ensuite, plus de translittération : le russe se lit en cyrillique (mais tu peux répondre en lettres latines si tu n'as pas de clavier russe).</p>
    </div>
    <div class="day-grid">${CYR_DAYS.map((d, i) => {
      const ok = !!P[i + 1];
      return `<a class="day ${ok ? "done" : ""}" href="#/lang/ru/alphabet/${i + 1}"><small>Séance ${i + 1}${ok ? " ✓" : ""}</small><b>${esc(d.title)}</b><span class="ru">${esc(d.sub)}</span></a>`;
    }).join("")}</div>`;
}

function viewCyrillic(n) {
  const i = Number(n) - 1, d = CYR_DAYS[i];
  if (!d) return viewNotFound();
  const key = `cyr-${n}`;
  if (ui.quiz?.key === key && ui.quiz.started) return viewQuiz("#/lang/ru/alphabet", d.title);
  return `<section class="view lesson-shell">
    <div class="lesson-top"><a class="close" href="#/lang/ru/alphabet" aria-label="Quitter">✕</a><div class="grow"><small class="muted">Alphabet cyrillique · séance ${n} / ${CYR_DAYS.length}</small><h1 class="fs-1-4rem">${esc(d.title)}</h1></div></div>
    ${d.kind === "stress" ? `<div class="card tip">🎯 En russe, une syllabe par mot est <b>accentuée</b> (plus forte, plus longue). Les autres voyelles s'affaiblissent : <b class="ru">молоко</b> se dit « malakó ». Dans le glossaire de Mochi, l'accent est marqué : молоко́.</div>` : ""}
    <div class="py-grid">${d.items.map(([letter, sound, word, fr]) => `<button class="card py-item" data-act="say" data-text="${esc(word)}" data-lang="ru">
      <span class="py-zh ru">${esc(letter)}</span><b class="py-py">${esc(sound)}</b><small><span class="ru">${esc(word)}</span> · ${esc(fr)}</small><span class="py-ear" aria-hidden="true">🔊</span></button>`).join("")}</div>
    <div class="center mt-20"><button class="btn" data-act="start-cyr" data-day="${n}">Je m'entraîne</button></div>
  </section>`;
}

function cyrillicQuestions(n) {
  const d = CYR_DAYS[n - 1], qs = [];
  const audio = (w) => `<button class="big-audio" data-act="say" data-text="${esc(w)}" data-lang="ru">🔊</button>`;
  if (d.kind === "stress") {
    for (const [w, right, wrong] of CYR_STRESS_QUIZ) qs.push({ ask: "Écoute : où est l'accent ?", prompt: audio(w), options: shuffle([right, wrong]), answer: right, optCls: "ru", audio: w, audioLang: "ru" });
    return shuffle(qs);
  }
  // Toutes les lettres vues jusqu'ici servent de distracteurs
  const seen = CYR_DAYS.slice(0, n).flatMap((x) => x.kind === "stress" ? [] : x.items);
  for (const [letter, sound, word] of d.items) {
    const others = shuffle([...new Set(seen.map((o) => o[1]))].filter((s) => s !== sound)).slice(0, 3);
    qs.push({ ask: `Quel son fait <b class="ru cyr-big">${esc(letter.split(" ")[0])}</b> ?`, prompt: "", options: shuffle([sound, ...others]), answer: sound, audio: word, audioLang: "ru", after: `${word}` });
    const w2 = shuffle([...new Set(seen.map((o) => o[2]))].filter((w) => w !== word)).slice(0, 2);
    qs.push({ ask: "Écoute : quel mot ?", prompt: audio(word), options: shuffle([word, ...w2]), answer: word, optCls: "ru", audio: word, audioLang: "ru" });
  }
  return shuffle(qs);
}

Object.assign(actions, {
  "start-cyr": (el) => {
    const n = +el.dataset.day;
    startQuiz(`cyr-${n}`, cyrillicQuestions(n), () => {
      const L = state.langs.ru;
      if (!L.alphabetDays[n]) { L.alphabetDays[n] = true; L.xp += 15; }
      save();
    });
    ui.quiz.started = true;
    render();
  },
});

function cyrillicTodayCard() {
  const n = Object.keys(state.langs.ru.alphabetDays).length;
  if (n >= CYR_DAYS.length) return "";
  return `<div class="card phase hangul-first">
    <div class="phase-head"><b>Alphabet cyrillique</b><span class="tag">${n} / ${CYR_DAYS.length} séances</span></div>
    <div class="bar"><span data-bar-w="${(n / CYR_DAYS.length) * 100}"></span></div>
    <p class="muted">${n ? "Continue : encore quelques lettres et tu lis tout." : "Le russe s'écrit en cyrillique. Bonne nouvelle : en 6 séances de quelques minutes, tu sais le lire."}</p>
    <a class="btn ${n ? "ghost" : ""}" href="#/lang/ru/alphabet/${n + 1}">${n ? `Séance ${n + 1}` : "Commencer : les lettres familières"}</a></div>`;
}
