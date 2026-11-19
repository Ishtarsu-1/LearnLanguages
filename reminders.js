// ============================================================
//  Mochi — reminders.js : rappels quotidiens (Web Push), carte du profil et actions
//  Chargé après actions.js (Object.assign(actions, …)).
// ============================================================
// ---------- Rappels (Web Push, v0.6 lot 3.3) ----------
// Au plus 1 par jour, à l'heure choisie ; jamais un jour décoché, ni si la séance est déjà faite, ni
// quand l'objectif de la semaine est atteint (jour de repos). Désactivable en un clic.
const DAYS_FR = [[1, "L"], [2, "M"], [3, "M"], [4, "J"], [5, "V"], [6, "S"], [7, "D"]];
const reminder = () => (state.settings.reminder ||= { on: false, hour: 19, days: [1, 2, 3, 4, 5, 6, 7] });
const pushSupported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent || "");
const standalone = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);
function reminderCard() {
  if (!account || !features.push) return "";
  const R = reminder();
  const iosHint = isIOS() && !standalone() ? `<p class="muted m-0"><small>Sur iPhone, les rappels marchent quand Mochi est <b>sur l'écran d'accueil</b> (Partager › « Sur l'écran d'accueil »), puis ouvert depuis l'icône.</small></p>` : "";
  return `<h2 class="section-title">Rappels</h2>
    <div class="card">
      <p class="mt-0">🔔 Un petit rappel par jour, à l'heure qui t'arrange. Jamais si tu as déjà fait ta séance, ni les jours de repos.</p>
      <p><button class="btn ${R.on ? "ghost" : ""} small" data-act="rem-toggle" aria-pressed="${R.on}">${R.on ? "🔕 Désactiver les rappels" : "🔔 Activer les rappels"}</button></p>
      <label class="avis-field"><span>Heure du rappel</span>
        <select class="input maxw-320" data-act="rem-hour" id="rem-hour">${Array.from({ length: 17 }, (_, i) => i + 6).map((h) => `<option value="${h}" ${R.hour === h ? "selected" : ""}>${h} h</option>`).join("")}</select></label>
      <fieldset class="avis-kinds"><legend>Jours</legend>${DAYS_FR.map(([d, l]) => `<button type="button" class="chip ${R.days.includes(d) ? "on" : ""}" data-act="rem-day" data-d="${d}" aria-pressed="${R.days.includes(d)}">${l}</button>`).join(" ")}</fieldset>
      ${iosHint}
    </div>`;
}
const vapidKey = (b64) => { const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function reminderSubscribe() {
  const R = reminder();
  if (!pushSupported()) throw new Error(isIOS() ? "Sur iPhone, ajoute d'abord Mochi à l'écran d'accueil, puis ouvre-le depuis l'icône." : "Ce navigateur ne gère pas les notifications.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications refusées : autorise-les dans les réglages du navigateur pour recevoir les rappels.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(features.push) }));
  await api("POST", "/api/push/subscribe", { subscription: sub.toJSON(), hour: R.hour, days: R.days, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
}
async function reminderUnsubscribe() {
  const sub = pushSupported() ? await (await navigator.serviceWorker.ready).pushManager.getSubscription() : null;
  if (sub) { await api("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
}
Object.assign(actions, {
  "rem-toggle": async () => {
    const R = reminder();
    try {
      if (R.on) { await reminderUnsubscribe(); R.on = false; toast("Rappels désactivés"); }
      else { await reminderSubscribe(); R.on = true; toast(`Rappel chaque jour vers ${R.hour} h ✓`); }
      save(); render();
    } catch (e) { toast(e.message); }
  },
  "rem-day": async (el) => {
    const R = reminder(), d = +el.dataset.d;
    R.days = R.days.includes(d) ? R.days.filter((x) => x !== d) : [...R.days, d].sort();
    save(); render();
    if (R.on) reminderSubscribe().catch((e) => toast(e.message));
  },
});
// Changement d'heure (select)
if (typeof document !== "undefined") document.addEventListener("change", (e) => {
  if (e.target?.id !== "rem-hour") return;
  const R = reminder(); R.hour = Number(e.target.value); save();
  if (R.on) reminderSubscribe().then(() => toast(`Rappel vers ${R.hour} h ✓`)).catch((er) => toast(er.message));
});
