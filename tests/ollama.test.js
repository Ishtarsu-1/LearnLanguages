// Moteur Ollama : faux serveur Ollama local (aucun modèle réel nécessaire)
const http = require("http"), path = require("path");
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("  ok", m); };
let reply = null, lastBody = null;
const fake = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    lastBody = JSON.parse(b);
    const [status, content] = reply;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status === 200 ? { message: { role: "assistant", content } } : { error: "model not found" }));
  });
});
fake.listen(0, "127.0.0.1", async () => {
  process.env.MOCHI_LLM_PROVIDER = "ollama";
  process.env.OLLAMA_URL = `http://127.0.0.1:${fake.address().port}`;
  const llm = require(path.join(__dirname, "..", "llm.js"));
  const input = { lang: "ko", prompt: "Dis que tu aimes le café.", who: "À un inconnu", register: "haeyo", reference: null, text: "저는 커피을 좋아해" };
  const good = { verdict: "errors", recast: "저는 커피를 좋아해요.", errors: [{ type: "grammaire", original: "커피을", correction: "커피를", particle: "를", explanation: "Après une voyelle : 를." }], explanation: "커피 finit par une voyelle.", encouragement: "Presque !" };
  try {
    ok(llm.ENGINE === "Ollama (qwen2.5:7b-instruct)", "moteur et modèle par défaut");
    reply = [200, JSON.stringify(good)];
    const f = await llm.getFeedback(input);
    ok(f.recast === good.recast && f.errors[0].particle === "를", "réponse valide");
    ok(lastBody.model === "qwen2.5:7b-instruct" && lastBody.stream === false && lastBody.format?.type === "object" && lastBody.format.properties.verdict, "schéma JSON envoyé à Ollama");
    ok(lastBody.messages[1].content.includes("<learner_sentence>"), "phrase de l'apprenant isolée");
    reply = [200, JSON.stringify({ ...good, verdict: "correct" })];
    ok((await llm.getFeedback({ ...input, text: "저는 커피를 좋아해요." })).errors.length === 0, "verdict correct → aucune erreur listée");

    // Garde-fous déterministes
    const pp = (text, f, extra = {}) => llm.postProcess({ ...input, text, ...extra }, { errors: [], explanation: "", encouragement: "", ...f });
    let g = pp("영화가 재미있었어.", { verdict: "correct", recast: "영화가 재미있었어요." });
    ok(g.verdict === "errors" && g.errors.some((e) => e.type === "registre" && e.correction === "재미있었어요"), "반말 face à un inconnu → erreur de registre ajoutée");
    g = pp("저는 학생입니다.", { verdict: "errors", recast: "저는 학생이에요.", errors: [{ type: "registre", original: "학생입니다", correction: "학생이에요", particle: null, explanation: "x" }] });
    ok(g.verdict === "acceptable" && !g.errors.length, "합니다체 → acceptable, pas une faute de registre");
    g = pp("아메리카노 주세요", { verdict: "errors", recast: "아메리카노 주세요", errors: [{ type: "grammaire", original: "주", correction: "주세요", particle: "세요", explanation: "x" }] });
    ok(g.errors[0].particle === null, "fausse particule (세요) écartée");
    g = pp("I am agree.", { verdict: "acceptable", recast: "I agree.", errors: [{ type: "grammaire", original: "am agree", correction: "agree", particle: null, explanation: "x" }] }, { lang: "en", register: null });
    ok(g.verdict === "errors", "erreurs listées ⇒ verdict errors");
    g = pp("I live next door.", { verdict: "errors", recast: "I live next door.", errors: [] }, { lang: "en", register: null });
    ok(g.verdict === "correct", "aucune erreur et rien changé ⇒ correct");
    const fail = async (r, re, m) => { reply = r; try { await llm.getFeedback(input); ok(false, m); } catch (e) { ok(e instanceof llm.LlmUnavailable && re.test(e.message), `${m} (${e.message})`); } };
    await fail([200, "pas du json"], /illisible/, "JSON invalide refusé");
    await fail([200, JSON.stringify({ ...good, verdict: "bof" })], /illisible/, "JSON hors schéma refusé");
    await fail([200, JSON.stringify({ ...good, recast: "  " })], /illisible/, "correction vide refusée");
    await fail([404, ""], /ollama pull qwen2\.5:7b-instruct/, "modèle absent");
    fake.close();
    await new Promise((r) => setTimeout(r, 50));
    await fail([200, ""], /ne répond pas/, "Ollama arrêté");
  } catch (e) { fails++; console.log("ERREUR", e); }
  console.log(fails ? `\n${fails} échec(s)` : "\nOK : moteur Ollama");
  process.exit(fails ? 1 : 0);
});
