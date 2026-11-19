// ============================================================
//  Mochi — contenu pédagogique (voir PEDAGOGIE.md)
// ============================================================
//
//  FORMAT DES PHRASES ANNOTÉES
//  Les mots sont séparés par des espaces. Chaque mot peut être découpé en
//  morceaux avec « | » (utile en coréen : nom|particule). Chaque morceau :
//     surface            → lemme = la surface (en minuscules pour l'anglais)
//     surface=lemme      → lemme explicite (forme fléchie → forme de base)
//     surface=l1+l2      → plusieurs lemmes (contractions : it's=it+be)
//     @surface           → nom propre (exclu du calcul de couverture)
//  La ponctuation en fin de mot est ignorée pour la couverture.
//  En coréen, un morceau placé après « | » dont le lemme est une particule
//  est surligné comme particule (§6).
//
//  Les textes d'origine sont annotés à la main. Le nouveau contenu est annoté par
//  tools/annotate.js (coréen : analyseur Kiwi ; anglais : lemmatiseur), puis relu
//  (CONTENU-PIPELINE.md). Les données vivent dans content/, pas ici.

const KO_PARTICLES = new Set(["은", "는", "이", "가", "을", "를", "에", "에서", "도", "의", "와", "과", "하고", "로", "으로", "랑", "이랑", "한테", "께"]);

// ---------- Lexiques (ordonnés du plus fréquent au moins fréquent) ----------
// Données dans content/lexicon/*.json, chargées par content.data.js (npm run content:build).
// cog: mot transparent FR/EN (compté « probablement connu », §7) ; faux: faux ami (jamais compté comme transparent)
const LEXICON = CONTENT.lexicon;

// ---------- Anti-interférence (§12) ----------
// Catégories sémantiques (semantic_group dans le lexique) : jamais deux nouveaux mots du même
// groupe le même jour (apprendre « tous les fruits » d'un coup crée de la confusion).
// Paires d'opposés et quasi-synonymes (confusable_with) : jamais introduites le même jour.
const SEMANTIC_GROUPS = {}, CONFUSABLE = {};
for (const [lang, lex] of Object.entries(LEXICON)) {
  SEMANTIC_GROUPS[lang] = {}; CONFUSABLE[lang] = [];
  const pairs = new Set();
  for (const [w, e] of Object.entries(lex)) {
    if (e.semantic_group) (SEMANTIC_GROUPS[lang][e.semantic_group] ||= []).push(w);
    for (const c of e.confusable_with || []) { const k = [w, c].sort().join("\u0000"); if (!pairs.has(k)) { pairs.add(k); CONFUSABLE[lang].push([w, c]); } }
  }
}

// ---------- Thèmes de situation (PEDAGOGIE §12, ROADMAP « thèmes et situations ») ----------
// Un thème = des mots qui vont ensemble dans une scène. Chaque texte porte themes[].
// Les mots d'un thème sont déduits de ses textes (themeWords dans lessons.js) : le socle de
// fréquence (mots présents dans 3 thèmes ou plus, et les particules) n'appartient à aucun thème.
// fill : saveur de Mochi associée (CHARTE-GRAPHIQUE §8), uniquement pour l'illustration.
const THEMES = [
  { id: "cafe", name: "Au café", icon: "☕", flavor: "Matcha", fill: "#B9DDB0" },
  { id: "rencontre", name: "Rencontrer quelqu'un", icon: "👋", flavor: "Sakura", fill: "#F6C1D3" },
  { id: "transports", name: "Les transports", icon: "🚇", flavor: "Myrtille", fill: "#B9CBF3" },
  { id: "cuisine", name: "Cuisine", icon: "🍳", flavor: "Kaki", fill: "#F7C29A" },
  { id: "sport", name: "Le sport", icon: "⚽", flavor: "Yuzu", fill: "#F9DE8A" },
  { id: "series", name: "Séries & K-drama", icon: "📺", flavor: "Ube", fill: "#CDB8EE" },
  { id: "gaming", name: "Gaming", icon: "🎮", flavor: "Sésame noir", fill: "#5B5160", dark: true },
  { id: "travail", name: "Au travail", icon: "💼", flavor: "Injeolmi", fill: "#E7CC98" },
];

// ---------- Contenus d'input (§3, §5) ----------
// Formats conversationnels en priorité (§7). Registre 해요체 par défaut en coréen (§6).
// Un fichier par texte dans content/texts/<langue>/, chargés par content.data.js.
const TEXTS = CONTENT.texts;

