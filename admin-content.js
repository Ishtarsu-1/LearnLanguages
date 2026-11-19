// ============================================================
//  Mochi — admin-content.js : relecture humaine du contenu (CONTENU-PIPELINE, lots C6 et C8)
//  #/admin/contenu            file de relecture (brouillons triés par unité du plan)
//  #/admin/contenu/couverture tableau de bord de la couverture
//  #/admin/contenu/<id>       un brouillon : phrases, remarques du relecteur IA, lexique, publier
//  Objectif : relire et publier un texte A1 en moins de 3 minutes.
//  Script classique chargé dans l'ordre par index.html.
// ============================================================
const CA_DOT = { green: "🟢", orange: "🟠", red: "🔴" };
const caLoad = (key, url, after) => {
  ui.ca ||= {};
  if (ui.ca[key]) return ui.ca[key];
  ui.ca[key] = { loading: true };
  api("GET", url).then((d) => { ui.ca[key] = { d }; after?.(d); }).catch((e) => { ui.ca[key] = { err: e.message }; }).finally(() => { if (location.hash.startsWith("#/admin/contenu")) render(); });
  return ui.ca[key];
};
const caReset = (key) => { if (ui.ca) delete ui.ca[key]; };

function viewAdminContent(sub) {
  if (!isAdmin()) return viewNotFound();
  const tabs = `<div class="ca-tabs"><a class="chip ${!sub ? "on" : ""}" href="#/admin/contenu">📝 File de relecture</a><a class="chip ${sub === "lexique" ? "on" : ""}" href="#/admin/contenu/lexique">📒 Lexique</a><a class="chip ${sub === "couverture" ? "on" : ""}" href="#/admin/contenu/couverture">📊 Couverture</a><a class="chip" href="#/admin">← Tableau de bord</a></div>`;
  const body = !sub ? caQueue() : sub === "couverture" ? caCoverage() : sub === "lexique" ? caLexicon() : caDraft(sub);
  return `<section class="view"><h1>🛠️ Contenu</h1>${tabs}${body}</section>`;
}

// ---------- File de relecture ----------
function caQueue() {
  const S = caLoad("queue", "/api/admin/content/drafts");
  if (S.err) return `<div class="card"><p class="form-err">${esc(S.err)}</p></div>`;
  if (!S.d) return `<div class="card"><p class="muted">Chargement…</p></div>`;
  const list = S.d.drafts;
  if (!list.length) return `<div class="card empty">${mochi("small", "proud")}<h2>Rien à relire</h2><p class="muted">Génère des brouillons avec <code>npm run content:gen -- --next 5 --lang ko</code>.</p></div>`;
  return Object.keys(LANGUAGES).map((l) => {
    const ds = list.filter((d) => d.lang === l);
    if (!ds.length) return "";
    return `<h2 class="section-title">${LANGUAGES[l].flag} ${LANGUAGES[l].name} · ${ds.length} brouillon(s)</h2>
      <div class="ca-list">${ds.map((d) => `<a class="card ca-item" href="#/admin/contenu/${esc(d.id)}">
        <span class="ca-dot" title="${d.status === "green" ? "tout est vert" : d.status === "orange" ? "avertissements" : "problèmes bloquants"}">${CA_DOT[d.status]}</span>
        <div class="grow"><b>${esc(d.icon || "")} ${esc(d.title)}</b> <small class="muted">· ${esc(d.unit || "hors plan")} · ${esc(d.kind)} · ${d.sentences} phrases</small><br/>
          <small class="muted">${d.coverage !== null ? `couverture ${num1(d.coverage)} % · ` : ""}${d.blocking ? `${d.blocking} bloquant(s) · ` : ""}${d.warnings ? `${d.warnings} avertissement(s) · ` : ""}${d.notes ? `${d.notes} remarque(s) du relecteur · ` : ""}${d.lexiconTodo ? `${d.lexiconTodo} mot(s) à traduire` : ""}${d.regenerating ? " · ⏳ régénération en cours" : ""}</small></div>
        <span class="tag">Relire →</span></a>`).join("")}</div>`;
  }).join("") + `<p class="mt-20"><button class="btn ghost small" data-act="ca-refresh" data-k="queue">↻ Actualiser</button></p>`;
}

