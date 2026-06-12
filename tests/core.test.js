import { describe, it, expect } from "vitest";
import {
  normalizeExpense,
  computeStats,
  daysForAverage,
  mergeExpenses,
  buildSummaryText,
  isValidDate,
  fmtMoney,
  clamp,
  esc,
  newTrip,
  defaultStateV2,
  migrateV1toV2,
  mergeTrips,
  convert,
  sanitizeRates,
  computePace,
  sanitizeBudgets,
  toCSV,
  parseAmount,
  t,
  setLocale,
  LOCALES,
  chunkPayload,
  reassemble
} from "../js/core.js";

const todayStr = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

// deterministic money formatter for summary assertions
const fmt = (n, c) => `${c} ${Number(n).toFixed(2)}`;
const trip = (over = {}) => ({
  name: "", destination: "", startDate: "", endDate: "",
  budget: null, currency: "USD", ...over
});

describe("normalizeExpense", () => {
  it("parses comma decimals: '12,50' -> 12.5", () => {
    expect(normalizeExpense({ item: "x", amount: "12,50" }).amount).toBe(12.5);
  });
  it("rounds to 2 decimal places", () => {
    expect(normalizeExpense({ item: "x", amount: 10.005 }).amount).toBe(10.01);
    expect(normalizeExpense({ item: "x", amount: 1.239 }).amount).toBe(1.24);
  });
  it("defaults a missing/invalid date to today", () => {
    expect(normalizeExpense({ item: "x", amount: 5 }).date).toBe(todayStr());
    expect(normalizeExpense({ item: "x", amount: 5, date: "nope" }).date).toBe(todayStr());
  });
  it("keeps a valid date", () => {
    expect(normalizeExpense({ item: "x", amount: 5, date: "2026-03-17" }).date).toBe("2026-03-17");
  });
  it("maps an unknown category to 'others'", () => {
    expect(normalizeExpense({ item: "x", amount: 5, category: "spaceship" }).category).toBe("others");
    expect(normalizeExpense({ item: "x", amount: 5, category: "food" }).category).toBe("food");
  });
  it("rejects amount <= 0, NaN, or empty item", () => {
    expect(normalizeExpense({ item: "x", amount: 0 })).toBeNull();
    expect(normalizeExpense({ item: "x", amount: -3 })).toBeNull();
    expect(normalizeExpense({ item: "x", amount: "abc" })).toBeNull();
    expect(normalizeExpense({ item: "   ", amount: 5 })).toBeNull();
    expect(normalizeExpense(null)).toBeNull();
    expect(normalizeExpense("string")).toBeNull();
  });
  it("uppercases + truncates currency and accepts a 'name' alias for item", () => {
    const e = normalizeExpense({ name: "Lunch", amount: 5, currency: "thb" });
    expect(e.item).toBe("Lunch");
    expect(e.currency).toBe("THB");
  });
  it("generates an id and createdAt when absent", () => {
    const e = normalizeExpense({ item: "x", amount: 5 });
    expect(typeof e.id).toBe("string");
    expect(e.id.length).toBeGreaterThan(0);
    expect(typeof e.createdAt).toBe("number");
  });
});