// ---------- Production (§4) ----------
// target : réponse de référence annotée ; accept : variantes acceptables (pas de sur-correction)
// register (coréen) : registre attendu selon l'interlocuteur
const PRODUCTION = {
  en: [
    { id: "p-en-1", prompt: "Demande un thé, poliment.", target: "Can I have a tea, please?", accept: ["Can I have a tea please?", "Could I have a tea, please?", "Can I get a tea, please?", "A tea, please."], words: ["have", "please"], why: "« Can I have… ? » est la formule naturelle pour commander. « please » se place à la fin." },
    { id: "p-en-2", prompt: "Dis que tu habites à côté.", target: "I live next door.", accept: [], words: ["live", "next", "door"], why: "« next door » = la porte d'à côté, à côté de chez quelqu'un. Pas d'article : on ne dit pas « the next door »." },
    { id: "p-en-3", prompt: "Dis que tu travailles dans un hôpital.", target: "I work in a hospital.", accept: ["I work at a hospital."], words: ["work", "hospital"], why: "Le présent simple (I work) décrit une habitude ou un fait stable. On met l'article « a » devant hospital." },
    { id: "p-en-4", prompt: "Demande où est la bibliothèque.", target: "Where is=be the library?", accept: ["Where's the library?", "Excuse me, where is the library?", "Excuse me, where's the library?"], words: ["library", "where"], why: "Attention, faux ami : library = bibliothèque. Une librairie se dit « bookshop »." },
    { id: "p-en-5", prompt: "Dis : « En fait, je voulais rester à la maison. »", target: "Actually, I wanted=want to stay home.", accept: ["Actually, I wanted to stay at home.", "Actually I wanted to stay home."], words: ["actually", "stay", "want"], why: "« Actually » = en fait (jamais « actuellement », qui se dit « currently »). « want to + verbe »." },
    { id: "p-en-6", prompt: "Dis que tu es allé(e) au cinéma avec ta sœur.", target: "I went=go to the cinema with my sister.", accept: ["I went to the movies with my sister."], words: ["go", "cinema", "sister"], why: "« went » est le passé irrégulier de « go ». Possessif : my sister (pas « the sister »)." },
    { id: "p-en-7", prompt: "Demande combien ça coûte.", target: "How much is=be it?", accept: ["How much does it cost?", "How much is this?", "How much is that?"], words: ["much", "how"], why: "« How much » pour un prix (indénombrable : l'argent)." },
  ],
  ko: [
    { id: "p-ko-1", who: "À un serveur", register: "haeyo", prompt: "Demande un americano.", target: "아메리카노 한=하나 잔 주세요=주다.", accept: ["아메리카노 주세요.", "아메리카노 하나 주세요.", "아메리카노 한 잔 주세요."], words: ["주다", "잔"], why: "Nom + nombre natif + compteur + 주세요. 하나 devient 한 devant un compteur (잔)." },
    { id: "p-ko-2", who: "À un inconnu", register: "haeyo", prompt: "Dis que tu es étudiant(e).", target: "저|는 학생|이에요=이다.", accept: ["학생이에요.", "저 학생이에요."], words: ["학생", "이다"], why: "학생 finit par une consonne (ㅇ) → 이에요. Après une voyelle, ce serait 예요 (민지예요)." },
    { id: "p-ko-3", who: "À un inconnu", register: "haeyo", prompt: "Dis que tu aimes le café.", target: "저|는 커피|를 좋아해요=좋아하다.", accept: ["커피를 좋아해요.", "커피 좋아해요.", "저는 커피 좋아해요."], words: ["커피", "좋아하다"], why: "L'objet prend 를 après une voyelle (커피를), 을 après une consonne. À l'oral, on l'omet souvent." },
    { id: "p-ko-4", who: "À un inconnu", register: "haeyo", prompt: "Dis que tu habites à Séoul.", target: "저|는 @서울|에 살아요=살다.", accept: ["서울에 살아요.", "서울에서 살아요.", "저는 서울에서 살아요."], words: ["살다"], why: "Avec 살다, 에 et 에서 sont tous les deux corrects." },
    { id: "p-ko-5", who: "À un(e) collègue", register: "haeyo", prompt: "Dis que tu as mangé des tteokbokki au marché.", target: "시장|에서 떡볶이|를 먹었어요=먹다.", accept: ["저는 시장에서 떡볶이를 먹었어요.", "시장에서 떡볶이 먹었어요."], words: ["시장", "떡볶이", "먹다"], why: "에서 marque le lieu où se déroule une action (manger). 에 servirait pour une destination ou une existence." },
    { id: "p-ko-6", who: "À un inconnu", register: "haeyo", prompt: "Dis que le film était vraiment bien.", target: "영화|가 정말 재미있었어요=재미있다.", accept: ["영화가 재미있었어요.", "영화 정말 재미있었어요.", "영화가 진짜 재미있었어요."], words: ["영화", "재미있다", "정말"], why: "Le sujet prend 가 après une voyelle (영화가). Passé poli : -었어요." },
    { id: "p-ko-7", who: "À ta prof", register: "haeyo", prompt: "Dis que ta famille compte quatre personnes.", target: "우리 가족|은 네=넷 명|이에요=이다.", accept: ["저희 가족은 네 명이에요.", "가족은 네 명이에요."], words: ["가족", "넷", "명"], why: "On compte les personnes avec les nombres natifs + 명. 넷 devient 네 devant un compteur." },
  ],
  zh: [
    { id: "p-zh-1", who: "Au serveur", prompt: "Demande un thé, poliment.", target: "我 要 一 杯 茶， 谢谢。", accept: ["我要一杯茶。", "请给我一杯茶。", "我要茶，谢谢。"], words: ["要", "杯"], why: "我要… = « je voudrais… ». Entre le nombre et le nom, il faut un classificateur : 一杯茶 (une tasse de thé)." },
    { id: "p-zh-2", prompt: "Dis que tu es étudiant(e).", target: "我 是 学生。", accept: ["我是学生"], words: ["是", "学生"], why: "是 relie deux noms : 我是学生. Pas de conjugaison en chinois : 是 ne change jamais." },
    { id: "p-zh-3", prompt: "Dis que tu aimes le café.", target: "我 喜欢 咖啡。", accept: ["我很喜欢咖啡。", "我喜欢喝咖啡。"], words: ["喜欢", "咖啡"], why: "Sujet + verbe + objet, comme en français. 很 (très) se place devant le verbe : 我很喜欢咖啡." },
    { id: "p-zh-4", prompt: "Demande combien ça coûte.", target: "多少 钱？", accept: ["这个多少钱？", "多少钱"], words: ["多少", "钱"], why: "多少钱 ? = « combien d'argent ? ». C'est LA question pour un prix." },
    { id: "p-zh-5", prompt: "Dis que tu habites à Pékin.", target: "我 住 在 @北京。", accept: ["我住北京。", "我在北京住。"], words: ["住", "在"], why: "住在 + lieu = habiter à. Le lieu vient après 在." },
    { id: "p-zh-6", prompt: "Demande à quelqu'un s'il aime le sport.", target: "你 喜欢 运动 吗？", accept: ["你喜欢运动吗", "你喜不喜欢运动？"], words: ["喜欢", "运动", "吗"], why: "Pour une question oui/non, on garde la phrase telle quelle et on ajoute 吗 à la fin." },
  ],
  ru: [
    { id: "p-ru-1", who: "Au serveur", prompt: "Demande un thé, poliment.", target: "Можно чай, пожалуйста?", accept: ["Чай, пожалуйста.", "Можно чай?", "Один чай, пожалуйста."], words: ["можно", "чай", "пожалуйста"], why: "Можно… ? = « est-ce que je peux avoir… ? » : la façon simple et polie de commander." },
    { id: "p-ru-2", prompt: "Dis que tu t'appelles Léa.", target: "Меня=я зовут=звать @Леа.", accept: ["Я Леа.", "Меня зовут Лея."], words: ["звать"], why: "Mot à mot : « on m'appelle Léa ». Меня = « me » (я à l'accusatif)." },
    { id: "p-ru-3", prompt: "Dis que tu aimes le café.", target: "Я люблю=любить кофе.", accept: ["Я очень люблю кофе."], words: ["любить", "кофе"], why: "люблю = j'aime (любить, 1re personne). кофе ne se décline jamais." },
    { id: "p-ru-4", prompt: "Demande combien ça coûte.", target: "Сколько это стоит=стоить?", accept: ["Сколько стоит?"], words: ["сколько", "стоить"], why: "Сколько стоит ? = « combien ça coûte ? ». это (ça) est facultatif." },
    { id: "p-ru-5", prompt: "Dis que tu habites à Paris.", target: "Я живу=жить в @Париже.", accept: ["Я живу в Париже"], words: ["жить", "в"], why: "в + le lieu, qui prend une terminaison (le prépositionnel) : Париж → в Париже." },
    { id: "p-ru-6", prompt: "Dis que tu as un frère.", target: "У меня=я есть брат.", accept: ["У меня брат."], words: ["у", "есть", "брат"], why: "Pour « avoir », le russe dit « chez moi, il y a » : у меня есть." },
  ],
};

