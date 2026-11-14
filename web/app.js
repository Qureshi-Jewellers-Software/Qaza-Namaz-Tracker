// Qaza Namaz Tracker - Web app
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { PRAYERS, ROZA, ITEMS, nameOf, parseDate, computeTotals, balances, dateKey, fmt, startOfDay } from "./calc.js";

const $ = (id) => document.getElementById(id);
const AUTH_VIEWS = ["loading", "login", "register", "forgot", "reset"];
const APP_VIEWS = ["setup", "review", "dashboard", "add", "history", "settings"];
const ALL_VIEWS = [...AUTH_VIEWS, ...APP_VIEWS];
const NAV_VIEWS = ["dashboard", "add", "history", "settings"];
const SITE_URL = window.location.origin + window.location.pathname;
const configured = !SUPABASE_URL.startsWith("PASTE_") && !SUPABASE_ANON_KEY.startsWith("PASTE_");

// ---------- chhote helpers ----------
function show(view) {
  for (const v of ALL_VIEWS) $("view-" + v).hidden = v !== view;
  const inApp = APP_VIEWS.includes(view);
  $("nav").hidden = !NAV_VIEWS.includes(view);
  $("brand").classList.toggle("compact", inApp);
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
  window.scrollTo(0, 0);
}

function say(text, type = "info") {
  const box = $("message");
  if (!text) { box.hidden = true; box.textContent = ""; return; }
  box.textContent = text;
  box.className = "notice" + (type === "error" ? " error" : "");
  box.hidden = false;
}

function friendly(err) {
  const m = (err && err.message) || String(err);
  if (/invalid login credentials/i.test(m)) return "Email ya password ghalat hai.";
  if (/email not confirmed/i.test(m)) return "Pehle apni email mein aaya confirm link kholein.";
  if (/already registered|already been registered/i.test(m)) return "Is email se account pehle se bana hua hai. Login karein.";
  if (/password should be at least/i.test(m)) return "Password kam az kam 8 huroof ka hona chahiye.";
  if (/rate limit|too many/i.test(m)) return "Bohat dafa koshish ho gayi. Thodi der baad dobara karein.";
  if (/network|fetch/i.test(m)) return "Internet se rabta nahi ho saka. Connection check karein.";
  if (/same.*password|different from the old/i.test(m)) return "Naya password purane se mukhtalif hona chahiye.";
  return "Masla aa gaya: " + m;
}

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dateLabel = (key) => {
  const today = dateKey(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === today) return "Aaj";
  if (key === dateKey(y)) return "Kal";
  const [yy, mm, dd] = key.split("-").map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

async function busy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}

// Device par mehfooz (sirf is browser mein) setup maloomat
function localGet(uid) { try { return JSON.parse(localStorage.getItem("qaza-setup-" + uid) || "null"); } catch { return null; } }
function localSet(uid, v) { try { localStorage.setItem("qaza-setup-" + uid, JSON.stringify(v)); } catch { /* koi baat nahi */ } }

document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { say(""); show(b.dataset.go); }));

if (!configured) {
  $("config-warning").hidden = false;
  show("login");
} else {
  start();
}

