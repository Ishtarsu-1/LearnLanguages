// ============================================================
//  Mochi — missions de conversation du mode histoire (ROADMAP P2 « Mode histoire »)
//  Fichier partagé : le navigateur l'utilise pour l'affichage et le mode guidé,
//  le serveur (server.js → llm.js) pour le jeu de rôle avec l'IA. Le client
//  n'envoie que l'identifiant de la mission : il ne peut pas changer le scénario.
//
//  role / goal_en : consignes données à l'IA (en anglais, plus fiable pour les modèles)
//  goal_fr : but affiché à l'apprenant
//  opening : première réplique du personnage [langue cible, traduction]
//  script : mode guidé (sans IA, ou si elle ne répond pas). Pour chaque étape,
//           la réplique du personnage puis des réponses au choix [texte, bonne ?, explication].
//           La première étape réutilise `opening`.
//  end : réplique finale quand le but est atteint
// ============================================================
const MISSIONS = {
  "ko-airport": {
    lang: "ko", title: "Comment aller à Séoul ?", icon: "🛬",
    role: "a friendly employee at the information desk of Incheon airport",
    goal_en: "The learner must (1) ask how to get to Seoul and (2) ask how much the ticket costs.",
    goal_fr: "Demande comment aller à Séoul, puis combien coûte le billet.",
    register: "해요체 (polite -요 endings)",
    opening: ["안녕하세요! 무엇을 도와드릴까요?", "Bonjour ! Je peux vous aider ?"],
    script: [
      { choices: [["서울에 어떻게 가요?", true, ""], ["저는 서울이에요.", false, "Ça veut dire « Je suis Séoul ». Demande comment y aller : 어떻게 가요 ?"], ["서울을 먹어요.", false, "« Je mange Séoul »… 😄 Utilise 어떻게 가요 ? (comment on y va ?)"]] },
      { npc: ["공항버스를 타세요. 저기에 있어요.", "Prenez le bus de l'aéroport. Il est là-bas."],
        choices: [["얼마예요?", true, ""], ["감사합니다. 안녕히 계세요.", false, "Très poli ! Mais la mission demande aussi le prix : 얼마예요 ?"], ["버스가 맛있어요.", false, "« Le bus est délicieux »… Demande le prix : 얼마예요 ?"]] },
    ],
    end: ["만 칠천 원이에요. 좋은 여행 되세요!", "C'est 17 000 wons. Bon voyage !"],
  },
  "ko-neighbor": {
    lang: "ko", title: "La voisine", icon: "👵",
    role: "a kind elderly neighbor (할머니) meeting the learner in the hallway of their building",
    goal_en: "The learner must introduce themself: (1) their name, (2) where they come from, (3) what they do (e.g. student).",
    goal_fr: "Présente-toi : ton prénom, d'où tu viens et ce que tu fais.",
    register: "해요체 (polite -요 endings)",
    opening: ["어머, 새로 이사 왔어요?", "Oh, vous venez d'emménager ?"],
    script: [
      { choices: [["네! 저는 모찌예요.", true, ""], ["아니요, 저는 김치예요.", false, "« Non, je suis un kimchi » 😄 Réponds oui et dis ton prénom : 네! 저는 …예요."], ["네, 저는 집이에요.", false, "« Je suis une maison »… Dis ton prénom : 저는 모찌예요."]] },
      { npc: ["반가워요! 어디에서 왔어요?", "Enchantée ! D'où venez-vous ?"],
        choices: [["프랑스에서 왔어요.", true, ""], ["서울에 살아요.", false, "C'est vrai, mais elle demande d'où tu viens : …에서 왔어요."], ["프랑스를 먹어요.", false, "« Je mange la France »… Dis : 프랑스에서 왔어요."]] },
      { npc: ["한국에서 뭐 해요?", "Qu'est-ce que vous faites en Corée ?"],
        choices: [["저는 학생이에요. 한국어를 공부해요.", true, ""], ["저는 할머니예요.", false, "« Je suis une grand-mère »… Dis ce que tu fais : 저는 학생이에요."], ["학교가 커요.", false, "« L'école est grande »… Elle demande ce que tu fais : 저는 학생이에요."]] },
    ],
    end: ["아이고, 대단해요! 잘 지내요!", "Oh, c'est formidable ! Bonne installation !"],
  },
  "ko-cafe": {
    lang: "ko", title: "Ton premier 아이스 아메리카노", icon: "🧋",
    role: "a cheerful barista in a small neighborhood café in Seoul",
    goal_en: "The learner must (1) order an iced americano, (2) say it is to take away (포장), and (3) pay (e.g. by card).",
    goal_fr: "Commande un americano glacé, à emporter, et paie.",
    register: "해요체 (polite -요 endings)",
    opening: ["어서 오세요! 주문하시겠어요?", "Bienvenue ! Vous voulez commander ?"],
    script: [
      { choices: [["아이스 아메리카노 한 잔 주세요.", true, ""], ["아메리카노가 커요.", false, "« L'americano est grand »… Pour commander : … 한 잔 주세요."], ["저는 아메리카노예요.", false, "« Je suis un americano » 😄 Dis : 아이스 아메리카노 한 잔 주세요."]] },
      { npc: ["드시고 가세요? 포장이세요?", "Sur place ou à emporter ?"],
        choices: [["포장이요.", true, ""], ["네, 맛있어요.", false, "Elle demande sur place (드시고 가요) ou à emporter (포장)."], ["카페에 살아요.", false, "« J'habite au café »… Réponds : 포장이요 (à emporter)."]] },
      { npc: ["사천오백 원이에요.", "4 500 wons."],
        choices: [["카드로 할게요.", true, ""], ["안녕히 계세요.", false, "Tu pars sans payer ! Dis : 카드로 할게요 (par carte)."], ["사천오백 원을 먹어요.", false, "« Je mange 4 500 wons »… Paie : 카드로 할게요."]] },
    ],
    end: ["감사합니다! 맛있게 드세요!", "Merci ! Bonne dégustation !"],
  },
  "en-ticket": {
    lang: "en", title: "A ticket to London", icon: "🚆",
    role: "a ticket office clerk at Heathrow airport, London",
    goal_en: "The learner must (1) buy a train ticket to central London and (2) ask when the next train leaves.",
    goal_fr: "Achète un billet de train pour le centre de Londres et demande l'heure du prochain train.",
    register: "neutral, polite",
    opening: ["Hello! How can I help you?", "Bonjour ! Je peux vous aider ?"],
    script: [
      { choices: [["One ticket to central London, please.", true, ""], ["I am a ticket.", false, "« Je suis un billet » 😄 Dis : One ticket to central London, please."], ["London is big.", false, "Vrai, mais commande ton billet : One ticket to…, please."]] },
      { npc: ["Single or return?", "Aller simple ou aller-retour ?"],
        choices: [["Single, please.", true, ""], ["Yes, please.", false, "C'est une question à choix : single (aller simple) ou return (aller-retour)."], ["I'm single.", false, "« Je suis célibataire » 😄 Ici, single = aller simple : Single, please."]] },
      { npc: ["That's twenty pounds.", "Ça fait vingt livres."],
        choices: [["Here you are. When is the next train?", true, ""], ["Goodbye!", false, "Tu pars sans payer ni demander l'heure : Here you are. When is the next train?"], ["Twenty pounds is nice.", false, "Paie et demande l'heure : Here you are. When is the next train?"]] },
    ],
    end: ["In five minutes, platform two. Have a nice trip!", "Dans cinq minutes, quai 2. Bon voyage !"],
  },
  "en-flatmate": {
    lang: "en", title: "Your new flatmate", icon: "🏠",
    role: "Priya, a friendly music student meeting the learner, her new flatmate, for the first time",
    goal_en: "The learner must introduce themself: (1) their name, (2) where they come from, (3) why they are in London.",
    goal_fr: "Présente-toi : ton prénom, d'où tu viens et pourquoi tu es à Londres.",
    register: "casual, friendly",
    opening: ["Hi! You must be my new flatmate!", "Salut ! Tu dois être ma nouvelle colocataire !"],
    script: [
      { choices: [["Yes! I'm Mochi. Nice to meet you!", true, ""], ["Yes, I'm a flat.", false, "« Je suis un appartement » 😄 Dis ton prénom : I'm Mochi."], ["No, thank you.", false, "Elle t'accueille ! Réponds : Yes! I'm Mochi. Nice to meet you!"]] },
      { npc: ["Nice to meet you too! Where are you from?", "Enchantée aussi ! Tu viens d'où ?"],
        choices: [["I'm from France.", true, ""], ["I'm fine, thanks.", false, "Elle demande d'où tu viens : I'm from…"], ["I'm from the kitchen.", false, "« Je viens de la cuisine »… Dis : I'm from France."]] },
      { npc: ["Cool! Why are you in London?", "Cool ! Pourquoi tu es à Londres ?"],
        choices: [["I'm here to study English.", true, ""], ["London is a city.", false, "Elle demande pourquoi tu es là : I'm here to…"], ["Because yes.", false, "Un peu sec ! Dis : I'm here to study English."]] },
    ],
    end: ["Great! Welcome home, Mochi!", "Super ! Bienvenue à la maison, Mochi !"],
  },
  "en-cafe": {
    lang: "en", title: "An iced coffee to go", icon: "🥤",
    role: "a barista in a small London coffee shop",
    goal_en: "The learner must (1) order an iced coffee, (2) say it is to go (takeaway), and (3) pay (e.g. ask to pay by card).",
    goal_fr: "Commande un café glacé, à emporter, et paie.",
    register: "neutral, friendly",
    opening: ["Hi there! What can I get you?", "Bonjour ! Qu'est-ce que je vous sers ?"],
    script: [
      { choices: [["An iced coffee, please.", true, ""], ["I am coffee.", false, "« Je suis du café » 😄 Dis : An iced coffee, please."], ["The coffee is hot.", false, "Commande plutôt : An iced coffee, please."]] },
      { npc: ["For here or to go?", "Sur place ou à emporter ?"],
        choices: [["To go, please.", true, ""], ["Yes, please.", false, "C'est une question à choix : for here (sur place) ou to go (à emporter)."], ["Here is coffee.", false, "Réponds au choix : To go, please."]] },
      { npc: ["That's three fifty.", "Ça fait 3,50."],
        choices: [["Can I pay by card?", true, ""], ["Bye!", false, "Tu pars sans payer ! Demande : Can I pay by card?"], ["Three is a number.", false, "Paie : Can I pay by card?"]] },
    ],
    end: ["Sure! Here you go. Have a nice day!", "Bien sûr ! Voilà. Bonne journée !"],
  },
};
if (typeof module !== "undefined") module.exports = { MISSIONS };