// ---------- Un brouillon ----------
function caSentence(src, lang, newWords) {
  return toSentence(src, lang).words.map((w) => esc(w.pre) + w.segs.map((g) => {
    if (g.proper) return `<span class="w proper">${esc(g.surface)}</span>`;
    const pt = g.particle ? particleFn(g.surface) : null, nw = g.lemmas.some((l) => newWords.has(l));
    return `<span class="w ${nw ? "nw" : ""} ${pt ? `pt pt-${pt[0]}` : ""}"${nw ? ` title="mot nouveau : ${esc(g.lemmas.join(" + "))}"` : ""}>${esc(g.surface)}</span>`;
  }).join("") + esc(w.post)).join(" ");
}
function caDraft(id) {
  const S = caLoad(`d:${id}`, `/api/admin/content/draft/${encodeURIComponent(id)}`);
  if (S.err) return `<div class="card"><p class="form-err">${esc(S.err)}</p><a class="btn small" href="#/admin/contenu">Retour à la file</a></div>`;
  if (!S.d) return `<div class="card"><p class="muted">Chargement…</p></div>`;
  const { draft: d, unit, grammar } = S.d, lang = d.lang, k = koCls(lang), C = d.checks || { blocking: [], warnings: [], stats: {} };
  const newWords = new Set(unit?.new_words || []), E = ui.ca.edit, busy = ui.ca.busy;
  const notesOf = (i) => (d.review_notes || []).filter((n) => n.sentence === i + 1 && n.status === "open");
  const todo = Object.entries(d.lexicon_new || {});
  const canPublish = !C.blocking.length && !todo.some(([, v]) => v.todo_review || !v.fr);
  return `
    <div class="card">
      <div class="ca-head"><span class="ca-dot">${CA_DOT[C.status] || "🔴"}</span>
        <div class="grow"><h2 class="m-0">${esc(d.icon || "")} ${esc(d.title)} <small class="muted">· ${esc(d.id)}</small></h2>
          <p class="muted mt-4 mb-0 mx-0">${LANGUAGES[lang].flag} ${esc(d.level)} · ${esc(d.kind)} · unité ${esc(d.unit || "—")}${C.stats.coverage !== undefined ? ` · couverture <b>${num1(C.stats.coverage)} %</b>` : ""}${d.source?.engine ? ` · ${esc(d.source.engine)}` : ""}</p></div></div>
      ${unit ? `<p class="mt-8 mb-0 mx-0"><small>Mots nouveaux : ${unit.new_words.map((w) => `<span class="chip ${k} ${(C.stats.newWords || []).includes(w) ? "" : "ca-absent"}">${esc(w)}</span>`).join(" ")}
        ${grammar.length ? ` · grammaire : ${grammar.map((g) => esc(g.label)).join(", ")}` : ""}</small></p>` : ""}
      ${C.blocking.length ? `<ul class="ca-checks red">${C.blocking.map((b) => `<li>✗ ${esc(b)}</li>`).join("")}</ul>` : ""}
      ${C.warnings.length ? `<ul class="ca-checks orange">${C.warnings.map((w) => `<li>! ${esc(w)}</li>`).join("")}</ul>` : ""}
      ${!C.blocking.length && !C.warnings.length ? `<p class="mt-8 mb-0 mx-0">✓ Toutes les vérifications automatiques sont vertes.</p>` : ""}
      ${d.review_overall ? `<p class="tip">🧐 Relecteur IA : ${esc(d.review_overall)}</p>` : ""}
    </div>

    <h2 class="section-title">Phrases</h2>
    <div class="sentences">${d.sentences.map(([src, fr], i) => {
      const editing = E && E.id === d.id && E.i === i;
      return `<div class="sentence ca-sentence">
        <div class="s-tools"><button data-act="say" data-text="${esc(toSentence(src, lang).text)}" data-lang="${lang}" aria-label="Écouter">🔊</button>
          <button data-act="ca-edit" data-i="${i}" aria-label="Modifier">✏️</button>
          ${d.sentences.length > 1 ? `<button data-act="ca-del" data-i="${i}" aria-label="Supprimer la phrase">🗑️</button>` : ""}</div>
        <div class="s-body">
          ${d.speakers?.[i] ? `<small class="muted">${esc(d.speakers[i])}</small>` : ""}
          ${editing ? `<div class="ca-edit">
              <label><small>Texte (brut : il sera ré-annoté ; ou annoté à la main avec = | @)</small><input id="ca-text" class="input ${k}" maxlength="300" value="${esc(toSentence(src, lang).text)}"/></label>
              <label><small>Traduction</small><input id="ca-fr" class="input" maxlength="300" value="${esc(fr)}"/></label>
              <details><summary><small>Annotation actuelle</small></summary><code>${esc(src)}</code></details>
              <div class="wp-actions"><button class="btn small" data-act="ca-save" data-i="${i}" ${busy ? "disabled" : ""}>${busy ? "…" : "Enregistrer"}</button><button class="btn ghost small" data-act="ca-cancel">Annuler</button></div>
            </div>` : `<p class="s-text ${k}">${caSentence(src, lang, newWords)}</p><p class="s-fr">${esc(fr)}</p>`}
          ${notesOf(i).map((n) => `<div class="ca-note"><small><b>${{ naturel: "Peu naturel", erreur: "Erreur", traduction: "Traduction", culture: "Culture", ambiguite: "Ambigu" }[n.type] || n.type}</b> : ${esc(n.issue_fr)}</small>
            ${n.suggestion ? `<br/><small>→ <span class="${n.type === "traduction" ? "" : k}">${esc(n.suggestion)}</span>${n.suggestion_fr && n.type !== "traduction" ? ` <span class="muted">(${esc(n.suggestion_fr)})</span>` : ""}</small>` : ""}
            <div class="wp-actions">${n.suggestion ? `<button class="btn small" data-act="ca-note" data-n="${esc(n.id)}" data-d="accept" ${busy ? "disabled" : ""}>Accepter</button>` : ""}<button class="btn ghost small" data-act="ca-note" data-n="${esc(n.id)}" data-d="ignore" ${busy ? "disabled" : ""}>Ignorer</button></div></div>`).join("")}
        </div></div>`;
    }).join("")}</div>

    ${todo.length ? `<h2 class="section-title">Lexique à valider</h2>
    <div class="card"><table class="admin-table"><tbody>${todo.map(([lemma, v]) => `<tr><th scope="row" class="${k}">${esc(lemma)}</th>
      <td><input id="ca-lex-${esc(lemma)}" class="input ca-lex" maxlength="120" value="${esc(v.fr)}" placeholder="traduction française"/></td>
      <td>${v.todo_review || !v.fr ? `<button class="btn small" data-act="ca-lex" data-l="${esc(lemma)}" ${busy ? "disabled" : ""}>Valider</button>` : "✓"}</td></tr>`).join("")}</tbody></table></div>` : ""}

    <div class="card ca-actions">
      <button class="btn" data-act="ca-publish" ${canPublish && !busy ? "" : "disabled"} title="${canPublish ? "Publier ce texte" : "Corrige d'abord les problèmes bloquants et valide le lexique"}">✅ Publier</button>
      <button class="btn ghost" data-act="ca-regen" ${S.d.regenerating || busy ? "disabled" : ""}>${S.d.regenerating ? "⏳ Régénération en cours…" : "🔁 Régénérer"}</button>
      <div class="ca-reject"><input id="ca-reason" class="input" maxlength="500" placeholder="Raison du rejet (sert à améliorer le prompt)"/><button class="btn ghost" data-act="ca-reject" ${busy ? "disabled" : ""}>🗑️ Rejeter</button></div>
      ${!canPublish ? `<p class="muted m-0"><small>Publier : il faut zéro problème bloquant et tout le lexique validé.</small></p>` : ""}
    </div>
    <p><a href="#/admin/contenu">← Retour à la file</a></p>`;
}

