#!/usr/bin/env node
// ============================================================
//  Génération de textes calibrés par LLM (CONTENU-PIPELINE, lot C4)
//    npm run content:gen -- --unit ko-A1-07           les textes d'une unité du plan
//    npm run content:gen -- --next 5 --lang en        les 5 prochaines unités à écrire
//    npm run content:gen -- --unit ko-A1-07 --only 2  régénère seulement le 2e texte (bouton « Régénérer »)
//  Options : --engine ollama|anthropic (défaut : MOCHI_LLM_PROVIDER), --model <nom>,
//            --variants 2, --repair 1 (tours de correction si la meilleure variante est rouge), --no-review (sans relecture critique), --dry-run (affiche le prompt)
//  Pour chaque texte : 2 variantes → annotation (Kiwi / lemmatiseur) → vérification (lot C5)
//  → on garde la meilleure → relecture critique par un 2e appel (review_notes) → traductions
//  proposées pour les lemmes absents du lexique (lexicon_new, à valider) → content/drafts/.
// ============================================================
const path = require("node:path");
const { z } = require("zod");
const L = require("./content-lib.js");
const P = require("./plan-lib.js");
const { annotate } = require("./annotate.js");
const { checkText, score, LENGTH, expectedRegister } = require("./content-check.js");
const llm = require("../llm.js");

const LANG_NAMES = { en: "English", ko: "Korean" };
const THEME_EN = { cafe: "at a café", rencontre: "meeting someone", transports: "public transport", cuisine: "cooking", sport: "sport", series: "TV series and K-dramas", gaming: "video games", travail: "at work" };
const KIND_EN = { Dialogue: "a dialogue between two people (alternate speakers)", "Récit": "a short first-person or third-person story", Monologue: "a short monologue where someone talks about themselves", Message: "a short text message or note to a friend" };
const ICONS = { cafe: "☕", rencontre: "👋", transports: "🚇", cuisine: "🍳", sport: "⚽", series: "📺", gaming: "🎮", travail: "💼" };

const GenSchema = z.object({
  title_fr: z.string(),
  icon: z.string(),
  sentences: z.array(z.object({ speaker: z.string(), text: z.string(), fr: z.string() })),
});
const ReviewSchema = z.object({
  notes: z.array(z.object({
    sentence: z.number().int(),
    type: z.enum(["naturel", "erreur", "traduction", "culture", "ambiguite"]),
    issue_fr: z.string(),
    suggestion: z.string(),
    suggestion_fr: z.string(),
  })),
  overall_fr: z.string(),
});
const LexSchema = z.object({ entries: z.array(z.object({ lemma: z.string(), fr: z.string() })) });

// ---------- Prompts ----------
const GEN_SYSTEM = `You write graded reading texts for Mochi, a site where French speakers learn English or Korean.
Each text must be comprehensible input: almost every word already known by the learner, plus a few new words that the text teaches through repetition and context.

Hard rules:
- Use ONLY words from the allowed list, plus the new words, plus proper names. Inflected forms of allowed words are fine. If you need a word that is not allowed, rephrase.
- Every new word must appear at least twice in the text.
- Natural sentences, exactly as a native speaker would say them in this situation: no textbook phrasing, no translated French.
- A natural, idiomatic French translation for every sentence (not word-for-word).
- No real people, no brands, no sensitive topics (politics, religion, violence, health problems). Fictional first names only.
- Short sentences for beginners.`;
const KO_RULES = `
Korean rules:
- Hangul only. Absolutely NO romanization and no Latin letters (except proper names written in Hangul anyway).
- Register: REGISTER_HERE. Keep it consistent in every sentence (set phrases like 감사합니다 are fine).
- Accurate Korean culture, no clichés (no "everyone loves kimchi and K-pop" stereotypes).
- Use natural spacing (띄어쓰기).`;
const EN_RULES = `
English rules:
- Everyday spoken English, contractions are welcome (I'm, don't).
- Obvious French-English cognates (important, music, restaurant, student…) count as known: you may use them freely.`;

