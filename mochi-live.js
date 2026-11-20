// ============================================================
//  Mochi — mochi-live.js : Mochi vivant (MOCHI.md, lots M2 à M4)
//  Un seul Mochi animé à la fois : le compagnon de la page (accueil, fin de séance,
//  Profil › Ma Mochi) ou, dans les vues d'apprentissage, un petit Mochi en haut de
//  page (« dock », mode calme). SVG de mochi() + CSS + Web Animations API, sans
//  bibliothèque. On n'anime que transform et opacity.
//  Les modules de l'app préviennent Mochi par mochiBus.emit("answer:right"), etc.
//  Charte §8 et §12 : jamais triste ni en colère, célébrations réservées aux vrais
//  paliers, prefers-reduced-motion respecté.
// ============================================================

// ---------- Bus d'événements ----------
const mochiBus = {
  handlers: {},
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
  emit(ev, data = {}) { for (const fn of this.handlers[ev] || []) try { fn(data); } catch (e) { console.warn("mochiBus", ev, e); } },
};

// Réactions : priorité (célébration > réponse > geste), durée en ms
const MOCHI_REACTIONS = {
  celebrate: { prio: 3, ms: 1200 }, milestone: { prio: 3, ms: 1500 }, accessory: { prio: 3, ms: 800 },
  welcome: { prio: 2, ms: 1000 }, right: { prio: 2, ms: 500 }, streak: { prio: 2, ms: 700 }, wrong: { prio: 2, ms: 600 },
  capture: { prio: 2, ms: 600 }, tap: { prio: 2, ms: 450 }, laugh: { prio: 2, ms: 1600 }, pet: { prio: 2, ms: 900 },
  flavor: { prio: 2, ms: 900 }, worn: { prio: 2, ms: 900 },
  gesture: { prio: 1, ms: 900 }, detail: { prio: 1, ms: 600 },
};
const MOCHI_IDLE_SLEEP_MS = 2 * 60 * 1000, MOCHI_BUBBLE_GAP_MS = 2 * 60 * 1000, MOCHI_ANSWER_GAP_MS = 20 * 1000, MOCHI_QUEUE_MAX = 3;
const MOCHI_FX_COLORS = ["#F6C1D3", "#B9DDB0", "#F9DE8A", "#CDB8EE", "#B9CBF3", "#F7C29A"]; // saveurs (§8)

const MochiLive = {
  el: null, key: "", state: "idle", baseMood: "happy", mood: "happy",
  current: null, queue: [], timers: {}, anims: new Set(),
  visible: true, audio: 0, llm: 0, typing: false, streak: 0, missed: false,
  lastInput: Date.now(), lastBubble: 0, played: {}, flavorsChecked: 0,
  gaze: { x: 0, y: 0, tx: 0, ty: 0, raf: 0, until: 0 },
  press: null,
};
const SVGNS = "http://www.w3.org/2000/svg";

// ---------- Niveau d'animation ----------
// still : immobile (réglage) ; reduced : prefers-reduced-motion ; calm : réglage « discret »
// ou vue d'apprentissage ; full : tout.
function mochiMode() { return state.settings.mochiMode || "live"; }
function prefersReducedMotion() { try { return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; } }
function mochiLevel() {
  if (mochiMode() === "still") return "still";
  if (prefersReducedMotion()) return "reduced";
  if (mochiMode() === "calm" || MochiLive.el?.dataset?.calm) return "calm";
  return "full";
}
const mochiMoves = () => ["calm", "full"].includes(mochiLevel());
const mochiActive = () => !!MochiLive.el && MochiLive.visible && !document.hidden && mochiLevel() !== "still";

// ---------- Minuteurs (un seul par nom ; tous coupés hors écran ou en mode immobile) ----------
function mochiLater(name, fn, ms) {
  clearTimeout(MochiLive.timers[name]);
  MochiLive.timers[name] = setTimeout(() => { delete MochiLive.timers[name]; fn(); }, ms);
}
function mochiClearTimers(keep = []) {
  for (const k of Object.keys(MochiLive.timers)) if (!keep.includes(k)) { clearTimeout(MochiLive.timers[k]); delete MochiLive.timers[k]; }
}
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- Animation (WAAPI) : uniquement transform / opacity ----------
function moPart(sel) { return MochiLive.el?.querySelector?.(sel) || null; }
function mochiAnimate(node, frames, opts) {
  if (!node?.animate) return null;
  const moving = frames.some((f) => "transform" in f);
  if (moving && !mochiMoves()) return null; // mouvement réduit ou immobile : pas de mouvement
  if (mochiLevel() === "still") return null;
  const a = node.animate(frames, { easing: "cubic-bezier(0.22, 1, 0.36, 1)", ...opts });
  MochiLive.anims.add(a);
  a.onfinish = a.oncancel = () => MochiLive.anims.delete(a);
  return a;
}
const SQUISH = "cubic-bezier(0.34, 1.56, 0.64, 1)";
function mochiCancelAnims() { for (const a of [...MochiLive.anims]) a.cancel?.(); MochiLive.anims.clear(); }

// Saut : anticipation (écrasé), envol (étiré), atterrissage (écrasé), volume à peu près constant
function mochiJump(h = 14, ms = 500, spin = false) {
  const rig = moPart(".mo-rig"), sq = moPart(".mo-squash"), sh = moPart(".mo-shadow"), acc = moPart(".mo-acc");
  mochiAnimate(sq, [
    { transform: "scale(1,1)" }, { transform: "scale(1.1,0.9)", offset: 0.2 }, { transform: "scale(0.92,1.08)", offset: 0.4 },
    { transform: "scale(1,1)", offset: 0.65 }, { transform: "scale(1.12,0.88)", offset: 0.82 }, { transform: "scale(1,1)" },
  ], { duration: ms, easing: "ease-out" });
  mochiAnimate(rig, [
    { transform: "translateY(0) rotate(0deg)" }, { transform: "translateY(0) rotate(0deg)", offset: 0.2 },
    { transform: `translateY(${-h}px) rotate(${spin ? 180 : 0}deg)`, offset: 0.5 },
    { transform: `translateY(0) rotate(${spin ? 360 : 0}deg)`, offset: 0.8 }, { transform: `translateY(0) rotate(${spin ? 360 : 0}deg)` },
  ], { duration: ms, easing: "ease-in-out" });
  mochiAnimate(sh, [{ transform: "scale(1)" }, { transform: "scale(0.7)", opacity: 0.6, offset: 0.5 }, { transform: "scale(1)", opacity: 1 }], { duration: ms });
  // Suivi : les accessoires arrivent avec un léger retard
  mochiAnimate(acc, [{ transform: "translateY(0)" }, { transform: "translateY(3px)", offset: 0.5 }, { transform: "translateY(-2px)", offset: 0.85 }, { transform: "translateY(0)" }], { duration: ms, delay: 60 });
}
function mochiTilt(deg = -8, ms = 600) {
  mochiAnimate(moPart(".mo-rig"), [{ transform: "rotate(0deg)" }, { transform: `rotate(${deg}deg)`, offset: 0.35 }, { transform: `rotate(${deg}deg)`, offset: 0.7 }, { transform: "rotate(0deg)" }], { duration: ms, easing: "ease-in-out" });
}