// ---------- Lexique : traductions proposées par le LLM, à relire (v0.5, lot 2.2) ----------
const CA_PAGE = 40;
function caLexicon() {
  const S = caLoad("lex", "/api/admin/content/lexicon");
  if (S.err) return `<div class="card"><p class="form-err">${esc(S.err)}</p></div>`;
  if (!S.d) return `<div class="card"><p class="muted">Chargement…</p></div>`;
  const langs = Object.entries(S.d.lexicon).filter(([l, x]) => x.proposals.length || isStable(l));
  return `<p class="muted">Traductions proposées par <code>npm run content:lexicon</code>. Corrige si besoin, puis valide : le mot entre dans le lexique (et le site est reconstruit). Objectif : 1 000 lemmes par langue.</p>
    ${langs.map(([l, x]) => {
      const page = x.proposals.slice(0, CA_PAGE);
      return `<h2 class="section-title">${LANGUAGES[l]?.flag || ""} ${LANGUAGES[l]?.name || l} · ${num0(x.size)} lemmes · ${num0(x.proposals.length)} à relire</h2>
      ${page.length ? `<div class="card table-scroll"><table class="admin-table ca-lex-table"><tbody>${page.map((p) => `<tr>
        <th scope="row" class="${koCls(l)}">${esc(p.lemma)}${p.unit ? ` <small class="muted">${esc(p.unit)}</small>` : ""}</th>
        <td><input class="input ca-lex" data-lexl="${l}" data-lemma="${esc(p.lemma)}" maxlength="120" value="${esc(p.fr)}" aria-label="Traduction de ${esc(p.lemma)}"/></td>
        <td class="ca-lex-acts"><button class="btn small" data-act="lex-one" data-l="${l}" data-lemma="${esc(p.lemma)}" title="Valider">✓</button><button class="btn ghost small" data-act="lex-skip" data-l="${l}" data-lemma="${esc(p.lemma)}" title="Ignorer (ne pas ajouter)">✕</button></td></tr>`).join("")}</tbody></table>
        <p class="mt-12"><button class="btn" data-act="lex-page" data-l="${l}">✓ Valider les ${page.length} affichés</button></p></div>` : `<div class="card"><p class="muted m-0">Rien à relire. ${x.size < 1000 ? "Lance <code>npm run content:lexicon -- --lang " + l + "</code> pour en proposer d'autres." : "Objectif atteint ✓"}</p></div>`}`;
    }).join("")}`;
}
const lexInputs = (l, lemma) => [...document.querySelectorAll(`input[data-lexl="${l}"]`)].filter((i) => !lemma || i.dataset.lemma === lemma).map((i) => ({ lemma: i.dataset.lemma, fr: i.value }));
async function lexPost(body, msg) {
  try { const r = await api("POST", "/api/admin/content/lexicon", body); caReset("lex"); toast(`${msg(r.done)} · ${num0(r.size)} lemmes`); } catch (e) { toast(e.message); }
  render();
}
Object.assign(actions, {
  "lex-one": (el) => lexPost({ lang: el.dataset.l, action: "accept", items: lexInputs(el.dataset.l, el.dataset.lemma) }, () => "Ajouté au lexique ✓"),
  "lex-skip": (el) => lexPost({ lang: el.dataset.l, action: "skip", items: [{ lemma: el.dataset.lemma }] }, () => "Ignoré"),
  "lex-page": (el) => { if (confirm("Ajouter ces traductions au lexique, telles qu'elles sont affichées ?")) lexPost({ lang: el.dataset.l, action: "accept", items: lexInputs(el.dataset.l) }, (n) => `${n} mot(s) ajouté(s) ✓`); },
});

