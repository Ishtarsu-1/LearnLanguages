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
  "ko-class": {
    lang: "ko", title: "Après le cours", icon: "🏫",
    role: "a friendly Korean teacher at a language academy, chatting with a new student after class",
    goal_en: "The learner must (1) say what they like in Korea (e.g. K-dramas, food) and (2) ask what time the class starts tomorrow.",
    goal_fr: "Dis ce que tu aimes en Corée, puis demande à quelle heure commence le cours demain.",
    register: "해요체 (polite -요 endings)",
    opening: ["모찌 씨, 한국 생활 어때요?", "Mochi, comment se passe la vie en Corée ?"],
    script: [
      { choices: [["재미있어요! 저는 한국 드라마를 좋아해요.", true, ""], ["저는 드라마예요.", false, "« Je suis un drama » 😄 Dis ce que tu aimes : …를 좋아해요."], ["한국이 학원이에요.", false, "« La Corée est une académie »… Dis ce que tu aimes : 한국 드라마를 좋아해요."]] },
      { npc: ["와, 좋아요! 질문 있어요?", "Super ! Tu as des questions ?"],
        choices: [["내일 수업이 몇 시에 시작해요?", true, ""], ["몇 시예요 내일?", false, "Presque ! En coréen, le verbe va à la fin : 내일 수업이 몇 시에 시작해요 ?"], ["수업이 맛있어요.", false, "« Le cours est délicieux » 😄 Demande l'heure : 몇 시에 시작해요 ?"]] },
    ],
    end: ["열 시에 시작해요. 내일 봐요!", "Il commence à dix heures. À demain !"],
  },
  "ko-noraebang": {
    lang: "ko", title: "Une soirée au 노래방", icon: "🎤",
    role: "a Korean friend inviting the learner to a noraebang (karaoke) on Friday",
    goal_en: "The learner must (1) accept the invitation, (2) ask where the noraebang is and (3) propose a time to meet.",
    goal_fr: "Accepte l'invitation, demande où est le karaoké, et propose une heure de rendez-vous.",
    register: "해요체 (polite -요 endings)",
    opening: ["모찌 씨, 금요일에 같이 노래방에 가요!", "Mochi, on va au karaoké ensemble vendredi ?"],
    script: [
      { choices: [["좋아요! 같이 가요.", true, ""], ["노래방이 커요.", false, "Elle t'invite ! Accepte : 좋아요! 같이 가요."], ["아니요, 저는 노래예요.", false, "« Non, je suis une chanson » 😄 Accepte : 좋아요!"]] },
      { npc: ["진짜 재미있을 거예요!", "Ça va être trop bien !"],
        choices: [["노래방이 어디에 있어요?", true, ""], ["어디예요 노래방에?", false, "Ordre coréen : 노래방이 어디에 있어요 ?"], ["노래방을 먹어요.", false, "« Je mange le karaoké »… Demande où il est : 어디에 있어요 ?"]] },
      { npc: ["집 근처에 있어요. 몇 시에 만나요?", "C'est près de chez toi. On se retrouve à quelle heure ?"],
        choices: [["일곱 시에 만나요!", true, ""], ["저는 일곱 살이에요.", false, "« J'ai sept ans » 😄 Pour l'heure, on dit 시 : 일곱 시에 만나요."], ["일곱 시예요 노래방.", false, "Propose un rendez-vous : 일곱 시에 만나요 !"]] },
    ],
    end: ["좋아요! 금요일에 봐요!", "Parfait ! À vendredi !"],
  },
  "en-directions": {
    lang: "en", title: "Lost in London", icon: "🗺️",
    role: "a friendly passer-by on a London street",
    goal_en: "The learner must (1) politely ask the way to the British Museum and (2) ask if it is far.",
    goal_fr: "Demande poliment le chemin du British Museum, puis demande si c'est loin.",
    register: "neutral, polite",
    opening: ["You look lost! Can I help?", "Tu as l'air perdue ! Je peux t'aider ?"],
    script: [
      { choices: [["Yes, please. Where is the British Museum?", true, ""], ["I am the museum.", false, "« Je suis le musée » 😄 Demande : Where is the British Museum?"], ["Museum is big.", false, "Demande ton chemin : Where is the British Museum?"]] },
      { npc: ["Go straight, then turn left at the bank.", "Va tout droit, puis tourne à gauche à la banque."],
        choices: [["Thank you! Is it far?", true, ""], ["Is it delicious?", false, "« C'est délicieux ? » 😄 Demande si c'est loin : Is it far?"], ["Far is it?", false, "En anglais, la question commence par le verbe : Is it far?"]] },
    ],
    end: ["No, about ten minutes on foot. Enjoy the museum!", "Non, environ dix minutes à pied. Profite bien du musée !"],
  },
  "en-karaoke": {
    lang: "en", title: "Karaoke night", icon: "🎤",
    role: "Priya, the learner's flatmate, inviting them to a karaoke night on Friday",
    goal_en: "The learner must (1) accept the invitation, (2) ask what time and (3) ask where they meet.",
    goal_fr: "Accepte l'invitation, demande à quelle heure, puis où vous vous retrouvez.",
    register: "casual, friendly",
    opening: ["Hey Mochi! Do you want to come to karaoke on Friday?", "Hé Mochi ! Tu veux venir au karaoké vendredi ?"],
    script: [
      { choices: [["Yes, I'd love to!", true, ""], ["Yes, I am karaoke.", false, "« Je suis un karaoké » 😄 Accepte : Yes, I'd love to!"], ["I don't know Friday.", false, "« Je ne connais pas vendredi »… Accepte : Yes, I'd love to!"]] },
      { npc: ["Great! It's going to be fun!", "Super ! Ça va être génial !"],
        choices: [["What time?", true, ""], ["What is time?", false, "« Qu'est-ce que le temps ? » 😄 Demande l'heure : What time?"], ["Time is fun.", false, "Demande l'heure : What time?"]] },
      { npc: ["At eight o'clock.", "À huit heures."],
        choices: [["Where do we meet?", true, ""], ["Where is eight?", false, "« Où est huit ? »… Demande le lieu : Where do we meet?"], ["We meet is where?", false, "En anglais : Where do we meet?"]] },
    ],
    end: ["At the station. See you on Friday!", "À la gare. À vendredi !"],
  },
};
if (typeof module !== "undefined") module.exports = { MISSIONS };