function start() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const state = { session: null, entries: [], bal: null, addItem: "fajr", range: "day", review: null, loadedFor: null };
  let recovering = false;

  // ================= AUTH =================
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { recovering = true; say(""); show("reset"); return; }
    if (recovering) return;
    if (!session) { state.session = null; state.loadedFor = null; show("login"); return; }
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      if (state.loadedFor === session.user.id) return; // token refresh par dobara load nahi
      state.session = session;
      state.loadedFor = session.user.id;
      setTimeout(() => enterApp(), 0);
    }
  });

  $("form-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, email = f.email.value.trim(), password = f.password.value;
    if (!validEmail(email)) return say("Sahih email likhein.", "error");
    if (!password) return say("Password likhein.", "error");
    busy(f.querySelector("[type=submit]"), async () => {
      say("");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) say(friendly(error), "error"); else f.reset();
    });
  });

  $("form-register").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, email = f.email.value.trim(), p1 = f.password.value, p2 = f.password2.value;
    if (!validEmail(email)) return say("Sahih email likhein.", "error");
    if (p1.length < 8) return say("Password kam az kam 8 huroof ka hona chahiye.", "error");
    if (p1 !== p2) return say("Dono password ek jaise nahi hain.", "error");
    busy(f.querySelector("[type=submit]"), async () => {
      say("");
      const { data, error } = await supabase.auth.signUp({ email, password: p1, options: { emailRedirectTo: SITE_URL } });
      if (error) return say(friendly(error), "error");
      f.reset();
      if (!data.session) { show("login"); say("Account ban gaya! Apni email mein aaya confirm link kholein, phir login karein."); }
    });
  });

  $("form-forgot").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, email = f.email.value.trim();
    if (!validEmail(email)) return say("Sahih email likhein.", "error");
    busy(f.querySelector("[type=submit]"), async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
      if (error) return say(friendly(error), "error");
      f.reset(); show("login");
      say("Agar is email ka account hai to password badalne ka link bhej diya gaya hai. Email check karein.");
    });
  });

  $("form-reset").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, p1 = f.password.value, p2 = f.password2.value;
    if (p1.length < 8) return say("Password kam az kam 8 huroof ka hona chahiye.", "error");
    if (p1 !== p2) return say("Dono password ek jaise nahi hain.", "error");
    busy(f.querySelector("[type=submit]"), async () => {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) return say(friendly(error), "error");
      f.reset(); recovering = false;
      say("Password badal gaya ✓");
      const { data: s } = await supabase.auth.getSession();
      if (s.session) { state.session = s.session; state.loadedFor = s.session.user.id; enterApp(); } else show("login");
    });
  });

  // ================= DATA =================
  async function loadEntries() {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("qaza_entries").select("*")
        .order("recorded_at", { ascending: false }).range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) break;
    }
    state.entries = all;
    state.bal = balances(all, dateKey(new Date()));
  }

  async function insertEntries(rows) {
    const now = new Date().toISOString();
    // Har row mein saare columns, taake koi column khali (NULL) na reh jaye
    const full = rows.map((r) => ({
      id: uuid(), user_id: state.session.user.id, recorded_at: now, device_id: "web",
      related_entry_id: null, note: null, ...r,
    }));
    const { error } = await supabase.from("qaza_entries").insert(full);
    if (error) throw error;
    await loadEntries();
  }

  const initialEntries = () => state.entries.filter((e) => e.kind === "initial");

  async function enterApp() {
    show("loading");
    try {
      await loadEntries();
    } catch (err) {
      show("settings"); renderSettings();
      return say("Data load nahi ho saka: " + friendly(err), "error");
    }
    say("");
    if (initialEntries().length === 0) openSetup(); else { renderDashboard(); show("dashboard"); }
  }

  // ================= SETUP =================
  const setupForm = $("form-setup");
  setupForm.addEventListener("change", () => { $("haiz-box").hidden = setupForm.gender.value !== "female"; });

  function openSetup() {
    const saved = localGet(state.session.user.id);
    if (saved) {
      setupForm.dob.value = saved.dob || "";
      setupForm.gender.value = saved.gender || "male";
      setupForm.startAge.value = saved.startAge || 10;
      setupForm.haizDays.value = saved.haizDays ?? 7;
    }
    setupForm.dob.max = dateKey(new Date());
    $("haiz-box").hidden = setupForm.gender.value !== "female";
    say(""); show("setup");
  }

  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const dob = parseDate(setupForm.dob.value);
    const startAge = parseInt(setupForm.startAge.value, 10);
    const gender = setupForm.gender.value;
    const haizDays = parseInt(setupForm.haizDays.value, 10) || 0;
    if (!dob) return say("Date of Birth chunein.", "error");
    if (dob > new Date()) return say("Date of Birth aaj ke baad ki nahi ho sakti.", "error");
    if (!(startAge >= 1 && startAge <= 30)) return say("Start age 1 se 30 ke darmiyan likhein.", "error");
    if (gender === "female" && (haizDays < 0 || haizDays > 15)) return say("Haiz ke din 0 se 15 ke darmiyan likhein.", "error");
    const t = computeTotals({ dob, startAge, gender, haizDays });
    if (t.days <= 0) return say("Is start age ke hisaab se ginti abhi shuru nahi hui.", "error");
    localSet(state.session.user.id, { ...(localGet(state.session.user.id) || {}), dob: setupForm.dob.value, gender, startAge, haizDays });
    supabase.from("profiles").update({ start_age: startAge, updated_at: new Date().toISOString() }).eq("id", state.session.user.id).then(() => {});
    const startStr = t.start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    let info = `Ginti ${startStr} (${startAge} saal) se aaj tak: ${fmt(t.days)} din.`;
    if (gender === "female") info += ` Haiz ke takreeban ${fmt(t.haizTotal)} din minus kiye.`;
    info += ` Ramzan: ${t.ramadanCount} (${fmt(t.ramadanDays)} din${t.ramadanEstimated ? ", andaza" : ""}).`;
    if (gender === "female" && t.ramadanHaiz) info += ` In mein haiz ke takreeban ${fmt(t.ramadanHaiz)} din ke rozay bhi shamil hain.`;
    const totals = {};
    for (const p of PRAYERS) totals[p.id] = t.prayerTotal;
    totals.roza = t.ramadanDays;
    openReview(totals, info);
  });

  $("btn-manual").addEventListener("click", () => {
    const totals = {};
    for (const it of ITEMS) totals[it.id] = 0;
    openReview(totals, "Har namaz aur rozon ka apna andaza \"Total\" mein likhein.");
  });

  // ================= REVIEW =================
  function openReview(totals, info) {
    $("review-info").textContent = info;
    const rows = $("review-rows");
    rows.replaceChildren();
    state.review = {}; state.reviewAda = {};
    const savedAda = (localGet(state.session.user.id) || {}).ada || {};
    for (const it of ITEMS) {
      const row = el("div", "rev-row");
      row.append(el("b", null, it.name));
      const tot = el("input"); tot.type = "number"; tot.inputMode = "numeric"; tot.min = "0"; tot.value = totals[it.id] || 0;
      tot.setAttribute("aria-label", it.name + " total");
      const ada = el("input"); ada.type = "number"; ada.inputMode = "numeric"; ada.min = "0"; ada.value = savedAda[it.id] || 0;
      ada.setAttribute("aria-label", it.name + " pehle ada");
      const res = el("span", "num", "0");
      const recalc = () => {
        const v = Math.max(0, (parseInt(tot.value, 10) || 0) - (parseInt(ada.value, 10) || 0));
        res.textContent = fmt(v); state.review[it.id] = v; state.reviewAda[it.id] = parseInt(ada.value, 10) || 0;
      };
      tot.addEventListener("input", recalc); ada.addEventListener("input", recalc);
      row.append(tot, ada, res); rows.append(row); recalc();
    }
    say(""); show("review");
  }

  $("btn-save-initial").addEventListener("click", (e) => busy(e.currentTarget, async () => {
    const target = state.review || {};
    const totalAll = Object.values(target).reduce((a, b) => a + b, 0);
    if (totalAll <= 0) return say("Kam az kam ek item ka number likhein.", "error");
    const rows = [];
    const inits = initialEntries();
    for (const it of ITEMS) {
      const want = target[it.id] || 0;
      const current = state.bal.items[it.id].initial;
      const diff = want - current;
      if (diff === 0) continue;
      const first = inits.find((x) => x.item === it.id);
      if (first) rows.push({ item: it.id, kind: "correction", delta: diff, related_entry_id: first.id, note: "Shuru ka hisaab badla" });
      else if (want > 0) rows.push({ item: it.id, kind: "initial", delta: want });
    }
    try {
      if (rows.length) await insertEntries(rows);
      const ls = localGet(state.session.user.id) || {};
      localSet(state.session.user.id, { ...ls, ada: state.reviewAda });
      renderDashboard(); show("dashboard");
      say(inits.length ? "Hisaab update ho gaya ✓ (farq history mein likha gaya)" : "Hisaab save ho gaya ✓");
    } catch (err) { say(friendly(err), "error"); }
  }));

  // ================= DASHBOARD =================
  function renderDashboard() {
    const b = state.bal.items;
    let init = 0, rem = 0, today = 0;
    for (const p of PRAYERS) { init += b[p.id].initial; rem += b[p.id].remaining; today += b[p.id].today; }
    const done = init - rem;
    const pct = init > 0 ? (done / init) * 100 : 0;
    $("d-remaining").textContent = fmt(rem);
    $("d-done").textContent = fmt(done);
    $("d-pct").textContent = (Math.round(pct * 10) / 10) + "%";
    $("d-bar").style.width = Math.min(100, pct) + "%";
    $("d-today").textContent = fmt(today + b.roza.today);
    $("d-roza").textContent = fmt(b.roza.remaining);

    const list = $("d-list"); list.replaceChildren();
    for (const it of ITEMS) {
      const r = b[it.id];
      if (it.id === "roza" && r.initial === 0) continue;
      const card = el("div", "item");
      const row = el("div", "item-row");
      row.append(el("b", null, it.name));
      const right = el("span"); right.append(el("b", null, fmt(r.remaining)), document.createTextNode(" baqi · " + fmt(r.done) + " ada"));
      row.append(right);
      const bar = el("div", "bar"); const fill = el("div");
      fill.style.width = (r.initial > 0 ? Math.min(100, (r.done / r.initial) * 100) : 0) + "%";
      bar.append(fill); card.append(row, bar); list.append(card);
    }
    const recent = $("d-recent"); recent.replaceChildren();
    const rec = state.entries.filter((e) => e.kind !== "initial").slice(0, 5);
    if (!rec.length) recent.append(el("p", "muted small-left", "Abhi koi entry nahi. Neeche \"Add\" dabayein."));
    rec.forEach((e) => recent.append(entryCard(e, false)));
  }

  // ================= ADD =================
  function renderAdd() {
    const wrap = $("add-items"); wrap.replaceChildren();
    for (const it of ITEMS) {
      if (it.id === "roza" && state.bal.items.roza.initial === 0) continue;
      const c = el("button", "chip" + (state.addItem === it.id ? " active" : ""), it.name);
      c.type = "button";
      c.addEventListener("click", () => { state.addItem = it.id; renderAdd(); });
      wrap.append(c);
    }
    updateAddNumbers();
  }

  function updateAddNumbers() {
    const r = state.bal.items[state.addItem];
    const inp = $("add-count");
    let n = parseInt(inp.value, 10) || 0;
    if (n > r.remaining) { n = r.remaining; inp.value = n; }
    $("add-q").textContent = state.addItem === "roza" ? "Kitne rozay rakhe?" : `Kitni ${nameOf(state.addItem)} ada ki?`;
    $("add-before").textContent = fmt(r.remaining);
    $("add-after").textContent = fmt(Math.max(0, r.remaining - Math.max(0, n)));
  }

  $("add-inc").addEventListener("click", () => { const i = $("add-count"); i.value = (parseInt(i.value, 10) || 0) + 1; updateAddNumbers(); });
  $("add-dec").addEventListener("click", () => { const i = $("add-count"); i.value = Math.max(1, (parseInt(i.value, 10) || 0) - 1); updateAddNumbers(); });
  $("add-count").addEventListener("input", updateAddNumbers);

  $("btn-add").addEventListener("click", (e) => busy(e.currentTarget, async () => {
    const n = parseInt($("add-count").value, 10) || 0;
    const r = state.bal.items[state.addItem];
    if (n < 1) return say("Kam az kam 1 likhein.", "error");
    if (n > r.remaining) return say(`${nameOf(state.addItem)} mein sirf ${fmt(r.remaining)} baqi hain.`, "error");
    try {
      await insertEntries([{ item: state.addItem, kind: "completed", delta: -n }]);
      $("add-count").value = 1;
      updateAddNumbers();
      say(`${nameOf(state.addItem)} +${n} save ho gaya ✓ Baqi: ${fmt(state.bal.items[state.addItem].remaining)}`);
    } catch (err) { say(friendly(err), "error"); }
  }));

  // ================= HISTORY =================
  function entryText(e) {
    const byId = new Map(state.entries.map((x) => [x.id, x]));
    const rel = e.related_entry_id ? byId.get(e.related_entry_id) : null;
    const nm = nameOf(e.item);
    if (e.kind === "initial") return { t: `Shuru ka hisaab: ${nm} ${fmt(e.delta)}`, fix: false };
    if (e.kind === "completed") return { t: `${nm} +${fmt(-e.delta)}`, fix: false };
    if (e.kind === "undo") return { t: `Undo: ${nm} ${rel && rel.kind === "completed" ? "+" + fmt(-rel.delta) : ""} wapas baqi mein`, fix: true };
    if (rel && rel.kind === "initial") return { t: `Correction: ${nm} shuru ka hisaab ${e.delta > 0 ? "+" : ""}${fmt(e.delta)}`, fix: true };
    return { t: `Correction: ${nm} ${e.delta > 0 ? "+" : ""}${fmt(e.delta)}`, fix: true };
  }

  function entryCard(e, withUndo) {
    const { t, fix } = entryText(e);
    const undone = state.bal.undone.has(e.id);
    const card = el("div", "item" + (fix ? " fix" : "") + (undone ? " undone" : ""));
    const row = el("div", "item-row");
    const left = el("div", "grow");
    left.append(el("b", "t", t));
    let meta = timeOf(e.recorded_at) + (withUndo ? "" : " · " + dateLabel(dateKey(e.recorded_at)));
    if (e.kind === "completed") meta += ` · baqi par asar: −${fmt(-e.delta)}`;
    if (e.kind === "undo" || e.kind === "correction") meta += ` · baqi par asar: ${e.delta > 0 ? "+" : ""}${fmt(e.delta)}`;
    if (undone) meta += " · undo ho chuka";
    left.append(el("span", "muted", meta));
    row.append(left);
    if (withUndo && e.kind === "completed" && !undone) {
      const u = el("button", "mini", "Undo"); u.type = "button";
      u.setAttribute("aria-label", "Undo " + t);
      u.addEventListener("click", () => busy(u, async () => {
        try {
          await insertEntries([{ item: e.item, kind: "undo", delta: -e.delta, related_entry_id: e.id, note: "Undo" }]);
          renderHistory(); say("Undo ho gaya ✓ " + nameOf(e.item) + " +" + fmt(-e.delta) + " wapas baqi mein.");
        } catch (err) { say(friendly(err), "error"); }
      }));
      row.append(u);
    }
    card.append(row);
    return card;
  }

  document.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => {
    state.range = b.dataset.range;
    document.querySelectorAll("[data-range]").forEach((x) => x.classList.toggle("active", x === b));
    renderHistory();
  }));

  function renderHistory() {
    const now = startOfDay(new Date());
    const from = new Date(now);
    if (state.range === "week") from.setDate(from.getDate() - 6);
    else if (state.range === "month") from.setDate(from.getDate() - 29);
    else if (state.range === "all") from.setFullYear(1900);
    const list = state.entries.filter((e) => new Date(e.recorded_at) >= from);
    let done = 0;
    for (const e of list) if (e.kind !== "initial") {
      const rel = e.related_entry_id ? state.entries.find((x) => x.id === e.related_entry_id) : null;
      if (!(rel && rel.kind === "initial")) done += -e.delta;
    }
    const label = { day: "Aaj", week: "Pichle 7 din", month: "Pichle 30 din", all: "Ab tak" }[state.range];
    $("h-summary").textContent = `${label}: ${fmt(done)} ada (undo ke baad), ${list.length} entries.`;
    const wrap = $("h-list"); wrap.replaceChildren();
    if (!list.length) { wrap.append(el("p", "muted small-left", "Is muddat mein koi entry nahi.")); return; }
    let lastKey = null;
    for (const e of list) {
      const k = dateKey(e.recorded_at);
      if (k !== lastKey) { wrap.append(el("p", "date-head", dateLabel(k))); lastKey = k; }
      wrap.append(entryCard(e, true));
    }
  }

  // ================= SETTINGS =================
  async function renderSettings() {
    $("s-email").textContent = state.session ? state.session.user.email : "";
    $("delete-note").hidden = true;
    $("s-db").textContent = "Database check ho raha hai…";
    const { error } = await supabase.from("profiles").select("start_age").limit(1);
    $("s-db").textContent = error ? "Database se rabta nahi hua: " + error.message : "Database se juda hua ✓";
  }

  $("btn-logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    say("Aap logout ho gaye.");
  });

  let deleteArmed = false;
  $("btn-delete").addEventListener("click", (e) => busy(e.currentTarget, async () => {
    if (!deleteArmed) { deleteArmed = true; $("delete-note").hidden = false; setTimeout(() => { deleteArmed = false; $("delete-note").hidden = true; }, 10000); return; }
    deleteArmed = false;
    const { error } = await supabase.rpc("delete_my_account");
    if (error) return say(friendly(error), "error");
    try { localStorage.removeItem("qaza-setup-" + state.session.user.id); } catch { /* */ }
    await supabase.auth.signOut();
    say("Aapka account aur saara record mita diya gaya.");
  }));

  // ================= NAVIGATION =================
  function go(view) {
    say("");
    if (view === "dashboard") renderDashboard();
    if (view === "add") renderAdd();
    if (view === "history") renderHistory();
    if (view === "settings") renderSettings();
    if (view === "setup") return openSetup();
    show(view);
  }
  document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => go(b.dataset.nav)));
  document.querySelectorAll("[data-go-app]").forEach((b) => b.addEventListener("click", () => go(b.dataset.goApp)));
}
