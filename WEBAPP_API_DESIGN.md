# Webapp API Design

## DB Schema (`device_readings` table)

| Column | Type | Example |
|--------|------|---------|
| id | BigInteger (PK) | 1300 |
| device_id | String(50) | `3a0d6425e3f9d60e` |
| timestamp | DateTime | `2025-12-15 10:30:28` |
| latitude | Float | 29.9422 |
| longitude | Float | 31.0659 |
| level | Integer | 1 |
| asu | Integer | 32 |
| rsrp | Integer | -108 |
| rssi | Integer | -89 |
| dbm | Integer | -108 |
| rsrq | Integer | -19 |
| network_type | String(20) | `LTE` |
| operator | String(100) | `Vodafone` |
| cell_id | String(100) | `-` |
| physical_cell_id | Integer | 103 |
| tracking_area_code | Integer | 21320 |
| created_at | DateTime | `2025-12-15 10:30:28.248` |

---

## Common Input Parameters

| Field | Type | Notes |
|-------|------|-------|
| country | String (optional) | e.g., `Egypt` |
| city | String (optional) | e.g., `Cairo`, `Giza`, `Alexandria` |
| operator | String (optional) | e.g., `Vodafone`, `Orange`, `Etisalat`, `WE` |
| network_type | String (default: `LTE`) | `LTE` \| `HSPA+` \| `5G` \| `3G` |
| period | String (default: `week`) | `24h` \| `week` \| `month` \| `all` |
| source | String (default: `all`) | `device_ids` \| `prediction` \| `all` |

---

## `GET /api/devices`

> Already exists on backend.

```json
[
  {
    "device_id": "3a0d6425e3f9d60e",
    "last_reading": "2025-12-15T10:30:28Z",
    "reading_count": 1216
  },
  {
    "device_id": "5476990e5eb3c2c7",
    "last_reading": "2025-12-04T07:12:00Z",
    "reading_count": 52
  }
]
```

---

## `GET /api/webapp/overview`

```json
{
  "mean_rsrp": -105.3,
  "mean_rsrq": -17.2,
  "median_rsrp": -107.0,
  "coverage_quality_percent": 18.4,
  "signal_quality_index": 0.31,
  "measurements_density": 8.7,
  "devices_count": 4,
  "detected_cells_count": 12,
  "coverage_reliability_score": 0.62,
  "total_readings": 1300
}
```

- **Coverage Quality %** = good readings / total readings (RSRP > -100 dBm)
- **Signal Quality Index** = weighted normalized RSRP + RSRQ (0–1)
- **Coverage Reliability Score** = f(samples, devices, time freshness) (0–1)
- **Measurements Density** = samples / area in km²

---

## `GET /api/webapp/cities`

Used when no specific city is selected.

```json
{
  "cities": [
    {
      "city": "Cairo",
      "country": "Egypt",
      "mean_rsrp": -103.8,
      "mean_rsrq": -16.5,
      "coverage_quality_percent": 22.1,
      "measurements_density": 12.3,
      "devices_count": 3,
      "detected_cells_count": 8
    },
    {
      "city": "Giza",
      "country": "Egypt",
      "mean_rsrp": -108.4,
      "mean_rsrq": -18.9,
      "coverage_quality_percent": 11.6,
      "measurements_density": 5.4,
      "devices_count": 2,
      "detected_cells_count": 4
    }
  ]
}
```

---

## `GET /api/webapp/map`

Points aggregated by H3 hexagonal cells (resolution ~9).

```json
{
  "points": [
    {
      "latitude": 29.9404,
      "longitude": 31.0674,
      "rsrp": -107,
      "rsrq": -19,
      "measurements_density": 15.2,
      "h3_index": "8a30e1c4a67ffff"
    },
    {
      "latitude": 29.9422,
      "longitude": 31.0659,
      "rsrp": -109,
      "rsrq": -20,
      "measurements_density": 9.8,
      "h3_index": "8a30e1c4a6fffff"
    }
  ]
}
```

---

## `GET /api/webapp/trend`

**Additional parameter:**

| Field | Type | Notes |
|-------|------|-------|
| aggregation | String (auto) | `30min` \| `hourly` \| `daily` \| `weekly` |

| Period | Default Aggregation |
|--------|-------------------|
| 24h | 30 Minutes |
| week | Hourly |
| month | Daily |
| all | Weekly |