// ---------- Faux amis (§7) ----------
const FAUX_AMIS = [
  { lemma: "actually", fr: "en fait (≠ actuellement → currently)", s: "Actually, I don't like coffee.", sfr: "En fait, je n'aime pas le café." },
  { lemma: "eventually", fr: "finalement (≠ éventuellement → possibly)", s: "Eventually, he found his keys.", sfr: "Finalement, il a retrouvé ses clés." },
  { lemma: "library", fr: "bibliothèque (≠ librairie → bookshop)", s: "I study at the library.", sfr: "J'étudie à la bibliothèque." },
  { lemma: "sensible", fr: "raisonnable (≠ sensible → sensitive)", s: "That's a sensible idea.", sfr: "C'est une idée raisonnable." },
  { lemma: "attend", fr: "assister à (≠ attendre → wait)", s: "I attend a class every Monday.", sfr: "J'assiste à un cours tous les lundis." },
  { lemma: "pretend", fr: "faire semblant (≠ prétendre → claim)", s: "He pretends to be asleep.", sfr: "Il fait semblant de dormir." },
  { lemma: "deception", fr: "tromperie (≠ déception → disappointment)", s: "The film is about lies and deception.", sfr: "Le film parle de mensonges et de tromperie." },
  { lemma: "rude", fr: "impoli (≠ rude → harsh)", s: "Don't be rude to the waiter.", sfr: "Ne sois pas impoli avec le serveur." },
];

