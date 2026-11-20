// ============================================================
//  Mochi — relecture et publication du contenu (CONTENU-PIPELINE, lots C6 et C8)
//  Routes /api/admin/content/* (admins uniquement, vérifié par server.js).
//  Sécurité : l'écriture sur disque se fait UNIQUEMENT dans content/, et jamais avec un
//  chemin fourni par le client : seuls des identifiants validés par ID_RE sont acceptés,
//  le chemin est reconstruit ici.
// ============================================================
const fs = require("node:fs"), path = require("node:path");
const { execFile } = require("node:child_process");
const L = require("./tools/content-lib.js");
const P = require("./tools/plan-lib.js");
const { annotate } = require("./tools/annotate.js");
const { checkText } = require("./tools/content-check.js");
const { build } = require("./tools/content-build.js");

const UNIT_RE = /^[a-z]{2}-[A-Z][0-9]-[0-9a-z]{1,10}$/;
const MAX_TEXT = 300;

function create({ dir = L.CONTENT_DIR, out, analyze, onPublished = () => {}, spawnGen } = {}) {
  const draftsDir = path.join(dir, "drafts");
  const draftFile = (id) => { if (!L.ID_RE.test(String(id))) throw httpError(400, "Identifiant invalide."); return path.join(draftsDir, `${id}.json`); };
  const readDraft = (id) => { const f = draftFile(id); if (!fs.existsSync(f)) throw httpError(404, "Brouillon introuvable."); return L.readJSON(f); };
  const saveDraft = (d) => L.writeJSON(draftFile(d.id), d);
  const jobs = new Map(); // régénérations en cours : id → { started, error }

  const ctxFor = (lang) => ({ plan: L.loadPlan(lang, dir), lexicon: { ...L.loadLexicon(dir)[lang] }, freq: L.loadFreq(lang, dir), texts: L.loadKind("texts", { dir })[lang] });
  const otherIds = (d) => new Set([...L.LANGS.flatMap((l) => L.loadKind("texts", { dir, published: false })[l]), ...L.loadDrafts(dir)].filter((x) => x.id !== d.id && x.lang === d.lang).map((x) => x.id));
  // Re-vérifie un brouillon (le lexique proposé et validé compte comme présent)
  function recheck(d) {
    const ctx = ctxFor(d.lang);
    for (const [k, v] of Object.entries(d.lexicon_new || {})) if (!v.todo_review) ctx.lexicon[k] = v;
    d.checks = checkText(d, { ...ctx, others: otherIds(d) });
    // Propositions de lexique : on retire celles devenues inutiles, on signale les nouveaux manques
    const missing = new Set(d.checks.stats.lexiconMissing || []);
    const used = new Set(L.textLemmas(d.sentences, d.lang));
    d.lexicon_new = Object.fromEntries(Object.entries(d.lexicon_new || {}).filter(([k]) => used.has(k)));
    for (const k of missing) d.lexicon_new[k] ||= { fr: "", todo_review: true };
    return d;
  }
  // Texte brut ou déjà annoté (contient = ou | ou @) → phrase annotée
  async function toAnnotated(text, lang) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > MAX_TEXT) throw httpError(400, `Phrase vide ou trop longue (${MAX_TEXT} caractères au plus).`);
    if (/[=|@]/.test(text)) return text;
    try { return (await annotate([text], lang, { analyze }))[0]; }
    catch (e) { throw httpError(503, e.message); }
  }
  const summary = (d, planIdx) => ({
    id: d.id, lang: d.lang, unit: d.unit || null, unitIndex: planIdx[d.lang]?.[d.unit] ?? 1e6, title: d.title, icon: d.icon, kind: d.kind, level: d.level,
    status: d.checks?.status || "red", blocking: d.checks?.blocking?.length || 0, warnings: d.checks?.warnings?.length || 0, coverage: d.checks?.stats?.coverage ?? null,
    notes: (d.review_notes || []).filter((n) => n.status === "open").length, lexiconTodo: Object.values(d.lexicon_new || {}).filter((v) => v.todo_review).length,
    sentences: d.sentences.length, generated_at: d.generated_at || null, regenerating: jobs.has(d.id),
  });

  // ---------- Actions ----------
  async function editSentence(d, i, { text, fr }) {
    if (!Number.isInteger(i) || i < 0 || i >= d.sentences.length) throw httpError(400, "Phrase inconnue.");
    if (text !== undefined) d.sentences[i][0] = await toAnnotated(text, d.lang);
    if (fr !== undefined) { fr = String(fr).trim(); if (!fr || fr.length > MAX_TEXT) throw httpError(400, "Traduction vide ou trop longue."); d.sentences[i][1] = fr; }
  }
  async function act(id, body) {
    const d = readDraft(id), a = body.action;
    if (a === "edit") await editSentence(d, Number(body.i), body);
    else if (a === "delete-sentence") { const i = Number(body.i); if (d.sentences.length <= 1 || !(i >= 0 && i < d.sentences.length)) throw httpError(400, "Phrase inconnue."); d.sentences.splice(i, 1); d.speakers?.splice(i, 1); for (const n of d.review_notes || []) if (n.sentence - 1 === i) n.status = "ignored"; else if (n.sentence - 1 > i) n.sentence--; }
    else if (a === "note") {
      const n = (d.review_notes || []).find((x) => x.id === body.note);
      if (!n) throw httpError(404, "Remarque introuvable.");
      if (body.decision === "accept") {
        if (n.type === "traduction") await editSentence(d, n.sentence - 1, { fr: n.suggestion });
        else await editSentence(d, n.sentence - 1, { text: n.suggestion, fr: n.suggestion_fr || undefined });
        n.status = "accepted";
      } else if (body.decision === "ignore") n.status = "ignored";
      else throw httpError(400, "Décision inconnue.");
    } else if (a === "lexicon") {
      const lemma = String(body.lemma || ""), fr = String(body.fr || "").trim();
      if (!d.lexicon_new?.[lemma]) throw httpError(404, "Lemme inconnu.");
      if (!fr || fr.length > 120) throw httpError(400, "Traduction vide ou trop longue.");
      d.lexicon_new[lemma] = { fr };
    } else if (a === "meta") {
      if (body.title !== undefined) { const t = String(body.title).trim(); if (!t || t.length > 80) throw httpError(400, "Titre invalide."); d.title = t; }
      if (body.icon !== undefined) d.icon = [...String(body.icon)].slice(0, 2).join("") || d.icon;
    } else throw httpError(400, "Action inconnue.");
    if (a !== "lexicon" && !(a === "note" && body.decision === "ignore")) d.edited = true; // texte touché par la relecture
    recheck(d);
    saveDraft(d);
    return d;
  }
  function publish(id, by) {
    const d = recheck(readDraft(id));
    if (d.checks.blocking.length) throw httpError(409, `Problèmes bloquants à corriger d'abord : ${d.checks.blocking.join(" ; ")}`);
    const todo = Object.entries(d.lexicon_new || {}).filter(([, v]) => v.todo_review || !v.fr);
    if (todo.length) throw httpError(409, `Traductions du lexique à valider d'abord : ${todo.map(([k]) => k).join(", ")}`);
    // Lexique : ajout des nouvelles entrées validées (à la fin : moins fréquentes que l'existant)
    const lexFile = path.join(dir, "lexicon", `${d.lang}.json`);
    const lex = L.readJSON(lexFile);
    for (const [k, v] of Object.entries(d.lexicon_new || {})) if (!lex[k]) lex[k] = { fr: v.fr };
    // Texte : ordre après le dernier texte publié de la langue
    const texts = L.loadKind("texts", { dir, published: false })[d.lang];
    const order = Math.max(0, ...texts.map((t) => t.order || 0)) + 10;
    const { checks, review_notes, review_overall, review_checklist, ai_review, lexicon_new, variants_scores, _file, edited, ...rest } = d;
    const text = { ...rest, source: { ...rest.source, ...(rest.source?.type === "generated" ? { edited: !!edited } : {}) }, order, status: "published", review: { by, at: new Date().toISOString().slice(0, 10) } };
    const errs = L.validateText(text);
    if (errs.length) throw httpError(409, errs.join(" ; "));
    const target = path.join(dir, "texts", d.lang, `${d.id}.json`);
    if (fs.existsSync(target)) throw httpError(409, "Un texte publié porte déjà cet identifiant.");
    L.writeLexicon(lexFile, lex);
    L.writeJSON(target, text);
    fs.unlinkSync(draftFile(d.id));
    const r = build({ dir, out, log() {} });
    if (!r.ok) { // on revient en arrière : jamais de site cassé par une publication
      fs.unlinkSync(target); saveDraft(d);
      throw httpError(500, `Le build a échoué : ${r.errors.join(" ; ")}`);
    }
    onPublished(d.lang, text);
    return { id: d.id, stats: r.stats };
  }
  function reject(id, reason) {
    const d = readDraft(id);
    reason = String(reason || "").trim();
    if (!reason || reason.length > 500) throw httpError(400, "Donne une raison (500 caractères au plus) : elle sert à améliorer le prompt.");
    fs.appendFileSync(path.join(draftsDir, "rejected.jsonl"), JSON.stringify({ id: d.id, lang: d.lang, unit: d.unit, reason, at: new Date().toISOString(), engine: d.source?.engine, title: d.title, sentences: d.sentences }) + "\n");
    fs.unlinkSync(draftFile(id));
    return { ok: true };
  }
  function regenerate(id) {
    const d = readDraft(id), m = d.id.match(/-(\d+)$/);
    if (!d.unit || !UNIT_RE.test(d.unit) || !m) throw httpError(400, "Ce brouillon n'est pas rattaché à une unité du plan.");
    if (jobs.has(id)) throw httpError(409, "Régénération déjà en cours.");
    // Arguments fixes et validés, pas de shell
    const args = [path.join(__dirname, "tools", "content-gen.js"), "--unit", d.unit, "--only", m[1]];
    jobs.set(id, { started: Date.now() });
    (spawnGen || ((a, cb) => execFile(process.execPath, a, { cwd: __dirname, timeout: 30 * 60e3, env: process.env }, cb)))(args, (err) => {
      if (err) console.error(`Régénération de ${id} :`, err.message);
      jobs.delete(id);
    });
    return { started: true };
  }

  // ---------- Lexique : propositions du LLM à relire (v0.5, lot 2.2) ----------
  const propFile = (lang) => path.join(dir, "lexicon", `${lang}.proposals.json`);
  const readProps = (lang) => { try { return L.readJSON(propFile(lang)); } catch { return {}; } };
  function lexiconView() {
    const lex = L.loadLexicon(dir);
    return Object.fromEntries(L.LANGS.map((l) => [l, { size: Object.keys(lex[l]).length, proposals: Object.entries(readProps(l)).map(([lemma, v]) => ({ lemma, fr: v.fr, unit: v.unit || null, checked: v.checked || null })) }]));
  }
  function lexiconAct(b) {
    if (!L.LANGS.includes(b.lang)) throw httpError(400, "Langue inconnue.");
    if (!["accept", "skip", "accept-checked"].includes(b.action)) throw httpError(400, "Action inconnue.");
    const props = readProps(b.lang), lexFile = path.join(dir, "lexicon", `${b.lang}.json`), lex = L.readJSON(lexFile);
    // « accept-checked » : toutes les propositions déjà relues (checked), telles quelles
    const items = b.action === "accept-checked" ? Object.keys(props).filter((k) => props[k].checked).map((lemma) => ({ lemma }))
      : Array.isArray(b.items) ? b.items.slice(0, 200) : [];
    if (b.action === "accept-checked") b = { ...b, action: "accept" };
    let n = 0;
    for (const it of items) {
      const lemma = String(it?.lemma || "");
      if (!props[lemma]) continue; // seulement des mots proposés : jamais un mot inventé par le client
      if (b.action === "accept") {
        const fr = String(it.fr ?? props[lemma].fr).trim();
        if (!fr || fr.length > 120) throw httpError(400, `Traduction invalide pour « ${lemma} ».`);
        if (!lex[lemma]) lex[lemma] = { fr };
      }
      delete props[lemma]; n++;
    }
    if (b.action === "accept") L.writeLexicon(lexFile, lex);
    L.writeJSON(propFile(b.lang), props);
    if (b.action === "accept" && n) { const r = build({ dir, out, log() {} }); if (!r.ok) throw httpError(500, `Le build a échoué : ${r.errors.join(" ; ")}`); }
    return { done: n, ...lexiconView()[b.lang] };
  }

  // Qualité de la chaîne (v0.5, lot 2.5) : publiés sans / avec modification, rejetés, par moteur
  function pipelineQuality() {
    const by = {};
    const eng = (e) => (/ollama/i.test(e || "") ? "Ollama" : /anthropic|claude/i.test(e || "") ? "Anthropic" : "Autre");
    const add = (e, k) => { const x = (by[eng(e)] ||= { clean: 0, edited: 0, rejected: 0 }); x[k]++; };
    for (const l of L.LANGS) for (const t of L.loadKind("texts", { dir })[l]) if (t.source?.type === "generated") add(t.source.engine, t.source.edited ? "edited" : "clean");
    try { for (const line of fs.readFileSync(path.join(draftsDir, "rejected.jsonl"), "utf8").split("\n").filter(Boolean)) add(JSON.parse(line).engine, "rejected"); } catch {}
    return Object.entries(by).map(([engine, x]) => {
      const total = x.clean + x.edited + x.rejected;
      return { engine, ...x, total, rejectRate: total ? x.rejected / total : 0, switch: engine === "Ollama" && total >= 5 && x.rejected / total > 0.4 };
    });
  }

  // ---------- Tableau de bord de couverture (lot C8) ----------
  function coverage() {
    const out = {};
    for (const lang of L.LANGS) {
      const plan = L.loadPlan(lang, dir), texts = L.loadKind("texts", { dir })[lang], freq = L.loadFreq(lang, dir), drafts = L.loadDrafts(dir).filter((d) => d.lang === lang);
      const books = [...L.loadKind("books", { dir })[lang], ...L.loadKind("story", { dir })[lang]];
      const seen = new Set([...texts.flatMap((t) => L.textLemmas(t.sentences, lang)), ...books.flatMap((b) => b.chapters.flatMap((c) => L.textLemmas(c.sentences, lang)))]);
      const top = (n) => { const list = freq.slice(0, n).filter((f) => !(lang === "en" && f.cog)); return { total: list.length, covered: list.filter((f) => seen.has(f.lemma)).length }; };
      const byLevel = {}, byTheme = Object.fromEntries(L.THEME_IDS.map((t) => [t, { total: 0, A1: 0 }]));
      for (const t of texts) { byLevel[t.level] = (byLevel[t.level] || 0) + 1; for (const th of t.themes || []) { byTheme[th].total++; if (t.level === "A1") byTheme[th].A1++; } }
      const gcounts = P.grammarCounts(lang, plan, texts);
      const grammar = (plan.grammar_order || []).map((g) => ({ id: g.id, label: g.label, phase: g.phase, texts: gcounts[g.id] || 0 }));
      const missingFrequent = freq.slice(0, 1000).filter((f) => !seen.has(f.lemma) && !(lang === "en" && f.cog) && !P.BASE[lang].has(f.lemma)).slice(0, 40).map((f) => f.lemma);
      const GOALS = lang === "en" ? [{ step: 1, label: "3 textes « tout premiers pas »", done: texts.filter((t) => plan.units.find((u) => u.unit === t.unit)?.first_steps).length, target: 3 }] : [];
      GOALS.push(
        { step: 2, label: "30 textes A1-A2", done: texts.filter((t) => ["A1", "A2"].includes(t.level)).length, target: 30 },
        ...(lang === "ko" ? [{ step: 2, label: "Grammaire de la phase 2 vue ≥ 3 fois", done: grammar.filter((g) => g.phase === 2 && g.texts >= 3).length, target: grammar.filter((g) => g.phase === 2).length }] : []),
        { step: 3, label: "50 textes", done: texts.length, target: 50 },
        { step: 3, label: "~1 000 mots les plus fréquents couverts", done: top(1000).covered, target: top(1000).total },
        { step: 4, label: "4 livres gradués", done: L.loadKind("books", { dir })[lang].length, target: 4 },
        { step: 4, label: "15 chapitres d'histoire", done: L.loadKind("story", { dir })[lang].reduce((n, b) => n + b.chapters.length, 0), target: 15 },
      );
      out[lang] = {
        texts: texts.length, drafts: drafts.length, byLevel, byTheme, top1000: top(1000), top2000: top(2000), grammar,
        holes: { themesWithoutA1: L.THEME_IDS.filter((t) => !byTheme[t].A1), grammarUnder3: grammar.filter((g) => g.texts < 3).map((g) => g.label), missingFrequent },
        goals: GOALS, units: { total: plan.units.filter((u) => !u.legacy).length, written: new Set(texts.map((t) => t.unit).filter(Boolean)).size, drafted: new Set(drafts.map((t) => t.unit).filter(Boolean)).size },
      };
    }
    return out;
  }

  // ---------- Routeur ----------
  async function handle(route, req, url, readJson, user) {
    const m = route.match(/^(GET|POST) \/api\/admin\/content\/(drafts|draft|coverage|lexicon)(?:\/([^/]+))?(?:\/(publish|reject|regenerate))?$/);
    if (!m) throw httpError(404, "Route inconnue.");
    const [, method, kind, id, verb] = m;
    if (method === "GET" && kind === "drafts" && !id) {
      const planIdx = Object.fromEntries(L.LANGS.map((l) => [l, Object.fromEntries(L.loadPlan(l, dir).units.map((u, i) => [u.unit, i]))]));
      const list = L.loadDrafts(dir).map((d) => summary(d, planIdx)).sort((a, b) => a.lang.localeCompare(b.lang) || a.unitIndex - b.unitIndex || a.id.localeCompare(b.id));
      return { drafts: list, jobs: [...jobs.keys()] };
    }
    if (method === "GET" && kind === "coverage" && !id) return { coverage: coverage(), quality: pipelineQuality() };
    if (method === "GET" && kind === "lexicon" && !id) return { lexicon: lexiconView() };
    if (method === "POST" && kind === "lexicon" && !id) return lexiconAct(await readJson(req));
    if (kind !== "draft" || !id) throw httpError(404, "Route inconnue.");
    if (method === "GET" && !verb) {
      const d = readDraft(id), plan = L.loadPlan(d.lang, dir), unit = plan.units.find((u) => u.unit === d.unit) || null;
      return { draft: d, unit, grammar: (plan.grammar_order || []).filter((g) => unit?.grammar?.includes(g.id)), regenerating: jobs.has(d.id) };
    }
    if (method !== "POST") throw httpError(405, "Méthode non autorisée.");
    const body = await readJson(req);
    if (!verb) return { draft: await act(id, body) };
    if (verb === "publish") return publish(id, user);
    if (verb === "reject") return reject(id, body.reason);
    if (verb === "regenerate") return regenerate(id);
    throw httpError(404, "Route inconnue.");
  }
  return { handle, coverage, publish, reject, act, regenerate, jobs, lexiconAct, lexiconView, pipelineQuality };
}
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

module.exports = { create };
