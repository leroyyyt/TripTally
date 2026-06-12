# TripTally — Improvement Roadmap (Prompt Playbook)

Each phase below is written as a **copy-paste prompt** you can give to Claude (or any coding agent) in a session with this repo open. Phases are ordered by dependency — do them in order. Each prompt includes context, exact scope, constraints, and acceptance criteria so the agent can't drift.

**Current state (baseline, commit `c091c6d`):** one self-contained `index.html` (~1,300 lines: CSS + HTML + vanilla JS), localStorage key `triptally.v1`, single trip, 7 fixed categories, 24 currencies with **no conversion**, quick-add bar, add/edit bottom sheet, budget progress bar, category/day breakdowns, text-summary share, JSON export/import with dedupe, dark mode. **No service worker, no manifest, no tests, no CI, no lint.** "Offline" today only means "works if the tab is already open."

**Standing constraints for every prompt:**
- Keep the app dependency-free at runtime (no frameworks, no CDN scripts) unless a phase explicitly says otherwise.
- Never break existing localStorage data — every schema change ships with a migration.
- Preserve the design language (CSS tokens in `:root` / `body.dark`).
- All user-rendered strings must keep going through `esc()`.
- Each phase ends with a commit (or PR) and a manual test checklist actually executed.

---

## Phase 0 — Repo hygiene & deployment baseline

> **Prompt 0:**
> In the TripTally repo (single-file offline travel expense tracker, `index.html` only), do repo housekeeping without touching app logic:
> 1. Rewrite `README.md`: what the app is, feature list, screenshot placeholders, how to use (open `index.html` / GitHub Pages link), privacy statement (all data in localStorage, nothing uploaded), data backup instructions (Share & backup tab), and a "development" section explaining the single-file architecture.
> 2. Add `LICENSE` (MIT, copyright leroyyyt).
> 3. Add `.gitignore` (node_modules, dist, .DS_Store, *.log).
> 4. Add `CHANGELOG.md` starting at `v0.1.0 — initial single-file release`.
> 5. Add a GitHub Actions workflow `.github/workflows/pages.yml` that deploys the repo root to GitHub Pages on push to `main` (use `actions/upload-pages-artifact` + `actions/deploy-pages`).
> 6. Add `docs/ARCHITECTURE.md`: one page describing the state shape (`trip`, `expenses[]`, `settings`), the render functions (`renderDashboard`, `renderExpenseList`, `renderDataPreviews`), the storage key `triptally.v1`, and known limitations (single trip, no currency conversion, no true offline install).
>
> Acceptance: repo has all 6 files; README renders cleanly on GitHub; Pages workflow is valid YAML; no changes to `index.html`.

---

## Phase 1 — Make it a real offline PWA

The HTML already has Apple meta tags but there is **no manifest and no service worker**, so it isn't installable and dies offline on first load. A service worker *must* be a separate file, so this phase relaxes "single file" to "three files, zero build step."