// ---------- Oreille & prononciation (§5, §6, §7) ----------
const EAR = {
  en: {
    pairs: [
      { label: "Voyelle courte / longue", items: ["ship", "sheep"] },
      { label: "Voyelle courte / longue", items: ["live", "leave"] },
      { label: "Voyelle courte / longue", items: ["full", "fool"] },
      { label: "« th » sourd / s", items: ["think", "sink"] },
      { label: "« th » / t", items: ["three", "tree"] },
      { label: "« h » aspiré", items: ["eat", "heat"] },
      { label: "« h » aspiré", items: ["air", "hair"] },
      { label: "« h » aspiré", items: ["old", "hold"] },
      { label: "« th » sourd / s", items: ["thick", "sick"] },
      { label: "« th » sourd / f", items: ["three", "free"] },
      { label: "« th » sourd / f", items: ["thought", "fought"] },
      { label: "« th » sonore / z", items: ["then", "zen"] },
      { label: "w / v", items: ["west", "vest"] },
      { label: "w / v", items: ["wine", "vine"] },
      { label: "Voyelle courte / longue", items: ["sit", "seat"] },
    ],
    notes: [
      { t: "Formes faibles", lines: [["I'm going to eat.", "→ à l'oral : « I'm gonna eat »"], ["I want to go.", "→ « I wanna go »"], ["What do you want?", "→ « Whaddya want? »"]] },
      { t: "Accent tonique", lines: [["PHOtograph", "accent sur la 1ʳᵉ syllabe"], ["phoTOgraphy", "accent sur la 2ᵉ"], ["photoGRAPHic", "accent sur la 3ᵉ"]] },
    ],
  },
  ko: {
    pairs: [
      { label: "ㅓ / ㅗ", items: ["거기", "고기"] },
      { label: "ㅓ / ㅗ", items: ["섬", "솜"] },
      { label: "ㅡ / ㅜ", items: ["글", "굴"] },
      { label: "Simple / aspirée / tendue", items: ["달", "탈", "딸"] },
      { label: "Simple / aspirée / tendue", items: ["불", "풀", "뿔"] },
      { label: "Simple / aspirée / tendue", items: ["기", "키", "끼"] },
      { label: "Simple / aspirée / tendue", items: ["자다", "차다", "짜다"] },
      { label: "Simple / aspirée / tendue", items: ["방", "빵"] },
      { label: "ㅅ / ㅆ", items: ["살", "쌀"] },
      { label: "ㅅ / ㅆ", items: ["사다", "싸다"] },
      { label: "ㅓ / ㅗ", items: ["어른", "오른"] },
      { label: "ㅡ / ㅜ", items: ["그림", "구림"] },
    ],
    notes: [
      { t: "Enchaînement (연음)", lines: [["한국어", "se prononce [한구거] : la consonne finale glisse sur la voyelle suivante"], ["음악", "se prononce [으막]"], ["옷이", "se prononce [오시]"]] },
      { t: "ㄹ entre deux voyelles / en finale", lines: [["사랑", "ㄹ entre voyelles : un r battu léger"], ["물", "ㄹ en finale : un l"]] },
    ],
  },
  zh: {
    pairs: [
      { label: "1er / 4e ton", items: ["妈", "骂"] },
      { label: "2e / 3e ton", items: ["麻", "马"] },
      { label: "3e / 4e ton", items: ["买", "卖"] },
      { label: "1er / 2e ton", items: ["汤", "糖"] },
      { label: "1er / 2e ton", items: ["书", "熟"] },
      { label: "3e / 4e ton", items: ["水", "睡"] },
      { label: "2e / 4e ton", items: ["时", "是"] },
      { label: "1er / 3e ton", items: ["八", "把"] },
      { label: "4e / 2e ton", items: ["大", "答"] },
      { label: "zh / z", items: ["知", "资"] },
      { label: "sh / s", items: ["是", "四"] },
      { label: "q / ch", items: ["去", "处"] },
      { label: "x / sh", items: ["西", "师"] },
      { label: "Aspirée / non aspirée", items: ["爸", "怕"] },
      { label: "Aspirée / non aspirée", items: ["大", "他"] },
    ],
    notes: [
      { t: "Changements de ton", lines: [["你好", "deux 3es tons à la suite : le premier devient un 2e ton (ní hǎo)"], ["不是", "不 (bù) devient bú devant un 4e ton : bú shì"], ["一起", "一 (yī) devient yì devant les tons 1, 2 et 3 : yìqǐ"]] },
      { t: "Consonnes soufflées", lines: [["爸 / 怕", "b n'est pas un vrai « b » français : c'est un p sans souffle ; p est soufflé"], ["大 / 他", "même chose : d = t sans souffle, t = t soufflé"]] },
    ],
  },
  ru: {
    pairs: [
      { label: "ы / и", items: ["быть", "бить"] },
      { label: "ы / и", items: ["мыл", "мил"] },
      { label: "Consonne dure / mouillée", items: ["мат", "мать"] },
      { label: "Consonne dure / mouillée", items: ["брат", "брать"] },
      { label: "Consonne dure / mouillée", items: ["кон", "конь"] },
      { label: "у / ю", items: ["лук", "люк"] },
      { label: "ж / ш", items: ["жар", "шар"] },
      { label: "р / л", items: ["рак", "лак"] },
      { label: "Accent tonique", items: ["за́мок", "замо́к"] },
    ],
    notes: [
      { t: "Voyelles réduites", lines: [["молоко", "se prononce [malakó] : un о sans accent sonne presque a"], ["хорошо", "se prononce [kharachó]"], ["язык", "se prononce [iizýk] : un я sans accent sonne presque i"]] },
      { t: "Consonnes finales assourdies", lines: [["хлеб", "se prononce [khliep] : б → p en fin de mot"], ["друг", "se prononce [drouk]"], ["год", "se prononce [got]"]] },
    ],
  },
};

