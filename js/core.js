/* ============================================================
   TripTally — core (pure, DOM-free logic)
   Imported by index.html (as an ES module) and exercised by
   the vitest suite in tests/. No DOM, no globals, no storage.
   ============================================================ */

/* ---------- constants ---------- */
export const CATEGORIES = [
  { key:"food",       label:"Food",       emoji:"🍜", color:"#f59e0b" },
  { key:"transport",  label:"Transport",  emoji:"🚕", color:"#3b82f6" },
  { key:"hotel",      label:"Hotel",      emoji:"🏨", color:"#8b5cf6" },
  { key:"activities", label:"Activities", emoji:"🎟️", color:"#10b981" },
  { key:"shopping",   label:"Shopping",   emoji:"🛍️", color:"#ec4899" },
  { key:"emergency",  label:"Emergency",  emoji:"🚨", color:"#ef4444" },
  { key:"others",     label:"Others",     emoji:"✨", color:"#64748b" },
];
export const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));
export const CURRENCIES = ["USD","EUR","GBP","JPY","SGD","THB","MYR","IDR","VND","INR",
  "AUD","CAD","CNY","KRW","HKD","PHP","TWD","AED","CHF","NZD","ZAR","BRL","MXN","TRY"];

/* ---------- i18n (Phase 7) ---------- */
export const LOCALES = { en: "English", id: "Bahasa Indonesia" };
export const STRINGS = {
  en: {
    tagline:"Your travel spending, sorted",
    nav_home:"Home", nav_expenses:"Expenses", nav_trip:"Trip", nav_share:"Share",
    title_expenses:"Expenses", title_trips:"My trips", title_share:"Share & backup",
    total_spent:"TOTAL SPENT", by_category:"Spending by category", by_day:"Spending by day",
    new_trip:"＋ New trip", search_ph:"🔍 Search item or note…",
    add_expense:"Add expense", save_expense:"Save expense", cancel:"Cancel",
    language:"Language",
    t_added:"Added", t_updated:"Expense updated", t_deleted:"Deleted", t_restored:"Restored"
  },
  id: {
    tagline:"Pengeluaran perjalanan Anda, rapi",
    nav_home:"Beranda", nav_expenses:"Pengeluaran", nav_trip:"Perjalanan", nav_share:"Bagikan",
    title_expenses:"Pengeluaran", title_trips:"Perjalanan saya", title_share:"Bagikan & cadangkan",
    total_spent:"TOTAL DIBELANJAKAN", by_category:"Pengeluaran per kategori", by_day:"Pengeluaran per hari",
    new_trip:"＋ Perjalanan baru", search_ph:"🔍 Cari item atau catatan…",
    add_expense:"Tambah pengeluaran", save_expense:"Simpan", cancel:"Batal",
    language:"Bahasa",
    t_added:"Ditambahkan", t_updated:"Pengeluaran diperbarui", t_deleted:"Dihapus", t_restored:"Dipulihkan"
  }
};
let _locale; // active BCP-47 locale for Intl formatting; undefined → system default
export function setLocale(loc){ _locale = loc || undefined; }
export function t(key, locale){
  const table = STRINGS[locale] || STRINGS[_locale] || STRINGS.en;
  if(table && table[key] != null) return table[key];
  return STRINGS.en[key] != null ? STRINGS.en[key] : key;
}

/* ---------- small helpers ---------- */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

export function esc(s){
  return String(s??"").replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

export function clamp(n,lo,hi){ return Math.max(lo, Math.min(hi, n)); }

export function todayStr(){
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}

export function isValidDate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }

export function fmtMoney(amount, currency){
  const cur = currency || "USD";
  const n = Number(amount) || 0;
  try { return new Intl.NumberFormat(_locale,{ style:"currency", currency:cur, maximumFractionDigits:2 }).format(n); }
  catch { return (Math.round(n*100)/100).toLocaleString() + " " + cur; }
}