// ---------- Effets (groupe .mo-fx) ----------
// Le placement (attribut transform) va sur un groupe parent : une animation WAAPI de
// « transform » remplace l'attribut transform de l'élément animé, qui se retrouverait en (0, 0).
function mochiFx(tag, attrs, text) {
  const fx = moPart(".mo-fx");
  if (!fx || typeof document.createElementNS !== "function") return null;
  const n = document.createElementNS(SVGNS, tag);
  const { transform, ...rest } = attrs;
  for (const [k, v] of Object.entries(rest)) n.setAttribute(k, v);
  if (text) n.textContent = text;
  if (transform) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("transform", transform); g.appendChild(n); fx.appendChild(g);
    n.moWrap = g;
  } else fx.appendChild(n);
  return n;
}
function mochiFxAnim(n, frames, opts) {
  if (!n) return;
  const a = mochiAnimate(n, frames, opts), drop = () => (n.moWrap || n).remove();
  if (a) a.finished?.then(drop, drop); else drop();
}
const STAR_D = "M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z";
function mochiSparkles(n = 1) {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 112 : 30 + i * 40, y = n === 1 ? 26 : 22 - (i % 2) * 8;
    const s = mochiFx("path", { d: STAR_D, class: "mo-star", transform: `translate(${x} ${y})` });
    mochiFxAnim(s, [{ opacity: 0, transform: "scale(0.2)" }, { opacity: 1, transform: "scale(1.2)", offset: 0.4 }, { opacity: 0, transform: "scale(0.6)" }], { duration: 600, delay: i * 80, easing: SQUISH });
  }
}
function mochiConfetti() {
  for (let i = 0; i < 18; i++) {
    const x = 70 + rand(-10, 10), c = mochiFx(i % 2 ? "rect" : "circle", i % 2
      ? { x: x - 2, y: 40, width: 4, height: 7, fill: MOCHI_FX_COLORS[i % MOCHI_FX_COLORS.length] }
      : { cx: x, cy: 40, r: 2.6, fill: MOCHI_FX_COLORS[i % MOCHI_FX_COLORS.length] });
    const dx = rand(-70, 70), dy = rand(-60, -20);
    mochiFxAnim(c, [{ transform: "translate(0,0) rotate(0deg)", opacity: 1 }, { transform: `translate(${dx}px,${dy}px) rotate(${rand(90, 360)}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx * 1.1}px,${dy + 70}px) rotate(${rand(360, 540)}deg)`, opacity: 0 }], { duration: 1200, easing: "cubic-bezier(0.2, 0.6, 0.4, 1)" });
  }
}
function mochiNote() {
  const n = mochiFx("text", { x: 116, y: 40, class: "mo-mark small mo-note" }, Math.random() < 0.5 ? "♪" : "♫");
  mochiFxAnim(n, [{ opacity: 0, transform: "translate(0,0)" }, { opacity: 1, offset: 0.3 }, { opacity: 0, transform: "translate(8px,-22px)" }], { duration: 1400 });
}
function mochiHeart() {
  const h = mochiFx("path", { d: "M0 3 C-6 -3 -3 -8 0 -4 C3 -8 6 -3 0 3 Z", class: "mo-heart", transform: "translate(104 34)" });
  mochiFxAnim(h, [{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "scale(1.3)", offset: 0.4 }, { opacity: 0, transform: "translateY(-14px) scale(1)" }], { duration: 900 });
}

// ---------- Humeur ----------
function mochiSetMood(mood, { fade = false } = {}) {
  if (!MOCHI_FACES[mood]) mood = "happy";
  MochiLive.mood = mood;
  const el = MochiLive.el;
  if (!el?.querySelector) return;
  if (el.dataset.mood === mood) return;
  const p = mochiParts(mood, !el.dataset.bare);
  el.dataset.mood = mood;
  for (const m of MOCHI_MOODS) el.classList.remove(`mochi-${m}`);
  el.classList.add(`mochi-${mood}`);
  moPart(".mo-body")?.setAttribute("d", p.body);
  const tilt = moPart(".mo-tilt");
  if (tilt) { if (p.tilt) tilt.setAttribute("transform", p.tilt); else tilt.removeAttribute("transform"); }
  const set = (sel, html) => { const n = moPart(sel); if (n) n.innerHTML = html; };
  set(".mo-eyes", p.eyes); set(".mo-mouth", p.mouth); set(".mo-marks", p.marks); set(".mo-acc", p.acc); set(".mo-face-acc", p.faceAcc);
  if (fade || mochiLevel() === "reduced") mochiAnimate(moPart(".mo-face"), [{ opacity: 0.2 }, { opacity: 1 }], { duration: 150 });
  if (mood === "thinking") mochiThinkingDots();
}
function mochiThinkingDots() {
  [...(MochiLive.el?.querySelectorAll?.(".mo-dot") || [])].forEach((d, i) =>
    mochiAnimate(d, [{ opacity: 0.25 }, { opacity: 1, offset: 0.3 }, { opacity: 0.25 }], { duration: 900, delay: i * 300, iterations: Infinity }));
}