// ---------- Couverture (lot C8) ----------
function caCoverage() {
  const S = caLoad("cov", "/api/admin/content/coverage");
  if (S.err) return `<div class="card"><p class="form-err">${esc(S.err)}</p></div>`;
  if (!S.d) return `<div class="card"><p class="muted">Chargement…</p></div>`;
  const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const Q = S.d.quality || [];
  const quality = `<h2 class="section-title">Qualité de la chaîne</h2>
    <div class="card">${Q.length ? `<table class="admin-table"><thead><tr><th>Moteur</th><th>Publiés tels quels</th><th>Publiés modifiés</th><th>Rejetés</th><th>Taux de rejet</th></tr></thead><tbody>
      ${Q.map((q) => `<tr><th scope="row">${esc(q.engine)}</th><td>${q.clean}</td><td>${q.edited}</td><td>${q.rejected}</td><td>${Math.round(q.rejectRate * 100)} %</td></tr>`).join("")}</tbody></table>
      ${Q.some((q) => q.switch) ? `<p class="form-err mt-12">Ollama dépasse 40 % de rejets : passe les prochaines vagues sur Anthropic (<code>--engine anthropic</code>, clé ANTHROPIC_API_KEY).</p>` : ""}`
      : `<p class="muted m-0">Pas encore de texte généré publié ou rejeté.</p>`}</div>`;
  const bar = (a, b) => `<div class="cov"><div class="bar"><span data-bar-w="${pctOf(a, b)}"></span></div><b>${num0(a)} / ${num0(b)}</b></div>`;
  return quality + Object.entries(S.d.coverage).filter(([l]) => isStable(l)).map(([l, c]) => `
    <h2 class="section-title">${LANGUAGES[l].flag} ${LANGUAGES[l].name}</h2>
    <div class="lang-grid">
      <div class="card"><h3>Objectifs</h3><table class="admin-table"><tbody>${c.goals.map((g) => `<tr><th scope="row">Étape ${g.step} · ${esc(g.label)}</th><td>${bar(g.done, g.target)}</td><td>${g.done >= g.target ? "✓" : ""}</td></tr>`).join("")}</tbody></table>
        <p class="muted"><small>${c.texts} texte(s) publiés · ${c.drafts} brouillon(s) · unités du plan : ${c.units.written} / ${c.units.total} écrites</small></p></div>
      <div class="card"><h3>Mots fréquents vus</h3><table class="admin-table"><tbody>
        <tr><th scope="row">1 000 premiers</th><td>${bar(c.top1000.covered, c.top1000.total)}</td></tr>
        <tr><th scope="row">2 000 premiers</th><td>${bar(c.top2000.covered, c.top2000.total)}</td></tr></tbody></table>
        ${l === "en" ? `<p class="muted"><small>Mots transparents exclus (comptés comme connus).</small></p>` : ""}</div>
      <div class="card"><h3>Textes par niveau et par thème</h3><table class="admin-table"><tbody>
        ${Object.entries(c.byLevel).map(([lv, n]) => `<tr><th scope="row">${lv}</th><td>${n}</td><td></td></tr>`).join("")}
        ${Object.entries(c.byTheme).map(([th, x]) => `<tr><th scope="row">${esc(THEMES.find((t) => t.id === th)?.icon || "")} ${esc(THEMES.find((t) => t.id === th)?.name || th)}</th><td>${x.total}</td><td class="muted">dont ${x.A1} A1</td></tr>`).join("")}</tbody></table></div>
      <div class="card"><h3>Grammaire (textes qui l'utilisent ≥ 2 fois)</h3><table class="admin-table"><tbody>
        ${c.grammar.map((g) => `<tr><th scope="row">${esc(g.label)} <small class="muted">phase ${g.phase}</small></th><td>${g.texts}</td><td>${g.texts >= 3 ? "✓" : "⚠️"}</td></tr>`).join("")}</tbody></table></div>
      <div class="card"><h3>Les trous</h3>
        <p><b>Thèmes sans texte A1</b> : ${c.holes.themesWithoutA1.map((t) => esc(THEMES.find((x) => x.id === t)?.name || t)).join(", ") || "aucun ✓"}</p>
        <p><b>Grammaire vue dans moins de 3 textes</b> : ${c.holes.grammarUnder3.map(esc).join(", ") || "aucune ✓"}</p>
        <p><b>Mots fréquents jamais vus</b> (parmi les 1 000 premiers) : <span class="${koCls(l)}">${c.holes.missingFrequent.map(esc).join(", ") || "aucun ✓"}</span></p></div>
    </div>`).join("") + `<p class="mt-20"><button class="btn ghost small" data-act="ca-refresh" data-k="cov">↻ Actualiser</button></p>`;
}