// ---------- Module Hangul (§6, ≈ 7 jours) ----------
// La romanisation n'est autorisée QUE dans ce module.
// Repères de prononciation pour FRANCOPHONES (pas la romanisation officielle, pensée pour
// l'anglais : son « u » se lirait comme dans « lune » alors que ㅜ se dit « ou »).
// Convention : ô fermé (beau) ≠ o ouvert (porte) ; consonne + h = soufflée (kh, th, ph) ;
// consonne doublée = tendue (kk, tt, pp). Aide temporaire : elle disparaît après le module.
const HANGUL_DAYS = [
  { title: "Les voyelles de base", sub: "ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ", kind: "jamo", items: [["ㅏ", "a", "아"], ["ㅓ", "o ouvert (porte)", "어"], ["ㅗ", "ô fermé (beau)", "오"], ["ㅜ", "ou", "우"], ["ㅡ", "eu, lèvres étirées", "으"], ["ㅣ", "i", "이"]] },
  { title: "Premières consonnes", sub: "ㄱ ㄴ ㄷ ㄹ ㅁ", kind: "jamo", items: [["ㄱ", "k doux (≈ g)", "가"], ["ㄴ", "n", "나"], ["ㄷ", "t doux (≈ d)", "다"], ["ㄹ", "r léger / l", "라"], ["ㅁ", "m", "마"]] },
  { title: "Consonnes, suite", sub: "ㅂ ㅅ ㅇ ㅈ ㅎ", kind: "jamo", items: [["ㅂ", "p doux (≈ b)", "바"], ["ㅅ", "s", "사"], ["ㅇ", "muet / ng", "아"], ["ㅈ", "tch doux (≈ dj)", "자"], ["ㅎ", "h soufflé", "하"]] },
  { title: "Les voyelles en « y »", sub: "ㅑ ㅕ ㅛ ㅠ", kind: "jamo", items: [["ㅑ", "ya", "야"], ["ㅕ", "yo ouvert", "여"], ["ㅛ", "yô fermé", "요"], ["ㅠ", "you", "유"]] },
  { title: "Les aspirées", sub: "ㅊ ㅋ ㅌ ㅍ", kind: "jamo", items: [["ㅊ", "tch soufflé", "차"], ["ㅋ", "k soufflé (kh)", "카"], ["ㅌ", "t soufflé (th)", "타"], ["ㅍ", "p soufflé (ph)", "파"]] },
  { title: "Construire des syllabes", sub: "Consonne + voyelle", kind: "build", items: [["나", "na"], ["모", "mô"], ["수", "sou"], ["리", "ri"], ["하", "ha"], ["져", "djo"], ["커", "kho"], ["드", "deu"]] },
  { title: "Consonnes finales & mots", sub: "받침 + premiers mots", kind: "words", items: [["한국", "han-gouk"], ["사람", "sa-ram"], ["친구", "tchin-gou"], ["학생", "hak-sèng"], ["김치", "gim-tchi"], ["커피", "kho-phi"], ["엄마", "om-ma"], ["밥", "bap"]] },
  // Jours ajoutés après coup : à la suite (la progression est enregistrée par numéro de jour)
  { title: "Les consonnes doubles", sub: "ㄲ ㄸ ㅃ ㅆ ㅉ", kind: "jamo", items: [["ㄲ", "k tendu (kk)", "까"], ["ㄸ", "t tendu (tt)", "따"], ["ㅃ", "p tendu (pp)", "빠"], ["ㅆ", "s tendu (ss)", "싸"], ["ㅉ", "tch tendu", "짜"]] },
  { title: "Les voyelles composées", sub: "ㅐ ㅔ ㅘ ㅝ ㅚ ㅟ ㅢ", kind: "jamo", items: [["ㅐ", "è (≈ ㅔ)", "애"], ["ㅔ", "é (≈ ㅐ)", "에"], ["ㅘ", "oua", "와"], ["ㅝ", "ouo", "워"], ["ㅚ", "oué", "외"], ["ㅟ", "oui", "위"], ["ㅢ", "eui", "의"]] },
  { title: "Construire avec le 받침", sub: "Consonne + voyelle + consonne, et taper", kind: "buildFinal",
    items: [["한", "han"], ["국", "gouk"], ["밥", "bap"], ["말", "mal"], ["산", "san"], ["곰", "gôm"], ["빵", "ppang"], ["옷", "ôt"]],
    type: [["엄마", "maman"], ["친구", "ami"], ["한국", "Corée"], ["김치", "kimchi"], ["사랑", "amour"]] },
];
// Voyelles qui se prononcent pareil aujourd'hui (Séoul) : jamais opposées dans un exercice d'écoute
const HANGUL_HOMOPHONES = { "ㅐ": ["ㅔ"], "ㅔ": ["ㅐ"], "ㅚ": ["ㅙ", "ㅞ"], "ㅙ": ["ㅚ", "ㅞ"], "ㅞ": ["ㅚ", "ㅙ"] };