// ---------- Réactions : machine à états et file d'attente ----------
// idle ⇄ attentive ; idle → reacting → idle ; idle → sleepy → waking → idle ; idle → celebrating → idle
function mochiReact(kind, data = {}) {
  const R = MOCHI_REACTIONS[kind];
  if (!R) return;
  const item = { kind, data, prio: R.prio, t: Date.now() };
  if (MochiLive.current && MochiLive.current.prio > item.prio) return mochiEnqueue(item);
  if (MochiLive.current && MochiLive.current.prio === item.prio && kind === "gesture") return; // un geste ne coupe pas un geste
  mochiPlay(item);
}
function mochiEnqueue(item) {
  MochiLive.queue.push(item);
  if (MochiLive.queue.length > MOCHI_QUEUE_MAX) {
    const best = MochiLive.queue.reduce((a, b) => (b.prio > a.prio ? b : a));
    MochiLive.queue = [best];
  }
}
function mochiPlay(item) {
  if (MochiLive.state === "sleepy") mochiWake(true);
  MochiLive.current = item;
  MochiLive.state = item.prio === 3 ? "celebrating" : "reacting";
  const R = MOCHI_REACTIONS[item.kind];
  if (mochiLevel() !== "still") MOCHI_PLAY[item.kind](item.data);
  else if (MOCHI_STILL_MOOD[item.kind]) mochiSetMood(MOCHI_STILL_MOOD[item.kind]);
  mochiLater("reaction", () => mochiReactionEnd(), R.ms);
}
function mochiReactionEnd() {
  MochiLive.current = null;
  MochiLive.state = MochiLive.typing ? "attentive" : "idle";
  if (MochiLive.llm) mochiSetMood("thinking");
  else mochiSetMood(MochiLive.typing ? "focused" : MochiLive.baseMood);
  const now = Date.now();
  MochiLive.queue = MochiLive.queue.filter((q) => now - q.t < 5000);
  if (MochiLive.queue.length) {
    const i = MochiLive.queue.reduce((bi, q, j, a) => (q.prio > a[bi].prio ? j : bi), 0);
    mochiPlay(MochiLive.queue.splice(i, 1)[0]);
  }
}
// En mode immobile : seulement l'humeur, sans mouvement
const MOCHI_STILL_MOOD = { right: "happy", streak: "happy", wrong: "curious", celebrate: "proud", milestone: "proud", welcome: "happy" };
const MOCHI_PLAY = {
  right: (d) => { mochiSetMood(d.hard ? "surprised" : "happy"); mochiJump(10, 500); mochiSparkles(1); mochiBubble(mochiLine(d.hard ? "hardRight" : d.back ? "comeback" : "right"), { gap: MOCHI_ANSWER_GAP_MS }); },
  streak: () => { mochiSetMood("happy"); mochiJump(20, 700); mochiSparkles(3); mochiBubble(mochiLine("streak"), { gap: MOCHI_ANSWER_GAP_MS }); },
  // Mauvaise réponse : neutre et curieuse, jamais triste (charte §8)
  wrong: () => { mochiSetMood("curious"); mochiTilt(-7, 600); mochiBubble(mochiLine("wrong"), { gap: MOCHI_ANSWER_GAP_MS }); },
  capture: (d) => {
    mochiFlyCrumb(d.from);
    mochiLater("munch", () => {
      mochiSetMood("happy");
      [...(MochiLive.el?.querySelectorAll?.(".mo-cheek") || [])].forEach((c) => mochiAnimate(c, [{ transform: "scale(1)" }, { transform: "scale(1.45)", offset: 0.4 }, { transform: "scale(1.25)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 380 }));
      mochiAnimate(moPart(".mo-squash"), [{ transform: "scale(1,1)" }, { transform: "scale(1.06,0.95)", offset: 0.5 }, { transform: "scale(1,1)" }], { duration: 300, easing: SQUISH });
      mochiBubble(mochiLine("captured"));
      mochiSound("capture");
    }, 260);
  },
  celebrate: () => { mochiSound("celebrate"); mochiSetMood("happy"); mochiJump(30, 1200, true); mochiConfetti(); mochiBubble(mochiLine("done"), { important: true }); },
  milestone: (d) => {
    mochiSetMood("proud"); mochiJump(16, 700); mochiSparkles(3);
    if (d.fill) mochiFlavorFade(d.fill);
    mochiBubble(mochiLine(d.line || "milestone"), { important: true });
  },
  worn: (d) => { mochiSetMood("happy"); mochiDropAccessory(d.id, true); mochiSound("tap"); mochiBubble(mochiLine("worn"), { important: true }); },
  accessory: (d) => { mochiSetMood("surprised"); mochiDropAccessory(d.id); mochiBubble(mochiLine("accessory"), { important: true }); },
  welcome: () => {
    mochiSetMood("surprised");
    mochiLater("welcome2", () => { mochiSetMood("happy"); mochiJump(14, 500); }, 400);
    mochiBubble(mochiLine("welcome"), { important: true });
  },
  tap: () => { mochiSound("tap"); mochiSetMood("surprised"); mochiLater("tap2", () => mochiSetMood("happy"), 250); },
  laugh: () => {
    mochiSetMood("happy");
    [0, 260, 520].forEach((t, i) => mochiLater(`laugh${i}`, () => mochiJump(6, 240), t));
    // Fait semblant de bouder une seconde, puis sourit : jamais vexé pour de vrai
    mochiLater("pout", () => { mochiSetMood("focused"); mochiBubble(mochiLine("tease"), { important: true, force: true }); }, 800);
  },
  pet: () => {
    mochiSetMood("happy"); mochiHeart();
    [...(MochiLive.el?.querySelectorAll?.(".mo-cheek") || [])].forEach((c) => mochiAnimate(c, [{ opacity: 1, transform: "scale(1)" }, { opacity: 1, transform: "scale(1.3)", offset: 0.3 }, { opacity: 1, transform: "scale(1.3)", offset: 0.8 }, { transform: "scale(1)" }], { duration: 900 }));
  },
  flavor: (d) => { mochiSetMood("proud"); mochiJump(12, 600); mochiFlavorDetail(d.id); mochiBubble(mochiLine("flavor"), { important: true }); },
  gesture: (d) => MOCHI_GESTURES[d.name]?.(),
  detail: () => mochiFlavorDetail(),
};

// Pastille qui vole du mot capturé jusqu'à Mochi (en arc)
function mochiFlyCrumb(from) {
  const el = MochiLive.el;
  if (!from || !el?.getBoundingClientRect || !mochiMoves() || typeof document.createElement !== "function") return;
  const to = el.getBoundingClientRect(), dot = document.createElement("span");
  dot.className = "mochi-crumb";
  document.body.appendChild(dot);
  const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2, x1 = to.left + to.width / 2, y1 = to.top + to.height * 0.7;
  dot.style.setProperty("left", `${x0}px`); dot.style.setProperty("top", `${y0}px`);
  const dx = x1 - x0, dy = y1 - y0, lift = Math.min(-60, dy / 2 - 60);
  const a = dot.animate([{ transform: "translate(-50%,-50%) scale(1)" }, { transform: `translate(calc(${dx / 2}px - 50%), calc(${lift}px - 50%)) scale(1.1)`, offset: 0.5 },
    { transform: `translate(calc(${dx}px - 50%), calc(${dy}px - 50%)) scale(0.3)`, opacity: 0.4 }], { duration: 420, easing: "ease-in" });
  a.finished.then(() => dot.remove(), () => dot.remove());
}
// Palier : la nouvelle saveur apparaît en fondu sur le corps, puis repart
function mochiFlavorFade(fill) {
  const body = moPart(".mo-body"), sq = moPart(".mo-squash");
  if (!body || !sq) return;
  const over = body.cloneNode(); over.setAttribute("class", "mo-body mo-flavor"); over.setAttribute("fill", fill);
  body.after(over);
  const a = mochiAnimate(over, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2400 });
  if (a) a.finished.then(() => over.remove(), () => over.remove()); else over.remove();
}
// Nouvel accessoire : il tombe du haut et rebondit sur la tête
// L'accessoire tombe du haut et rebondit sur la tête. worn : il est déjà dessiné (on vient de le
// mettre), on anime son groupe intérieur ; sinon (déblocage) on l'affiche le temps de l'animation.
function mochiDropAccessory(id, worn = false) {
  const a = typeof accessoryById === "function" && accessoryById(id), acc = moPart(".mo-acc");
  if (!a || !acc || typeof document.createElementNS !== "function") return;
  const fall = a.slot === "face"
    ? [{ transform: "translateY(-14px) scale(1.15)", opacity: 0 }, { transform: "translateY(2px) scale(0.97)", opacity: 1, offset: 0.6 }, { transform: "translateY(0) scale(1)" }]
    : a.slot === "neck"
      ? [{ transform: "scaleX(1.25)", opacity: 0 }, { transform: "scaleX(0.94)", opacity: 1, offset: 0.55 }, { transform: "scaleX(1.03)", offset: 0.8 }, { transform: "scaleX(1)" }]
      : [{ transform: "translateY(-80px)", opacity: 0 }, { transform: "translateY(4px)", opacity: 1, offset: 0.6 }, { transform: "translateY(-6px)", offset: 0.8 }, { transform: "translateY(0)" }];
  let g = worn ? MochiLive.el?.querySelector?.(`.acc-${a.id} .acc-in`) : null;
  if (!g) {
    if (worn) return;
    g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", `acc acc-${a.id}`); g.innerHTML = a.svg;
    (a.slot === "face" ? moPart(".mo-face-acc") || acc : acc).appendChild(g);
    mochiLater("drop", () => { g.remove(); mochiSetMood("proud"); mochiSetMood("happy"); }, 900);
  }
  const an = mochiAnimate(g, fall, { duration: 800, easing: "ease-in" });
  // Atterrissage : Mochi s'écrase un peu sous le choc
  if (a.slot === "head") mochiAnimate(moPart(".mo-squash"), [{ transform: "scale(1,1)" }, { transform: "scale(1,1)", offset: 0.55 }, { transform: "scale(1.08,0.92)", offset: 0.7 }, { transform: "scale(1,1)" }], { duration: 800, easing: SQUISH });
  if (!an) mochiAnimate(g, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
}

// ---------- Vie au repos ----------
const MOCHI_GESTURES = {
  look: () => mochiAnimate(moPart(".mo-face"), [{ transform: "translate(0,0)" }, { transform: "translate(-3px,0)", offset: 0.25 }, { transform: "translate(-3px,0)", offset: 0.4 }, { transform: "translate(3px,0)", offset: 0.6 }, { transform: "translate(3px,0)", offset: 0.8 }, { transform: "translate(0,0)" }], { duration: 1400, easing: "ease-in-out" }),
  hop: () => mochiJump(8, 450),
  tilt: () => mochiTilt(Math.random() < 0.5 ? -6 : 6, 900),
  // Se trémousse : petites rotations alternées, avec un léger écrasement
  wiggle: () => {
    mochiAnimate(moPart(".mo-rig"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-4deg)", offset: 0.2 }, { transform: "rotate(4deg)", offset: 0.45 }, { transform: "rotate(-3deg)", offset: 0.7 }, { transform: "rotate(0deg)" }], { duration: 750, easing: "ease-in-out" });
    mochiAnimate(moPart(".mo-squash"), [{ transform: "scale(1,1)" }, { transform: "scale(1.04,0.97)", offset: 0.3 }, { transform: "scale(0.98,1.02)", offset: 0.6 }, { transform: "scale(1,1)" }], { duration: 750, easing: "ease-in-out" });
  },
  // S'étire vers le haut (volume constant), puis se tasse et revient
  stretch: () => {
    mochiAnimate(moPart(".mo-squash"), [{ transform: "scale(1,1)" }, { transform: "scale(0.92,1.1)", offset: 0.35 }, { transform: "scale(0.92,1.1)", offset: 0.55 }, { transform: "scale(1.08,0.93)", offset: 0.75 }, { transform: "scale(1,1)" }], { duration: 1300, easing: "ease-in-out" });
    mochiAnimate(moPart(".mo-acc"), [{ transform: "translateY(0)" }, { transform: "translateY(-9px)", offset: 0.4 }, { transform: "translateY(-9px)", offset: 0.58 }, { transform: "translateY(4px)", offset: 0.78 }, { transform: "translateY(0)" }], { duration: 1300, delay: 50, easing: "ease-in-out" });
  },
  // Lève les yeux au ciel (un nuage ? un oiseau ?), puis revient
  lookUp: () => mochiAnimate(moPart(".mo-face"), [{ transform: "translate(0,0)" }, { transform: "translate(1px,-3px)", offset: 0.25 }, { transform: "translate(1px,-3px)", offset: 0.75 }, { transform: "translate(0,0)" }], { duration: 1500, easing: "ease-in-out" }),
  // Fredonne : deux notes et un balancement
  hum: () => {
    mochiNote(); mochiLater("hum2", mochiNote, 600);
    mochiAnimate(moPart(".mo-rig"), [{ transform: "rotate(0deg)" }, { transform: "rotate(3deg)", offset: 0.25 }, { transform: "rotate(-3deg)", offset: 0.75 }, { transform: "rotate(0deg)" }], { duration: 1600, easing: "ease-in-out" });
  },
  yawn: () => {
    mochiSetMood("surprised");
    mochiAnimate(moPart(".mo-squash"), [{ transform: "scale(1,1)" }, { transform: "scale(0.96,1.05)", offset: 0.5 }, { transform: "scale(1,1)" }], { duration: 900, easing: "ease-in-out" });
    mochiLater("yawn2", () => mochiSetMood(MochiLive.baseMood), 700);
  },
};
function mochiBlink() {
  if (!mochiActive()) return;
  const eyes = moPart(".mo-eyes");
  if (MochiLive.mood !== "sleepy" && eyes?.animate) {
    // Le clignement est un mouvement minuscule : il reste même en mouvement réduit (MOCHI.md M3)
    const twice = Math.random() < 1 / 6, frames = [{ transform: "scaleY(1)" }, { transform: "scaleY(0.1)", offset: twice ? 0.2 : 0.5 }, { transform: "scaleY(1)", offset: twice ? 0.45 : 1 }];
    if (twice) frames.push({ transform: "scaleY(0.1)", offset: 0.7 }, { transform: "scaleY(1)" });
    const a = eyes.animate(frames, { duration: twice ? 380 : 120 });
    MochiLive.anims.add(a); a.onfinish = a.oncancel = () => MochiLive.anims.delete(a);
  }
  mochiLater("blink", mochiBlink, rand(2500, 6000));
}
function mochiGesture() {
  if (mochiActive() && mochiLevel() === "full" && MochiLive.state === "idle" && !MochiLive.audio && !MochiLive.typing) {
    const h = new Date().getHours(), night = h >= 22 || h < 5;
    const morning = h >= 6 && h < 11;
    const names = night ? ["yawn", "yawn", "look", "tilt", "lookUp"] : ["look", "hop", "tilt", "wiggle", "lookUp", "hum", ...(morning ? ["stretch", "stretch"] : ["stretch"])];
    mochiReact("gesture", { name: names[Math.floor(Math.random() * names.length)] });
  }
  mochiLater("gesture", mochiGesture, rand(20000, 40000));
}
// ---------- Saveurs vivantes (M5) : chaque saveur portée a son petit détail ----------
// Effets dans .mo-fx (repère 140 × 120), uniquement transform / opacity, retirés à la fin.
function mochiFlyFx(n, frames, ms, delay = 0) { mochiFxAnim(n, frames, { duration: ms, delay, easing: "ease-in-out", fill: "backwards" }); }
const MOCHI_FLAVOR_FX = {
  // Sakura : un pétale tombe en se balançant
  rencontre: () => {
    const x = rand(30, 110), p = mochiFx("path", { d: "M0 0 C-4 -3 -4 -8 0 -9 C4 -8 4 -3 0 0 Z", class: "mo-petal", transform: `translate(${x} 6)` });
    mochiFlyFx(p, [{ transform: "translate(0,0) rotate(0deg)", opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: "translate(10px,40px) rotate(120deg)", offset: 0.5 }, { transform: "translate(-6px,92px) rotate(260deg)", opacity: 0 }], 3200);
  },
  // Matcha : trois bulles montent du haut de la tête
  cafe: () => [0, 1, 2].forEach((i) => {
    const b = mochiFx("circle", { cx: 60 + i * 9, cy: 26, r: 2.5 + (i % 2), class: "mo-bubble" });
    mochiFlyFx(b, [{ transform: "translate(0,0) scale(0.4)", opacity: 0 }, { opacity: 0.9, offset: 0.25 }, { transform: `translate(${rand(-4, 4)}px,-24px) scale(1)`, opacity: 0 }], 1600, i * 280);
  }),
  // Myrtille : une petite myrtille roule jusqu'à Mochi
  transports: () => {
    const b = mochiFx("circle", { cx: 150, cy: 104, r: 4, class: "mo-berry" });
    mochiFlyFx(b, [{ transform: "translate(0,0)", opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: "translate(-26px,0)", offset: 0.7 }, { transform: "translate(-24px,-3px)", offset: 0.82 }, { transform: "translate(-26px,0)", opacity: 0 }], 1800);
  },
  // Kaki (cuisine) : deux filets de vapeur
  cuisine: () => [0, 1].forEach((i) => {
    const w = mochiFx("path", { d: "M0 0 c-3 -4 3 -6 0 -10 c-3 -4 3 -6 0 -10", class: "mo-steam", transform: `translate(${62 + i * 16} 28)` });
    mochiFlyFx(w, [{ transform: "translate(0,0)", opacity: 0 }, { opacity: 0.8, offset: 0.35 }, { transform: "translate(0,-12px)", opacity: 0 }], 1800, i * 350);
  }),
  // Yuzu (sport) : un reflet brille sur le haut du corps
  sport: () => {
    const g = mochiFx("path", { d: STAR_D, class: "mo-glint", transform: "translate(42 50)" });
    mochiFlyFx(g, [{ transform: "scale(0.2) rotate(0deg)", opacity: 0 }, { transform: "scale(1.1) rotate(45deg)", opacity: 1, offset: 0.4 }, { transform: "scale(0.3) rotate(90deg)", opacity: 0 }], 900);
  },
  // Ube (séries) : deux petites étoiles scintillent autour
  series: () => [[18, 40], [122, 56]].forEach(([x, y], i) => {
    const st = mochiFx("path", { d: STAR_D, class: "mo-star", transform: `translate(${x} ${y})` });
    mochiFlyFx(st, [{ transform: "scale(0.2)", opacity: 0 }, { transform: "scale(0.9)", opacity: 1, offset: 0.4 }, { transform: "scale(0.2)", opacity: 0 }], 1000, i * 400);
  }),
  // Sésame noir (gaming) : une graine de sésame brille
  gaming: () => {
    const g = mochiFx("ellipse", { cx: rand(48, 92), cy: rand(52, 64), rx: 1.6, ry: 3, class: "mo-seed" });
    mochiFlyFx(g, [{ opacity: 0, transform: "scale(0.5)" }, { opacity: 1, transform: "scale(1.4)", offset: 0.35 }, { opacity: 1, transform: "scale(1)", offset: 0.6 }, { opacity: 0, transform: "scale(0.8)" }], 1400);
  },
  // Injeolmi (travail) : un peu de poudre de soja tombe
  travail: () => [0, 1, 2, 3, 4].forEach((i) => {
    const d = mochiFx("circle", { cx: 34 + i * 18, cy: 98, r: 1.4, class: "mo-powder" });
    mochiFlyFx(d, [{ transform: "translate(0,0)", opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { transform: `translate(${rand(-3, 3)}px,10px)`, opacity: 0 }], 1100, i * 120);
  }),
};
function mochiFlavorDetail(id = state.settings.flavor) {
  if (mochiLevel() !== "full" || !MochiLive.el || MochiLive.el.dataset?.bare) return;
  MOCHI_FLAVOR_FX[id]?.();
}
function mochiFlavorLoop() {
  if (mochiActive() && MochiLive.state === "idle" && !MochiLive.audio && !MochiLive.typing && state.settings.flavor) mochiReact("detail");
  mochiLater("flavor", mochiFlavorLoop, rand(18000, 35000));
}
function mochiSleepCheck() {
  if (mochiActive() && mochiLevel() === "full" && MochiLive.state === "idle" && !MochiLive.audio && Date.now() - MochiLive.lastInput > MOCHI_IDLE_SLEEP_MS) mochiSleep();
  mochiLater("sleep", mochiSleepCheck, 15000);
}
function mochiSleep() {
  MochiLive.state = "sleepy";
  mochiSetMood("sleepy", { fade: true });
  mochiAnimate(moPart(".mo-marks"), [{ transform: "translate(0,0)", opacity: 1 }, { transform: "translate(4px,-8px)", opacity: 0, offset: 0.9 }, { transform: "translate(0,0)", opacity: 0 }], { duration: 2400, iterations: Infinity });
}
function mochiWake(quick = false) {
  if (MochiLive.state !== "sleepy") return;
  for (const a of [...MochiLive.anims]) if (a.effect?.target === moPart(".mo-marks")) a.cancel();
  if (quick) { MochiLive.state = "idle"; return mochiSetMood(MochiLive.baseMood); }
  MochiLive.state = "waking";
  mochiSetMood("surprised");
  mochiLater("wake", () => { MochiLive.state = "idle"; mochiSetMood(MochiLive.baseMood); }, 400);
}
function mochiNoteInput() {
  MochiLive.lastInput = Date.now();
  if (MochiLive.state === "sleepy" && MochiLive.baseMood !== "sleepy") mochiWake();
}

// ---------- Regard (une seule boucle requestAnimationFrame, arrêtée au repos) ----------
function mochiLookAt(x, y) {
  const el = MochiLive.el;
  if (!el?.getBoundingClientRect || !["full"].includes(mochiLevel()) || MochiLive.state === "sleepy") return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.66;
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 200) * 3;
  Object.assign(MochiLive.gaze, { tx: (dx / d) * k, ty: (dy / d) * k, until: Date.now() + 2000 });
  mochiGazeLoop();
}
function mochiGazeLoop() {
  const G = MochiLive.gaze;
  if (G.raf || typeof requestAnimationFrame !== "function") return;
  const step = () => {
    G.raf = 0;
    if (Date.now() > G.until) { G.tx = 0; G.ty = 0; }
    G.x += (G.tx - G.x) * 0.18; G.y += (G.ty - G.y) * 0.18;
    const face = moPart(".mo-face");
    if (!face || !mochiActive()) return;
    face.style.setProperty("transform", `translate(${G.x.toFixed(2)}px, ${G.y.toFixed(2)}px)`);
    const settled = Math.abs(G.tx - G.x) < 0.05 && Math.abs(G.ty - G.y) < 0.05;
    if (!settled || (G.tx || G.ty)) G.raf = requestAnimationFrame(Date.now() > G.until && settled ? () => {} : step);
  };
  G.raf = requestAnimationFrame(step);
}

// ---------- Bulles (M4) ----------
// Au plus une bulle toutes les 2 minutes (sauf événement important), aucune pendant la
// lecture d'un texte ou un audio. Les bulles importantes sont aussi lues par les lecteurs d'écran.
function mochiReading() { return /\/lire\/[^/]+$/.test(location.hash) || /\/livre\//.test(location.hash); }
function mochiBubble(text, { important = false, force = false, title = "", gap = MOCHI_BUBBLE_GAP_MS } = {}) {
  if (!text || mochiLevel() === "still" && !important) return false;
  const now = Date.now();
  if (!force && !important && (now - MochiLive.lastBubble < gap || MochiLive.audio || mochiReading())) return false;
  MochiLive.lastBubble = now;
  if (important) { const sr = document.getElementById("mochi-sr"); if (sr) sr.textContent = text; }
  const el = MochiLive.el;
  if (!el?.getBoundingClientRect || typeof document.createElement !== "function") return true;
  document.querySelectorAll(".mochi-say").forEach((b) => b.remove());
  const b = document.createElement("div"), r = el.getBoundingClientRect();
  b.className = "mochi-say"; b.setAttribute("aria-hidden", "true");
  b.textContent = text;
  if (title) b.title = title;
  document.body.appendChild(b);
  const left = Math.max(8, Math.min(innerWidth - b.offsetWidth - 8, r.left + r.width / 2 - b.offsetWidth / 2));
  const top = r.top - b.offsetHeight - 6 < 8 ? r.bottom + 6 : r.top - b.offsetHeight - 6;
  b.style.setProperty("left", `${left}px`); b.style.setProperty("top", `${top}px`);
  const a = b.animate?.([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none", offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 2800, easing: "ease-out" });
  if (a) a.finished.then(() => b.remove(), () => b.remove()); else setTimeout(() => b.remove(), 2800);
  return true;
}
// Petite phrase dans la langue apprise, avec des mots déjà connus (traduction au survol)
function mochiSpeakTarget(lang) {
  const l = lang && mochiTargetLine(lang);
  return l ? mochiBubble(l.t, { title: l.fr }) : false;
}

// ---------- Interactions directes : tap, caresse, étirement (ne rapportent rien) ----------
function mochiPointerDown(e) {
  if (mochiLevel() === "still") return;
  mochiNoteInput();
  MochiLive.press = { x: e.clientX, y: e.clientY, t: Date.now(), lastDx: 0, flips: 0, moved: 0, petted: false, id: e.pointerId };
  mochiAnimate(moPart(".mo-squash"), [{ transform: "scale(1,1)" }, { transform: "scale(1.12,0.86)" }], { duration: 120, fill: "forwards" });
  mochiLater("longpress", () => { if (MochiLive.press && MochiLive.press.moved < 8) { MochiLive.press.petted = true; mochiReact("pet"); } }, 650);
}
function mochiPointerMove(e) {
  const P = MochiLive.press;
  if (!P) return;
  const dx = e.clientX - P.x, dy = e.clientY - P.y;
  P.moved = Math.max(P.moved, Math.hypot(dx, dy));
  // Caresse : va-et-vient du doigt
  if (Math.sign(dx - P.lastDx) && Math.abs(dx - P.lastDx) > 6) { if (P.dir && Math.sign(dx - P.lastDx) !== P.dir) P.flips++; P.dir = Math.sign(dx - P.lastDx); P.lastDx = dx; }
  if (P.flips >= 3 && !P.petted) { P.petted = true; mochiReact("pet"); }
  // Étirement : comme de la pâte, 40 px au plus
  const k = Math.min(1, 40 / (Math.hypot(dx, dy) || 1)), tx = dx * k, ty = dy * k, s = 1 + Math.hypot(tx, ty) / 200;
  if (mochiMoves()) moPart(".mo-rig")?.style.setProperty("transform", `translate(${tx}px, ${ty}px) rotate(${tx / 6}deg) scale(${(1 / Math.sqrt(s)).toFixed(3)}, ${s.toFixed(3)})`);
}
function mochiPointerUp() {
  const P = MochiLive.press;
  if (!P) return;
  MochiLive.press = null;
  clearTimeout(MochiLive.timers.longpress); delete MochiLive.timers.longpress;
  for (const a of [...MochiLive.anims]) if (a.effect?.target === moPart(".mo-squash")) a.cancel();
  const rig = moPart(".mo-rig"), was = rig?.style.getPropertyValue("transform");
  rig?.style.removeProperty("transform");
  if (was) mochiAnimate(rig, [{ transform: was }, { transform: "none" }], { duration: 500, easing: SQUISH }); // retour élastique
  mochiAnimate(moPart(".mo-squash"), [{ transform: "scale(1.12,0.86)" }, { transform: "scale(0.95,1.06)", offset: 0.5 }, { transform: "scale(1,1)" }], { duration: 400, easing: SQUISH });
  if (P.petted || P.moved > 10) return;
  const now = Date.now(), taps = (MochiLive.taps || []).filter((t) => now - t < 1500);
  taps.push(now); MochiLive.taps = taps;
  if (taps.length >= 5) { MochiLive.taps = []; mochiReact("laugh"); } else mochiReact("tap");
}

// ---------- Rattachement après chaque rendu ----------
// Choisit le Mochi vivant de la page ; sinon, dans une vue d'apprentissage, ajoute un petit
// Mochi en haut de page. Garde le même élément d'un rendu à l'autre quand c'est possible.
function mochiAttach(root) {
  if (!root?.querySelector) return;
  let cand = root.querySelector(".mochi.live");
  const top = !cand && root.querySelector(".lesson-shell .lesson-top, .reader > .lesson-top, .ex-tab .lang-header .right");
  if (!cand && top && mochiMode() !== "still") {
    const old = MochiLive.el?.dataset?.calm ? MochiLive.el : null;
    if (old && old.isConnected === false) { const holder = document.createElement("span"); holder.className = "mochi-dock"; holder.appendChild(old); top.appendChild(holder); cand = old; }
    else { top.insertAdjacentHTML("beforeend", `<span class="mochi-dock">${mochi("dock", "happy", true, { live: true })}</span>`); cand = top.querySelector(".mochi.live"); cand.dataset.calm = "1"; }
  }
  if (!cand) return mochiDetach();
  // La clé inclut les accessoires portés : si on vient d'en changer, on garde le nouveau dessin
  const key = [...cand.classList].filter((c) => !c.startsWith("mochi-") && c !== "breathe" && c !== "paused").join(" ") + (cand.dataset.intro || "")
    + (cand.dataset.bare ? "" : `|${JSON.stringify(state.settings.look || {})}`);
  const base = cand.dataset.mood || "happy";
  if (MochiLive.el && MochiLive.el !== cand && MochiLive.key === key && !MochiLive.el.isConnected && !cand.dataset.calm) {
    cand.replaceWith(MochiLive.el); // même Mochi qu'avant le rendu : ses animations continuent
    cand = MochiLive.el;
  } else if (MochiLive.el !== cand) {
    mochiDetach();
    MochiLive.el = cand; MochiLive.key = key;
    mochiBind(cand);
  }
  if (MochiLive.baseMood !== base || !MochiLive.current) {
    MochiLive.baseMood = base;
    if (!MochiLive.current && MochiLive.state !== "sleepy") mochiSetMood(MochiLive.llm ? "thinking" : MochiLive.typing ? "focused" : base);
  }
  mochiArm();
  mochiIntro(cand);
  if (MochiLive.queue.length && !MochiLive.current) mochiReactionEnd();
}
function mochiBind(el) {
  el.classList.toggle("breathe", mochiMoves());
  el.addEventListener?.("pointerdown", mochiPointerDown);
  if (typeof IntersectionObserver === "function") {
    MochiLive.io = new IntersectionObserver(([en]) => { MochiLive.visible = en.isIntersecting; mochiArm(); });
    MochiLive.io.observe(el);
  }
}
function mochiDetach() {
  if (!MochiLive.el) return;
  MochiLive.io?.disconnect?.(); MochiLive.io = null;
  MochiLive.el.removeEventListener?.("pointerdown", mochiPointerDown);
  mochiCancelAnims();
  mochiClearTimers(["reaction"]);
  MochiLive.el = null; MochiLive.key = ""; MochiLive.press = null;
  if (MochiLive.state === "sleepy") MochiLive.state = "idle";
}
// Minuteurs de la vie au repos : seulement si Mochi est visible, onglet au premier plan, pas immobile
function mochiArm() {
  const el = MochiLive.el;
  if (!el) return;
  el.classList?.toggle("breathe", mochiMoves());
  el.classList?.toggle("paused", !mochiActive());
  if (!mochiActive()) { mochiClearTimers(mochiLevel() === "still" ? [] : ["reaction"]); if (mochiLevel() === "still") { MochiLive.current = null; MochiLive.state = "idle"; } return; }
  if (!MochiLive.timers.blink) mochiLater("blink", mochiBlink, rand(1500, 4000));
  if (mochiLevel() === "full") {
    if (!MochiLive.timers.gesture) mochiLater("gesture", mochiGesture, rand(20000, 40000));
    if (!MochiLive.timers.sleep) mochiLater("sleep", mochiSleepCheck, 15000);
    if (!MochiLive.timers.flavor) mochiLater("flavor", mochiFlavorLoop, rand(8000, 16000));
  } else mochiClearTimers(["blink", "reaction", "munch", "welcome2", "tap2", "pout", "laugh0", "laugh1", "laugh2", "drop", "wake", "yawn2", "hum2"]);
}
// Entrées en scène déclarées par la page (data-intro) : une fois par jour
function mochiIntro(el) {
  const intro = el.dataset?.intro, k = `${intro}:${today()}`;
  if (!intro || MochiLive.played[k]) return;
  MochiLive.played[k] = true;
  if (intro === "welcome") mochiReact("welcome");
  else if (intro === "done") mochiReact("celebrate");
  else if (intro === "rest") { MochiLive.baseMood = "sleepy"; mochiSetMood("sleepy"); mochiBubble(mochiLine("rest"), { important: true }); }
  else if (intro === "hello") {
    const lang = state.lastLang;
    if (!(Math.random() < 0.35 && mochiSpeakTarget(lang))) mochiBubble(mochiGreeting());
  }
}
// Saveur débloquée depuis la dernière visite (comparaison avec la liste vue, par langue)
function mochiCheckFlavors(lang) {
  if (!lang || typeof themeProgress !== "function" || Date.now() - MochiLive.flavorsChecked < 30000) return;
  MochiLive.flavorsChecked = Date.now();
  const got = themeProgress(lang).filter((p) => p.unlocked), seen = (state.settings.flavorSeen ||= {});
  if (!seen[lang]) { seen[lang] = got.map((p) => p.id); return save(); } // première fois : rien à fêter
  const fresh = got.filter((p) => !seen[lang].includes(p.id));
  if (!fresh.length) return;
  seen[lang] = [...seen[lang], ...fresh.map((p) => p.id)]; save();
  mochiBus.emit("milestone", { fill: fresh[0].fill, line: "milestone" });
}

// ---------- Branchements : événements de l'app ----------
mochiBus.on("answer:right", (d) => { MochiLive.streak++; mochiReact(MochiLive.streak % 3 === 0 ? "streak" : "right", { ...d, back: MochiLive.missed }); MochiLive.missed = false; });
mochiBus.on("answer:wrong", () => { MochiLive.streak = 0; MochiLive.missed = true; mochiReact("wrong"); });
mochiBus.on("word:captured", (d) => mochiReact("capture", d));
mochiBus.on("session:done", () => mochiReact("celebrate"));
mochiBus.on("milestone", (d) => mochiReact("milestone", d));
mochiBus.on("accessory:new", (d) => mochiReact("accessory", d));
mochiBus.on("flavor:worn", (d) => mochiReact("flavor", d));
mochiBus.on("accessory:worn", (d) => mochiReact("worn", d));
mochiBus.on("audio:start", () => {
  MochiLive.audio++;
  if (mochiLevel() !== "full" || MochiLive.timers.sway) return;
  const sway = () => {
    if (!MochiLive.audio) return;
    mochiAnimate(moPart(".mo-tilt"), [{ transform: "rotate(0deg)" }, { transform: "rotate(-3deg)", offset: 0.25 }, { transform: "rotate(3deg)", offset: 0.75 }, { transform: "rotate(0deg)" }], { duration: 1600, easing: "ease-in-out" });
    mochiNote();
    mochiLater("sway", sway, 1600);
  };
  sway();
});
mochiBus.on("audio:end", () => { MochiLive.audio = Math.max(0, MochiLive.audio - 1); });
// Filet de sécurité : une lecture qui ne se termine jamais ne bloque pas Mochi plus de 30 s
mochiBus.on("audio:start", () => mochiLater("audioSafety", () => { MochiLive.audio = 0; }, 30000));
mochiBus.on("llm:start", () => { MochiLive.llm++; if (!MochiLive.current) mochiSetMood("thinking"); });
mochiBus.on("llm:end", () => { MochiLive.llm = Math.max(0, MochiLive.llm - 1); if (!MochiLive.llm && !MochiLive.current) mochiSetMood(MochiLive.typing ? "focused" : MochiLive.baseMood); });

if (typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => mochiArm());
  document.addEventListener("pointermove", (e) => {
    if (MochiLive.press) return mochiPointerMove(e);
    if (e.pointerType === "mouse") { if (Date.now() - MochiLive.lastInput > 1000) mochiNoteInput(); mochiLookAt(e.clientX, e.clientY); }
  }, { passive: true });
  document.addEventListener("pointerup", mochiPointerUp);
  document.addEventListener("pointercancel", mochiPointerUp);
  document.addEventListener("keydown", () => mochiNoteInput());
  document.addEventListener("scroll", () => mochiNoteInput(), { passive: true });
  // Saisie : Mochi regarde le champ, concentré ; un bouton qui prend le focus attire son regard
  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (!t?.getBoundingClientRect) return;
    const r = t.getBoundingClientRect();
    mochiLookAt(r.left + r.width / 2, r.top + r.height / 2);
    if (t.matches?.("input[type=text], input:not([type]), textarea")) {
      MochiLive.typing = true;
      if (!MochiLive.current && MochiLive.state !== "sleepy") { MochiLive.state = "attentive"; if (!MochiLive.llm) mochiSetMood("focused"); }
    }
  });
  document.addEventListener("focusout", (e) => {
    if (!e.target?.matches?.("input, textarea")) return;
    MochiLive.typing = false;
    if (MochiLive.state === "attentive") { MochiLive.state = "idle"; if (!MochiLive.llm) mochiSetMood(MochiLive.baseMood); }
  });
}

// Audio et correcteur IA : on enveloppe speak() (audio.js) et api() (state.js) plutôt que de
// semer des appels partout. La valeur renvoyée ne change pas.
if (typeof speak === "function") {
  const rawSpeak = speak;
  speak = function (...args) {
    mochiBus.emit("audio:start");
    const r = rawSpeak.apply(this, args);
    const end = () => mochiBus.emit("audio:end");
    Promise.resolve(r).then(end, end);
    return r;
  };
}
if (typeof api === "function") {
  const rawApi = api;
  api = function (method, url, ...rest) {
    const llmCall = method === "POST" && url === "/api/feedback";
    if (llmCall) mochiBus.emit("llm:start");
    const r = rawApi.call(this, method, url, ...rest);
    if (llmCall) { const end = () => mochiBus.emit("llm:end"); Promise.resolve(r).then(end, end); }
    return r;
  };
}

// ---------- Sons (M5, désactivés par défaut) ----------
// Synthétisés avec Web Audio : pas de fichier, rien à télécharger, rien à créditer.
let mochiAudioCtx = null;
const MOCHI_SOUNDS = {
  tap: [[880, 1320, 0.09]],                                  // « pouic »
  capture: [[520, 380, 0.08], [600, 440, 0.08, 0.1]],        // « miam »
  celebrate: [[523, 523, 0.1], [659, 659, 0.1, 0.11], [784, 784, 0.1, 0.22], [1047, 1047, 0.22, 0.33]], // petite fanfare
};
function mochiSound(kind) {
  if (!state.settings.mochiSound || mochiLevel() === "still" || !MOCHI_SOUNDS[kind]) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    mochiAudioCtx ||= new AC();
    const ctx = mochiAudioCtx, t0 = ctx.currentTime;
    for (const [f0, f1, dur, at = 0] of MOCHI_SOUNDS[kind]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(f0, t0 + at); o.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur);
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.12, t0 + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
    }
  } catch {}
}

// Réglage Profil › Ma Mochi
Object.assign(actions, {
  "mochi-mode": (el) => { state.settings.mochiMode = el.dataset.v; save(); mochiDetach(); render(); },
});
