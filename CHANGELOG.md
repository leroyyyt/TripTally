# Changelog

All notable changes to TripTally are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-06-13

The first stable release. Everything below landed across Phases 0–9: a real installable
offline PWA, a tested logic core with CI, multi-trip support with a safe v1→v2 migration,
offline-first currency conversion, smarter budgets and pace insights, power-user entry/list
features, accessibility + internationalization, and serverless device-to-device transfer.

### Added
- **Device-to-device transfer & file backup (Phase 8):**
  - "Transfer to another device" with **no server**: the active export is gzip-compressed (`CompressionStream`) + base64 and split into labelled chunks (`chunkPayload`/`reassemble`, unit-tested).
  - **QR codes**: a self-contained QR encoder vendored at `js/vendor/qrcode.js` (byte mode, versions 1–10, EC levels L–H, full Reed–Solomon + masking) renders the chunks as scannable codes with "i / N" labels, verified module-for-module against a real decoder over 240+ random inputs.
  - **Scan to import**: a "📷 Scan QR codes" button opens the camera and reads the codes back. It uses `BarcodeDetector` when present and otherwise lazy-loads a vendored jsQR decoder (`js/vendor/jsQR.js`), so scanning works on any camera-capable browser including iOS Safari. The full encode→QR→scan→reassemble→gunzip→import round-trip is verified end-to-end. Pasting the code remains as a fallback.
  - **Web Share Level 2**: share the backup as an actual `.json` file via `navigator.share({files})` when supported.
  - **File System Access**: "Save backup file…" remembers the handle for one-tap "Backup now"; falls back to a normal download. Everything is feature-detected.
- **Accessibility, i18n & polish (Phase 7):**
  - A11y: focus trap + return-focus on the sheet/confirm modal, `role="tablist"`/`aria-selected` tab bar, `aria-expanded` toggles, visible `:focus-visible` rings, a `prefers-reduced-motion` block, and darkened `--faint`/`--muted` for WCAG-AA contrast in light mode.
  - **Auto theme** is the new default (follows `prefers-color-scheme`); the theme button cycles auto → light → dark and reacts to OS changes live.
  - **i18n scaffold** in `core.js` (`STRINGS`, `t()`, `setLocale`, `LOCALES`) with English + Bahasa Indonesia, a language picker on the Trip tab, and locale threaded through `Intl` money/date formatting. Tested.
  - **Haptics**: `navigator.vibrate(10)` (feature-detected) on add / delete / undo.
- **Entry & list power features (Phase 6):**
  - Live **search** over item/note above the expense list; **day grouping** with per-day subtotals (on date sorts); **swipe-left to delete** on touch (buttons stay for desktop); a **↻ repeat** button to re-log an expense onto today.
  - **CSV export** (`⬇️ CSV`) — RFC-4180 quoting with a UTF-8 BOM for Excel, via pure `toCSV(expenses)` in `core.js`.
  - Amount fields (quick-add + sheet) accept **arithmetic** like `12+8.5` via a safe `parseAmount` parser (no `eval`; digits and `+ - * / . , ( )` only). Both new functions are unit-tested (suite now 87 tests).
- **Smarter budgets & insights (Phase 5):**
  - Per-trip per-category budgets (`budgets` map). New Trip-tab "Category budgets" editor; dashboard category bars get a budget marker and turn amber at ≥80% / red when over. `core.js` adds `sanitizeBudgets` and category `catBudget`/`catPct`/`catLevel` on `computeStats`.
  - Daily **pace** card (only mid-trip, with dates + budget): daily allowance, spent-so-far vs allowance-to-date, and a projected end total with 🟢/⚠️/🔴. Implemented as `computePace(trip, stats, today)` (today injected for testability).
  - By-day card now shows day-of-trip labels ("Day 3 · Tue 17 Mar") and highlights the most expensive day. Share summary gains pace + projection lines. New tests cover pace lifecycle and per-category flags (suite now 70 tests).
