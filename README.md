# TripTally 🧳

**A fast, private, offline-first travel expense tracker that lives in a single HTML file.**

TripTally helps you log what you spend on a trip — meals, taxis, hotels, tickets — and see where your money is going, with category and day breakdowns, a budget progress bar, and a shareable text summary. Everything runs in your browser. No account, no server, no tracking.

> **Privacy first:** all of your data is stored in your browser's `localStorage` on your own device. Nothing is ever uploaded, synced, or sent anywhere.

---

## Screenshots

| Dashboard (light) | Dashboard (dark) |
|---|---|
| _screenshot placeholder — `docs/img/dashboard-light.png`_ | _screenshot placeholder — `docs/img/dashboard-dark.png`_ |

| Add expense | Share & backup |
|---|---|
| _screenshot placeholder — `docs/img/add-expense.png`_ | _screenshot placeholder — `docs/img/share-backup.png`_ |

---

## Features

- **Multiple trips** — keep separate trips with their own budget, currency, dates, and expenses; switch, duplicate, archive, or delete from the "My trips" tab.
- **Quick add bar** — log an expense (item, amount, currency, category) in seconds.
- **Add / edit bottom sheet** — full editor with note, date, and category picker.
- **Budget tracking** — set a trip budget and watch a live progress bar with remaining / over-budget state.
- **Breakdowns** — totals by category and by day, sorted and percentage-weighted.
- **24 currencies with optional conversion** — log expenses in any currency; set a per-trip exchange rate (manually or via the free Frankfurter API when online) to fold them into your trip total with an "≈".
- **Fast entry & lists** — search, day-grouped totals, swipe-to-delete, one-tap repeat, and arithmetic in the amount field (`12+8.5`).
- **Location & photos** — optionally geotag an expense (with a place name) and attach a food/receipt photo; tap the 📍 chip for a map or the thumbnail for a full view.
- **Excel export** — download a formatted multi-sheet `.xlsx` (Summary, Expenses, By category, By day) in addition to JSON/CSV.
- **Budgets & pace** — overall and per-category budgets, plus a mid-trip pace card with a projected end total.
- **Share summary** — copy a clean text summary of the whole trip to share anywhere.
- **Backup & restore** — export/import JSON (with duplicate detection) or export a CSV for Excel.
- **Dark mode** — toggle between light and dark themes.
- **Works offline** — no network needed to use the app once it's loaded.

---

## Feature matrix

| Area | What you get |
|---|---|
| Trips | Multiple trips, switch / duplicate / archive / delete, per-trip totals |
| Expenses | Quick-add + full sheet, 7 categories, search, day-grouped subtotals, swipe-delete, repeat, arithmetic amounts (`12+8.5`) |
| Money | 24 currencies, optional per-trip exchange rates (manual or Frankfurter API), totals marked “≈” when converted |
| Budgets | Overall + per-category budgets, mid-trip pace card with projected end total |
| Sharing | Text summary, JSON + CSV export/import, serverless device-to-device transfer via **QR codes** (scan or paste), Web Share / file backup |
| Platform | Installable offline PWA, light/dark/auto theme, English + Bahasa Indonesia, accessible (focus traps, ARIA, reduced-motion) |

## How to use

**Option A — open the file directly.** Download or clone this repo and open `index.html` in any modern browser. That's it.

**Option B — use the hosted version.** TripTally deploys automatically to GitHub Pages:

> 🔗 **https://leroyyyt.github.io/TripTally/**

### Install as an app

- **iPhone/iPad (Safari):** open the Pages link → Share → **Add to Home Screen**.
- **Android (Chrome):** open the Pages link → menu → **Install app** / **Add to Home screen**.
- **Desktop (Chrome/Edge):** click the **Install** icon in the address bar.

Once installed it launches full-screen and works in airplane mode.

---

## Privacy

TripTally is built so that your spending data never leaves your device:

- All trip and expense data is kept in `localStorage` under the key `triptally.v2` (an older `triptally.v1` key is preserved as a one-time migration backup).
- There is no backend, no analytics, and no third-party scripts loaded at runtime.
- **Location** is opt-in per expense. Typed place names and GPS coordinates are stored locally with the expense; TripTally does not reverse-geocode or upload coordinates automatically. Google Maps opens only when you explicitly tap a map/search action.
- **Photos** are downscaled and stored in your browser's IndexedDB on this device only — they are never included in JSON/QR exports and never uploaded.
- **Offline files** are kept in the browser's service-worker cache so the app shell can load without a network connection. TripTally does not use cookies for trip data.
- The only way data leaves your device is if **you** explicitly export it (JSON/CSV/Excel) or share the text summary.

Clearing your browser data for this site will erase your trip, so keep backups (below).

---

## Backing up your data

Open the **Share & backup** tab:

- **Download JSON** writes a `.json` file with your trip and all expenses. Keep this somewhere safe.
- **Import JSON** reads a previously exported file back in. Import is **non-destructive**: existing expenses are kept and incoming duplicates (same id, or same item/amount/currency/category/date signature) are skipped.
- **Copy summary** puts a human-readable text recap on your clipboard.

A good habit: export a fresh JSON backup at the end of each travel day.

---

## Development

TripTally is intentionally shipped as a **single self-contained file**: `index.html` contains the CSS, markup, and runtime application logic, so it can still be opened directly from your files. There are no frameworks, no build step, and no runtime dependencies.

To work on it:

1. Clone the repo.
2. Edit `index.html`.
3. Open it in a browser, or serve it locally for a more production-like setup:

   ```bash
   python -m http.server 8000
   # then visit http://localhost:8000
   ```

The pure, DOM-free logic (stats, normalization, import merge, summary text) is mirrored in [`js/core.js`](js/core.js) as an ES module so it can be unit-tested. The shipped `index.html` has the runtime code inlined to support double-click / `file://` use as well as hosted/PWA use.

Key things to know are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): the state shape, the main render functions, the storage key, and current limitations.

### Testing & linting (dev only)

The test/lint tooling is a **devDependency** — it is never needed to run the app, only to develop it.

```bash
npm install     # one-time
npm test        # run the vitest suite (tests/core.test.js)
npm run coverage# tests with a coverage report
npm run lint    # eslint (flat config)
npm run format  # prettier --write
```

`tests/core.test.js` covers `js/core.js` (normalization, stats, day math, import merge, summary text) at 100% line coverage. CI (`.github/workflows/ci.yml`) runs lint + tests on Node 20 for every push and PR.

### Offline / PWA

TripTally is an installable Progressive Web App. It ships three extra files alongside `index.html`:

- `manifest.webmanifest` — app metadata and icons (in `icons/`).
- `sw.js` — a cache-first service worker that precaches the app shell so it loads with no network after the first visit.
- The registration + in-app update flow lives inline in `index.html`.

When a new version is waiting, the **Share & backup → Offline app** card shows "Update available" and a toast offers an **Update** button, which activates the new worker and reloads.

#### Releasing / bumping the cache version

The service worker serves cached files until its cache name changes. **Every time you change `index.html`, an icon, or the manifest, bump the cache version** so users get the update:

1. Open `sw.js`.
2. Increment `const CACHE = "triptally-v1";` → `"triptally-v2"`, etc.
3. Commit and deploy. On next visit users see the "Update available" prompt; old caches are deleted on activation.

### Deployment

Pushing to `main` triggers the GitHub Actions workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which publishes the repository root to GitHub Pages. No build step runs — the files are served as-is.

---

## Known limitations

- **Currency conversion is rate-by-rate.** Foreign expenses only fold into the total once you set that currency's rate; anything without a rate stays listed separately. Totals that include a conversion are marked "≈".

See [`ROADMAP.md`](ROADMAP.md) for the planned improvements.

---

## License

[MIT](LICENSE) © leroyyyt