// ---------- Phase 2 coréen : les briques de la phrase (§6) ----------
// Un seul point à la fois, input d'abord (exemples), puis rappel actif (quiz).
const KO_GRAMMAR = [
  {
    id: "haeyo", title: "Le registre poli en -요", lemmas: [],
    explain: "Avec un inconnu, un serveur, un collègue : on finit les phrases en -요 (해요체). C'est le registre par défaut de tout le parcours.",
    examples: ["저|는 학생|이에요=이다.", "저|는 커피|를 좋아해요=좋아하다.", "@서울|에 살아요=살다."],
    quiz: [
      { q: "(à un inconnu) 저는 학생___.", fr: "Je suis étudiant(e).", o: ["이에요", "이야"], a: "이에요" },
      { q: "(à un inconnu) 밥을 먹___.", fr: "Je mange.", o: ["어요", "어"], a: "어요" },
      { q: "(à un inconnu) 서울에 살___.", fr: "J'habite à Séoul.", o: ["아요", "아"], a: "아요" },
    ],
  },
  {
    id: "eun-neun", title: "은 / 는 : le thème", lemmas: ["은", "는"],
    explain: "« Quant à… ». 는 après une voyelle, 은 après une consonne. Sert à présenter de quoi on parle, ou à contraster.",
    examples: ["안녕하세요. 저|는 @민지|예요=이다.", "우리 가족|은 네=넷 명|이에요=이다.", "아버지|는 회사원|이에요=이다."],
    quiz: [
      { q: "저___ 민지예요.", fr: "Moi, c'est Minji.", o: ["는", "은"], a: "는" },
      { q: "선생님___ 한국 사람이에요.", fr: "Le professeur est coréen.", o: ["은", "는"], a: "은" },
      { q: "아버지___ 회사원이에요.", fr: "Mon père est employé de bureau.", o: ["는", "은"], a: "는" },
    ],
  },
  {
    id: "i-ga", title: "이 / 가 : le sujet", lemmas: ["이", "가"],
    explain: "Marque le sujet grammatical, souvent une info nouvelle. 가 après une voyelle, 이 après une consonne.",
    examples: ["커피|가 정말 맛있어요=맛있다.", "떡볶이|가 조금 매웠어요=맵다.", "영화|가 정말 재미있었어요=재미있다."],
    quiz: [
      { q: "커피___ 맛있어요.", fr: "Le café est bon.", o: ["가", "이"], a: "가" },
      { q: "선생님___ 있어요.", fr: "Il y a un professeur.", o: ["이", "가"], a: "이" },
      { q: "영화___ 재미있어요.", fr: "Le film est bien.", o: ["가", "이"], a: "가" },
    ],
  },
  {
    id: "eul-reul", title: "을 / 를 : l'objet", lemmas: ["을", "를"],
    explain: "Marque le complément d'objet (ce qu'on mange, regarde, aime…). 를 après une voyelle, 을 après une consonne. Le verbe vient toujours à la fin.",
    examples: ["저|는 커피|를 좋아해요=좋아하다.", "그리고 영화|를 봤어요=보다.", "주말|에 같이 밥|을 먹어요=먹다."],
    quiz: [
      { q: "커피___ 좋아해요.", fr: "J'aime le café.", o: ["를", "을"], a: "를" },
      { q: "밥___ 먹어요.", fr: "Je mange (du riz).", o: ["을", "를"], a: "을" },
      { q: "영화___ 봐요.", fr: "Je regarde un film.", o: ["를", "을"], a: "를" },
    ],
  },
  {
    id: "e", title: "에 : lieu, destination, moment", lemmas: ["에"],
    explain: "Où l'on va (학교에 가요), où quelque chose se trouve (집에 있어요), quand (토요일에).",
    examples: ["토요일|에 친구|를 만났어요=만나다.", "@서울|에 살아요=살다.", "주말|에 같이 밥|을 먹어요=먹다."],
    quiz: [
      { q: "토요일___ 만나요.", fr: "On se voit samedi.", o: ["에", "에서"], a: "에" },
      { q: "집___ 있어요.", fr: "Je suis à la maison.", o: ["에", "에서"], a: "에" },
      { q: "학교___ 가요.", fr: "Je vais à l'école.", o: ["에", "에서"], a: "에" },
    ],
  },
  {
    id: "eseo", title: "에서 : le lieu d'une action", lemmas: ["에서"],
    explain: "Là où une action se passe : manger au marché, étudier à l'école. Comparer : 학교에 가요 (destination) / 학교에서 공부해요 (action).",
    examples: ["우리|는 시장|에서 떡볶이|를 먹었어요=먹다."],
    quiz: [
      { q: "시장___ 떡볶이를 먹었어요.", fr: "J'ai mangé des tteokbokki au marché.", o: ["에서", "에"], a: "에서" },
      { q: "카페___ 커피를 마셔요.", fr: "Je bois un café au café.", o: ["에서", "에"], a: "에서" },
      { q: "학교___ 공부해요.", fr: "J'étudie à l'école.", o: ["에서", "에"], a: "에서" },
    ],
  },
  {
    id: "do", title: "도 : aussi", lemmas: ["도"],
    explain: "Remplace 은/는, 이/가 ou 을/를 pour dire « aussi ». Il se combine avec 에 : 에도.",
    examples: ["언니|도 있어요=있다.", "다음 주|에|도 만나요=만나다."],
    quiz: [
      { q: "저___ 학생이에요.", fr: "Moi aussi, je suis étudiant(e).", o: ["도", "는"], a: "도" },
      { q: "언니___ 있어요.", fr: "J'ai aussi une grande sœur.", o: ["도", "를"], a: "도" },
      { q: "다음 주에___ 만나요.", fr: "On se voit aussi la semaine prochaine.", o: ["도", "를"], a: "도" },
    ],
  },
  {
    id: "natifs", title: "Nombres natifs (하나, 둘…)", lemmas: ["하나", "넷", "다섯", "스물"],
    explain: "Pour compter des objets ou des personnes, l'âge et les heures. 하나 둘 셋 넷 다섯… Devant un compteur : 한, 두, 세, 네.",
    examples: ["아메리카노 한=하나 잔 주세요=주다.", "언니|는 스물다섯=스물+다섯 살|이에요=이다.", "우리 가족|은 네=넷 명|이에요=이다."],
    quiz: [
      { q: "언니는 ___ 살이에요. (25)", fr: "Ma sœur a 25 ans.", o: ["스물다섯", "이십오"], a: "스물다섯" },
      { q: "커피 ___ 잔 주세요. (1)", fr: "Un café, s'il vous plaît.", o: ["한", "일"], a: "한" },
      { q: "우리 가족은 ___ 명이에요. (4)", fr: "Nous sommes quatre.", o: ["네", "사"], a: "네" },
    ],
  },
  {
    id: "sino", title: "Nombres sino-coréens (일, 이…)", lemmas: ["사천"],
    explain: "Pour les prix, les minutes, les dates, les numéros. 일 이 삼 사 오 육 칠 팔 구 십, 백 (100), 천 (1000).",
    examples: ["네, 사천 원|이에요=이다."],
    quiz: [
      { q: "___ 원이에요. (4000)", fr: "C'est 4 000 wons.", o: ["사천", "네천"], a: "사천" },
      { q: "___월 (3)", fr: "mars (le 3ᵉ mois)", o: ["삼", "셋"], a: "삼" },
      { q: "___ 분 (10)", fr: "dix minutes", o: ["십", "열"], a: "십" },
    ],
  },
];