```json
{
  "aggregation": "hourly",
  "points": [
    {
      "timestamp": "2025-12-15T09:00:00Z",
      "mean_rsrp": -107.2,
      "mean_rsrq": -19.1,
      "coverage_quality_percent": 15.3
    },
    {
      "timestamp": "2025-12-15T10:00:00Z",
      "mean_rsrp": -108.8,
      "mean_rsrq": -19.5,
      "coverage_quality_percent": 12.8
    }
  ]
}
```

---

## `GET /api/webapp/comparison`

**Replaces common country/city with:**

| Field | Type | Notes |
|-------|------|-------|
| country_a | String (required) | e.g., `Egypt` |
| city_a | String (optional) | e.g., `Cairo` |
| country_b | String (required) | e.g., `Egypt` |
| city_b | String (optional) | e.g., `Giza` |

```json
{
  "region_a": {
    "country": "Egypt",
    "city": "Cairo",
    "overview": {
      "mean_rsrp": -103.8,
      "mean_rsrq": -16.5,
      "coverage_quality_percent": 22.1,
      "measurements_density": 12.3,
      "devices_count": 3,
      "detected_cells_count": 8
    },
    "cities": null,
    "trend": [
      {
        "timestamp": "2025-12-15T09:00:00Z",
        "mean_rsrp": -104.1,
        "mean_rsrq": -16.8,
        "coverage_quality_percent": 21.5
      }
    ]
  },
  "region_b": {
    "country": "Egypt",
    "city": "Giza",
    "overview": {
      "mean_rsrp": -108.4,
      "mean_rsrq": -18.9,
      "coverage_quality_percent": 11.6,
      "measurements_density": 5.4,
      "devices_count": 2,
      "detected_cells_count": 4
    },
    "cities": null,
    "trend": [
      {
        "timestamp": "2025-12-15T09:00:00Z",
        "mean_rsrp": -108.0,
        "mean_rsrq": -18.6,
        "coverage_quality_percent": 12.2
      }
    ]
  }
}
```

When no city is selected → `cities` is populated, `overview` aggregates the whole country.
When a city is selected → `cities` is null.

---

## `GET /api/webapp/distribution`

```json
{
  "rsrp": {
    "histogram": [
      { "bin_start": -120, "bin_end": -115, "count": 18 },
      { "bin_start": -115, "bin_end": -110, "count": 245 },
      { "bin_start": -110, "bin_end": -105, "count": 512 },
      { "bin_start": -105, "bin_end": -100, "count": 389 },
      { "bin_start": -100, "bin_end": -95, "count": 98 },
      { "bin_start": -95, "bin_end": -90, "count": 12 }
    ],
    "box_plot": {
      "min": -120,
      "q1": -110,
      "median": -107,
      "q3": -103,
      "max": -89,
      "outliers": [-122, -85]
    },
    "stats": {
      "mean": -105.3,
      "median": -107.0,
      "std_dev": 5.8,
      "skewness": 0.32,
      "min": -122,
      "max": -85
    }
  },
  "rsrq": {
    "histogram": [
      { "bin_start": -22, "bin_end": -20, "count": 420 },
      { "bin_start": -20, "bin_end": -18, "count": 380 },
      { "bin_start": -18, "bin_end": -16, "count": 195 },
      { "bin_start": -16, "bin_end": -14, "count": 112 },
      { "bin_start": -14, "bin_end": -12, "count": 68 },
      { "bin_start": -12, "bin_end": -10, "count": 25 }
    ],
    "box_plot": {
      "min": -22,
      "q1": -20,
      "median": -19,
      "q3": -17,
      "max": -10,
      "outliers": [-8]
    },
    "stats": {
      "mean": -17.2,
      "median": -19.0,
      "std_dev": 3.1,
      "skewness": 0.45,
      "min": -22,
      "max": -8
    }
  }
}
```

---

## Summary

| Endpoint | Purpose |
|----------|---------|
| `GET /api/devices` | List registered devices (exists) |
| `GET /api/webapp/overview` | Aggregate KPIs |
| `GET /api/webapp/cities` | Per-city breakdown for charts & table |
| `GET /api/webapp/map` | H3-aggregated points for heatmap |
| `GET /api/webapp/trend` | Time series with auto-aggregation |
| `GET /api/webapp/comparison` | Side-by-side regional comparison |
| `GET /api/webapp/distribution` | Histogram, box plot, stats |