function genPrompt(lang, unit, kind, { known, lengths }) {
  const reg = { haeyo: "polite 해요체 (-아요/-어요 endings)", formal: "formal 합니다체 (-ㅂ니다 endings)", plain: "casual 반말 between close friends" }[expectedRegister(unit)];
  const grammar = unit.grammar.map((g) => unit._grammarLabels?.[g] || g).join(", ");
  const allowed = [...known].filter((w) => !/^\d+$/.test(w) && !P.BASE[lang].has(w)).slice(0, 700);
  return {
    system: GEN_SYSTEM + (lang === "ko" ? KO_RULES.replace("REGISTER_HERE", reg) : EN_RULES),
    user: [
      `Language: ${LANG_NAMES[lang]} · level ${unit.level}`,
      `Kind of text: ${KIND_EN[kind] || kind}`,
      `Situation / theme: ${unit.themes.map((t) => THEME_EN[t] || t).join(", ") || "everyday life"}`,
      grammar ? `Grammar point to use at least twice: ${grammar}` : null,
      unit.first_steps ? `This is one of the very first texts for an absolute beginner: build it mostly on French-English cognates and the new words.` : null,
      `Length: ${lengths[0]} to ${lengths[1]} sentences, short ones.`,
      ``,
      `NEW words (use each at least twice): ${unit.new_words.join(", ")}`,
      `Review words (use them if they fit): ${(unit.review_words || []).join(", ") || "—"}`,
      `Allowed words (dictionary forms): ${allowed.join(", ")}`,
      ``,
      `Return: title_fr (short French title), icon (one emoji), sentences (speaker: a first name for dialogues, "" otherwise; text; fr).`,
      ``,
      `Reminders: each of these words twice: ${unit.new_words.join(", ")}. No word outside the allowed list. ONE short sentence per item (never several sentences in one item). ${lang === "ko" ? "Every sentence ends in the same register. " : ""}"fr" is in French only (no Chinese, no Korean).`,
    ].filter((l) => l !== null).join("\n"),
  };
}
const REVIEW_SYSTEM = `You are a native LANG speaker and an experienced teacher reviewing a graded reader for French-speaking beginners.
For each sentence, flag only real problems: unnatural phrasing ("naturel"), errors ("erreur"), inaccurate French translation ("traduction"), cultural inaccuracy or cliché ("culture"), ambiguity ("ambiguite").
Do not rewrite the text. For each problem give: sentence (1-based number), type, issue_fr (one short French sentence), suggestion (the corrected sentence in the target language, plain text without annotations, or the corrected French translation for "traduction"), suggestion_fr (French translation of the suggestion).
"suggestion" is written in the TARGET LANGUAGE (LANG), except for "traduction" notes where it is the corrected French. Keep suggestions within the same simple vocabulary. If everything is fine, return an empty list. overall_fr: one short French sentence on the text as a whole.`;
const LEX_SYSTEM = `You write a bilingual glossary for French speakers. For each lemma (dictionary form), give a short French gloss (1 to 4 words, the meaning used in the sentences given). For Korean verbs and adjectives, use a French infinitive (« être grand », « manger »).`;

const summary = (c) => `${{ green: "🟢", orange: "🟠", red: "🔴" }[c.status]} ${c.blocking.length} bloquant(s), ${c.warnings.length} avertissement(s)${c.stats.coverage !== undefined ? `, couverture ${c.stats.coverage} %` : ""}`;

