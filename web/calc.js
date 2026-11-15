// Qaza ka hisaab lagane wale functions (sirf hisaab, koi screen nahi).
// Koi deeni faisla yahan nahi: start age, haiz ke din aur "ada" ki tadaad user khud deta hai.

export const PRAYERS = [
  { id: "fajr", name: "Fajr" },
  { id: "zuhr", name: "Zuhr" },
  { id: "asr", name: "Asr" },
  { id: "maghrib", name: "Maghrib" },
  { id: "isha", name: "Isha" },
  { id: "witr", name: "Witr" },
];
export const ROZA = { id: "roza", name: "Rozay" };
export const ITEMS = [...PRAYERS, ROZA];
export const nameOf = (id) => (ITEMS.find((i) => i.id === id) || { name: id }).name;

const DAY = 86400000;

// "YYYY-MM-DD" ko local date (raat 12 baje) mein badlo
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d;
}

export function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// DOB + start age = ginti shuru hone ki tareekh
export function startDateFrom(dob, startAge) {
  return new Date(dob.getFullYear() + startAge, dob.getMonth(), dob.getDate());
}

// Do tareekhon ke darmiyan din (aaj shamil nahi)
export function daysBetween(a, b) {
  return Math.max(0, Math.round((startOfDay(b) - startOfDay(a)) / DAY));
}

// Islamic (Umm al-Qura) calendar ka mahina. Ramzan = 9.
let hijriFmt = null;
function hijriMonth(d) {
  if (hijriFmt === null) {
    try {
      hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric" });
      if (!hijriFmt.resolvedOptions().calendar.startsWith("islamic")) hijriFmt = false;
    } catch { hijriFmt = false; }
  }
  if (!hijriFmt) return null;
  const part = hijriFmt.formatToParts(d).find((p) => p.type === "month");
  return part ? parseInt(part.value, 10) : null;
}

// start se aaj tak Ramzan ke kitne din aur kitne Ramzan guzre
export function ramadanStats(start, today) {
  let days = 0, count = 0, inRamadan = false;
  const end = startOfDay(today);
  const d = startOfDay(start);
  if (hijriMonth(d) === null) {
    // Islamic calendar na mile to andaza: har 354.37 din mein ~29.5 din
    const total = daysBetween(start, today);
    count = Math.floor(total / 354.37);
    return { days: Math.round(count * 29.5), count, estimated: true };
  }
  while (d < end) {
    const isR = hijriMonth(d) === 9;
    if (isR) { days++; if (!inRamadan) count++; }
    inRamadan = isR;
    d.setDate(d.getDate() + 1);
  }
  return { days, count, estimated: false };
}

// Poora hisaab
// opts: { dob: Date, startAge: number, gender: 'male'|'female', haizDays: number, today?: Date }
export function computeTotals(opts) {
  const today = opts.today || new Date();
  const start = startDateFrom(opts.dob, opts.startAge);
  const days = daysBetween(start, today);
  const female = opts.gender === "female";
  const haizPerMonth = female ? Math.max(0, Math.min(15, opts.haizDays || 0)) : 0;
  const haizTotal = Math.round((days / 30.44) * haizPerMonth);
  const prayerTotal = Math.max(0, days - haizTotal);
  const ram = ramadanStats(start, today);
  const ramadanHaiz = female ? Math.min(ram.days, ram.count * haizPerMonth) : 0;
  return { start, days, haizTotal, prayerTotal, ramadanDays: ram.days, ramadanCount: ram.count, ramadanHaiz, ramadanEstimated: ram.estimated };
}

// Entries (ledger) se har item ka hisaab
// initial = shuru ka balance (initial + us par corrections), remaining = sab deltas ka jor
export function balances(entries, todayKey) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const undone = new Set(entries.filter((e) => e.kind === "undo").map((e) => e.related_entry_id));
  const res = {};
  for (const it of ITEMS) res[it.id] = { initial: 0, remaining: 0, done: 0, today: 0 };
  // "initial" = kul qaza jo zimme aayi: shuru ka hisaab + rozana chhooti (missed) + un par corrections/undo
  const OWED = new Set(["initial", "missed"]);
  for (const e of entries) {
    const r = res[e.item];
    if (!r) continue;
    r.remaining += e.delta;
    const rel = e.related_entry_id ? byId.get(e.related_entry_id) : null;
    const owed = OWED.has(e.kind) || (rel && OWED.has(rel.kind));
    if (owed) r.initial += e.delta;
    else if (todayKey && dateKey(e.recorded_at) === todayKey) r.today += -e.delta;
  }
  for (const it of ITEMS) { const r = res[it.id]; r.done = r.initial - r.remaining; }
  return { items: res, undone };
}

export function dateKey(iso) {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export const fmt = (n) => Number(n || 0).toLocaleString("en-US");