describe("computeStats", () => {
  const expenses = [
    { id: "a", item: "Lunch", amount: 10, currency: "USD", category: "food", date: "2026-03-01" },
    { id: "b", item: "Taxi", amount: 5, currency: "USD", category: "transport", date: "2026-03-01" },
    { id: "c", item: "Snack", amount: 4, currency: "USD", category: "food", date: "2026-03-02" },
    { id: "d", item: "Market", amount: 350, currency: "THB", category: "shopping", date: "2026-03-02" }
  ];

  it("only counts trip-currency expenses toward baseTotal/categories/days", () => {
    const s = computeStats(trip({ currency: "USD" }), expenses);
    expect(s.baseTotal).toBe(19); // 10 + 5 + 4, THB excluded
    expect(s.count).toBe(4); // count is all expenses
    const food = s.cats.find(c => c.key === "food");
    expect(food.amount).toBe(14);
    expect(s.days.length).toBe(2);
  });
  it("collects non-base currencies in other[]", () => {
    const s = computeStats(trip({ currency: "USD" }), expenses);
    expect(s.other).toEqual([{ currency: "THB", amount: 350 }]);
  });
  it("sorts categories by amount desc and computes pct", () => {
    const s = computeStats(trip({ currency: "USD" }), expenses);
    expect(s.cats[0].key).toBe("food");
    expect(Math.round(s.cats[0].pct)).toBe(74); // 14/19
  });
  it("computes budget remaining / pct / overBudget", () => {
    const under = computeStats(trip({ currency: "USD", budget: 100 }), expenses);
    expect(under.remaining).toBe(81);
    expect(Math.round(under.pctOfBudget)).toBe(19);
    expect(under.overBudget).toBe(false);

    const over = computeStats(trip({ currency: "USD", budget: 10 }), expenses);
    expect(over.overBudget).toBe(true);
    expect(over.remaining).toBe(-9);
  });
  it("treats budget of 0 / negative as no budget", () => {
    const s = computeStats(trip({ currency: "USD", budget: 0 }), expenses);
    expect(s.budget).toBeNull();
    expect(s.remaining).toBeNull();
  });
  it("handles an empty expense list", () => {
    const s = computeStats(trip(), []);
    expect(s.baseTotal).toBe(0);
    expect(s.cats).toEqual([]);
    expect(s.count).toBe(0);
  });
});

describe("daysForAverage", () => {
  it("returns inclusive trip length when dates are set", () => {
    expect(daysForAverage(trip({ startDate: "2026-03-01", endDate: "2026-03-05" }), [])).toBe(5);
    expect(daysForAverage(trip({ startDate: "2026-03-01", endDate: "2026-03-01" }), [])).toBe(1);
  });
  it("falls back to the expense span when no dates", () => {
    const exp = [
      { amount: 1, currency: "USD", date: "2026-03-01" },
      { amount: 1, currency: "USD", date: "2026-03-04" }
    ];
    expect(daysForAverage(trip({ currency: "USD" }), exp)).toBe(4);
  });
  it("ignores non-base-currency expenses in the fallback span", () => {
    const exp = [
      { amount: 1, currency: "USD", date: "2026-03-01" },
      { amount: 1, currency: "THB", date: "2026-03-20" }
    ];
    expect(daysForAverage(trip({ currency: "USD" }), exp)).toBe(1);
  });
  it("returns at least 1 with no dates and no expenses", () => {
    expect(daysForAverage(trip(), [])).toBe(1);
  });
  it("ignores a reversed date range (end before start) and falls back", () => {
    expect(daysForAverage(trip({ startDate: "2026-03-10", endDate: "2026-03-01" }), [])).toBe(1);
  });
});

describe("mergeExpenses", () => {
  const existing = [
    normalizeExpense({ id: "1", item: "Lunch", amount: 10, currency: "USD", category: "food", date: "2026-03-01" })
  ];
  it("adds genuinely new expenses", () => {
    const r = mergeExpenses(existing, [{ id: "2", item: "Taxi", amount: 5, currency: "USD", category: "transport", date: "2026-03-01" }]);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.merged.length).toBe(2);
  });
  it("skips a duplicate id", () => {
    const r = mergeExpenses(existing, [{ id: "1", item: "Different", amount: 99, currency: "USD", category: "food", date: "2026-03-09" }]);
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(1);
  });
  it("skips a duplicate signature even with a new id", () => {
    const r = mergeExpenses(existing, [{ id: "zzz", item: "lunch", amount: 10, currency: "USD", category: "food", date: "2026-03-01" }]);
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(1);
  });
  it("counts invalid rows as skipped", () => {
    const r = mergeExpenses(existing, [{ item: "", amount: 0 }, { item: "ok", amount: 3 }]);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
  });
  it("does not mutate the existing array", () => {
    const before = existing.length;
    mergeExpenses(existing, [{ item: "New", amount: 1 }]);
    expect(existing.length).toBe(before);
  });
  it("tolerates non-array incoming", () => {
    const r = mergeExpenses(existing, null);
    expect(r.added).toBe(0);
    expect(r.merged.length).toBe(existing.length);
  });
});

