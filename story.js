// ============================================================
//  Mochi — mode histoire (ROADMAP P2) : Mochi part vivre un an à l'étranger.
//  Chaque chapitre = une lecture graduée (moteur de library.js) + questions +
//  une mission de conversation (missions.js) : avec l'IA si elle est disponible,
//  sinon en mode guidé (réponses au choix). Un chapitre s'ouvre quand le précédent
//  est fini ET que ses mots clés sont en révision ; en coréen, il suit aussi la
//  progression de grammaire (§6) : le mode histoire *est* le parcours, en plus motivant.
// ============================================================

// N'ajoute au lexique que les mots absents (d'autres fichiers peuvent déjà les définir)
const addLexicon = (lang, words) => { for (const [k, v] of Object.entries(words)) LEXICON[lang][k] ||= v; };
addLexicon("en", {
  "arrive": { fr: "arriver", cog: true }, "airport": { fr: "aéroport" }, "english": { fr: "anglais (langue)" }, "big": { fr: "grand, gros" }, "tired": { fr: "fatigué" }, "happy": { fr: "content, heureux" },
  "train": { fr: "train", cog: true }, "city": { fr: "ville" }, "center": { fr: "centre", cog: true }, "line": { fr: "file d'attente, ligne" },
  "office": { fr: "bureau, guichet" }, "finally": { fr: "enfin, finalement" }, "flat": { fr: "appartement (UK)" }, "cozy": { fr: "douillet, cosy" },
  "share": { fr: "partager" }, "girl": { fr: "fille" }, "call": { fr: "appeler" }, "study": { fr: "étudier" }, "music": { fr: "musique", cog: true },
  "evening": { fr: "soir, soirée" }, "they": { fr: "ils, elles" }, "teach": { fr: "apprendre (à qqn), enseigner" }, "an": { fr: "un, une (devant voyelle)" },
  "indian": { fr: "indien", cog: true }, "recipe": { fr: "recette" }, "think": { fr: "penser" }, "like": { fr: "aimer ; comme" },
  "shop": { fr: "magasin, boutique" }, "before": { fr: "avant" }, "class": { fr: "cours, classe", cog: true }, "hot": { fr: "chaud" },
  "so": { fr: "alors, donc ; si" }, "iced": { fr: "glacé" }, "barista": { fr: "barista", cog: true }, "smile": { fr: "sourire" },
  "deep": { fr: "profond" }, "breath": { fr: "respiration, souffle" }, "first": { fr: "premier" }, "order": { fr: "commande ; commander" },
});
addLexicon("en", {
  "visit": { fr: "visiter" }, "museum": { fr: "musée", cog: true }, "phone": { fr: "téléphone", cog: true }, "dead": { fr: "mort ; déchargé (batterie)" },
  "map": { fr: "plan, carte" }, "man": { fr: "homme" }, "straight": { fr: "tout droit" }, "then": { fr: "puis, ensuite" }, "turn": { fr: "tourner" },
  "left": { fr: "gauche" }, "bank": { fr: "banque" }, "front": { fr: "avant (in front of = devant)" }, "of": { fr: "de" },
  "invite": { fr: "inviter", cog: true }, "karaoke": { fr: "karaoké", cog: true }, "bar": { fr: "bar", cog: true }, "shy": { fr: "timide" },
  "friend": { fr: "ami, amie" }, "sing": { fr: "chanter" }, "pop": { fr: "pop (musique)" }, "song": { fr: "chanson" }, "korean": { fr: "coréen (langue)" },
  "friday": { fr: "vendredi" }, "everybody": { fr: "tout le monde" }, "clap": { fr: "applaudir" }, "dance": { fr: "danser", cog: true },
});
addLexicon("ko", {
  "월요일": { fr: "lundi" }, "학원": { fr: "école privée, académie (cours du soir)" }, "반": { fr: "classe (groupe d'élèves)" }, "열": { fr: "dix (natif)" },
  "명": { fr: "personne (compteur)" }, "숫자": { fr: "chiffre, nombre" }, "수업": { fr: "cours" }, "끝나다": { fr: "finir, se terminer" },
  "떡볶이": { fr: "tteokbokki (gâteaux de riz épicés)" }, "저녁": { fr: "soir, dîner" }, "부르다": { fr: "appeler ; chanter (노래를 부르다)" },
  "노래방": { fr: "karaoké (salle)" }, "근처": { fr: "près, alentours" }, "처음": { fr: "début, première fois" }, "부끄럽다": { fr: "être gêné, timide" },
  "케이팝": { fr: "K-pop" }, "밤": { fr: "nuit, soirée" }, "친구": { fr: "ami, amie" },
});
addLexicon("ko", {
  "오다": { fr: "venir, arriver" }, "공항": { fr: "aéroport" }, "크다": { fr: "être grand" }, "피곤하다": { fr: "être fatigué" },
  "공항버스": { fr: "bus de l'aéroport" }, "저기": { fr: "là-bas" }, "버스": { fr: "bus" }, "이제": { fr: "maintenant, désormais" },
  "생활": { fr: "vie (quotidienne)" }, "시작되다": { fr: "commencer (ça commence)" }, "의": { fr: "de (possession : 모찌의 집 = la maison de Mochi)" },
  "새": { fr: "nouveau, nouvelle" }, "작다": { fr: "être petit" }, "창문": { fr: "fenêtre" }, "옆집": { fr: "maison d'à côté, voisin" },
  "할머니": { fr: "grand-mère, vieille dame" }, "친절하다": { fr: "être gentil, aimable" }, "기쁘다": { fr: "être content, joyeux" },
  "앞": { fr: "devant" }, "덥다": { fr: "faire chaud" }, "아이스": { fr: "glacé (ice)" }, "싶다": { fr: "vouloir (-고 싶다 : avoir envie de)" },
  "들어가다": { fr: "entrer" }, "직원": { fr: "employé(e)" }, "인사하다": { fr: "saluer" },
});

