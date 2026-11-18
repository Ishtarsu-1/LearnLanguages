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
//  Le coréen est annoté à la main (lemme + particules) : c'est ce que ferait
//  un analyseur morphologique (Kiwi, Mecab-ko). Pour du contenu généré
//  automatiquement, il faudra brancher un vrai analyseur côté serveur.

const KO_PARTICLES = new Set(["은", "는", "이", "가", "을", "를", "에", "에서", "도", "의", "와", "과", "하고", "로", "으로", "랑", "이랑", "한테", "께"]);

// ---------- Lexiques (ordonnés du plus fréquent au moins fréquent) ----------
// cog: mot transparent FR/EN (compté « probablement connu », §7)
// faux: faux ami (jamais compté comme transparent)
const LEXICON = {
  en: {
    "the": { fr: "le, la, les" }, "be": { fr: "être" }, "a": { fr: "un, une" }, "to": { fr: "à, vers (+ infinitif)" },
    "i": { fr: "je" }, "you": { fr: "tu, vous" }, "it": { fr: "il, elle, ça (chose)" }, "have": { fr: "avoir, prendre" },
    "do": { fr: "faire (+ auxiliaire)" }, "that": { fr: "ça, cela, que" }, "in": { fr: "dans, en" }, "on": { fr: "sur, le (jour)" },
    "with": { fr: "avec" }, "at": { fr: "à, chez" }, "we": { fr: "nous, on" }, "she": { fr: "elle" }, "my": { fr: "mon, ma, mes" },
    "me": { fr: "moi, me" }, "but": { fr: "mais" }, "no": { fr: "non" }, "yes": { fr: "oui" }, "what": { fr: "quoi, que" },
    "how": { fr: "comment" }, "where": { fr: "où" }, "go": { fr: "aller" }, "can": { fr: "pouvoir" }, "see": { fr: "voir" },
    "want": { fr: "vouloir" }, "all": { fr: "tout" }, "time": { fr: "temps, fois, moment" }, "day": { fr: "jour, journée" },
    "people": { fr: "les gens" }, "need": { fr: "avoir besoin de" }, "too": { fr: "aussi, trop" }, "just": { fr: "juste, seulement" },
    "really": { fr: "vraiment" }, "much": { fr: "beaucoup" }, "little": { fr: "petit, un peu" }, "work": { fr: "travailler" },
    "live": { fr: "habiter, vivre" }, "next": { fr: "prochain, à côté" }, "last": { fr: "dernier" }, "great": { fr: "génial, super" },
    "nice": { fr: "sympa, agréable" }, "home": { fr: "maison, chez soi" }, "please": { fr: "s'il te / vous plaît" },
    "thanks": { fr: "merci" }, "thank": { fr: "remercier (thank you = merci)" }, "hi": { fr: "salut" }, "hello": { fr: "bonjour" },
    "oh": { fr: "oh" }, "sure": { fr: "bien sûr" }, "three": { fr: "trois" }, "four": { fr: "quatre" }, "open": { fr: "ouvert", cog: true },
    "close": { fr: "fermer" }, "early": { fr: "tôt" }, "late": { fr: "tard" }, "later": { fr: "plus tard" }, "meet": { fr: "rencontrer" },
    "stay": { fr: "rester" }, "choose": { fr: "choisir" }, "watch": { fr: "regarder" }, "funny": { fr: "drôle" },
    "movie": { fr: "film" }, "sister": { fr: "sœur" }, "door": { fr: "porte" }, "floor": { fr: "étage, sol" },
    "milk": { fr: "lait" }, "tea": { fr: "thé" }, "anything": { fr: "quelque chose, n'importe quoi" }, "else": { fr: "d'autre" }, "cool": { fr: "cool, super" },
    "nurse": { fr: "infirmier, infirmière" }, "elevator": { fr: "ascenseur" }, "sunday": { fr: "dimanche" }, "rest": { fr: "repos" },
    "coffee": { fr: "café", cog: true }, "dollar": { fr: "dollar", cog: true }, "student": { fr: "étudiant(e)", cog: true },
    "hospital": { fr: "hôpital", cog: true }, "interesting": { fr: "intéressant", cog: true }, "university": { fr: "université", cog: true },
    "weekend": { fr: "week-end", cog: true }, "cinema": { fr: "cinéma", cog: true }, "insist": { fr: "insister", cog: true },
    "excuse": { fr: "excuser", cog: true }, "second": { fr: "second, deuxième", cog: true },
    "actually": { fr: "en fait (≠ actuellement)", faux: true }, "eventually": { fr: "finalement (≠ éventuellement)", faux: true },
    "library": { fr: "bibliothèque (≠ librairie)", faux: true }, "sensible": { fr: "raisonnable (≠ sensible)", faux: true },
  },
  ko: {
    "이다": { fr: "être (copule : c'est…)" }, "는": { fr: "particule de thème (après voyelle)" }, "은": { fr: "particule de thème (après consonne)" },
    "가": { fr: "particule sujet (après voyelle)" }, "이": { fr: "particule sujet (après consonne)" }, "를": { fr: "particule objet (après voyelle)" },
    "을": { fr: "particule objet (après consonne)" }, "에": { fr: "à, dans (lieu, destination, moment)" }, "에서": { fr: "à, dans (lieu d'une action)" },
    "도": { fr: "aussi, même" }, "있다": { fr: "il y a, avoir, se trouver" }, "저": { fr: "je, moi (poli)" }, "우리": { fr: "nous, notre" },
    "네": { fr: "oui" }, "안녕하세요": { fr: "bonjour (poli)" }, "감사하다": { fr: "remercier" }, "좋아하다": { fr: "aimer (bien)" },
    "먹다": { fr: "manger" }, "보다": { fr: "voir, regarder" }, "만나다": { fr: "rencontrer, voir (qqn)" }, "살다": { fr: "habiter, vivre" },
    "주다": { fr: "donner (주세요 = donnez-moi, s'il vous plaît)" }, "사람": { fr: "personne, gens" }, "정말": { fr: "vraiment" },
    "여기": { fr: "ici" }, "같이": { fr: "ensemble" }, "그리고": { fr: "et, et puis" }, "조금": { fr: "un peu" }, "다음": { fr: "prochain, suivant" },
    "주": { fr: "semaine" }, "주말": { fr: "week-end" }, "친구": { fr: "ami(e)" }, "가족": { fr: "famille" }, "밥": { fr: "riz, repas" },
    "커피": { fr: "café" }, "학생": { fr: "élève, étudiant(e)" }, "선생님": { fr: "professeur" }, "한국": { fr: "Corée" },
    "하나": { fr: "un (nombre natif ; 한 devant un compteur)" }, "넷": { fr: "quatre (natif ; 네 devant un compteur)" },
    "다섯": { fr: "cinq (natif)" }, "스물": { fr: "vingt (natif)" }, "사천": { fr: "quatre mille (sino-coréen)" },
    "명": { fr: "compteur de personnes" }, "살": { fr: "an (âge)" }, "잔": { fr: "tasse, verre (compteur)" }, "원": { fr: "won (monnaie)" },
    "맛있다": { fr: "être bon (au goût)" }, "재미있다": { fr: "être intéressant, amusant" }, "반갑다": { fr: "être content (de voir qqn)" },
    "맵다": { fr: "être piquant" }, "아버지": { fr: "père" }, "어머니": { fr: "mère" }, "언니": { fr: "grande sœur (pour une fille)" },
    "회사원": { fr: "employé(e) de bureau" }, "영화": { fr: "film" }, "시장": { fr: "marché" }, "토요일": { fr: "samedi" },
    "아메리카노": { fr: "americano" }, "떡볶이": { fr: "tteokbokki (gâteaux de riz épicés)" },
    "집": { fr: "maison" }, "학교": { fr: "école" }, "가다": { fr: "aller" }, "카페": { fr: "café (lieu)" }, "마시다": { fr: "boire" },
    "공부하다": { fr: "étudier" },
  },
};