// ---------- Génération d'un texte ----------
async function generateText(lang, unit, n, opts = {}) {
  const plan = opts.plan, lexicon = opts.lexicon, freq = opts.freq, texts = opts.texts;
  const kind = unit.kinds?.[(n - 1) % (unit.kinds.length || 1)] || "Dialogue";
  const known = P.knownBefore(lang, plan, unit.unit, { lexicon, freq, texts });
  // Anglais : les mots transparents sont permis sans être listés (liste plus courte)
  const list = lang === "en" ? new Set([...known].filter((w) => !(freq.find((f) => f.lemma === w)?.cog) || lexicon[w])) : known;
  const [minS, maxS] = LENGTH[unit.level] || LENGTH.A1;
  unit._grammarLabels = Object.fromEntries((plan.grammar_order || []).map((g) => [g.id, g.label]));
  const prompt = genPrompt(lang, unit, kind, { known: list, lengths: [minS, maxS] });
  if (opts.dryRun) return { prompt };
  const id = `${unit.unit.toLowerCase()}-${n}`;
  const variants = [];
  const toDraft = async (out, meta) => {
    const raw = out.sentences.filter((s) => s.text.trim() && s.fr.trim());
    const annotated = await annotate(raw.map((s) => s.text), lang, { analyze: opts.analyze });
    const draft = {
      id, lang, level: unit.level, unit: unit.unit, themes: unit.themes, grammar: unit.grammar,
      title: out.title_fr.trim().slice(0, 80), icon: [...(out.icon || "")].slice(0, 2).join("") || ICONS[unit.themes[0]] || "📖", kind,
      status: "draft", source: { type: "generated", engine: meta.engine, author: "Mochi", license: "CC BY 4.0" },
      sentences: annotated.map((s, i) => [s, raw[i].fr.trim()]),
      speakers: kind === "Dialogue" && raw.some((s) => s.speaker) ? raw.map((s) => s.speaker || "") : null,
    };
    return { draft, checks: checkText(draft, { plan, lexicon, freq, texts, others: opts.others }), out };
  };
  for (let v = 0; v < (opts.variants || 2); v++) {
    const meta = {};
    let out;
    try { out = await llm.structured({ ...prompt, schema: GenSchema, engine: opts.engine, model: opts.model, temperature: 0.8 }, meta); }
    catch (e) { opts.log?.(`   variante ${v + 1} : ${e.message}\n`); if (e instanceof llm.LlmUnavailable && v === 0 && /clé|injoignable|ne répond pas|absent/.test(e.message)) throw e; continue; }
    const v1 = await toDraft(out, meta);
    variants.push(v1);
    opts.log?.(`   variante ${v + 1} : ${summary(v1.checks)}\n`);
  }
  if (!variants.length) throw new Error(`${id} : aucune variante utilisable`);
  variants.sort((a, b) => score(a.checks) - score(b.checks));
  // Réparation : la meilleure variante a des problèmes bloquants → on les renvoie au modèle
  for (let k = 0; k < (opts.repair ?? 1) && variants[0].checks.blocking.length; k++) {
    const best = variants[0], meta = {};
    try {
      const out = await llm.structured({ ...prompt, schema: GenSchema, engine: opts.engine, model: opts.model, temperature: 0.4,
        user: `${prompt.user}\n\nHere is a previous attempt:\n${JSON.stringify(best.out)}\n\nAn automatic checker found these problems (in French):\n- ${best.checks.blocking.join("\n- ")}\n\nRewrite the text to fix every problem, keeping what was good.` }, meta);
      const fixed = await toDraft(out, meta);
      opts.log?.(`   réparation ${k + 1} : ${summary(fixed.checks)}\n`);
      variants.push(fixed); variants.sort((a, b) => score(a.checks) - score(b.checks));
    } catch (e) { opts.log?.(`   réparation : ${e.message}\n`); break; }
  }
  const { draft, checks } = variants[0];
  draft.checks = checks;
  draft.variants_scores = variants.map((v) => v.checks.status);
  // Lexique : traductions proposées, à valider dans l'admin
  const missing = checks.stats.lexiconMissing || [];
  if (missing.length) {
    try {
      const r = await llm.structured({ system: LEX_SYSTEM, schema: LexSchema, engine: opts.engine, model: opts.model, temperature: 0.2,
        user: `Language: ${LANG_NAMES[lang]}\nLemmas: ${missing.join(", ")}\n\nSentences:\n${draft.sentences.map(([s]) => L.plainText(s, lang)).join("\n")}` });
      draft.lexicon_new = Object.fromEntries(r.entries.filter((e) => missing.includes(e.lemma) && e.fr.trim()).map((e) => [e.lemma, { fr: e.fr.trim(), todo_review: true }]));
    } catch (e) { opts.log?.(`   traductions du lexique : ${e.message}\n`); }
  }
  // Relecture critique (2e appel) : propose, ne réécrit pas
  if (opts.review !== false) {
    try {
      const r = await llm.structured({ system: REVIEW_SYSTEM.replaceAll("LANG", LANG_NAMES[lang]), schema: ReviewSchema, engine: opts.engine, model: opts.model, temperature: 0.2, effort: "high",
        user: draft.sentences.map(([s, fr], i) => `${i + 1}. ${L.plainText(s, lang)}\n   FR: ${fr}`).join("\n") });
      draft.review_notes = r.notes.filter((x) => x.sentence >= 1 && x.sentence <= draft.sentences.length).map((x, i) => ({ id: `n${i + 1}`, ...x, status: "open" }));
      draft.review_overall = r.overall_fr;
    } catch (e) { opts.log?.(`   relecture critique : ${e.message}\n`); draft.review_notes = []; }
  }
  draft.generated_at = new Date().toISOString();
  return { draft };
}