> **Prompt 1:**
> Convert TripTally into a genuinely installable offline PWA. Repo currently: `index.html` only, with inline data-URI icons and Apple PWA meta tags but no manifest/service worker.
> 1. Create `manifest.webmanifest`: name "TripTally", short_name "TripTally", `display: standalone`, `start_url: ./index.html`, theme/background colors matching `--brand` (#ff7a5c) and dark bg (#11131a), and icons. Generate real PNG icons (192, 512, maskable 512) from the existing 🧳-on-coral-rounded-square SVG concept and commit them under `icons/`.
> 2. Create `sw.js`: cache-first service worker, version-stamped cache name (e.g. `triptally-v1`), precaching `index.html`, the manifest, and icons. On `activate`, delete old caches. On fetch, serve from cache, fall back to network, and for navigation requests fall back to cached `index.html`.
> 3. In `index.html`: link the manifest, register the SW (feature-detected, after `load`), and add an in-app update flow — when a new SW is waiting, show the existing toast with an "Update" action that calls `skipWaiting` and reloads.
> 4. Add a tiny "offline ready ✓ / update available" indicator in the Share & backup tab.
> 5. Document in README how to bump the SW cache version on each release.
>
> Constraints: no build tools; keep everything else inline in `index.html`. Test: serve locally (`python -m http.server`), verify in Chrome DevTools → Application that the manifest parses, SW activates, and the app loads with network disabled after one visit. Acceptance: Lighthouse PWA installability passes; airplane-mode reload works.

---

## Phase 2 — Extract logic, add tests, lint, and CI

Everything is one `<script>` block; pure logic (stats, normalize, import dedupe, summary text) is untestable. Fix that without introducing a runtime build step.

> **Prompt 2a (extraction):**
> Refactor TripTally so its pure logic is testable while the shipped app stays build-free.
> 1. Create `js/core.js` (an ES module) containing the pure, DOM-free functions moved verbatim from `index.html`: `normalizeExpense`, `computeStats`, `daysForAverage`, `buildSummaryText` (refactor it to take `(trip, stats, fmt)` args instead of reading globals), `isValidDate`, `fmtMoney`, `esc`, `clamp`, the import dedupe logic (extract as `mergeExpenses(existing, incoming) → {merged, added, skipped}`), and the `CATEGORIES`/`CURRENCIES` constants.
> 2. In `index.html`, switch the main script tag to `type="module"` and `import` from `./js/core.js`. Update the service worker precache list (and bump cache version).
> 3. No behavior changes. Manually verify every tab, add/edit/delete with undo, import/export round-trip, and dark mode still work.
>
> Acceptance: `index.html` no longer defines any of the moved functions; app behaves identically; SW still serves it offline.

> **Prompt 2b (tests + CI):**
> Add a dev-only toolchain to TripTally (runtime stays vanilla):
> 1. `npm init`, add `vitest`, `eslint` (flat config, browser + es2022 globals), `prettier`. These are devDependencies only — the shipped app must not require npm.
> 2. Write `tests/core.test.js` covering: `normalizeExpense` (comma decimals "12,50" → 12.5, missing/invalid date → today, unknown category → "others", rejects amount ≤ 0 or empty item, rounds to 2 dp); `computeStats` (multi-currency expenses: only trip-currency ones count toward `baseTotal`/categories/days, others land in `other[]`; budget pct/remaining/overBudget math); `daysForAverage` (inclusive trip-day count; expense-span fallback; minimum 1); `mergeExpenses` (skips duplicate ids AND duplicate signatures item|amount|currency|category|date, counts added/skipped); `buildSummaryText` (contains budget line only when budget set, over-budget shows 🔴). Target ≥ 90% line coverage of `core.js`.
> 3. GitHub Actions `ci.yml`: on push/PR run lint + tests on Node 20.
> 4. Add npm scripts: `test`, `lint`, `format`. Document in README.
>
> Acceptance: `npm test` green, CI green on push, `eslint .` clean.

---

## Phase 3 — Multi-trip support (the big one)

The app hard-assumes one trip. This is the most-requested feature class for travel trackers and requires a schema migration.

> **Prompt 3:**
> Add multi-trip support to TripTally. Current storage: key `triptally.v1` = `{version:1, trip, expenses[], settings}`.
> 1. **Schema v2** under new key `triptally.v2`: `{version:2, activeTripId, trips:[{id, name, destination, startDate, endDate, budget, currency, archived:false, createdAt, expenses:[]}], settings}`. Write `migrateV1toV2()` in `core.js`: on boot, if v2 missing and v1 exists, wrap the old trip+expenses as the single trip, set it active, keep settings, write v2, and KEEP the v1 key as a safety backup (note this in ARCHITECTURE.md). Unit-test the migration (v1 present, v1 absent, v1 corrupted).
> 2. **Trip switcher UI:** the Trip tab becomes "My trips": list of trip cards (name, destination, dates, total spent, expense count, active badge), tap to switch active trip, "＋ New trip" button opening a sheet with the existing trip form fields, and per-trip actions via the existing confirm modal: archive/unarchive, duplicate (settings only, no expenses), delete (with the warning copy). Archived trips collapse under an "Archived" section.
> 3. Active-trip editing keeps the current live-edit form, scoped to the active trip.
> 4. Dashboard/Expenses/Share all operate on the active trip only. App bar subtitle shows active trip name (already does via `barSub`).
> 5. **Export/import v2:** export gains `"version":2` and full `trips` array; import accepts v2 (merge trips by id, dedupe expenses within each via `mergeExpenses`) AND legacy v1/bare-array payloads (import into the active trip, current behavior). Unit-test all three import shapes.
> 6. "Reset & clear" gets two options: "Delete this trip" and "Delete everything".
>
> Acceptance: existing users' data survives (test by seeding a v1 key first); all tests green; can create/switch/archive/delete trips; per-trip totals isolated.

---

## Phase 4 — Currency conversion (offline-first)

Today non-trip-currency expenses are excluded from totals — surprising on real trips. Stay offline-first: manual rates always work, online fetch is optional sugar.

> **Prompt 4:**
> Add currency conversion to TripTally, offline-first.
> 1. Data: per-trip `rates: { "THB": 0.027, ... }` meaning "1 unit of foreign currency = X trip-currency". Store alongside trip. Add `convert(amount, from, trip)` in `core.js` → `{value, converted:boolean}`; unconverted currencies fall back to current behavior (excluded + listed separately).
> 2. UI: in the Trip sheet, a "Exchange rates" section that lists every currency appearing in that trip's expenses with an editable rate input and "last updated" stamp. Expenses in foreign currency show both amounts in the list (`฿350 ≈ $9.45`).
> 3. Stats: `computeStats` now includes converted expenses in `baseTotal`, category, and day aggregations (flag `approx:true` when any conversion happened; show "≈" before the hero total and in the summary text). `other[]` keeps only currencies with no rate set.
> 4. Optional online refresh: a "Fetch latest rates" button that calls the free Frankfurter API (`api.frankfurter.dev`); handle failure gracefully (toast, keep manual rates), never call it automatically. Feature-detect `navigator.onLine` to disable the button offline.
> 5. Unit tests: conversion math, stats with mixed converted/unconverted, summary text with ≈.
>
> Acceptance: an expense in THB with a rate set appears in the USD total with ≈ markers; with no rate it behaves exactly as today; works fully offline with manual rates.

---

## Phase 5 — Smarter budgets & insights

> **Prompt 5:**
> Upgrade TripTally budgeting (per-trip, schema additive — migrate by defaulting new fields):
> 1. **Per-category budgets:** optional `budgets: {food: 400, ...}` per trip; edit UI in the Trip tab (one input per category, collapsible). Dashboard category bars gain a thin budget marker and turn amber/red using the existing badge logic when ≥ 80% / over.
> 2. **Daily pace:** if trip dates are set and today ∈ trip range, show a "Pace" card: budget ÷ trip days = daily allowance; spent-so-far vs allowance-to-date; projected end total (current daily average × trip length) with 🟢/⚠️/🔴 vs budget. All in `core.js` as `computePace(trip, stats, today)` — pass `today` in for testability.
> 3. **Trends:** in the by-day card, add a 7-day-max-window sparkline-style highlight of the most expensive day, and show day-of-trip numbers ("Day 3 · Tue 17 Mar").
> 4. Summary text (`buildSummaryText`) gains pace + projection lines when available.
> 5. Unit tests for `computePace` (before trip / during / after / no dates / no budget) and per-category over-budget flags.
>
> Acceptance: pace card appears only mid-trip with budget+dates set; category bars reflect their own budgets; tests green.

---

## Phase 6 — Expense entry & list power features

> **Prompt 6:**
> Improve day-to-day usability of TripTally entry and list:
> 1. **Search:** text input above the expense list filtering by item/note (case-insensitive, live).
> 2. **Day grouping:** group the expense list under sticky date headers with per-day subtotals (respect current sort: only for date sorts).
> 3. **Swipe actions:** on touch devices, swipe an expense row left to reveal delete (reuse `deleteExpense` with its undo toast); keep the buttons for desktop.
> 4. **Repeat last:** long-press (or a small ↻ button) on an expense to duplicate it with today's date.
> 5. **CSV export:** add "⬇️ CSV" next to the JSON download — columns `date,item,category,amount,currency,note`, RFC-4180 quoting, BOM for Excel. Pure function `toCSV(expenses)` in `core.js` + unit tests (quotes, commas, newlines in notes).
> 6. **Amount entry:** quick-add amount field accepts simple arithmetic (`12+8.5`) — safe parser (digits, `+ - * / .` and comma only — NO eval), in `core.js` with tests.
>
> Acceptance: all features work on mobile Safari + desktop Chrome; CSV opens correctly in Excel with utf-8 items (e.g. "Café"); arithmetic parser rejects letters.

---

## Phase 7 — Accessibility, i18n & polish

> **Prompt 7:**
> Accessibility and polish pass on TripTally:
> 1. **A11y:** focus trap in the bottom sheet and modal; return focus to the trigger on close; `aria-expanded` on the More-options toggle; `role="tablist"`/`aria-selected` on the tab bar; visible focus rings (`:focus-visible`) consistent with the theme; check all text/background pairs meet WCAG AA in both themes and fix the failures (the `--faint` on `--bg` pairs are suspects); `prefers-reduced-motion` media query disabling fadeUp/grow/stagger animations.
> 2. **Theme:** add "auto" as the default theme (follows `prefers-color-scheme`), keep manual override cycle auto→light→dark on the existing button.
> 3. **i18n scaffold:** extract every user-facing string into a `STRINGS` object in `core.js` with an English table; render via `t(key)`. Add one extra locale (pick Bahasa Indonesia or Japanese — common travel pairing) and a language picker in the Trip tab. Dates/money already use `Intl` — pass the chosen locale through.
> 4. **Haptics:** `navigator.vibrate(10)` (feature-detected) on add/delete/undo.
> 5. Run Lighthouse accessibility audit; fix everything fixable; record score in README.
>
> Acceptance: Lighthouse a11y ≥ 95; keyboard-only user can add, edit, and delete an expense; language switch persists and translates the full UI.

---

## Phase 8 — Sync & sharing without a server (optional, ambitious)

> **Prompt 8:**
> Add device-to-device transfer to TripTally with no backend:
> 1. **QR transfer:** "Send to another device" generates QR code(s) of the compressed trip JSON (use a small inlined QR library committed to the repo, e.g. qrcode-generator ~5KB, vendored into `js/vendor/` — no CDN). Compress with `CompressionStream('gzip')` + base64; chunk into multiple QRs if > ~2KB with "1/3" indicators. "Receive" uses `BarcodeDetector` where available, else falls back to paste-JSON (existing import).
> 2. **File handles:** where `showSaveFilePicker` exists, offer "Save backup to file" that remembers the handle and adds a one-tap "Backup now" button; fall back to the existing download.
> 3. **Web Share Level 2:** share the JSON as an actual `.json` file via `navigator.share({files})` when supported.
> 4. All feature-detected; nothing breaks on browsers without these APIs (iOS Safari lacks BarcodeDetector — paste fallback must be obvious).
>
> Acceptance: round-trip a 50-expense trip phone→laptop via QR + paste; no network requests involved; vendored lib license noted in README.

---

## Phase 9 — Release engineering

> **Prompt 9:**
> Cut TripTally v1.0:
> 1. Audit: run the full test suite, ESLint, Lighthouse (PWA / perf / a11y / best-practices) and fix regressions; verify SW cache version was bumped; verify v1→v2 migration once more with seeded legacy data.
> 2. Update CHANGELOG.md with everything since v0.1.0, grouped by phase.
> 3. Tag `v1.0.0`, create a GitHub Release with the changelog and a zip of the deployable files.
> 4. README: final screenshots (light + dark), feature matrix, "Install on iPhone/Android" instructions, link to the GitHub Pages URL.
> 5. Add `docs/TESTING.md`: the manual smoke-test checklist (15 steps covering every tab and the offline reload) to run before any future release.
>
> Acceptance: Pages deployment serves the tagged build; fresh device can install the PWA and use it in airplane mode.

---

## Suggested order & sizing

| Phase | Theme | Size | Depends on |
|---|---|---|---|
| 0 | Repo hygiene + Pages | S | — |
| 1 | True PWA (manifest + SW) | M | 0 |
| 2 | Extract core.js, tests, CI | M | 1 |
| 3 | Multi-trip + migration | L | 2 |
| 4 | Currency conversion | M | 3 |
| 5 | Budget pace & insights | M | 4 |
| 6 | Search, CSV, swipe, math entry | M | 3 |
| 7 | A11y + i18n + polish | M | 6 |
| 8 | QR sync (optional) | L | 7 |
| 9 | v1.0 release | S | all |

Known issues worth folding into whichever phase touches them first: `daysForAverage` divides by full trip length even before the trip ends (daily average looks artificially low mid-trip — fix in Phase 5 pace work); quick-add defaults to trip start date rather than today (revisit in Phase 6); `state.settings.lastDate` never clears between trips (fix in Phase 3).