// Phase 3 : verrouillée tant que la phase 2 n'est pas terminée (§6)
const KO_PHASE3 = ["반말 : parler à un ami proche", "합니다체 : le registre formel", "Les honorifiques (-시-, 드시다, 진지…)"];

// Switcher de registre (§6) : une même phrase selon l'interlocuteur
const REGISTERS = {
  who: [["ami", "Ami·e proche", "반말"], ["inconnu", "Inconnu·e", "해요체"], ["superieur", "Supérieur·e au travail", "합니다체"], ["aine", "Aîné·e de la famille", "honorifique"]],
  phrases: [
    { fr: "Tu as mangé ?", ami: "밥 먹었어?", inconnu: "밥 먹었어요?", superieur: "식사하셨습니까?", aine: "진지 드셨어요?", note: "Avec un aîné, on change même le vocabulaire : 밥 → 진지 (repas), 먹다 → 드시다 (manger)." },
    { fr: "Où vas-tu ?", ami: "어디 가?", inconnu: "어디 가요?", superieur: "어디 가십니까?", aine: "어디 가세요?", note: "-시- marque le respect envers la personne dont on parle." },
    { fr: "Merci", ami: "고마워", inconnu: "고마워요", superieur: "감사합니다", aine: "감사합니다", note: "감사합니다 est aussi très courant avec des inconnus : c'est une formule figée." },
    { fr: "Bonjour", ami: "안녕!", inconnu: "안녕하세요!", superieur: "안녕하십니까!", aine: "안녕하세요!", note: "안녕 seul ne s'utilise qu'avec des proches de même âge ou plus jeunes." },
  ],
};