// keywords : mots à mettre en révision avant le chapitre suivant
// grammar (coréen) : point de grammaire de la phase 2 requis pour ouvrir le chapitre
const STORIES = {
  ko: [
    {
      id: "ko-story-seoul", story: true, title: "모찌의 서울 일 년", fr: "Un an à Séoul", icon: "🇰🇷", level: "A1", themes: ["transports", "rencontre", "cafe"],
      summary: "Mochi part vivre un an à Séoul : l'arrivée à l'aéroport, le nouveau logement, le café du coin… À chaque chapitre, une mission où tu parles pour de vrai.",
      chapters: [
        {
          title: "공항", grammar: "haeyo", mission: "ko-airport", keywords: ["공항", "타다", "버스"],
          sentences: [
            ["@모찌|는 오늘 @서울|에 왔어요=오다.", "Aujourd'hui, Mochi est arrivée à Séoul."],
            ["@인천 공항|은 정말 커요=크다.", "L'aéroport d'Incheon est vraiment grand."],
            ["@모찌|는 조금 피곤해요=피곤하다.", "Mochi est un peu fatiguée."],
            ["\"실례합니다=실례하다. @서울|에 어떻게 가요=가다?\"", "« Excusez-moi. Comment on va à Séoul ? »"],
            ["\"공항버스|를 타세요=타다. 저기|에 있어요=있다.\"", "« Prenez le bus de l'aéroport. Il est là-bas. »"],
            ["@모찌|는 버스|를 탔어요=타다. 이제 @서울 생활|이 시작돼요=시작되다!", "Mochi prend le bus. Sa vie à Séoul commence !"],
          ],
          questions: [
            { q: "Où arrive Mochi ?", options: ["À l'aéroport d'Incheon", "À la gare de Séoul", "Au port de Busan"] },
            { q: "Comment va-t-elle à Séoul ?", options: ["En bus", "En taxi", "À pied"] },
          ],
        },
        {
          title: "새 집", grammar: "eun-neun", mission: "ko-neighbor", keywords: ["작다", "크다", "할머니"],
          sentences: [
            ["@모찌|의 새 집|은 작아요=작다.", "Le nouveau logement de Mochi est petit."],
            ["하지만 창문|이 커요=크다.", "Mais la fenêtre est grande."],
            ["옆집|에 할머니|가 살아요=살다.", "Une vieille dame habite à côté."],
            ["할머니|는 아주 친절해요=친절하다.", "La vieille dame est très gentille."],
            ["할머니|가 김치|를 주셨어요=주다.", "Elle lui a donné du kimchi."],
            ["@모찌|는 정말 기뻤어요=기쁘다.", "Mochi est vraiment contente."],
          ],
          questions: [
            { q: "Comment est le nouveau logement ?", options: ["Petit, avec une grande fenêtre", "Grand et sombre", "Petit, sans fenêtre"] },
            { q: "Que donne la voisine ?", options: ["Du kimchi", "Du café", "Un livre"] },
          ],
        },
        {
          title: "동네 카페", grammar: "eul-reul", mission: "ko-cafe", keywords: ["덥다", "아이스", "직원"],
          sentences: [
            ["@모찌|의 집 앞|에 작은=작다 카페|가 있어요=있다.", "Devant chez Mochi, il y a un petit café."],
            ["@모찌|는 매일 아침 카페|에 가요=가다.", "Mochi va au café tous les matins."],
            ["오늘|은 날씨|가 더워요=덥다.", "Aujourd'hui, il fait chaud."],
            ["그래서 아이스 아메리카노|를 마시고=마시다 싶어요=싶다.", "Alors elle a envie d'un americano glacé."],
            ["@모찌|는 카페|에 들어갔어요=들어가다.", "Mochi entre dans le café."],
            ["직원|이 웃으면서=웃다 인사했어요=인사하다.", "L'employée la salue en souriant."],
          ],
          questions: [
            { q: "Quel temps fait-il ?", options: ["Chaud", "Froid", "Il pleut"] },
            { q: "Qu'est-ce que Mochi veut boire ?", options: ["Un americano glacé", "Un thé chaud", "Un jus d'orange"] },
          ],
        },
        {
          title: "한국어 수업", grammar: "i-ga", mission: "ko-class", keywords: ["학원", "수업", "끝나다"],
          sentences: [
            ["@모찌|는 월요일|에 한국어 학원|에 가요=가다.", "Le lundi, Mochi va à l'académie de coréen."],
            ["선생님|이 아주 재미있어요=재미있다.", "La professeure est très drôle."],
            ["반|에 학생|이 열 명 있어요=있다.", "Il y a dix élèves dans la classe."],
            ["@일본 사람|도 있고=있다 @미국 사람|도 있어요=있다.", "Il y a des Japonais et aussi des Américains."],
            ["오늘|은 숫자|를 배웠어요=배우다.", "Aujourd'hui, ils ont appris les nombres."],
            ["수업|이 끝나고=끝나다 친구|들|하고 떡볶이|를 먹었어요=먹다.", "Après le cours, Mochi a mangé des tteokbokki avec ses amis."],
          ],
          questions: [
            { q: "Où va Mochi le lundi ?", options: ["À l'académie de coréen", "À la banque", "Au marché"] },
            { q: "Qu'ont-ils appris aujourd'hui ?", options: ["Les nombres", "Les couleurs", "Les jours de la semaine"] },
          ],
        },
        {
          title: "노래방", grammar: "e", mission: "ko-noraebang", keywords: ["노래방", "부르다", "근처"],
          sentences: [
            ["금요일 저녁|에 친구|들|이 @모찌|를 불렀어요=부르다.", "Vendredi soir, ses amis ont appelé Mochi."],
            ["\"우리 노래방|에 가요=가다!\"", "« Allons au karaoké ! »"],
            ["노래방|은 집 근처|에 있어요=있다.", "Le karaoké est près de chez elle."],
            ["@모찌|는 처음|에 부끄러웠어요=부끄럽다.", "Au début, Mochi était intimidée."],
            ["하지만 케이팝|을 같이 불렀어요=부르다.", "Mais ils ont chanté de la K-pop ensemble."],
            ["정말 재미있는=재미있다 밤|이었어요=이다.", "C'était une soirée vraiment géniale."],
          ],
          questions: [
            { q: "Où vont-ils vendredi soir ?", options: ["Au karaoké", "Au cinéma", "Au restaurant"] },
            { q: "Que chantent-ils ?", options: ["De la K-pop", "Du rock français", "Des chansons de Noël"] },
          ],
        },
      ],
    },
  ],
  en: [
    {
      id: "en-story-london", story: true, title: "Mochi in London", fr: "Mochi à Londres", icon: "🇬🇧", level: "A1", themes: ["transports", "rencontre", "cafe"],
      summary: "Mochi part étudier un an à Londres : l'arrivée, la colocation, le café du coin… À chaque chapitre, une mission où tu parles pour de vrai.",
      chapters: [
        {
          title: "Arrival", mission: "en-ticket", keywords: ["train", "ticket", "city"],
          sentences: [
            ["@Mochi arrives=arrive in @London today.", "Mochi arrive à Londres aujourd'hui."],
            ["The airport is=be very big.", "L'aéroport est très grand."],
            ["@Mochi is=be tired but happy.", "Mochi est fatiguée mais contente."],
            ["She needs=need a train ticket to the city center.", "Elle a besoin d'un billet de train pour le centre-ville."],
            ["There is=be a long line at the ticket office.", "Il y a une longue file au guichet."],
            ["Finally, @Mochi is=be on the train. Hello, @London!", "Enfin, Mochi est dans le train. Bonjour, Londres !"],
          ],
          questions: [
            { q: "Qu'est-ce que Mochi doit acheter ?", options: ["Un billet de train", "Un café", "Un plan de la ville"] },
            { q: "Comment est l'aéroport ?", options: ["Très grand", "Petit", "Fermé"] },
          ],
        },
        {
          title: "The flat", mission: "en-flatmate", keywords: ["flat", "share", "evening"],
          sentences: [
            ["@Mochi's new flat is=be small but cozy.", "Le nouvel appartement de Mochi est petit mais douillet."],
            ["She shares=share it with a girl called=call @Priya.", "Elle le partage avec une fille qui s'appelle Priya."],
            ["@Priya studies=study music.", "Priya étudie la musique."],
            ["In the evening, they cook together.", "Le soir, elles cuisinent ensemble."],
            ["@Priya teaches=teach @Mochi an Indian recipe.", "Priya apprend une recette indienne à Mochi."],
            ["@Mochi thinks=think: \"I like it here!\"", "Mochi pense : « Je me plais ici ! »"],
          ],
          questions: [
            { q: "Avec qui Mochi partage-t-elle l'appartement ?", options: ["Priya", "Tom", "Léa"] },
            { q: "Que font-elles le soir ?", options: ["Elles cuisinent", "Elles courent", "Elles dorment"] },
          ],
        },
        {
          title: "The coffee shop", mission: "en-cafe", keywords: ["hot", "iced", "order"],
          sentences: [
            ["There is=be a small coffee shop on @Mochi's street.", "Il y a un petit café dans la rue de Mochi."],
            ["Every morning, @Mochi goes=go there before class.", "Tous les matins, Mochi y va avant les cours."],
            ["Today it's=it+be hot.", "Aujourd'hui, il fait chaud."],
            ["So she wants=want an iced coffee.", "Alors elle veut un café glacé."],
            ["The barista smiles=smile and says=say hello.", "La barista sourit et dit bonjour."],
            ["@Mochi takes=take a deep breath. Her first order in English!", "Mochi prend une grande inspiration. Sa première commande en anglais !"],
          ],
          questions: [
            { q: "Quel temps fait-il ?", options: ["Chaud", "Froid", "Il pleut"] },
            { q: "Qu'est-ce que Mochi veut ?", options: ["Un café glacé", "Un thé", "Un chocolat chaud"] },
          ],
        },
        {
          title: "Lost in London", mission: "en-directions", keywords: ["map", "turn", "museum"],
          sentences: [
            ["On Saturday, @Mochi wants=want to visit the @British @Museum.", "Samedi, Mochi veut visiter le British Museum."],
            ["But her phone is=be dead!", "Mais son téléphone est déchargé !"],
            ["She has=have no map.", "Elle n'a pas de plan."],
            ["She stops=stop a man in the street.", "Elle arrête un homme dans la rue."],
            ["\"Go straight, then turn left at the bank.\"", "« Va tout droit, puis tourne à gauche à la banque. »"],
            ["Ten minutes=minute later, @Mochi is=be in front of the museum.", "Dix minutes plus tard, Mochi est devant le musée."],
          ],
          questions: [
            { q: "Pourquoi Mochi est-elle perdue ?", options: ["Son téléphone est déchargé", "Elle a perdu son sac", "Il pleut"] },
            { q: "Où faut-il tourner à gauche ?", options: ["À la banque", "À l'école", "Au parc"] },
          ],
        },
        {
          title: "Karaoke night", mission: "en-karaoke", keywords: ["sing", "song", "shy"],
          sentences: [
            ["On Friday evening, @Priya invites=invite @Mochi to a karaoke bar.", "Vendredi soir, Priya invite Mochi dans un bar karaoké."],
            ["@Mochi is=be a bit shy.", "Mochi est un peu timide."],
            ["Her friends=friend sing pop songs=song.", "Ses amis chantent des chansons pop."],
            ["Then @Mochi chooses=choose a song in Korean!", "Puis Mochi choisit une chanson en coréen !"],
            ["Everybody claps=clap and dances=dance.", "Tout le monde applaudit et danse."],
            ["What a fun night!", "Quelle soirée géniale !"],
          ],
          questions: [
            { q: "Où va Mochi vendredi soir ?", options: ["Au karaoké", "Au musée", "À la bibliothèque"] },
            { q: "Dans quelle langue chante Mochi ?", options: ["En coréen", "En français", "En anglais"] },
          ],
        },
      ],
    },
  ],
};
for (const lang of Object.keys(STORIES)) for (const b of STORIES[lang]) registerBook(lang, b);