// Unités qui ont encore des textes à écrire (brouillons et textes publiés comptés)
function pendingUnits(lang, plan, { drafts = L.loadDrafts(), texts = L.loadKind("texts", { published: false })[lang] } = {}) {
  const have = {};
  for (const t of [...drafts.filter((d) => d.lang === lang), ...texts]) if (t.unit) have[t.unit] = (have[t.unit] || 0) + 1;
  return plan.units.filter((u) => !u.legacy && (u.texts || 0) > (have[u.unit] || 0)).map((u) => ({ unit: u, from: (have[u.unit] || 0) + 1 }));
}

async function run(args, log = (s) => process.stdout.write(s)) {
  const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const unitId = get("--unit"), lang = unitId ? unitId.slice(0, 2) : get("--lang");
  if (!L.LANGS.includes(lang)) throw new Error("Usage : npm run content:gen -- --unit ko-A1-07 | --next 5 --lang en [--engine ollama|anthropic]");
  const plan = L.loadPlan(lang), lexicon = L.loadLexicon()[lang], freq = L.loadFreq(lang), texts = L.loadKind("texts")[lang];
  const drafts = L.loadDrafts();
  let todo;
  if (unitId) {
    const u = plan.units.find((x) => x.unit === unitId);
    if (!u || u.legacy) throw new Error(`Unité inconnue : ${unitId}`);
    const only = Number(get("--only", 0));
    todo = [{ unit: u, from: only || 1, to: only || undefined }];
  } else todo = pendingUnits(lang, plan, { drafts }).slice(0, Number(get("--next", 1)));
  if (!todo.length) { log("Rien à écrire : toutes les unités du plan ont leurs textes (npm run plan:suggest pour en ajouter).\n"); return []; }
  const others = new Set([...L.LANGS.flatMap((l) => L.loadKind("texts", { published: false })[l]), ...drafts].map((t) => t.id));
  const opts = { plan, lexicon, freq, texts, engine: get("--engine"), model: get("--model"), variants: Number(get("--variants", 2)), repair: Number(get("--repair", 1)), review: !args.includes("--no-review"), dryRun: args.includes("--dry-run"), log };
  const written = [];
  for (const { unit, from, to } of todo) {
    for (let n = from; n <= (to || Math.max(unit.texts || 1, from)); n++) {
      const id = `${unit.unit.toLowerCase()}-${n}`;
      log(`✍️  ${id} · ${unit.themes.join(", ")} · ${unit.grammar.join(", ") || "—"} · nouveaux : ${unit.new_words.join(", ")}\n`);
      const r = await generateText(lang, unit, n, { ...opts, others: new Set([...others].filter((x) => x !== id)) });
      if (opts.dryRun) { log(`--- système ---\n${r.prompt.system}\n--- message ---\n${r.prompt.user}\n\n`); continue; }
      const file = path.join(L.CONTENT_DIR, "drafts", `${id}.json`);
      L.writeJSON(file, r.draft);
      others.add(id); written.push(file);
      log(`   → content/drafts/${id}.json (${r.draft.checks.status}, ${r.draft.review_notes?.length ?? 0} remarque(s) du relecteur)\n`);
    }
  }
  return written;
}

if (require.main === module) {
  run(process.argv.slice(2)).then((w) => { if (w.length) console.log(`\n${w.length} brouillon(s) prêt(s) : relis-les dans l'admin (#/admin/contenu).`); })
    .catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
module.exports = { run, generateText, genPrompt, pendingUnits, GenSchema, ReviewSchema, LexSchema };