describe("buildSummaryText", () => {
  const expenses = [
    { id: "a", item: "Lunch", amount: 10, currency: "USD", category: "food", date: "2026-03-01" }
  ];
  it("omits the budget line when no budget is set", () => {
    const s = computeStats(trip({ currency: "USD" }), expenses);
    const txt = buildSummaryText(trip({ currency: "USD" }), s, fmt);
    expect(txt).not.toContain("🎯 Budget");
  });
  it("includes the budget line when a budget is set", () => {
    const t = trip({ currency: "USD", budget: 100 });
    const s = computeStats(t, expenses);
    const txt = buildSummaryText(t, s, fmt);
    expect(txt).toContain("🎯 Budget");
    expect(txt).toContain("🟢 Remaining");
  });
  it("shows the 🔴 over-budget marker when over", () => {
    const t = trip({ currency: "USD", budget: 5 });
    const s = computeStats(t, expenses);
    const txt = buildSummaryText(t, s, fmt);
    expect(txt).toContain("🔴 Over by");
  });
  it("lists other currencies as not converted", () => {
    const t = trip({ currency: "USD" });
    const mixed = [...expenses, { id: "x", item: "Market", amount: 350, currency: "THB", category: "shopping", date: "2026-03-02" }];
    const s = computeStats(t, mixed);
    const txt = buildSummaryText(t, s, fmt);
    expect(txt).toContain("Other currencies (not converted)");
  });
  it("falls back to the real fmtMoney when no fmt passed", () => {
    const t = trip({ currency: "USD" });
    const s = computeStats(t, expenses);
    expect(() => buildSummaryText(t, s)).not.toThrow();
  });
});

describe("newTrip", () => {
  it("fills defaults and normalizes expenses", () => {
    const t = newTrip();
    expect(t.archived).toBe(false);
    expect(t.currency).toBe("USD");
    expect(t.budget).toBeNull();
    expect(Array.isArray(t.expenses)).toBe(true);
  });
  it("coerces fields and drops invalid expenses", () => {
    const t = newTrip({
      name: "Bali", currency: "idr", startDate: "bad", budget: -5,
      expenses: [{ item: "x", amount: 5 }, { item: "", amount: 0 }]
    });
    expect(t.name).toBe("Bali");
    expect(t.currency).toBe("IDR");
    expect(t.startDate).toBe("");
    expect(t.budget).toBeNull();
    expect(t.expenses.length).toBe(1);
  });
});

describe("migrateV1toV2", () => {
  it("wraps a present v1 trip + expenses as the single active trip", () => {
    const v1 = {
      version: 1,
      trip: { name: "Japan", currency: "JPY", budget: 1000 },
      expenses: [{ id: "e1", item: "Ramen", amount: 800, currency: "JPY", category: "food", date: "2026-03-01" }],
      settings: { theme: "dark", sort: "amount-desc" }
    };
    const v2 = migrateV1toV2(v1);
    expect(v2.version).toBe(2);
    expect(v2.trips.length).toBe(1);
    expect(v2.activeTripId).toBe(v2.trips[0].id);
    expect(v2.trips[0].name).toBe("Japan");
    expect(v2.trips[0].expenses.length).toBe(1);
    expect(v2.settings.theme).toBe("dark");
    expect(v2.settings.sort).toBe("amount-desc");
  });
  it("returns a fresh v2 when v1 is absent (null)", () => {
    const v2 = migrateV1toV2(null);
    expect(v2.version).toBe(2);
    expect(v2.trips.length).toBe(1);
    expect(v2.trips[0].expenses.length).toBe(0);
    expect(v2.activeTripId).toBe(v2.trips[0].id);
  });
  it("returns a fresh v2 when v1 is corrupted (non-object / array)", () => {
    expect(migrateV1toV2("garbage").version).toBe(2);
    expect(migrateV1toV2(["a"]).trips.length).toBe(1);
    expect(migrateV1toV2(42).trips[0].expenses.length).toBe(0);
  });
  it("tolerates a v1 with missing trip/expenses", () => {
    const v2 = migrateV1toV2({ version: 1 });
    expect(v2.trips.length).toBe(1);
    expect(v2.trips[0].name).toBe("");
    expect(v2.trips[0].expenses).toEqual([]);
  });
});

