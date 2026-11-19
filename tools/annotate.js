#!/usr/bin/env node
// ============================================================
//  Annotation automatique au format Mochi (CONTENU-PIPELINE, lot C2)
//  Phrases brutes → phrases annotées (surface=lemme, nom|particule, @NomPropre).
//   - coréen  : analyseur Kiwi (tools/kiwi_server.py, KIWI_URL, 127.0.0.1:8882 par défaut)
//   - anglais : lemmatiseur JS (règles + formes irrégulières + lexique et liste de fréquence)
//
//    node tools/annotate.js --lang ko "커피가 정말 맛있어요."
//    node tools/annotate.js --eval              compare avec les textes annotés à la main
// ============================================================
const L = require("./content-lib.js");

const KIWI_URL = () => (process.env.KIWI_URL || "http://127.0.0.1:8882").replace(/\/+$/, "");
const PUNCT_RE = /^([«"“(¿¡「『（]*)(.*?)([.,!?…:;»"”)。，！？、：；」』）]*)$/u; // ponctuation latine et chinoise

// ---------- Contexte : lexique, fréquences, noms propres connus ----------
function context(lang, { lexicon, freq, proper } = {}) {
  lexicon ||= L.loadLexicon()[lang];
  freq ||= L.loadFreq(lang);
  const known = new Set([...Object.keys(lexicon), ...freq.map((f) => f.lemma)]);
  return { lang, lexicon, known, proper: new Set([...(proper || []), ...knownProper(lang)]) };
}
// Noms propres déjà annotés (@) dans le contenu : « Tom », « 민지 »…
let PROPER_CACHE = {};
function knownProper(lang) {
  if (PROPER_CACHE[lang]) return PROPER_CACHE[lang];
  const out = new Set();
  const all = [...L.loadKind("texts", { published: false })[lang], ...L.loadKind("books", { published: false })[lang], ...L.loadKind("story", { published: false })[lang]];
  const sents = all.flatMap((x) => x.sentences || (x.chapters || []).flatMap((c) => c.sentences));
  for (const [src] of sents) for (const g of L.segments(src, lang)) if (g.proper) out.add(g.surface.replace(/'s$/, ""));
  return (PROPER_CACHE[lang] = out);
}

// ============================================================
//  Anglais
// ============================================================
const IRREG = {
  am: "be", is: "be", are: "be", was: "be", were: "be", been: "be", being: "be",
  has: "have", had: "have", having: "have", does: "do", did: "do", done: "do", doing: "do",
  went: "go", gone: "go", goes: "go", saw: "see", seen: "see", came: "come", made: "make", took: "take", taken: "take",
  gave: "give", given: "give", got: "get", gotten: "get", said: "say", says: "say", knew: "know", known: "know",
  thought: "think", told: "tell", found: "find", felt: "feel", left: "leave", kept: "keep", began: "begin", begun: "begin",
  brought: "bring", bought: "buy", ate: "eat", eaten: "eat", drank: "drink", drunk: "drink", wrote: "write", written: "write",
  ran: "run", sat: "sit", stood: "stand", heard: "hear", met: "meet", paid: "pay", sent: "send", spent: "spend", slept: "sleep",
  taught: "teach", caught: "catch", fought: "fight", sang: "sing", sung: "sing", swam: "swim", won: "win", lost: "lose",
  forgot: "forget", forgotten: "forget", chose: "choose", chosen: "choose", spoke: "speak", spoken: "speak", woke: "wake",
  drove: "drive", driven: "drive", rode: "ride", flew: "fly", grew: "grow", threw: "throw", wore: "wear", broke: "break", broken: "break",
  understood: "understand", became: "become", built: "build", fell: "fall", held: "hold", led: "lead", meant: "mean", sold: "sell",
  shown: "show", children: "child", men: "man", women: "woman", people: "people", feet: "foot", teeth: "tooth", mice: "mouse",
  better: "good", best: "good", worse: "bad", worst: "bad", could: "can", would: "would", should: "should", might: "might",
  an: "an", us: "us", me: "me", him: "him", them: "them", her: "her", his: "his", its: "its", this: "this", has_: "",
};
delete IRREG.has_;
// Contractions : forme → lemmes (comme l'annotation manuelle : it's=it+be, don't=do+not)
const NOT_BASE = { "don't": "do", "doesn't": "do", "didn't": "do", "can't": "can", "won't": "will", "isn't": "be", "aren't": "be", "wasn't": "be", "weren't": "be", "haven't": "have", "hasn't": "have", "hadn't": "have", "couldn't": "could", "wouldn't": "would", "shouldn't": "should", "mustn't": "must", "needn't": "need", "ain't": "be" };
const S_IS = new Set(["it", "that", "he", "she", "there", "what", "where", "who", "how", "here", "this", "everything", "nothing", "something", "everyone", "everybody", "nobody", "someone", "somebody", "when", "why"]);

function enLemma(w, ctx) {
  if (IRREG[w] && !ctx.lexicon[w]) return IRREG[w];
  if (ctx.lexicon[w] || ctx.known.has(w)) return w;
  const c = [];
  const undouble = (b) => (b.length > 2 && b.at(-1) === b.at(-2) && !/[lsz]/.test(b.at(-1)) ? b.slice(0, -1) : null);
  if (w.endsWith("ies") && w.length > 4) c.push(w.slice(0, -3) + "y");
  if (w.endsWith("ied") && w.length > 4) c.push(w.slice(0, -3) + "y");
  if (w.endsWith("es")) c.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) c.push(w.slice(0, -1));
  if (w.endsWith("ing") && w.length > 4) { const b = w.slice(0, -3); c.push(b, b + "e", undouble(b)); }
  if (w.endsWith("ed") && w.length > 3) { const b = w.slice(0, -2); c.push(b, w.slice(0, -1), undouble(b)); }
  if (w.endsWith("er") && w.length > 4) { const b = w.slice(0, -2); c.push(b, b + "e", undouble(b)); if (b.endsWith("i")) c.push(b.slice(0, -1) + "y"); }
  if (w.endsWith("est") && w.length > 5) { const b = w.slice(0, -3); c.push(b, b + "e", undouble(b)); if (b.endsWith("i")) c.push(b.slice(0, -1) + "y"); }
  if (w.endsWith("ly") && w.length > 4) { /* adverbes : gardés tels quels (really, usually sont des lemmes) */ }
  const hit = c.filter(Boolean).find((x) => ctx.lexicon[x] || ctx.known.has(x));
  if (hit) return hit;
  // Inconnu partout : pluriel / 3e personne régulier en dernier recours
  if (/[^s]s$/.test(w) && !/(us|is)$/.test(w) && w.length > 3) return w.endsWith("ies") ? w.slice(0, -3) + "y" : w.slice(0, -1);
  return w;
}

function annotateEnWord(word, first, ctx) {
  const [, pre, core, post] = word.match(PUNCT_RE);
  if (!core) return word;
  const lc = core.toLowerCase().replace(/’/g, "'");
  const base = core.replace(/['’]s$/, "");
  // Noms propres : listés, ou majuscule en milieu de phrase et absents du lexique
  const looksProper = /^[A-Z]/.test(core) && core !== "I" && !/^I['’]/.test(core);
  if (ctx.proper.has(core) || ctx.proper.has(base)) return `${pre}@${core}${post}`;
  if (looksProper && !first && !ctx.lexicon[lc] && !ctx.lexicon[base.toLowerCase()] && !IRREG[lc] && !ctx.lexicon[enLemma(lc, ctx)]) return `${pre}@${core}${post}`;
  let lem;
  if (lc === "let's") lem = "let+us";
  else if (NOT_BASE[lc]) lem = `${NOT_BASE[lc]}+not`;
  else if (lc.endsWith("n't")) lem = `${enLemma(lc.slice(0, -3), ctx)}+not`;
  else {
    const m = lc.match(/^(.+)'(m|re|ve|ll|d|s)$/);
    if (m) {
      const [, h, t] = m, head = h === "i" ? "i" : enLemma(h, ctx);
      if (t === "m" || t === "re") lem = `${head}+be`;
      else if (t === "ve") lem = `${head}+have`;
      else if (t === "ll") lem = `${head}+will`;
      else if (t === "d") lem = `${head}+would`;
      else lem = S_IS.has(h) ? `${head}+be` : head; // possessif : the cat's → cat
    } else lem = enLemma(lc, ctx);
  }
  return `${pre}${core}${lem === lc ? "" : `=${lem}`}${post}`;
}
function annotateEn(sentence, ctx) {
  return sentence.split(/\s+/).filter(Boolean).map((w, i, all) => {
    const first = i === 0 || /[.!?…:"“«]$/.test(all[i - 1]) || /^["“«]/.test(w);
    return annotateEnWord(w, first, ctx);
  }).join(" ");
}

// ============================================================
//  Coréen (Kiwi)
// ============================================================
async function kiwiAnalyze(text, { fetchImpl = fetch, url = KIWI_URL() } = {}) {
  let res;
  try {
    res = await fetchImpl(`${url}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(10000) });
  } catch (e) { const err = new Error(`Analyseur coréen (Kiwi) injoignable sur ${url} : lance « python tools/kiwi_server.py » (voir SETUP.md).`); err.code = "KIWI_DOWN"; throw err; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Kiwi : ${data.error || `HTTP ${res.status}`}`);
  return data.tokens;
}
async function kiwiHealth({ fetchImpl = fetch, url = KIWI_URL() } = {}) {
  try { const r = await fetchImpl(`${url}/health`, { signal: AbortSignal.timeout(3000) }); return r.ok; } catch { return false; }
}

// Déterminants numéraux natifs → nombre de base (comme l'annotation manuelle : 한=하나)
const NUM_DET = { "한": "하나", "두": "둘", "세": "셋", "네": "넷", "스무": "스물" };
const PUNCT_TAG = /^(SF|SP|SS|SSO|SSC|SE|SO|SW)$/;
const isNoun = (pos) => /^(NNG|NNP|NNB|NP|NR|XR|SL|SN|SH)$/.test(pos);
const isVerb = (pos) => /^(VV|VA|VX|VCN)(-[RI])?$/.test(pos);

function annotateKoWord(word, wordStart, tokens, ctx) {
  const [, pre, core, post] = word.match(PUNCT_RE);
  if (!core) return word;
  // Mot entier connu (안녕하세요, 어떻게, 잠깐만…) ou nom propre listé
  if (ctx.proper.has(core)) return `${pre}@${core}${post}`;
  // (au moins 2 syllabes, ni particule ni nombre devant un compteur : 네 = « oui » ou « quatre »)
  const whole = (w) => [...w].length >= 2 && ctx.lexicon[w] && !w.endsWith("다") && !L.KO_PARTICLES.has(w) && !NUM_DET[w];
  if (whole(core)) return word;
  if (core.endsWith("요") && whole(core.slice(0, -1))) return `${pre}${core}=${core.slice(0, -1)}${post}`;
  const cs = wordStart + pre.length, ce = cs + core.length;
  const ms = tokens.filter((t) => t.start >= cs && t.start < ce && !PUNCT_TAG.test(t.pos));
  if (!ms.length) return word;
  // Regroupe les morphèmes en morceaux : contenu | particule | copule | suffixe 들
  const segs = [];
  let cur = null;
  const open = (kind, t) => { cur = { kind, start: t.start - cs, parts: [], proper: false }; segs.push(cur); return cur; };
  for (const t of ms) {
    const pos = t.pos;
    if (t.is_particle || /^J/.test(pos)) { open("particle", t).parts.push({ lemma: t.surface }); continue; }
    if (pos === "VCP") { open("copula", t).parts.push({ lemma: "이다" }); continue; }
    if (/^E/.test(pos)) { if (!cur) open("content", t); continue; } // terminaisons : rattachées au morceau en cours
    if (pos === "XSN" && t.surface === "들") { open("suffix", t).parts.push({ lemma: "들" }); continue; }
    if (!cur || cur.kind !== "content") open("content", t);
    if (pos === "XSN") { const p = cur.parts.at(-1); if (p) p.lemma += t.surface; else cur.parts.push({ lemma: t.surface, noun: true }); continue; }
    if (/^XS[VA]/.test(pos)) { const p = cur.parts.at(-1); if (p?.noun) { p.lemma += `${t.surface}다`; p.noun = false; p.verb = true; } else cur.parts.push({ lemma: `${t.surface}다`, verb: true }); continue; }
    if (pos === "MM" && NUM_DET[t.surface]) { cur.parts.push({ lemma: NUM_DET[t.surface] }); continue; }
    if (pos === "XPN") { cur.parts.push({ lemma: t.surface, noun: true, prefix: true }); continue; }
    if (isVerb(pos)) { cur.parts.push({ lemma: t.lemma || `${t.surface}다`, verb: true }); continue; }
    if ((pos === "NNP" && !ctx.lexicon[t.surface]) || ctx.proper.has(t.surface)) cur.proper = true; // 한국어 : NNP pour Kiwi, mot du lexique pour Mochi
    cur.parts.push({ lemma: t.lemma || t.surface, noun: isNoun(pos) });
  }
  // Surfaces : découpe du mot entre les débuts de morceaux (positions croissantes, jamais vides)
  for (let i = 0; i < segs.length; i++) segs[i].start = Math.max(0, Math.min(core.length, segs[i].start), i ? segs[i - 1].start : 0);
  const merged = [];
  segs.forEach((s, i) => {
    s.surface = core.slice(s.start, i + 1 < segs.length ? segs[i + 1].start : core.length);
    if (!s.surface && merged.length) merged.at(-1).parts.push(...s.parts); // contraction (전 = 저+는) : un seul morceau
    else merged.push(s);
  });
  if (merged.length && !merged[0].surface) merged[0].surface = core;
  const lemmaOf = (s) => {
    const ps = s.parts.map((p) => p.lemma).filter(Boolean);
    if (!ps.length) return s.surface;
    if (ps.length > 1) {
      const joined = ps.join("");
      // Noms composés (점심시간, 첫날) : un seul lemme s'il est connu ; sinon les morceaux (스물+다섯)
      if (ctx.lexicon[joined] || ctx.known.has(joined)) return joined;
      // Préfixe + nom inconnu : on garde le nom composé tel quel
      if (s.parts[0].prefix) return joined;
    }
    return ps.join("+");
  };
  const out = merged.map((s) => {
    if (s.proper && s.kind === "content") return `@${s.surface}`;
    const lem = lemmaOf(s);
    return lem === s.surface ? s.surface : `${s.surface}=${lem}`;
  });
  return `${pre}${out.join("|")}${post}`;
}
async function annotateKo(sentence, ctx, opts = {}) {
  const tokens = await (opts.analyze || kiwiAnalyze)(sentence, opts);
  let pos = 0;
  return sentence.split(" ").map((w) => { const start = sentence.indexOf(w, pos); pos = start + w.length; return w ? annotateKoWord(w, start, tokens, ctx) : w; }).join(" ");
}

// ============================================================
//  Chinois : segmentation par le lexique (le mot connu le plus long d'abord, 4 caractères au plus).
//  Pas de flexion : le lemme est le mot lui-même. Mots séparés par des espaces dans la source
//  (affichés sans espaces). Noms propres connus → @. Caractère inconnu : laissé seul (à relire).
// ============================================================
const ZH_PUNCT = /[，。！？、：；「」『』（）,.!?:;"“”]/u;
function annotateZh(sentence, ctx) {
  const str = sentence.replace(/\s+/g, ""), chars = [...str], out = [];
  const known = (w) => ctx.lexicon[w] || ctx.known.has(w);
  for (let i = 0; i < chars.length;) {
    if (ZH_PUNCT.test(chars[i])) { if (out.length) out[out.length - 1] += chars[i]; else out.push(chars[i]); i++; continue; }
    let w = null;
    for (const p of ctx.proper) if (p && str.startsWith(p, chars.slice(0, i).join("").length) && (!w || [...p].length > [...w].length)) w = p;
    if (w) { out.push(`@${w}`); i += [...w].length; continue; }
    for (let n = Math.min(4, chars.length - i); n >= 1 && !w; n--) { const c = chars.slice(i, i + n).join(""); if (known(c)) w = c; }
    w ||= chars[i];
    out.push(w); i += [...w].length;
  }
  return out.join(" ");
}

// ============================================================
//  Russe : pas d'analyseur installé ; on s'appuie sur les formes déjà annotées dans le contenu
//  (молоком → молоко) et sur le lexique. Forme inconnue : gardée telle quelle (à relire dans l'admin).
//  Majuscule en milieu de phrase et absente du lexique : nom propre (@).
// ============================================================
let RU_FORMS = null;
function ruForms() {
  if (RU_FORMS) return RU_FORMS;
  RU_FORMS = new Map();
  const all = [...L.loadKind("texts", { published: false }).ru, ...L.loadKind("books", { published: false }).ru, ...L.loadKind("story", { published: false }).ru];
  for (const [src] of all.flatMap((x) => x.sentences || (x.chapters || []).flatMap((c) => c.sentences))) for (const g of L.segments(src, "ru")) if (!g.proper) RU_FORMS.set(g.surface.toLowerCase(), g.lemmas.join("+"));
  return RU_FORMS;
}
function annotateRu(sentence, ctx) {
  const forms = ruForms();
  return sentence.split(/\s+/).filter(Boolean).map((w, i, all) => {
    const [, pre, core, post] = w.match(PUNCT_RE);
    if (!core) return w;
    const lc = core.toLowerCase(), first = i === 0 || /[.!?…:"«]$/.test(all[i - 1]);
    if (ctx.proper.has(core) || (/^[А-ЯЁ]/.test(core) && !first && !ctx.lexicon[lc] && !forms.has(lc))) return `${pre}@${core}${post}`;
    const lem = ctx.lexicon[lc] ? lc : forms.get(lc) || lc;
    return `${pre}${core}${lem === lc ? "" : `=${lem}`}${post}`;
  }).join(" ");
}

// ---------- API ----------
// Annote une liste de phrases brutes. opts : { lexicon, freq, proper, analyze (bouchon Kiwi) }
async function annotate(sentences, lang, opts = {}) {
  const ctx = context(lang, opts);
  if (lang === "en") return sentences.map((s) => annotateEn(s.trim(), ctx));
  if (lang === "zh") return sentences.map((s) => annotateZh(s.trim(), ctx));
  if (lang === "ru") return sentences.map((s) => annotateRu(s.trim(), ctx));
  const out = [];
  for (const s of sentences) out.push(await annotateKo(s.trim().replace(/\s+/g, " "), ctx, opts));
  return out;
}

// ---------- Évaluation sur les textes annotés à la main ----------
// Rappel des lemmes (multiensemble par phrase, noms propres exclus) et des particules coréennes.
function compare(manual, auto, lang) {
  const count = (src, f) => { const m = new Map(); for (const g of L.segments(src, lang)) for (const k of f(g)) m.set(k, (m.get(k) || 0) + 1); return m; };
  const lem = (g) => g.lemmas, part = (g) => (g.particle ? [`${g.surface}`] : []);
  const score = (f) => {
    const a = count(manual, f), b = count(auto, f); let tot = 0, hit = 0; const miss = [];
    for (const [k, n] of a) { tot += n; const h = Math.min(n, b.get(k) || 0); hit += h; if (h < n) miss.push(k); }
    return { tot, hit, miss };
  };
  return { lemmas: score(lem), particles: score(part) };
}
async function evaluate(lang, { texts, ...opts } = {}) {
  texts ||= L.loadKind("texts")[lang];
  const ctx = context(lang, opts);
  const r = { lemmas: { tot: 0, hit: 0 }, particles: { tot: 0, hit: 0 }, gaps: [] };
  for (const t of texts) for (const [src] of t.sentences) {
    const raw = L.plainText(src, lang);
    const auto = lang === "en" ? annotateEn(raw, ctx) : lang === "zh" ? annotateZh(raw, ctx) : lang === "ru" ? annotateRu(raw, ctx) : await annotateKo(raw, ctx, opts);
    const c = compare(src, auto, lang);
    for (const k of ["lemmas", "particles"]) { r[k].tot += c[k].tot; r[k].hit += c[k].hit; }
    if (c.lemmas.miss.length || c.particles.miss.length) r.gaps.push({ id: t.id, manual: src, auto, missing: [...c.lemmas.miss, ...c.particles.miss.map((p) => `particule ${p}`)] });
  }
  r.lemmaRate = r.lemmas.tot ? r.lemmas.hit / r.lemmas.tot : 1;
  r.particleRate = r.particles.tot ? r.particles.hit / r.particles.tot : 1;
  return r;
}
const pct = (x) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
function evalReport(lang, r) {
  const lines = [`${lang} : lemmes ${pct(r.lemmaRate)} (${r.lemmas.hit}/${r.lemmas.tot})${lang === "ko" ? ` · particules ${pct(r.particleRate)} (${r.particles.hit}/${r.particles.tot})` : ""} · ${r.gaps.length} phrase(s) avec écarts`];
  for (const g of r.gaps) lines.push(`  ${g.id} · manque ${g.missing.join(", ")}\n     main : ${g.manual}\n     auto : ${g.auto}`);
  return lines.join("\n");
}

if (require.main === module) {
  (async () => {
    const a = process.argv.slice(2);
    if (a[0] === "--eval") {
      for (const lang of L.LANGS) {
        try { console.log(evalReport(lang, await evaluate(lang))); } catch (e) { console.log(`${lang} : ${e.message}`); }
      }
      return;
    }
    const i = a.indexOf("--lang"), lang = i >= 0 ? a[i + 1] : "en";
    const sentences = a.filter((_, j) => j !== i && j !== i + 1);
    if (!sentences.length) { console.error('Usage : node tools/annotate.js --lang ko "phrase" … | --eval'); process.exit(2); }
    for (const s of await annotate(sentences, lang)) console.log(s);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { annotate, annotateEn, annotateKo, annotateZh, annotateRu, enLemma, context, kiwiAnalyze, kiwiHealth, evaluate, evalReport, compare, KIWI_URL };