- **Offline-first currency conversion (Phase 4):**
  - Per-trip `rates` map ("1 unit of foreign currency = X trip-currency") + `ratesUpdatedAt` stamp. New `core.js` exports `convert(amount, from, trip)` and `sanitizeRates`.
  - `computeStats` now folds rated foreign expenses into `baseTotal`, category, and day totals and sets `approx:true`; an "≈" appears before the hero total, daily average, and in the share summary. Currencies with no rate stay in `other[]` (excluded), exactly as before.
  - Trip tab "Exchange rates" editor lists every foreign currency in the trip with an editable rate and a "last updated" stamp; expense rows show both amounts (e.g. `฿350` / `≈ $9.45`).
  - Optional "Fetch latest" button pulls rates from the free Frankfurter API (`api.frankfurter.dev`), feature-detected on `navigator.onLine`, with graceful failure — never called automatically. New tests cover conversion math, mixed converted/unconverted stats, and the ≈ summary (suite now 57 tests).
- **Multi-trip support + migration (Phase 3):**
  - New schema **v2** under key `triptally.v2`: `{ version:2, activeTripId, trips:[{id,name,destination,startDate,endDate,budget,currency,archived,createdAt,expenses[]}], settings }`. `migrateV1toV2()` wraps an existing `triptally.v1` blob as the single active trip on first load and **keeps the v1 key as a backup**. Migration is unit-tested (v1 present / absent / corrupted).
  - "My trips" tab: trip cards (name, destination, dates, total spent, expense count, active badge), tap to switch, "＋ New trip", and per-trip duplicate (settings only) / archive-unarchive / delete. Archived trips collapse under an "Archived" section.
  - Dashboard, Expenses, and Share all scope to the active trip (via non-enumerable `state.trip` / `state.expenses` accessors that proxy the active trip).
  - Export is now v2 (full `trips` array); import accepts v2, legacy v1, and bare-array payloads. "Reset" offers "Delete this trip" and "Delete everything". New `core.js` exports `newTrip`, `defaultStateV2`, `migrateV1toV2`, `mergeTrips` with tests (suite now 45 tests).
- **Testable core + dev toolchain (Phase 2):**
  - Extracted all pure logic into `js/core.js` (ES module): constants, `esc`/`clamp`/`isValidDate`/`todayStr`/`uid`/`fmtMoney`/`fmtDate`, `normalizeExpense`, `daysForAverage`, `computeStats`, `buildSummaryText` (now `(trip, stats, fmt)`), and a new `mergeExpenses(existing, incoming)`.
  - `index.html` switched to `<script type="module">` importing from `./js/core.js`; SW precache updated and cache bumped to `triptally-v2`.
  - `tests/core.test.js` (vitest, 34 tests, 100% line coverage of core), `eslint` flat config, `prettier`, npm scripts (`test`/`lint`/`format`/`coverage`), and `.github/workflows/ci.yml` (lint + test on Node 20). Runtime stays dependency-free.
- **Installable offline PWA (Phase 1):**
  - `manifest.webmanifest` with standalone display and real PNG icons (192, 512, maskable 512) under `icons/`.
  - `sw.js` — cache-first, version-stamped service worker (`triptally-v1`) that precaches the app shell, cleans up old caches on activate, and falls back to cached `index.html` for navigations.
  - In-app update flow: a toast with an "Update" action plus an "Offline app" status card in Share & backup (offline-ready ✓ / update available).
- Repo hygiene: `LICENSE` (MIT), `.gitignore`, `CHANGELOG.md`.
- `README.md` rewrite: feature list, usage, privacy statement, backup instructions, development + PWA/cache-bump sections.
- `docs/ARCHITECTURE.md` describing state shape, render functions, storage key, and known limitations.
- GitHub Actions workflow (`.github/workflows/pages.yml`) to deploy the repo root to GitHub Pages on push to `main`.

### Changed
- `index.html`: linked the manifest, replaced the data-URI apple-touch-icon with `icons/icon-192.png`, and extended `toast()` with an optional custom action label (backward compatible).

## [0.1.0] — 2026-06-13

### Added
- Initial single-file release: self-contained `index.html` offline travel expense tracker.
- Single trip with name, destination, dates, budget, and currency.
- Quick-add bar and add/edit bottom sheet across 7 fixed categories.
- 24 selectable currencies (no conversion).
- Budget progress bar, category breakdown, and day breakdown.
- Text-summary share, JSON export/import with duplicate detection.
- Light/dark theme toggle.
- Data persisted in `localStorage` under key `triptally.v1`.