// ---------- Anti-interférence (§12) ----------
// Catégories sémantiques : jamais deux nouveaux mots du même groupe le même jour
// (apprendre « tous les fruits » d'un coup crée de la confusion).
const SEMANTIC_GROUPS = {
  en: {
    nombre: ["three", "four", "second"], jour: ["sunday", "weekend", "day"], boisson: ["coffee", "tea", "milk"],
    moment: ["early", "late", "later", "last", "next"], salutation: ["hi", "hello"], remerciement: ["thanks", "thank", "please", "excuse"],
    pronom: ["i", "you", "it", "we", "she", "me", "my"], interrogatif: ["what", "how", "where"], oui_non: ["yes", "no", "sure"],
    lieu: ["hospital", "university", "cinema", "library", "home"], metier: ["nurse", "student"], quantite: ["much", "little", "too", "all"],
    perception: ["see", "watch"], ouverture: ["open", "close"],
  },
  ko: {
    nombre_natif: ["하나", "넷", "다섯", "스물"], compteur: ["명", "살", "잔", "원"], famille: ["아버지", "어머니", "언니", "가족"],
    boisson: ["커피", "아메리카노"], lieu: ["집", "학교", "카페", "시장"], jour: ["토요일", "주말", "주"],
    metier: ["학생", "선생님", "회사원"], adjectif_gout: ["맛있다", "맵다"], pronom: ["저", "우리"],
    deplacement: ["가다", "살다"], consommer: ["먹다", "마시다"], voir: ["보다", "만나다"],
  },
};
// Paires d'opposés et quasi-synonymes : jamais introduites le même jour
const CONFUSABLE = {
  en: [["early", "late"], ["open", "close"], ["yes", "no"], ["see", "watch"], ["last", "next"], ["much", "little"], ["hi", "hello"], ["thanks", "thank"], ["later", "late"]],
  ko: [["아버지", "어머니"], ["먹다", "마시다"], ["보다", "만나다"], ["가다", "살다"], ["맛있다", "재미있다"], ["집", "학교"]],
};