describe("defaultStateV2", () => {
  it("has one active empty trip and default settings", () => {
    const s = defaultStateV2();
    expect(s.version).toBe(2);
    expect(s.trips.length).toBe(1);
    expect(s.activeTripId).toBe(s.trips[0].id);
    expect(s.settings.theme).toBe("light");
  });
});

describe("mergeTrips (v2 import)", () => {
  const base = [
    newTrip({ id: "t1", name: "Thailand", currency: "THB",
      expenses: [{ id: "x1", item: "Pad Thai", amount: 60, currency: "THB", category: "food", date: "2026-03-01" }] })
  ];
  it("adds a brand-new trip", () => {
    const r = mergeTrips(base, [{ id: "t2", name: "Vietnam", currency: "VND",
      expenses: [{ id: "y1", item: "Pho", amount: 50000, currency: "VND", category: "food", date: "2026-03-05" }] }]);
    expect(r.addedTrips).toBe(1);
    expect(r.trips.length).toBe(2);
    expect(r.addedExpenses).toBe(1);
  });
  it("merges expenses into an existing trip by id, deduping", () => {
    const r = mergeTrips(base, [{ id: "t1", name: "Thailand",
      expenses: [
        { id: "x1", item: "Pad Thai", amount: 60, currency: "THB", category: "food", date: "2026-03-01" }, // dup id
        { id: "x2", item: "Taxi", amount: 120, currency: "THB", category: "transport", date: "2026-03-02" } // new
      ] }]);
    expect(r.addedTrips).toBe(0);
    expect(r.addedExpenses).toBe(1);
    expect(r.skippedExpenses).toBe(1);
    expect(r.trips[0].expenses.length).toBe(2);
  });
  it("does not mutate the input trips", () => {
    const before = base[0].expenses.length;
    mergeTrips(base, [{ id: "t1", expenses: [{ id: "z9", item: "New", amount: 9, currency: "THB", category: "food", date: "2026-03-09" }] }]);
    expect(base[0].expenses.length).toBe(before);
  });
  it("tolerates non-array / junk incoming", () => {
    expect(mergeTrips(base, null).trips.length).toBe(1);
    expect(mergeTrips(base, [null, 5]).addedTrips).toBe(0);
  });
});

describe("convert (Phase 4)", () => {
  it("base currency: value=amount, converted=false", () => {
    expect(convert(10, "USD", trip({ rates:{} }))).toEqual({ value: 10, converted: false });
  });
  it("foreign with rate multiplies and flags converted", () => {
    expect(convert(350, "THB", trip({ currency:"USD", rates:{ THB:0.03 } }))).toEqual({ value: 10.5, converted: true });
  });
  it("foreign without rate is not converted", () => {
    expect(convert(350, "THB", trip({ currency:"USD", rates:{} })).converted).toBe(false);
  });
  it("ignores zero/negative rate", () => {
    expect(convert(100, "THB", trip({ rates:{ THB:0 } })).converted).toBe(false);
    expect(convert(100, "THB", trip({ rates:{ THB:-1 } })).converted).toBe(false);
  });
});

describe("computeStats with conversion (Phase 4)", () => {
  const expenses = [
    { id:"a", item:"Lunch", amount:10, currency:"USD", category:"food", date:"2026-03-01" },
    { id:"b", item:"Market", amount:350, currency:"THB", category:"shopping", date:"2026-03-01" },
    { id:"c", item:"Pho", amount:50000, currency:"VND", category:"food", date:"2026-03-02" }
  ];
  it("includes converted in totals, flags approx, keeps only un-rated in other[]", () => {
    const t = trip({ currency:"USD", rates:{ THB:0.03 } });
    const s = computeStats(t, expenses);
    expect(s.baseTotal).toBeCloseTo(20.5, 6);
    expect(s.approx).toBe(true);
    expect(s.other).toEqual([{ currency:"VND", amount:50000 }]);
    expect(s.cats.find(c => c.key === "shopping").amount).toBeCloseTo(10.5, 6);
  });
  it("no rates → unchanged legacy behavior", () => {
    const s = computeStats(trip({ currency:"USD", rates:{} }), expenses);
    expect(s.baseTotal).toBe(10);
    expect(s.approx).toBe(false);
    expect(s.other.map(o => o.currency).sort()).toEqual(["THB", "VND"]);
  });
});