// ---------- Onglet « 🎬 Histoire » ----------
TABS.en.splice(1, 0, ["histoire", "🎬 Histoire"]);
TABS.ko.splice(2, 0, ["histoire", "🎬 Histoire"]);
TAB_VIEWS.histoire = (lang) => tabStory(lang);
function tabStory(lang) {
  return STORIES[lang].map((b) => {
    const done = b.chapters.filter((_, i) => chapterDone(lang, b, i)).length;
    return `<div class="card story-head">
        ${mochi("small", done ? "proud" : "curious")}
        <div><h2 class="section-title" style="margin:0"><span class="${koCls(lang)}">${esc(b.title)}</span></h2>
          <p class="muted" style="margin:4px 0 8px">${esc(b.fr)} · ${done} / ${b.chapters.length} chapitres</p>
          <p style="margin:0">${esc(b.summary)}</p></div>
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
      ${llmReady() ? `<button class="btn ghost small" data-act="mission-mode" data-m="ai" style="margin-top:10px">Parler librement avec l'IA</button>` : `<p class="muted"><small>Connecte-toi pour parler librement avec l'IA.</small></p>`}`;
  }
  return `<section class="view lesson-shell">
    <div class="lesson-top"><a class="close" href="${back}" aria-label="Quitter" data-act="stop">✕</a>
      <div style="flex:1"><h1 style="font-size:1.3rem">${M.icon} ${esc(M.title)}</h1></div>
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
