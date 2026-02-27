# Signal Atlas — From Mockup to Final Version

## 1) What `Mockup.jsx` is doing now

`Mockup.jsx` is a **UI planning page**. It is not fetching real API data and it is not split into reusable components yet.

It has 5 main parts:

1. **`COLORS` object**
   - Central color constants used by inline styles.
   - Good for quick prototyping.

2. **`pages` array**
   - Defines your 4 conceptual pages (`overview`, `detail`, `map`, `reports`).
   - Each item includes:
     - basic metadata (`title`, `tag`, `description`)
     - `layout` blocks (wireframe sections)
     - `apis` list (what backend endpoints each page will need)

3. **`WireframeBlock` component**
   - Renders one layout box from `layout` data.
   - Used to visually explain the page structure.

4. **`ApiRow` component**
   - Renders one API endpoint row from `apis` data.
   - Helps you plan backend/frontend integration.

5. **`Mockup` main component**
   - Uses `activePage` state to switch tabs.
   - Reads current page config: `const page = pages.find(...)`.
   - Renders header, tabs, wireframe blocks, and API rows.

---

## 2) Why this is great for now

- You already defined **page structure** and **API contracts**.
- You already thought about **data fields** needed per screen.
- This reduces confusion when building the real app.

---

## 3) What to do for the final version (in separate files)

Keep `Mockup.jsx` as your reference, then build the real app in modular files.

### Suggested structure

```txt
src/
  pages/
    DashboardPage.jsx
    SignalsPage.jsx
    SignalDetailsPage.jsx
  components/
    layout/
      AppLayout.jsx
      TopNav.jsx
    dashboard/
      SummaryCards.jsx
      SignalTrendChart.jsx
      OperatorBarChart.jsx
    signals/
      SignalsFilters.jsx
      SignalsTable.jsx
      Pagination.jsx
    details/
      SignalInfoCard.jsx
      MetadataPanel.jsx
      SmallTrendChart.jsx
  data/
    dataService.js
  utils/
    formatters.js
    signalUtils.js
```

---

## 4) Migration map (Mockup → real pages)

- `overview` → `DashboardPage.jsx`
  - Summary cards
  - RSSI line chart
  - Signals per operator bar chart

- `detail` → `SignalDetailsPage.jsx`
  - Device/signal info card
  - Small time-series chart
  - metadata blocks

- `reports` and `map`
  - Optional next phase after MVP

- `signals` page (from your project requirements)
  - Add as `SignalsPage.jsx`
  - Search + filters + paginated table

---

## 5) Data layer rules for final code

In `dataService.js`:

1. Keep one function per endpoint, for example:
   - `getSignals(params)`
   - `getSignalById(id)`
   - `getSignalTrend(id)`

2. Return clean data objects used directly by UI.
3. Keep parsing/normalizing in service layer, not inside page components.
4. Handle errors once in service (throw readable messages).

---

## 6) Styling rules for final code

Current `Mockup.jsx` uses many inline styles (good for mock).
For final version:

- Move to Tailwind classes.
- Keep color tokens in Tailwind theme (or CSS variables).
- Reuse card/table/input classes for consistency.
- Keep dark mode simple (single toggle and `dark` class).

---

## 7) Final MVP order (recommended)

1. Build `AppLayout` + routing.
2. Build `DashboardPage` with static mock data.
3. Build `SignalsPage` filters + table + pagination.
4. Build `SignalDetailsPage` from selected row.
5. Replace mock data with real API calls from `dataService.js`.
6. Add loading + error states.

---

## 8) Simple quality checklist before submission

- Pages are split into reusable components.
- No large page has all logic in one file.
- Charts receive data through props.
- Filters update table correctly.
- Pagination works after filtering.
- Dark mode keeps text readable.
- API errors show user-friendly message.

---

If you want, next step I can generate the three page files + minimal reusable components exactly in this structure so you can keep learning while editing each part yourself.