export function fmtDate(s){
  if(!isValidDate(s)) return s||"";
  return new Date(s+"T00:00:00").toLocaleDateString(_locale,{weekday:"short",day:"numeric",month:"short"});
}

/* ---------- expense normalization ---------- */
export function normalizeExpense(raw){
  if(!raw || typeof raw!=="object") return null;
  const amount = Number(String(raw.amount).replace(",", "."));
  const item = (raw.item||raw.name||"").toString().trim();
  if(!item || !(amount>0)) return null;
  let date = (raw.date||"").toString().slice(0,10);
  if(!isValidDate(date)) date = todayStr();
  const cat = CAT_MAP[raw.category] ? raw.category : "others";
  const currency = (raw.currency||"USD").toString().toUpperCase().slice(0,6) || "USD";
  const out = {
    id: raw.id || uid(),
    item, amount: Math.round(amount*100)/100, currency, category:cat, date,
    note: (raw.note||"").toString().trim(),
    createdAt: Number(raw.createdAt) || Date.now()
  };
  // optional geotag
  const lat = Number(raw.lat), lng = Number(raw.lng);
  if(isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180){ out.lat = lat; out.lng = lng; }
  const place = (raw.place||"").toString().trim().slice(0,80);
  if(place) out.place = place;
  // optional photo (binary lives in IndexedDB; only the id rides in state)
  if(raw.photoId) out.photoId = String(raw.photoId).slice(0,60);
  return out;
}