// ---------- Contenus d'input (§3, §5) ----------
// Formats conversationnels en priorité (§7). Registre 해요체 par défaut en coréen (§6).
const TEXTS = {
  en: [
    {
      id: "en-cafe", title: "Au café", icon: "☕", kind: "Dialogue",
      sentences: [
        ["Hi! Can I have a coffee, please?", "Salut ! Je peux avoir un café, s'il vous plaît ?"],
        ["Sure. Do you want milk?", "Bien sûr. Vous voulez du lait ?"],
        ["Yes, just a little milk. Thanks!", "Oui, juste un peu de lait. Merci !"],
        ["Anything else?", "Autre chose ?"],
        ["No, that's=that+be all. How much is=be it?", "Non, c'est tout. C'est combien ?"],
        ["It's=it+be three dollars=dollar.", "C'est trois dollars."],
      ],
    },
    {
      id: "en-neighbor", title: "La nouvelle voisine", icon: "🏠", kind: "Dialogue",
      sentences: [
        ["Hello, I'm=i+be @Sam. I live next door.", "Bonjour, je suis Sam. J'habite à côté."],
        ["Oh, nice to meet you! I'm=i+be @Léa.", "Oh, enchantée ! Je suis Léa."],
        ["Are=be you a student?", "Tu es étudiant ?"],
        ["No, I work in a hospital. I'm=i+be a nurse.", "Non, je travaille dans un hôpital. Je suis infirmier."],
        ["That's=that+be interesting! I'm=i+be a student at the university.", "C'est intéressant ! Moi, je suis étudiante à l'université."],
        ["Cool. See you later!", "Cool. À plus tard !"],
      ],
    },
    {
      id: "en-weekend", title: "Le week-end", icon: "🎬", kind: "Dialogue",
      sentences: [
        ["What did=do you do last weekend?", "Qu'est-ce que tu as fait le week-end dernier ?"],
        ["I went=go to the cinema with my sister.", "Je suis allé au cinéma avec ma sœur."],
        ["We watched=watch a really funny movie.", "On a regardé un film vraiment drôle."],
        ["Actually, I wanted=want to stay home, but she insisted=insist.", "En fait, je voulais rester à la maison, mais elle a insisté."],
        ["Eventually, I had=have a great time!", "Finalement, j'ai passé un super moment !"],
        ["Next time, I'm=i+be going=go to choose the movie.", "La prochaine fois, c'est moi qui choisis le film."],
      ],
    },
    {
      id: "en-library", title: "À la bibliothèque", icon: "📚", kind: "Dialogue",
      sentences: [
        ["Excuse me, where is=be the library?", "Excusez-moi, où est la bibliothèque ?"],
        ["It's=it+be on the second floor, next to the elevator.", "Elle est au deuxième étage, à côté de l'ascenseur."],
        ["Thank you. Is=be it open on Sundays=sunday?", "Merci. Elle est ouverte le dimanche ?"],
        ["Yes, but it closes=close early, at four.", "Oui, mais elle ferme tôt, à quatre heures."],
        ["That's=that+be sensible. People need rest on Sunday too.", "C'est raisonnable. Les gens ont besoin de repos le dimanche aussi."],
        ["Have a nice day!", "Bonne journée !"],
      ],
    },
  ],
  ko: [
    {
      id: "ko-cafe", title: "Au café", icon: "🧋", kind: "Dialogue",
      sentences: [
        ["안녕하세요!", "Bonjour !"],
        ["아메리카노 한=하나 잔 주세요=주다.", "Un americano, s'il vous plaît."],
        ["네, 사천 원|이에요=이다.", "Oui, c'est 4 000 wons."],
        ["여기 있어요=있다.", "Voilà."],
        ["감사해요=감사하다!", "Merci !"],
        ["커피|가 정말 맛있어요=맛있다.", "Le café est vraiment bon."],
      ],
    },
    {
      id: "ko-intro", title: "Se présenter", icon: "🙋", kind: "Monologue",
      sentences: [
        ["안녕하세요. 저|는 @민지|예요=이다.", "Bonjour. Je suis Minji."],
        ["저|는 한국 사람|이에요=이다.", "Je suis coréenne."],
        ["저|는 학생|이에요=이다.", "Je suis étudiante."],
        ["@서울|에 살아요=살다.", "J'habite à Séoul."],
        ["저|는 커피|를 좋아해요=좋아하다.", "J'aime le café."],
        ["만나서=만나다 반가워요=반갑다!", "Enchantée !"],
      ],
    },
    {
      id: "ko-family", title: "Ma famille", icon: "👨‍👩‍👧", kind: "Monologue",
      sentences: [
        ["우리 가족|은 네=넷 명|이에요=이다.", "Dans ma famille, nous sommes quatre."],
        ["아버지|는 회사원|이에요=이다.", "Mon père est employé de bureau."],
        ["어머니|는 선생님|이에요=이다.", "Ma mère est professeure."],
        ["언니|도 있어요=있다.", "J'ai aussi une grande sœur."],
        ["언니|는 스물다섯=스물+다섯 살|이에요=이다.", "Ma grande sœur a vingt-cinq ans."],
        ["주말|에 같이 밥|을 먹어요=먹다.", "Le week-end, on mange ensemble."],
      ],
    },
    {
      id: "ko-weekend", title: "Le week-end", icon: "🌶️", kind: "Récit",
      sentences: [
        ["토요일|에 친구|를 만났어요=만나다.", "Samedi, j'ai vu une amie."],
        ["우리|는 시장|에서 떡볶이|를 먹었어요=먹다.", "On a mangé des tteokbokki au marché."],
        ["떡볶이|가 조금 매웠어요=맵다.", "Les tteokbokki étaient un peu piquants."],
        ["그리고 영화|를 봤어요=보다.", "Et puis on a regardé un film."],
        ["영화|가 정말 재미있었어요=재미있다.", "Le film était vraiment bien."],
        ["다음 주|에|도 만나요=만나다.", "On se revoit la semaine prochaine aussi."],
      ],
    },
  ],
};

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
    ],
    notes: [
      { t: "Enchaînement (연음)", lines: [["한국어", "se prononce [한구거] : la consonne finale glisse sur la voyelle suivante"], ["음악", "se prononce [으막]"], ["옷이", "se prononce [오시]"]] },
      { t: "ㄹ entre deux voyelles / en finale", lines: [["사랑", "ㄹ entre voyelles : un r battu léger"], ["물", "ㄹ en finale : un l"]] },
    ],
  },
};

