# Webapp Demo API (using `/api/mobile/*` for now)

We can finish the demo using the live mobile analytics endpoints.

## Inputs for demo APIs
| Field | Type | Notes |
|-------|------|-------|
| operator | string | Optional filter by operator |
| network_type | string | Optional filter by technology (LTE/NR/...) |
| period | string | `24h` \| `week` \| `month` |
| source | string | `all` \| `measured` \| `prediction` |
| lat | float | Required with `lon` + `radius_km` for geo filter |
| lon | float | Required with `lat` + `radius_km` for geo filter |
| radius_km | float | Required with `lat` + `lon` |
| X-API-Key | header | Required for all requests |

## Required for demo now (Overview + Map)

### 1) Overview aggregates
**GET** `/api/mobile/overview`

Used for:
- Top KPI summary on Overview page

Example response:
```json
{
  "mean_rsrp": -92.4,
  "mean_rsrq": -11.8,
  "coverage_quality_percent": 64.2,
  "measurements_count": 2432,
  "density_score": 0.78
}
```

### 2) Map points
**GET** `/api/mobile/map`

Used for:
- Map markers / heatmap points
- Marker colors by signal quality (`rsrp`, `rsrq`)

Example response:
```json
{
  "points": [
    {
      "latitude": 29.9404,
      "longitude": 31.0674,
      "rsrp": -107,
      "rsrq": -19
    }
  ]
}
```

### 3) Overview trends
**GET** `/api/mobile/trends`

Used for:
- Overview trend chart (mean RSRP / mean RSRQ over time)

Example response:
```json
{
  "points": [
    {
      "timestamp": "2026-03-06T10:00:00Z",
      "mean_rsrp": -94.1,
      "mean_rsrq": -11.3
    },
    {
      "timestamp": "2026-03-06T10:30:00Z",
      "mean_rsrp": -93.4,
      "mean_rsrq": -10.8
    }
  ]
}
```

### 4) Operators list (optional but very useful)
**GET** `/api/mobile/operators/unique`

Used for:
- Filter dropdown population without hardcoding operator names

Example response:
```json
{
  "operators": ["Orange", "Etisalat", "Vodafone"]
}
```

---

## Geo/operator filtering requirement

Please ensure `overview`, `map`, and `trends` all support these query params consistently:
- `operator`
- `network_type`
- `period`
- `source`
- geo filter trio: `lat`, `lon`, `radius_km` (all three required together)

This is needed so we can demo filtering by location/operator/network from the webapp UI.
