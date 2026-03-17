# Signal Atlas — Real App Adapter Guide

This guide explains what was implemented to make the live app behave like the mockup wireframe while handling unstable backend routes.

## What was done

### 1) Unified data adapter (device-first + mobile fallback)
The app now tries **device endpoints first** (the wireframe contract), and if they fail, it automatically switches to **mobile analytics fallback**.

- Device-first path:
  - `GET /api/devices`
  - `GET /api/readings/latest?device_id=...`
  - `GET /api/readings/history?device_id=...&limit=...`
  - `GET /api/readings/locations`
- Fallback path:
  - `GET /api/mobile/map`
  - `GET /api/mobile/overview`
  - `GET /api/mobile/trends`

Implemented in:
- `src/data/dataService.js`
- `src/hooks/useDeviceData.js`

---

### 2) Normalized UI model for mockup sections
To keep the wireframe layout always filled (cards + device panel + charts + map), mobile responses are normalized to the same shape as device readings.

Example normalized model used by the UI:

```js
{
  timestamp,
  rsrp,
  rssi,
  rsrq,
  asu,
  level,
  operator,
  network_type,
  latitude,
  longitude
}
```

If mobile overview does not provide ASU/level, they are derived from RSRP to keep cards and charts populated.

---

### 3) Overview page behavior
`OverviewPage` now:
- Renders normal cards/charts from device data when available.
- Renders the same cards/charts from normalized mobile analytics fallback when device routes are unavailable.
- Shows a small info banner when fallback mode is active.

Implemented in:
- `src/pages/OverviewPage.jsx`

---

### 4) Real map with Leaflet + fallback points
`MapPage` now uses a true Leaflet map and works for both data modes:
- Device map points from locations endpoint.
- Mobile points fallback when device endpoints fail.

Implemented in:
- `src/pages/MapPage.jsx`
- `src/pages/MapPage.css`
- `src/main.jsx` (Leaflet CSS import)

---

### 5) Runtime verification
Build status after changes:

```bash
npm run build
# ✅ success
```

---

## Key code sections

### A) Device-first with fallback endpoint variants
From `src/data/dataService.js`:

```js
export async function getLatestReading(deviceId) {
  const encoded = encodeURIComponent(deviceId)
  const result = await tryEndpoints([
    `/api/readings/latest?device_id=${encoded}`,
    `/api/network-data/${encoded}?limit=1&offset=0`,
  ])
  return Array.isArray(result) ? result[0] || null : result || null
}
```

### B) Unified fallback load in hook
From `src/hooks/useDeviceData.js`:

```js
const loadMobileFallback = useCallback(async () => {
  const [mobilePointsRaw, mobileOverview, mobileTrends] = await Promise.all([
    getMobileMap({ period: "week", source: "all" }),
    getMobileOverview({ period: "week", source: "all" }),
    getMobileTrends({ period: "week", source: "all" }),
  ]);
  // normalize to UI reading shape here
}, []);
```

### C) Source-awareness in pages
Pages use `dataSource` from the hook to show fallback banner and handle map filtering correctly.

---

## Env variables required

Create/update `.env.local`:

```env
VITE_API_URL=https://sa.agentraeg.com
VITE_API_KEY=YOUR_API_KEY
```

> Note: in a Vite frontend, `VITE_*` values are visible client-side. For production, move API key usage to a backend proxy/BFF.

---

## Final result

The live app now follows the mockup wireframe behavior with resilient data loading:
- Overview cards + device panel + charts remain functional.
- Map works with real Leaflet and real coordinates.
- Backend route mismatches no longer break the whole UI.