describe("buildSummaryText ≈ marker (Phase 4)", () => {
  const expenses = [
    { id:"a", item:"Lunch", amount:10, currency:"USD", category:"food", date:"2026-03-01" },
    { id:"b", item:"Market", amount:350, currency:"THB", category:"shopping", date:"2026-03-01" }
  ];
  it("adds ≈ to total + daily average when converted", () => {
    const t = trip({ currency:"USD", rates:{ THB:0.03 } });
    const txt = buildSummaryText(t, computeStats(t, expenses), fmt);
    expect(txt).toContain("💰 Total spent: ≈ ");
    expect(txt).toContain("📅 Daily average: ≈ ");
  });
  it("no ≈ when nothing converted", () => {
    const t = trip({ currency:"USD", rates:{} });
    expect(buildSummaryText(t, computeStats(t, expenses), fmt)).not.toContain("≈");
  });
});

describe("sanitizeRates / newTrip.rates (Phase 4)", () => {
  it("keeps positive numbers, uppercases keys, drops junk", () => {
    expect(sanitizeRates({ thb:"0.03", eur:1.1, jpy:0, bad:"x", neg:-2 })).toEqual({ THB:0.03, EUR:1.1 });
  });
  it("newTrip stores sanitized rates + null stamp", () => {
    const t = newTrip({ rates:{ thb:0.03, junk:"no" } });
    expect(t.rates).toEqual({ THB:0.03 });
    expect(t.ratesUpdatedAt).toBeNull();
  });
});

describe("sanitizeBudgets / per-category flags (Phase 5)", () => {
  it("keeps positive budgets for known categories only", () => {
    expect(sanitizeBudgets({ food:400, transport:"50", bogus:99, hotel:0, shopping:-1 }))
      .toEqual({ food:400, transport:50 });
  });
  it("computeStats flags ok/warn/over per category", () => {
    const expenses = [
      { id:"a", item:"x", amount:90, currency:"USD", category:"food", date:"2026-03-03" },
      { id:"b", item:"y", amount:30, currency:"USD", category:"transport", date:"2026-03-03" }
    ];
    const s = computeStats(trip({ budgets:{ food:100, transport:200 } }), expenses);
    expect(s.cats.find(c => c.key==="food").catLevel).toBe("warn");   // 90%
    expect(s.cats.find(c => c.key==="transport").catLevel).toBe("ok"); // 15%
    const over = computeStats(trip({ budgets:{ food:50 } }), expenses);
    expect(over.cats.find(c => c.key==="food").catLevel).toBe("over");
  });
});

describe("computePace (Phase 5)", () => {
  const dated = (over) => trip({ startDate:"2026-03-01", endDate:"2026-03-10", budget:1000, ...over });
  const spend = (amt) => [{ id:"s", item:"x", amount:amt, currency:"USD", category:"food", date:"2026-03-01" }];
  it("null before / after / no-dates / no-budget", () => {
    expect(computePace(dated(), computeStats(dated(), []), "2026-02-20")).toBeNull();
    expect(computePace(dated(), computeStats(dated(), []), "2026-03-20")).toBeNull();
    expect(computePace(trip({ budget:1000 }), computeStats(trip({ budget:1000 }), []), "2026-03-05")).toBeNull();
    const nb = trip({ startDate:"2026-03-01", endDate:"2026-03-10" });
    expect(computePace(nb, computeStats(nb, []), "2026-03-05")).toBeNull();
  });
  it("computes allowance + projection mid-trip", () => {
    const t = dated();
    const p = computePace(t, computeStats(t, spend(250)), "2026-03-05");
    expect(p.totalDays).toBe(10);
    expect(p.dayOfTrip).toBe(5);
    expect(p.allowanceToDate).toBe(500);
    expect(p.projectedTotal).toBe(500);
    expect(p.onTrack).toBe(true);
    expect(p.level).toBe("ok");
  });
  it("flags over when projection blows the budget", () => {
    const t = dated();
    const p = computePace(t, computeStats(t, spend(800)), "2026-03-02");
    expect(p.onTrack).toBe(false);
    expect(p.level).toBe("over");
  });
});

