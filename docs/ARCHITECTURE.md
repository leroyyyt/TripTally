# TripTally — Architecture

TripTally is a single self-contained file, `index.html`, containing three things: a `<style>` block (all CSS, themed with custom properties on `:root` / `body.dark`), the markup, and one vanilla-JavaScript `<script>` block holding all application logic. There is no framework, no build step, and no runtime dependency.

## State shape (schema v2 — multi-trip)

All application state lives in one in-memory object, `state`, persisted as JSON in `localStorage`.

```js
{
  version: 2,
  activeTripId: "…",
  trips: [
    {
      id: "…",
      name: "",          // trip name
      destination: "",   // free-text place
      startDate: "",     // "YYYY-MM-DD" or ""
      endDate: "",       // "YYYY-MM-DD" or ""
      budget: null,      // number or null
      currency: "USD",   // base currency for totals
      archived: false,
      createdAt: 1718000000000,
      expenses: [
        {
          id: "…", item: "Lunch", amount: 12.5, currency: "THB",
          category: "food", date: "2026-06-13", note: "", createdAt: 1718000000000
        }
      ]
    }
  ],
  settings: {
    theme: "light", sort: "date-desc", filter: "all",
    lastCategory: "food", lastDate: ""
  }
}
```

Most of the UI code still reads `state.trip` and `state.expenses`. Those are **non-enumerable accessor properties** (installed by `installStateAccessors`) that proxy the *active* trip, so they don't serialize and the single-trip code keeps working unchanged.

## Storage & migration

- **Key:** `triptally.v2` in `localStorage` (the old `triptally.v1` key is kept as a backup).
- On boot `loadState()` reads `triptally.v2`; if absent it reads `triptally.v1`, runs `migrateV1toV2()` (wrapping the old single trip as the one active trip), writes v2, and leaves v1 untouched as a safety backup. `normalizeLoadedV2()` re-normalizes every trip/expense and repairs a dangling `activeTripId`. `saveState()` writes v2; on failure (quota/blocked) it shows a toast.
- `normalizeExpense(raw)` is the gatekeeper for every expense entering state — from load, quick-add, the sheet, or import. It coerces comma decimals, validates the date (falling back to today), defaults unknown categories to `others`, uppercases the currency, and rejects entries with an empty item or a non-positive amount.

## Core logic functions

The pure, DOM-free logic lives in `js/core.js` (an ES module, unit-tested by `tests/core.test.js`). `index.html` imports it. These functions take their inputs as arguments rather than reading globals, which is what makes them testable:

- `computeStats(trip, expenses)` — aggregates expenses into `baseTotal`, per-category (`cats`) and per-day (`days`) breakdowns, budget math (`remaining`, `pctOfBudget`, `overBudget`), and `dailyAvg`. **Only expenses in the trip currency** count toward totals; everything else is collected in `other[]`.
- `daysForAverage(trip, expenses)` — the divisor for the daily average: the inclusive trip length when dates are set, otherwise the span the recorded expenses cover (minimum 1).
- `buildSummaryText(trip, stats, fmt)` — renders the shareable plain-text recap; `fmt` is the money formatter.
- `normalizeExpense(raw)` — the gatekeeper described under _Storage_.
- `mergeExpenses(existing, incoming)` → `{ merged, added, skipped }` — the import dedupe: skips incoming expenses whose `id` already exists, or whose `item|amount|currency|category|date` signature matches an existing one.

`index.html` keeps the DOM glue: `stats()` / `summaryText()` wrappers that call the core functions with `state.trip` / `state.expenses`, plus `jsonText()` (export payload: `app`, `version`, `exportedAt`, `trip`, `expenses`).

## Render functions

The UI is re-rendered imperatively from `state`:

- `renderDashboard()` — the home tab: trip header, hero total, budget card, category and day breakdowns.
- `renderExpenseList()` — the expenses tab: sorted/filtered list of expense rows.
- `renderDataPreviews()` — the Share & backup tab: summary text and JSON previews.
- `renderTripInfo()` — the Trip tab form state.

`refresh()` calls `saveState()` then the render functions. `setTab(name)` switches tabs and triggers the relevant render.

## Known limitations

- ~~**Single trip.**~~ Resolved in Phase 3: multiple trips with a switcher, archive, duplicate, and per-trip totals.
- ~~**No currency conversion.**~~ Resolved in Phase 4: per-trip exchange rates fold foreign expenses into the total (with an "≈"); currencies without a rate still stay separate in `other[]`.
- ~~**No true offline install.**~~ Resolved in Phase 1: the app now ships `manifest.webmanifest` and a cache-first service worker (`sw.js`), so it is installable and loads from a cold start offline after the first visit. Remember to bump the `CACHE` version in `sw.js` on every asset change.

See [`../ROADMAP.md`](../ROADMAP.md) for how these are slated to be addressed.