// Link that opens a coordinate in OpenStreetMap (and most native map apps).
export function geoMapUrl(lat, lng){
  if(!isFinite(Number(lat)) || !isFinite(Number(lng))) return "";
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

/* ---------- stats ---------- */
export function daysForAverage(trip, expenses){
  const { startDate, endDate } = trip;
  // Primary: the whole length of the trip — first day through last day, inclusive.
  if(isValidDate(startDate) && isValidDate(endDate)){
    const start = new Date(startDate+"T00:00:00");
    const end   = new Date(endDate+"T00:00:00");
    if(end >= start) return Math.floor((end - start)/86400000) + 1;
  }
  // Fallback (no trip dates yet): the span the recorded expenses cover.
  const times = expenses
    .filter(e => e.currency===trip.currency && isValidDate(e.date))
    .map(e => new Date(e.date+"T00:00:00").getTime());
  if(times.length){
    return Math.max(1, Math.floor((Math.max(...times) - Math.min(...times))/86400000) + 1);
  }
  return 1;
}

// Convert `amount` of currency `from` into the trip's base currency.
// Returns { value, converted }. converted is true ONLY when an actual
// foreign→base conversion was applied via a stored rate.
export function convert(amount, from, trip){
  const base = trip.currency;
  if(from === base) return { value: amount, converted: false };
  const rate = trip.rates && trip.rates[from];
  if(typeof rate === "number" && rate > 0) return { value: amount * rate, converted: true };
  return { value: amount, converted: false }; // no rate: caller treats as unconvertible
}

export function computeStats(trip, expenses){
  const base = trip.currency;
  const byCur = {}, byCat = {}, byDay = {};
  let baseTotal = 0;
  let approx = false;
  const unconverted = new Set();
  for(const e of expenses){
    byCur[e.currency] = (byCur[e.currency]||0) + e.amount;
    let contribution = null;
    if(e.currency === base){
      contribution = e.amount;
    } else {
      const r = convert(e.amount, e.currency, trip);
      if(r.converted){ contribution = r.value; approx = true; }
      else { unconverted.add(e.currency); }
    }
    if(contribution != null){
      baseTotal += contribution;
      byCat[e.category] = (byCat[e.category]||0) + contribution;
      byDay[e.date] = (byDay[e.date]||0) + contribution;
    }
  }
  const catBudgets = trip.budgets || {};
  const cats = CATEGORIES
    .filter(c => byCat[c.key])
    .map(c => {
      const amount = byCat[c.key];
      const o = { ...c, amount, pct: baseTotal ? amount/baseTotal*100 : 0 };
      const cb = catBudgets[c.key];
      if(typeof cb === "number" && cb > 0){
        o.catBudget = cb;
        o.catPct = amount/cb*100;
        o.catLevel = amount > cb ? "over" : (amount >= cb*0.8 ? "warn" : "ok");
      }
      return o;
    })
    .sort((a,b)=> b.amount - a.amount);
  const days = Object.keys(byDay).sort().map(d => ({ date:d, amount:byDay[d] }));
  const maxDay = days.reduce((m,d)=>Math.max(m,d.amount), 0);
  // other[] keeps only currencies with no rate set (still excluded from totals)
  const other = [...unconverted].map(c => ({ currency:c, amount:byCur[c] }));

  const budget = (typeof trip.budget==="number" && trip.budget>0) ? trip.budget : null;
  const remaining = budget!=null ? budget - baseTotal : null;
  const pctOfBudget = budget!=null ? baseTotal/budget*100 : null;
  const dAvg = daysForAverage(trip, expenses);

  return {
    baseTotal, count: expenses.length, cats, days, maxDay, other, approx,
    budget, remaining, pctOfBudget, overBudget: budget!=null && baseTotal>budget,
    dailyAvg: baseTotal/dAvg, daysCount:dAvg, base
  };
}

/* ---------- daily pace / projection (Phase 5) ----------
   Returns null unless the trip has start+end dates, a budget, and `today`
   falls within the trip. `today` is injected ("YYYY-MM-DD") for testability. */
export function computePace(trip, stats, today){
  if(!isValidDate(trip.startDate) || !isValidDate(trip.endDate)) return null;
  if(stats.budget == null) return null;
  if(!isValidDate(today)) return null;
  const start = new Date(trip.startDate+"T00:00:00");
  const end   = new Date(trip.endDate+"T00:00:00");
  const now   = new Date(today+"T00:00:00");
  if(end < start) return null;
  if(now < start || now > end) return null; // only mid-trip

  const totalDays = Math.floor((end - start)/86400000) + 1;
  const dayOfTrip = Math.floor((now - start)/86400000) + 1; // 1-based, inclusive
  const dailyAllowance = stats.budget / totalDays;
  const allowanceToDate = dailyAllowance * dayOfTrip;
  const spent = stats.baseTotal;
  const avgPerDay = spent / dayOfTrip;
  const projectedTotal = avgPerDay * totalDays;
  const level = projectedTotal > stats.budget * 1.1 ? "over"
              : projectedTotal > stats.budget ? "warn" : "ok";
  return {
    totalDays, dayOfTrip, dailyAllowance, allowanceToDate,
    spent, avgPerDay, projectedTotal, budget: stats.budget,
    onTrack: spent <= allowanceToDate, level
  };
}

/* ---------- summary text ---------- */
export function buildSummaryText(trip, stats, fmt, pace){
  const t = trip, s = stats;
  const money = fmt || fmtMoney;
  const L = [];
  L.push("🧳 " + (t.name || "My Trip"));
  if(t.destination) L.push("📍 " + t.destination);
  if(isValidDate(t.startDate) || isValidDate(t.endDate))
    L.push("🗓️ " + (isValidDate(t.startDate)?fmtDate(t.startDate):"?") + " → " + (isValidDate(t.endDate)?fmtDate(t.endDate):"?"));
  L.push("");
  const approx = s.approx ? "≈ " : "";
  L.push("💰 Total spent: " + approx + money(s.baseTotal, s.base));
  if(s.budget!=null){
    L.push("🎯 Budget: " + money(s.budget, s.base));
    L.push((s.overBudget?"🔴 Over by ":"🟢 Remaining: ") + money(Math.abs(s.remaining), s.base) + "  (" + Math.round(s.pctOfBudget) + "% used)");
  }
  L.push("🧾 Expenses: " + s.count);
  L.push("📅 Daily average: " + approx + money(s.dailyAvg, s.base) + " over " + s.daysCount + " day" + (s.daysCount===1?"":"s"));
  if(pace){
    L.push("");
    L.push("⏱️ Day " + pace.dayOfTrip + " of " + pace.totalDays);
    L.push((pace.onTrack?"🟢 ":"⚠️ ") + "Spent " + money(pace.spent, s.base) + " vs " + money(pace.allowanceToDate, s.base) + " budgeted so far");
    const icon = pace.level==="over" ? "🔴" : (pace.level==="warn" ? "⚠️" : "🟢");
    L.push(icon + " Projected total: " + approx + money(pace.projectedTotal, s.base) + " of " + money(pace.budget, s.base));
  }
  if(s.cats.length){
    L.push("");
    L.push("BY CATEGORY");
    for(const c of s.cats) L.push(c.emoji + " " + c.label + ": " + money(c.amount, s.base) + " (" + Math.round(c.pct) + "%)");
  }
  if(s.days.length){
    L.push("");
    L.push("BY DAY");
    for(const d of s.days) L.push("• " + fmtDate(d.date) + ": " + money(d.amount, s.base));
  }
  if(s.other.length){
    L.push("");
    L.push("Other currencies (not converted): " + s.other.map(o=>money(o.amount,o.currency)).join(", "));
  }
  L.push("");
  L.push("— Tracked with TripTally · data stays on device");
  return L.join("\n");
}

/* ---------- import merge / dedupe ---------- */
// Merge incoming (raw) expenses into existing (normalized) ones.
// Skips duplicate ids AND duplicate item|amount|currency|category|date signatures.
export function mergeExpenses(existing, incoming){
  const sig = e => [String(e.item).trim().toLowerCase(), e.amount, e.currency, e.category, e.date].join("|");
  const merged = existing.slice();
  const ids = new Set(existing.map(e=>e.id));
  const sigs = new Set(existing.map(sig));
  let added=0, skipped=0;
  for(const raw of (Array.isArray(incoming)?incoming:[])){
    const e = normalizeExpense(raw);
    if(!e){ skipped++; continue; }
    if(ids.has(e.id) || sigs.has(sig(e))){ skipped++; continue; }
    merged.push(e); ids.add(e.id); sigs.add(sig(e)); added++;
  }
  return { merged, added, skipped };
}

/* ============================================================
   MULTI-TRIP (schema v2) — Phase 3
   v2 shape: { version:2, activeTripId, trips:[trip], settings }
   trip:    { id, name, destination, startDate, endDate, budget,
              currency, archived, createdAt, expenses:[] }
   ============================================================ */
export const DEFAULT_SETTINGS = {
  theme:"auto", locale:"", sort:"date-desc", filter:"all", lastCategory:"food", lastDate:""
};

// Keep only positive-number rates, keyed by an uppercased currency code.
export function sanitizeRates(r){
  const out = {};
  if(r && typeof r === "object"){
    for(const k of Object.keys(r)){
      const v = Number(r[k]);
      if(v > 0 && isFinite(v)) out[k.toString().toUpperCase().slice(0,6)] = v;
    }
  }
  return out;
}

// Keep only positive per-category budgets keyed by a known category.
export function sanitizeBudgets(b){
  const out = {};
  if(b && typeof b === "object"){
    for(const k of Object.keys(b)){
      const v = Number(b[k]);
      if(v > 0 && isFinite(v) && CAT_MAP[k]) out[k] = v;
    }
  }
  return out;
}

export function newTrip(over = {}){
  const o = over || {};
  return {
    id: o.id || uid(),
    name: (o.name||"").toString().slice(0,60),
    destination: (o.destination||"").toString().slice(0,60),
    startDate: isValidDate(o.startDate) ? o.startDate : "",
    endDate: isValidDate(o.endDate) ? o.endDate : "",
    budget: (typeof o.budget==="number" && o.budget>0) ? o.budget : null,
    budgets: sanitizeBudgets(o.budgets),
    currency: (o.currency||"USD").toString().toUpperCase().slice(0,6) || "USD",
    rates: sanitizeRates(o.rates),
    ratesUpdatedAt: Number(o.ratesUpdatedAt) || null,
    archived: !!o.archived,
    createdAt: Number(o.createdAt) || Date.now(),
    expenses: Array.isArray(o.expenses) ? o.expenses.map(normalizeExpense).filter(Boolean) : []
  };
}

export function defaultStateV2(){
  const t = newTrip();
  return { version:2, activeTripId:t.id, trips:[t], settings:{ ...DEFAULT_SETTINGS } };
}

// Wrap a v1 blob ({version:1, trip, expenses, settings}) as a single v2 trip.
// Handles v1 present, v1 absent/null, and v1 corrupted (non-object) → fresh v2.
export function migrateV1toV2(v1){
  if(!v1 || typeof v1!=="object" || Array.isArray(v1)) return defaultStateV2();
  const t = newTrip({ ...(v1.trip||{}), expenses: v1.expenses });
  return {
    version:2,
    activeTripId: t.id,
    trips:[t],
    settings:{ ...DEFAULT_SETTINGS, ...(v1.settings||{}) }
  };
}

/* ============================================================
   ENTRY & LIST POWER FEATURES — Phase 6
   ============================================================ */

// RFC-4180 CSV with a UTF-8 BOM so Excel reads accents correctly.
export function toCSV(expenses){
  const headers = ["date","item","category","amount","currency","note"];
  const cell = v => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = (Array.isArray(expenses) ? expenses : []).map(e =>
    [e.date, e.item, e.category, e.amount, e.currency, e.note || ""].map(cell).join(","));
  return "﻿" + [headers.join(","), ...rows].join("\r\n");
}

// Build the sheet data for an .xlsx export (pure; js/xlsx.js turns it into a file).
// Returns [{ name, rows: [[cell, ...]] }] where cells are strings/numbers.
export function workbookSheets(trip, stats){
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const catLabel = k => (CAT_MAP[k] || {}).label || k;

  const summary = [
    ["TripTally export"],
    ["Trip", trip.name || "My Trip"],
    ["Destination", trip.destination || ""],
    ["Dates", (trip.startDate || "?") + " to " + (trip.endDate || "?")],
    ["Currency", trip.currency],
    ["Budget", typeof trip.budget === "number" ? trip.budget : ""],
    ["Total spent" + (stats.approx ? " (approx)" : ""), r2(stats.baseTotal)],
    ["Expenses", stats.count],
    [],
    ["Category", "Amount", "% of total"]
  ];
  for(const c of stats.cats) summary.push([c.label, r2(c.amount), Math.round(c.pct)]);

  const expenses = [["Date", "Item", "Category", "Amount", "Currency", "Note", "Place", "Photo", "Lat", "Lng"]];
  for(const e of trip.expenses){
    expenses.push([
      e.date, e.item, catLabel(e.category), r2(e.amount), e.currency,
      e.note || "", e.place || "", e.photoId ? "yes" : "",
      (e.lat != null ? e.lat : ""), (e.lng != null ? e.lng : "")
    ]);
  }

  const byCat = [["Category", "Amount", "% of total", "Budget", "Status"]];
  for(const c of stats.cats) byCat.push([c.label, r2(c.amount), Math.round(c.pct), c.catBudget != null ? c.catBudget : "", c.catLevel || ""]);

  const byDay = [["Date", "Amount"]];
  for(const d of stats.days) byDay.push([d.date, r2(d.amount)]);

  return [
    { name: "Summary", rows: summary },
    { name: "Expenses", rows: expenses },
    { name: "By category", rows: byCat },
    { name: "By day", rows: byDay }
  ];
}

// Safe arithmetic for the amount field ("12+8.5", "2*3"). NO eval:
// a tiny recursive-descent parser over + - * / and parentheses.
// Returns a number rounded to 2dp, or null if the input isn't valid.
export function parseAmount(input){
  if(typeof input === "number") return isFinite(input) ? Math.round(input*100)/100 : null;
  let s = String(input == null ? "" : input).replace(/,/g, ".").trim();
  if(!s) return null;
  if(!/^[0-9+\-*/.()\s]+$/.test(s)) return null; // reject letters and anything unexpected
  let i = 0;
  const cur = () => s[i];
  const ws = () => { while(i < s.length && s[i] === " ") i++; };
  function factor(){
    ws();
    let sign = 1;
    while(cur() === "+" || cur() === "-"){ if(s[i] === "-") sign = -sign; i++; ws(); }
    if(cur() === "("){
      i++;
      const v = expr();
      ws();
      if(cur() !== ")") return null;
      i++;
      return v == null ? null : sign * v;
    }
    let num = "";
    while(i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
    if(num === "" || isNaN(Number(num))) return null;
    return sign * Number(num);
  }
  function term(){
    let v = factor();
    if(v == null) return null;
    ws();
    while(cur() === "*" || cur() === "/"){
      const op = s[i++];
      const f = factor();
      if(f == null) return null;
      if(op === "/" && f === 0) return null;
      v = op === "*" ? v * f : v / f;
      ws();
    }
    return v;
  }
  function expr(){
    let v = term();
    if(v == null) return null;
    ws();
    while(cur() === "+" || cur() === "-"){
      const op = s[i++];
      const t = term();
      if(t == null) return null;
      v = op === "+" ? v + t : v - t;
      ws();
    }
    return v;
  }
  const result = expr();
  ws();
  if(i < s.length) return null;            // trailing junk
  if(result == null || !isFinite(result)) return null;
  return Math.round(result * 100) / 100;
}

/* ============================================================
   DEVICE-TO-DEVICE TRANSFER — Phase 8
   Split a (compressed, base64) payload into labelled chunks small
   enough for QR / copy-paste, and reassemble them on the other side.
   ============================================================ */
export function chunkPayload(str, maxLen = 1800){
  const s = String(str ?? "");
  const size = Math.max(1, maxLen | 0);
  const total = Math.max(1, Math.ceil(s.length / size));
  const parts = [];
  for(let i = 0; i < total; i++){
    parts.push(`TT${i + 1}/${total}:` + s.slice(i * size, (i + 1) * size));
  }
  return parts;
}
export function reassemble(parts){
  if(!Array.isArray(parts) || !parts.length) return null;
  const map = new Map();
  let total = null;
  for(const p of parts){
    const m = /^TT(\d+)\/(\d+):([\s\S]*)$/.exec(String(p).trim());
    if(!m) return null;
    const idx = +m[1], tot = +m[2];
    if(total == null) total = tot;
    if(tot !== total) return null;
    map.set(idx, m[3]);
  }
  if(map.size !== total) return null;
  let out = "";
  for(let i = 1; i <= total; i++){
    if(!map.has(i)) return null;
    out += map.get(i);
  }
  return out;
}

// Merge incoming v2 trips into existing ones: match by id (merge expenses via
// mergeExpenses + dedupe), otherwise add as a new normalized trip.
export function mergeTrips(existingTrips, incomingTrips){
  const trips = (existingTrips||[]).map(t => ({ ...t, expenses: (t.expenses||[]).slice() }));
  const byId = new Map(trips.map(t => [t.id, t]));
  let addedTrips=0, addedExpenses=0, skippedExpenses=0;
  for(const raw of (Array.isArray(incomingTrips)?incomingTrips:[])){
    if(!raw || typeof raw!=="object") continue;
    const existing = raw.id!=null ? byId.get(raw.id) : null;
    if(existing){
      const r = mergeExpenses(existing.expenses, raw.expenses||[]);
      existing.expenses = r.merged;
      addedExpenses += r.added; skippedExpenses += r.skipped;
    } else {
      const t = newTrip(raw);
      trips.push(t); byId.set(t.id, t);
      addedTrips++; addedExpenses += t.expenses.length;
    }
  }
  return { trips, addedTrips, addedExpenses, skippedExpenses };
}