describe("toCSV (Phase 6)", () => {
  const rows = [
    { date:"2026-03-01", item:"Lunch", category:"food", amount:12.5, currency:"USD", note:"" },
    { date:"2026-03-02", item:"Taxi, airport", category:"transport", amount:30, currency:"USD", note:'Said "fast"' },
    { date:"2026-03-03", item:"Café", category:"food", amount:4, currency:"EUR", note:"line1\nline2" }
  ];
  const csv = toCSV(rows);
  it("BOM + header + CRLF", () => {
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain("date,item,category,amount,currency,note");
    expect(csv).toContain("\r\n");
  });
  it("quotes commas, doubles quotes, quotes newlines, keeps utf-8", () => {
    expect(csv).toContain('"Taxi, airport"');
    expect(csv).toContain('"Said ""fast"""');
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain("Café");
  });
  it("tolerates non-array input", () => expect(typeof toCSV(null)).toBe("string"));
});

describe("parseAmount (Phase 6)", () => {
  it("numbers + comma decimal", () => {
    expect(parseAmount("5")).toBe(5);
    expect(parseAmount("12,50")).toBe(12.5);
    expect(parseAmount(12.345)).toBe(12.35);
  });
  it("arithmetic with precedence and parens", () => {
    expect(parseAmount("12+8.5")).toBe(20.5);
    expect(parseAmount("2+3*4")).toBe(14);
    expect(parseAmount("(2+3)*4")).toBe(20);
    expect(parseAmount("10/4")).toBe(2.5);
    expect(parseAmount("10/3")).toBe(3.33);
  });
  it("rejects letters, div-by-zero, junk", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("5+x")).toBeNull();
    expect(parseAmount("1/0")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("2++")).toBeNull();
    expect(parseAmount("(1+2")).toBeNull();
  });
});

describe("i18n (Phase 7)", () => {
  it("English by default, explicit locale, fallback", () => {
    expect(t("nav_home")).toBe("Home");
    expect(t("nav_home", "id")).toBe("Beranda");
    expect(t("totally_missing_key", "id")).toBe("totally_missing_key");
  });
  it("setLocale switches the active table", () => {
    setLocale("id");
    expect(t("cancel")).toBe("Batal");
    setLocale("en");
    expect(t("cancel")).toBe("Cancel");
  });
  it("ships at least English + Indonesian", () => {
    expect(Object.keys(LOCALES)).toEqual(expect.arrayContaining(["en", "id"]));
  });
});

describe("chunkPayload / reassemble (Phase 8)", () => {
  it("round-trips short and long payloads", () => {
    expect(reassemble(chunkPayload("hello", 1800))).toBe("hello");
    const big = "x".repeat(5000);
    const parts = chunkPayload(big, 1000);
    expect(parts.length).toBe(5);
    expect(reassemble(parts)).toBe(big);
  });
  it("reassembles out of order, fails on missing/garbage", () => {
    const p = chunkPayload("abcdefgh", 3);
    expect(reassemble([p[2], p[0], p[1]])).toBe("abcdefgh");
    expect(reassemble([p[0], p[1]])).toBeNull();
    expect(reassemble(["nope"])).toBeNull();
    expect(reassemble([])).toBeNull();
  });
  it("preserves base64 chars", () => {
    const b64 = "SGVsbG8r/Pz8=";
    expect(reassemble(chunkPayload(b64, 4))).toBe(b64);
  });
});

describe("small helpers", () => {
  it("isValidDate", () => {
    expect(isValidDate("2026-03-01")).toBe(true);
    expect(isValidDate("2026-3-1")).toBe(false);
    expect(isValidDate("nope")).toBe(false);
  });
  it("clamp", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it("esc escapes HTML metacharacters", () => {
    expect(esc('<a href="x">&\'')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
  it("fmtMoney returns a string and tolerates a bad currency", () => {
    expect(typeof fmtMoney(10, "USD")).toBe("string");
    expect(typeof fmtMoney(10, "NOTREAL")).toBe("string");
  });
});
