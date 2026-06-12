# TripTally — Manual smoke test

Run this 15-step checklist in a browser before tagging any release. It exercises every tab
and the offline path. Automated logic tests live in `tests/` (`npm test`); this covers the UI
and integration that the unit tests can't.

Serve locally first so the service worker is active:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

| # | Step | Expected |
|---|------|----------|
| 1 | Open the app fresh (clear site data first). | Dashboard loads; empty state prompts you to add an expense. |
| 2 | Quick-add an expense with an arithmetic amount (`12+8.5`). | Adds `20.50`; appears in the list; a short haptic fires on mobile. |
| 3 | Open the ＋ sheet, add an expense in a **foreign** currency. | Saves; expense row shows the original amount. |
| 4 | Trip tab → set trip name, dates, budget, and currency. | Dashboard header + budget bar update live. |
| 5 | Trip tab → Exchange rates → set a rate for the foreign currency. | Hero total gains an “≈”; the foreign row shows `≈` converted amount. |
| 6 | Trip tab → Category budgets → set one category budget below its spend. | That category’s dashboard bar turns red/amber. |
| 7 | With dates spanning today + a budget, check the dashboard. | A **Pace** card shows day-of-trip, allowance, and a projected total. |
| 8 | Expenses tab → type in the search box. | List filters live by item/note. |
| 9 | Expenses tab (date sort) → check grouping. | Rows group under date headers with per-day subtotals. |
| 10 | On a touch device, swipe an expense row left; tap the ↻ on another. | Swipe reveals delete; ↻ duplicates onto today. |
| 11 | Create a 2nd trip (Trip tab → ＋ New trip), switch between them. | Totals are isolated per trip; active badge moves. |
| 12 | Share tab → Download CSV, open in Excel. | Opens with correct columns and accented text (e.g. “Café”). |
| 13 | Share tab → “Create transfer code”, paste it into “Receive” (or another device). | Trips import via the v2 importer; duplicates are skipped. |
| 14 | Toggle the theme button through auto → light → dark; switch language to Bahasa Indonesia. | Theme + nav/labels update and persist on reload. |
| 15 | DevTools → Network → **Offline**, then reload. | App still loads and works; Share tab shows “Offline ready ✓”. |

### Migration check (do once per release)

Seed a legacy `triptally.v1` key in the console, reload, and confirm the data appears as a single
migrated trip and that `triptally.v1` is **still present** as a backup:

```js
localStorage.setItem("triptally.v1", JSON.stringify({
  version:1,
  trip:{ name:"Legacy", currency:"USD", budget:500 },
  expenses:[{ id:"a", item:"Coffee", amount:4, currency:"USD", category:"food", date:"2026-03-01" }],
  settings:{ theme:"dark" }
}));
localStorage.removeItem("triptally.v2");
location.reload();
```

### Before tagging

- `npm test` green · `npm run lint` clean.
- `sw.js` `CACHE` version bumped since the last release.
- Lighthouse (PWA / performance / accessibility / best-practices) run and regressions fixed.
