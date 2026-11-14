// Qaza Namaz Tracker - Web
// Qadam 1: Register, Login, Password bhool gaye, Naya password, Logout.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const configured = !SUPABASE_URL.startsWith("PASTE_") && !SUPABASE_ANON_KEY.startsWith("PASTE_");
const views = ["loading", "login", "register", "forgot", "reset", "home"];
const $ = (id) => document.getElementById(id);

// Login ke baad wapas isi page par aana hai (email links bhi yahin aate hain)
const SITE_URL = window.location.origin + window.location.pathname;

function show(view) {
  for (const v of views) $("view-" + v).hidden = v !== view;
}

function say(text, type = "info") {
  const box = $("message");
  if (!text) { box.hidden = true; box.textContent = ""; return; }
  box.textContent = text;
  box.className = "notice" + (type === "error" ? " error" : "");
  box.hidden = false;
}

// Supabase ke English errors ko Roman Urdu mein
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

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

async function busy(form, fn) {
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}

// Navigation buttons (data-go="login" waghera)
document.querySelectorAll("[data-go]").forEach((b) =>
  b.addEventListener("click", () => { say(""); show(b.dataset.go); })
);

if (!configured) {
  $("config-warning").hidden = false;
  show("login");
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let recovering = false;

  async function showHome(session) {
    $("home-email").textContent = session.user.email;
    show("home");
    $("db-status").textContent = "Database check ho raha hai…";
    const { data, error } = await supabase
      .from("profiles").select("start_age").eq("id", session.user.id).maybeSingle();
    $("db-status").textContent = error
      ? "Database se rabta nahi hua: " + error.message
      : data ? "Database se juda hua ✓" : "Database juda hua hai, lekin profile nahi mili.";
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recovering = true;
      say("");
      show("reset");
      return;
    }
    if (recovering) return;
    if (event === "SIGNED_OUT" || !session) { show("login"); return; }
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      // Auth callback ke andar seedha query na karein (Supabase ki hidayat)
      setTimeout(() => showHome(session), 0);
    }
  });

  // Login
  $("form-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    const password = f.password.value;
    if (!validEmail(email)) return say("Sahih email likhein.", "error");
    if (!password) return say("Password likhein.", "error");
    busy(f, async () => {
      say("");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) say(friendly(error), "error");
      else f.reset();
    });
  });

  // Register
  $("form-register").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    const p1 = f.password.value;
    const p2 = f.password2.value;
    if (!validEmail(email)) return say("Sahih email likhein.", "error");
    if (p1.length < 8) return say("Password kam az kam 8 huroof ka hona chahiye.", "error");
    if (p1 !== p2) return say("Dono password ek jaise nahi hain.", "error");
    busy(f, async () => {
      say("");
      const { data, error } = await supabase.auth.signUp({
        email, password: p1, options: { emailRedirectTo: SITE_URL },
      });
      if (error) return say(friendly(error), "error");
      f.reset();
      if (!data.session) {
        show("login");
        say("Account ban gaya! Apni email mein aaya confirm link kholein, phir login karein.");
      }
    });
  });

  // Password bhool gaye
  $("form-forgot").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    if (!validEmail(email)) return say("Sahih email likhein.", "error");
    busy(f, async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
      if (error) return say(friendly(error), "error");
      f.reset();
      show("login");
      say("Agar is email ka account hai to password badalne ka link bhej diya gaya hai. Email check karein.");
    });
  });

  // Naya password
  $("form-reset").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const p1 = f.password.value;
    const p2 = f.password2.value;
    if (p1.length < 8) return say("Password kam az kam 8 huroof ka hona chahiye.", "error");
    if (p1 !== p2) return say("Dono password ek jaise nahi hain.", "error");
    busy(f, async () => {
      const { data, error } = await supabase.auth.updateUser({ password: p1 });
      if (error) return say(friendly(error), "error");
      f.reset();
      recovering = false;
      say("Password badal gaya ✓");
      const { data: s } = await supabase.auth.getSession();
      if (s.session) showHome(s.session); else show("login");
    });
  });

  // Logout
  $("btn-logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    say("Aap logout ho gaye.");
  });
}