// Heures estimées par niveau (§8)
const LEVEL_HOURS = {
  ko: { label: "Coréen", steps: [["B1", 800, "≈ 700–900 h"], ["Pro (FSI)", 2200, "≈ 2 200 h de cours"]] },
  en: { label: "Anglais", steps: [["B1", 375, "≈ 350–400 h guidées"], ["B2", 550, "≈ 500–600 h guidées"]] },
  zh: { label: "Chinois", steps: [["HSK 3 (≈ B1)", 900, "≈ 800–1 000 h"], ["Pro (FSI)", 2200, "≈ 2 200 h de cours"]] },
  ru: { label: "Russe", steps: [["B1", 600, "≈ 500–700 h"], ["Pro (FSI)", 1100, "≈ 1 100 h de cours"]] },
};

// ---------- Phrases libres (production ouverte, corrigée par le LLM, §4) ----------
// En coréen : interlocuteur indiqué pour que le registre soit vérifié (§6).
const FREE_PROMPTS = {
  en: [
    { prompt: "Raconte ce que tu as fait le week-end dernier." },
    { prompt: "Décris un membre de ta famille." },
    { prompt: "Dis ce que tu aimes manger, et pourquoi." },
    { prompt: "Commande quelque chose dans un café." },
    { prompt: "Présente-toi à un nouveau collègue." },
    { prompt: "Explique où tu habites." },
    { prompt: "Dis ce que tu vas faire demain." },
  ],
  ko: [
    { prompt: "Présente-toi (prénom, nationalité, métier ou études).", who: "À un·e inconnu·e", register: "haeyo" },
    { prompt: "Dis ce que tu as mangé aujourd'hui.", who: "À un·e collègue", register: "haeyo" },
    { prompt: "Commande quelque chose au café.", who: "Au serveur", register: "haeyo" },
    { prompt: "Dis ce que tu aimes faire le week-end.", who: "À un·e inconnu·e", register: "haeyo" },
    { prompt: "Parle d'un membre de ta famille.", who: "À ta professeure", register: "haeyo" },
    { prompt: "Dis où tu habites.", who: "À un·e collègue", register: "haeyo" },
  ],
  zh: [
    { prompt: "Présente-toi (prénom, nationalité, études ou métier)." },
    { prompt: "Dis ce que tu as mangé aujourd'hui." },
    { prompt: "Commande quelque chose au café." },
    { prompt: "Dis ce que tu aimes faire le week-end." },
    { prompt: "Parle d'un membre de ta famille." },
  ],
  ru: [
    { prompt: "Présente-toi (prénom, ville, études ou métier)." },
    { prompt: "Dis ce que tu aimes faire le week-end." },
    { prompt: "Commande quelque chose au café." },
    { prompt: "Parle d'un membre de ta famille." },
    { prompt: "Raconte ce que tu as mangé aujourd'hui." },
  ],
};