// ---------- Module Hangul (§6, ≈ 7 jours) ----------
// La romanisation n'est autorisée QUE dans ce module.
const HANGUL_DAYS = [
  { title: "Les voyelles de base", sub: "ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ", kind: "jamo", items: [["ㅏ", "a", "아"], ["ㅓ", "eo", "어"], ["ㅗ", "o", "오"], ["ㅜ", "u", "우"], ["ㅡ", "eu", "으"], ["ㅣ", "i", "이"]] },
  { title: "Premières consonnes", sub: "ㄱ ㄴ ㄷ ㄹ ㅁ", kind: "jamo", items: [["ㄱ", "g/k", "가"], ["ㄴ", "n", "나"], ["ㄷ", "d/t", "다"], ["ㄹ", "r/l", "라"], ["ㅁ", "m", "마"]] },
  { title: "Consonnes, suite", sub: "ㅂ ㅅ ㅇ ㅈ ㅎ", kind: "jamo", items: [["ㅂ", "b/p", "바"], ["ㅅ", "s", "사"], ["ㅇ", "muet / ng", "아"], ["ㅈ", "j", "자"], ["ㅎ", "h", "하"]] },
  { title: "Les voyelles en « y »", sub: "ㅑ ㅕ ㅛ ㅠ", kind: "jamo", items: [["ㅑ", "ya", "야"], ["ㅕ", "yeo", "여"], ["ㅛ", "yo", "요"], ["ㅠ", "yu", "유"]] },
  { title: "Les aspirées", sub: "ㅊ ㅋ ㅌ ㅍ", kind: "jamo", items: [["ㅊ", "ch", "차"], ["ㅋ", "k (soufflé)", "카"], ["ㅌ", "t (soufflé)", "타"], ["ㅍ", "p (soufflé)", "파"]] },
  { title: "Construire des syllabes", sub: "Consonne + voyelle", kind: "build", items: [["나", "na"], ["모", "mo"], ["수", "su"], ["리", "ri"], ["하", "ha"], ["져", "jyeo"], ["커", "keo"], ["드", "deu"]] },
  { title: "Consonnes finales & mots", sub: "받침 + premiers mots", kind: "words", items: [["한국", "hanguk"], ["사람", "saram"], ["친구", "chingu"], ["학생", "haksaeng"], ["김치", "gimchi"], ["커피", "keopi"], ["엄마", "eomma"], ["밥", "bap"]] },
];

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
};