// ---------- Actions ----------
const caId = () => decodeURIComponent(location.hash.split("/")[3] || "");
async function caPost(url, body, ok) {
  ui.ca.busy = true; render();
  try {
    const r = await api("POST", url, body);
    if (r.draft) ui.ca[`d:${r.draft.id}`] = { d: { ...ui.ca[`d:${r.draft.id}`].d, draft: r.draft } };
    ok?.(r);
  } catch (e) { toast(e.message); }
  finally { ui.ca.busy = false; caReset("queue"); caReset("cov"); render(); }
}
Object.assign(actions, {
  "ca-refresh": (el) => { caReset(el.dataset.k); render(); },
  "ca-edit": (el) => { ui.ca.edit = { id: caId(), i: +el.dataset.i }; render(); document.getElementById("ca-text")?.focus(); },
  "ca-cancel": () => { ui.ca.edit = null; render(); },
  "ca-save": (el) => {
    const text = document.getElementById("ca-text").value, fr = document.getElementById("ca-fr").value;
    caPost(`/api/admin/content/draft/${encodeURIComponent(caId())}`, { action: "edit", i: +el.dataset.i, text, fr }, () => { ui.ca.edit = null; toast("Phrase ré-annotée et re-vérifiée ✓"); });
  },
  "ca-del": (el) => { if (confirm("Supprimer cette phrase ?")) caPost(`/api/admin/content/draft/${encodeURIComponent(caId())}`, { action: "delete-sentence", i: +el.dataset.i }); },
  "ca-note": (el) => caPost(`/api/admin/content/draft/${encodeURIComponent(caId())}`, { action: "note", note: el.dataset.n, decision: el.dataset.d }, () => toast(el.dataset.d === "accept" ? "Correction appliquée ✓" : "Remarque ignorée")),
  "ca-lex": (el) => caPost(`/api/admin/content/draft/${encodeURIComponent(caId())}`, { action: "lexicon", lemma: el.dataset.l, fr: document.getElementById(`ca-lex-${el.dataset.l}`).value }),
  "ca-publish": () => {
    const id = caId();
    caPost(`/api/admin/content/draft/${encodeURIComponent(id)}/publish`, {}, () => { caReset(`d:${id}`); toast("Publié ✓ Le site le prend au prochain chargement."); location.hash = "#/admin/contenu"; });
  },
  "ca-regen": () => {
    const id = caId();
    caPost(`/api/admin/content/draft/${encodeURIComponent(id)}/regenerate`, {}, () => { ui.ca[`d:${id}`].d.regenerating = true; toast("Régénération lancée (quelques minutes). Actualise la file ensuite."); });
  },
  "ca-reject": () => {
    const id = caId(), reason = document.getElementById("ca-reason").value.trim();
    if (!reason) { toast("Donne une raison : elle sert à améliorer le prompt."); return; }
    caPost(`/api/admin/content/draft/${encodeURIComponent(id)}/reject`, { reason }, () => { caReset(`d:${id}`); toast("Brouillon rejeté"); location.hash = "#/admin/contenu"; });
  },
});
