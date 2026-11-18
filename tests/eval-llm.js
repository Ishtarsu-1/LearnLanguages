// Évaluation RÉELLE du correcteur (appelle le moteur configuré : Ollama ou Claude).
//   MOCHI_LLM_PROVIDER=ollama node tests/eval-llm.js
//   node --env-file=.env tests/eval-llm.js        (Claude : consomme des crédits)
//   MOCHI_MODEL=claude-sonnet-5-5 node --env-file=.env tests/eval-llm.js   (comparer un modèle plus léger)
//   MOCHI_MODEL=claude-haiku-5-5  node --env-file=.env tests/eval-llm.js
// Mesure, sur des phrases typiques d'apprenants, si le correcteur trouve les vraies
// erreurs SANS sur-corriger les phrases justes (§4), et le temps de réponse.
const llm = require("../llm.js");

const KO = { lang: "ko", who: "À un·e inconnu·e", register: "haeyo" };
const EN = { lang: "en" };
const CASES = [
  { ...KO, prompt: "Dis que tu aimes le café.", text: "저는 커피을 좋아해", expect: "errors", recastHas: ["커피를", "요"], types: ["registre"], why: "particule 를 + registre -요" },
  { ...KO, prompt: "Dis que tu aimes le café.", text: "저는 커피를 좋아해요.", expect: "ok", why: "phrase correcte" },
  { ...KO, prompt: "Dis que tu aimes le café.", text: "커피 좋아해요.", expect: "ok", why: "particule omise : acceptable à l'oral" },
  { ...KO, prompt: "Dis que tu as mangé des tteokbokki au marché.", text: "시장에 떡볶이를 먹었어요.", expect: "errors", recastHas: ["시장에서"], why: "에 → 에서 (lieu d'action)" },
  { ...KO, prompt: "Dis que tu es étudiant(e).", text: "저는 학생입니다.", expect: "ok", noTypes: ["registre"], why: "합니다체 : plus formel mais pas une faute" },
  { ...KO, prompt: "Dis que le film était vraiment bien.", text: "영화가 정말 재미있었어.", expect: "errors", types: ["registre"], recastHas: ["요"], why: "반말 avec un inconnu" },
  { ...EN, prompt: "Dis que tu habites à côté.", text: "I live next door.", expect: "ok", why: "phrase correcte" },
  { ...EN, prompt: "Dis que tu es d'accord.", text: "I am agree with you.", expect: "errors", recastHas: ["I agree"], why: "*I am agree" },
  { ...EN, prompt: "Dis que tu travailles dans un hôpital.", text: "Actually, I work in a hospital.", expect: "ok", why: "phrase correcte" },
  { ...EN, prompt: "Raconte ce que tu as fait hier.", text: "Yesterday I go to the cinema with my sister.", expect: "errors", recastHas: ["went"], why: "passé : went" },
];

(async () => {
  console.log(`Moteur : ${llm.ENGINE} · modèle : ${llm.MODEL}\n`);
  let pass = 0, totalMs = 0, cost = 0;
  for (const c of CASES) {
    const t0 = Date.now();
    let f, err;
    const meta = {};
    try { f = await llm.getFeedback({ lang: c.lang, prompt: c.prompt, who: c.who || null, register: c.register || null, reference: null, text: c.text }, meta); } catch (e) { err = e.message; }
    cost += llm.costOf(meta.usage);
    const ms = Date.now() - t0; totalMs += ms;
    const problems = [];
    if (err) problems.push(`erreur : ${err}`);
    else {
      const flagged = f.verdict === "errors";
      if (c.expect === "ok" && flagged) problems.push("sur-correction (phrase juste marquée fausse)");
      if (c.expect === "errors" && !flagged) problems.push("faute non détectée");
      for (const s of c.recastHas || []) if (!f.recast.includes(s)) problems.push(`correction sans « ${s} »`);
      const types = f.errors.map((e) => e.type);
      for (const t of c.types || []) if (!types.includes(t)) problems.push(`type « ${t} » manquant`);
      for (const t of c.noTypes || []) if (types.includes(t)) problems.push(`type « ${t} » en trop`);
    }
    const okCase = !problems.length;
    if (okCase) pass++;
    console.log(`${okCase ? "✅" : "❌"} [${c.lang}] ${c.text}   (${(ms / 1000).toFixed(1)} s, attendu : ${c.why})`);
    if (f) console.log(`   → ${f.verdict} : ${f.recast}${f.errors.length ? `  [${f.errors.map((e) => `${e.type}: ${e.original}→${e.correction}`).join(" ; ")}]` : ""}`);
    if (f?.explanation) console.log(`   💡 ${f.explanation}`);
    for (const p of problems) console.log(`   ⚠️  ${p}`);
  }
  console.log(`\nScore : ${pass}/${CASES.length} · temps moyen : ${(totalMs / CASES.length / 1000).toFixed(1)} s par correction · coût estimé : ${(cost / CASES.length * 100).toFixed(2)} centime(s) de $ par correction`);
})();
