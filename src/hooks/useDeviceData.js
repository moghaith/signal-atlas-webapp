import { useState, useEffect, useCallback } from "react";
import {
  getDevicesWithInfo,
  getDeviceReadings,
  getSupabaseDeviceSources,
  getSupabaseDeviceReadings,
  getMobileMap,
  getMobileOperators,
  getMobileOverview,
  getMobileTrends,
} from "../data/dataService";

const ALL_ID = "__all__";
const EGYPT_BOUNDS = {
  minLat: 21.5,
  maxLat: 32.5,
  minLng: 24.0,
  maxLng: 37.0,
};

const OVERVIEW_FALLBACK = {
  mean_rsrp: null,
  mean_rsrq: null,
  median_rsrp: null,
  coverage_quality_percent: null,
  signal_quality_index: null,
  measurements_density: null,
  devices_count: 0,
  detected_cells_count: 0,
  coverage_reliability_score: null,
  total_readings: 0,
};

// ── Per-metric uncertainty config ──────────────────────────────────────────────
// max_expected_error: the uncertainty value at which confidence hits ~0
// These are tuned to your model's expected error range in dB / dBm
const METRIC_UNCERTAINTY_CONFIG = {
  rsrp: { max_expected_error: 8 },   // RSRP uncertainty in dBm
  rsrq: { max_expected_error: 4 },   // RSRQ uncertainty in dB
};

// Confidence levels for display
const CONFIDENCE_LEVELS = [
  { min: 0.85, label: "High",   color: "#22c55e" },
  { min: 0.65, label: "Medium", color: "#f59e0b" },
  { min: 0,    label: "Low",    color: "#ef4444" },
];

function getConfidenceLevel(confidence) {
  if (confidence == null) return null;
  return CONFIDENCE_LEVELS.find((l) => confidence >= l.min) || CONFIDENCE_LEVELS[CONFIDENCE_LEVELS.length - 1];
}

// Compute per-metric confidence from raw uncertainty value
function computeMetricConfidence(uncertaintyValue, metric) {
  const config = METRIC_UNCERTAINTY_CONFIG[metric];
  if (!config) return null;
  const u = toNumber(uncertaintyValue);
  if (u == null) return null;
  // Linear decay: 0 uncertainty → 1.0, max_expected_error → 0.0
  return Math.max(0, Math.min(1, 1 - u / config.max_expected_error));
}

// Combined confidence = harmonic mean of available per-metric confidences
// (harmonic mean punishes low-confidence metrics more than arithmetic mean)
function computeCombinedConfidence(rsrpConf, rsrqConf) {
  const valid = [rsrpConf, rsrqConf].filter((v) => v != null);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];
  const harmonic = valid.length / valid.reduce((sum, v) => sum + 1 / Math.max(v, 0.001), 0);
  return Math.max(0, Math.min(1, harmonic));
}

function isPredictionSource(source) {
  return String(source || "").trim().toLowerCase() === "predicted";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isEgyptRow(row) {
  const lat = toNumber(row?.latitude);
  const lng = toNumber(row?.longitude);
  if (lat == null || lng == null) return false;
  const country = String(row?.country || "").trim().toLowerCase();
  const countryLooksEgypt =
    country === "egypt" || country.includes("egypt") || country.includes("مصر");
  if (countryLooksEgypt) return true;
  return (
    lat >= EGYPT_BOUNDS.minLat &&
    lat <= EGYPT_BOUNDS.maxLat &&
    lng >= EGYPT_BOUNDS.minLng &&
    lng <= EGYPT_BOUNDS.maxLng
  );
}

function estimateAsuFromRsrp(rsrp) {
  if (rsrp == null) return null;
  return Math.max(0, Math.min(97, Math.round((rsrp + 140) / 2)));
}

function estimateLevelFromRsrp(rsrp) {
  if (rsrp == null) return null;
  if (rsrp >= -90) return 4;
  if (rsrp >= -100) return 3;
  if (rsrp >= -110) return 2;
  return 1;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(aLat, aLng, bLat, bLng) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

function assignNearbyUnknownRegions(rows, maxDistanceKm = 25) {
  const regionClusters = new Map();
  for (const row of rows) {
    if (!row.city || row.city === "Unknown city") continue;
    if (row.latitude == null || row.longitude == null) continue;
    const key = row.city;
    const cluster = regionClusters.get(key) || { totalLat: 0, totalLng: 0, count: 0, country: row.country };
    cluster.totalLat += row.latitude;
    cluster.totalLng += row.longitude;
    cluster.count += 1;
    regionClusters.set(key, cluster);
  }

  const centroids = Array.from(regionClusters.entries()).map(([city, cluster]) => ({
    city,
    country: cluster.country,
    latitude: cluster.totalLat / cluster.count,
    longitude: cluster.totalLng / cluster.count,
  }));

  if (centroids.length === 0) return rows;

  return rows.map((row) => {
    if (row.city && row.city !== "Unknown city") return row;
    if (row.latitude == null || row.longitude == null) return row;

    let nearest = null;
    let nearestDistance = Infinity;
    for (const centroid of centroids) {
      const distance = getDistanceKm(row.latitude, row.longitude, centroid.latitude, centroid.longitude);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = centroid;
      }
    }

    if (!nearest || nearestDistance > maxDistanceKm) return row;
    return {
      ...row,
      city: nearest.city,
      country: nearest.country || row.country,
      city_inferred: true,
    };
  });
}

function normalizeRow(row, options = {}) {
  const rsrp = toNumber(row?.rsrp);
  const city = String(row?.city || "").trim() || "Unknown city";
  const country = String(row?.country || "").trim() || "Unknown country";
  const isPrediction = options.isPrediction ?? isPredictionSource(row?.source);

  // Per-metric uncertainty + confidence
  const rsrpUncertainty = toNumber(row?.rsrp_uncertainty);
  const rsrqUncertainty = toNumber(row?.rsrq_uncertainty);
  const rsrpConfidence = isPrediction ? computeMetricConfidence(rsrpUncertainty, "rsrp") : null;
  const rsrqConfidence = isPrediction ? computeMetricConfidence(rsrqUncertainty, "rsrq") : null;
  const combinedConfidence = isPrediction ? computeCombinedConfidence(rsrpConfidence, rsrqConfidence) : null;

  return {
    ...row,
    source: row?.source ?? options.forceSource ?? null,
    is_prediction: isPrediction,
    device_id: row?.device_id || row?.source || null,
    latitude: toNumber(row?.latitude),
    longitude: toNumber(row?.longitude),
    rsrp,
    rsrq: toNumber(row?.rsrq),
    rssi: toNumber(row?.rssi),
    asu: row?.asu ?? estimateAsuFromRsrp(rsrp),
    level: row?.level ?? estimateLevelFromRsrp(rsrp),
    city,
    country,
    region_label: city !== "Unknown city" ? `${city}, ${country}` : country,
    operator: row?.operator || "Unknown operator",
    timestamp: row?.timestamp || row?.created_at || null,
    prediction_source: isPrediction ? row?.source || null : null,

    // Raw uncertainty values
    rsrp_uncertainty: rsrpUncertainty,
    rsrq_uncertainty: rsrqUncertainty,

    // Per-metric confidence (0–1)
    rsrp_confidence: rsrpConfidence,
    rsrq_confidence: rsrqConfidence,

    // Combined confidence (used for opacity / filtering)
    prediction_confidence: combinedConfidence,
  };
}

function periodToMs(period) {
  if (period === "24h") return 24 * 60 * 60 * 1000;
  if (period === "week") return 7 * 24 * 60 * 60 * 1000;
  if (period === "month") return 30 * 24 * 60 * 60 * 1000;
  return null;
}

function trendBucketMs(period) {
  if (period === "24h") return 30 * 60 * 1000;
  if (period === "week") return 60 * 60 * 1000;
  if (period === "month") return 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function trendAggregationLabel(period) {
  if (period === "24h") return "30 minutes";
  if (period === "week") return "hourly";
  if (period === "month") return "daily";
  return "weekly";
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function normalizeRange(value, min, max) {
  if (value == null || max <= min) return null;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function computeOverviewMetrics(rows) {
  if (!rows.length) return OVERVIEW_FALLBACK;

  const rsrpValues = rows.map((row) => toNumber(row.rsrp)).filter((v) => v != null);
  const rsrqValues = rows.map((row) => toNumber(row.rsrq)).filter((v) => v != null);

  const meanRsrp = rsrpValues.length
    ? rsrpValues.reduce((sum, v) => sum + v, 0) / rsrpValues.length
    : null;
  const meanRsrq = rsrqValues.length
    ? rsrqValues.reduce((sum, v) => sum + v, 0) / rsrqValues.length
    : null;

  const coverageQualityPercent = rsrpValues.length
    ? (rsrpValues.filter((v) => v >= -100).length / rsrpValues.length) * 100
    : null;

  const rsrpNorm = normalizeRange(meanRsrp, -120, -70);
  const rsrqNorm = normalizeRange(meanRsrq, -20, -3);
  const signalQualityIndex =
    rsrpNorm != null && rsrqNorm != null ? (rsrpNorm + rsrqNorm) / 2 : null;

  const uniqueCoordinates = new Set(
    rows
      .filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => `${Number(r.latitude).toFixed(5)},${Number(r.longitude).toFixed(5)}`)
  ).size;
  const measurementsDensity = uniqueCoordinates > 0 ? rows.length / uniqueCoordinates : null;

  const devicesCount = new Set(rows.map((r) => r.device_id).filter(Boolean)).size;
  const detectedCellsCount = new Set(rows.map((r) => r.cell_id).filter(Boolean)).size;

  const latestTimestamp = rows
    .map((r) => new Date(r.timestamp || 0).getTime())
    .filter(Number.isFinite)
    .reduce((max, v) => Math.max(max, v), 0);

  const hoursSinceLatest =
    latestTimestamp > 0 ? (Date.now() - latestTimestamp) / (1000 * 60 * 60) : null;
  const freshnessScore =
    hoursSinceLatest == null ? null : Math.max(0, Math.min(1, 1 - hoursSinceLatest / 168));
  const samplesScore = Math.max(0, Math.min(1, rows.length / 500));
  const devicesScore = Math.max(0, Math.min(1, devicesCount / 20));

  const reliabilityParts = [samplesScore, devicesScore, freshnessScore].filter((v) => v != null);
  const coverageReliabilityScore = reliabilityParts.length
    ? reliabilityParts.reduce((sum, v) => sum + v, 0) / reliabilityParts.length
    : null;

  return {
    mean_rsrp: meanRsrp,
    mean_rsrq: meanRsrq,
    median_rsrp: median(rsrpValues),
    coverage_quality_percent: coverageQualityPercent,
    signal_quality_index: signalQualityIndex,
    measurements_density: measurementsDensity,
    devices_count: devicesCount,
    detected_cells_count: detectedCellsCount,
    coverage_reliability_score: coverageReliabilityScore,
    total_readings: rows.length,
  };
}

function buildCitySummaries(rows) {
  const byCity = new Map();
  for (const row of rows) {
    const city = String(row.city || "").trim() || "Unknown city";
    const country = String(row.country || "").trim() || "Unknown country";
    const cityLabel = `${city}, ${country}`;
    const entry = byCity.get(cityLabel) || { city, country, city_label: cityLabel, rows: [] };
    entry.rows.push(row);
    byCity.set(cityLabel, entry);
  }

  return Array.from(byCity.values())
    .map((entry) => {
      const metrics = computeOverviewMetrics(entry.rows);
      return {
        city: entry.city,
        country: entry.country,
        city_label: entry.city_label,
        mean_rsrp: metrics.mean_rsrp,
        mean_rsrq: metrics.mean_rsrq,
        coverage_quality_percent: metrics.coverage_quality_percent,
        measurements_density: metrics.measurements_density,
        devices_count: metrics.devices_count,
        detected_cells_count: metrics.detected_cells_count,
        total_readings: metrics.total_readings,
      };
    })
    .sort((a, b) => (b.total_readings || 0) - (a.total_readings || 0));
}

function aggregateTrendRows(rows, period) {
  const bucketSize = trendBucketMs(period);
  const buckets = new Map();

  for (const row of rows) {
    const ts = new Date(row?.timestamp || 0).getTime();
    if (!Number.isFinite(ts)) continue;
    const bucketStart = Math.floor(ts / bucketSize) * bucketSize;
    const entry = buckets.get(bucketStart) || {
      bucketStart,
      total: 0,
      rsrpGood: 0,
      rsrpSum: 0,
      rsrpCount: 0,
      rsrqSum: 0,
      rsrqCount: 0,
    };
    entry.total += 1;
    if (row?.rsrp != null && Number.isFinite(Number(row.rsrp))) {
      const rsrp = Number(row.rsrp);
      entry.rsrpSum += rsrp;
      entry.rsrpCount += 1;
      if (rsrp >= -100) entry.rsrpGood += 1;
    }
    if (row?.rsrq != null && Number.isFinite(Number(row.rsrq))) {
      entry.rsrqSum += Number(row.rsrq);
      entry.rsrqCount += 1;
    }
    buckets.set(bucketStart, entry);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.bucketStart - b.bucketStart)
    .map((entry) => ({
      timestamp: new Date(entry.bucketStart).toISOString(),
      mean_rsrp: entry.rsrpCount > 0 ? entry.rsrpSum / entry.rsrpCount : null,
      mean_rsrq: entry.rsrqCount > 0 ? entry.rsrqSum / entry.rsrqCount : null,
      coverage_quality_percent:
        entry.rsrpCount > 0 ? (entry.rsrpGood / entry.rsrpCount) * 100 : null,
      total_readings: entry.total,
    }));
}

function filterByPeriod(rows, period) {
  const windowMs = periodToMs(period);
  if (!windowMs) return rows;
  const cutoff = Date.now() - windowMs;
  return rows.filter((row) => {
    const ts = new Date(row.timestamp || 0).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

function buildCountryOptions(rows) {
  const counts = new Map();
  for (const row of rows) {
    const country = String(row?.country || "").trim() ||
                    row.region_label?.split(", ").slice(-1)[0] ||
                    "Unknown country";
    counts.set(country, (counts.get(country) || 0) + 1);
  }
  const options = Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([country, count]) => ({ id: country, label: country, reading_count: count }));
  const total = options.reduce((sum, o) => sum + o.reading_count, 0);
  return options.length > 0
    ? [{ id: ALL_ID, label: "All countries", reading_count: total }, ...options]
    : options;
}

function buildCityOptions(rows, selectedCountry) {
  const source =
    selectedCountry && selectedCountry !== ALL_ID
      ? rows.filter((row) => {
          const country = String(row?.country || "").trim() ||
                          row.region_label?.split(", ").slice(-1)[0] ||
                          "Unknown country";
          return country === selectedCountry;
        })
      : rows;

  const counts = new Map();
  for (const row of source) {
    const city = String(row?.city || "").trim() ||
                 row.region_label?.split(", ")[0] ||
                 "Unknown city";
    counts.set(city, (counts.get(city) || 0) + 1);
  }
  const options = Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([city, count]) => ({ id: city, label: city, reading_count: count }));
  const total = options.reduce((sum, o) => sum + o.reading_count, 0);
  return options.length > 0
    ? [{ id: ALL_ID, label: "All cities", reading_count: total }, ...options]
    : options;
}

function resolveCountry(row) {
  return (
    String(row?.country || "").trim() ||
    row.region_label?.split(", ").slice(-1)[0] ||
    "Unknown country"
  );
}

function resolveCity(row) {
  return (
    String(row?.city || "").trim() ||
    row.region_label?.split(", ")[0] ||
    "Unknown city"
  );
}

function filterByCountry(rows, selectedCountry) {
  if (!selectedCountry || selectedCountry === ALL_ID) return rows;
  return rows.filter((row) => resolveCountry(row) === selectedCountry);
}

function filterByCity(rows, selectedCity) {
  if (!selectedCity || selectedCity === ALL_ID) return rows;
  return rows.filter((row) => resolveCity(row) === selectedCity);
}

export default function useDeviceData(apiMode = "device") {
  const effectiveApiMode = apiMode === "mobile" ? "supabase" : apiMode;

  const [devices, setDevices] = useState([]);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(ALL_ID);
  const [selectedCity, setSelectedCity] = useState(ALL_ID);
  const [regions, setRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [operators, setOperators] = useState([]);
  const [networkTypes, setNetworkTypes] = useState([]);
  const [selectedOperator, setSelectedOperator] = useState("all");
  const [selectedNetworkType, setSelectedNetworkType] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [dataSourceMode, setDataSourceMode] = useState("crowdsourced");
  const [predictionConfidenceMin, setPredictionConfidenceMin] = useState(0);

  const [latestReading, setLatestReading] = useState(null);
  const [readings, setReadings] = useState([]);
  const [trendPoints, setTrendPoints] = useState([]);
  const [overviewMetrics, setOverviewMetrics] = useState(OVERVIEW_FALLBACK);
  const [citySummaries, setCitySummaries] = useState([]);
  const [mapPoints, setMapPoints] = useState([]);
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [predictionPoints, setPredictionPoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const [loading, setLoading] = useState(true);
  const [readingsError, setReadingsError] = useState(null);
  const [error, setError] = useState(null);

  const handleSetSelectedCountry = useCallback((country) => {
    setSelectedCountry(country);
    setSelectedCity(ALL_ID);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReadingsError(null);

    try {
      if (effectiveApiMode === "mobile") {
        const periodMap = { "24h": "day", week: "week", month: "month", all: "all" };

        const operatorList = await getMobileOperators();
        const operatorOptions = [
          { id: "all", label: "All operators" },
          ...(operatorList || []).map((op) => ({ id: op, label: op })),
        ];
        setOperators(operatorOptions);

        const validOperator = operatorOptions.some((o) => o.id === selectedOperator)
          ? selectedOperator
          : "all";
        setSelectedOperator(validOperator);

        const mobileFilters = {
          period: periodMap[selectedPeriod] || "all",
          source: "all",
          ...(validOperator !== "all" ? { operator: validOperator } : {}),
        };

        const [overview, trends, map] = await Promise.all([
          getMobileOverview(mobileFilters),
          getMobileTrends(mobileFilters),
          getMobileMap(mobileFilters),
        ]);

        const normalizedMap = (map || [])
          .map((point, index) =>
            normalizeRow({
              ...point,
              device_id: point.device_id || `mobile-point-${index + 1}`,
              operator: point.operator || (validOperator !== "all" ? validOperator : "Mixed"),
              city: "Mobile",
              country: "Data",
            })
          )
          .filter((p) => p.latitude != null && p.longitude != null);

        const normalizedReadings = (trends || []).map((row) => {
          const rsrp = toNumber(row.rsrp);
          return normalizeRow({
            timestamp: row.timestamp,
            rsrp,
            rssi: toNumber(row.rssi),
            rsrq: toNumber(row.rsrq),
            asu: estimateAsuFromRsrp(rsrp),
            level: estimateLevelFromRsrp(rsrp),
            latitude: normalizedMap[0]?.latitude ?? null,
            longitude: normalizedMap[0]?.longitude ?? null,
            operator: validOperator !== "all" ? validOperator : "Mixed",
            city: "Mobile",
            country: "Data",
          });
        });

        const fallbackRsrp = toNumber(
          overview?.mean_rsrp ?? overview?.avg_rsrp ?? overview?.rsrp
        );
        const latest =
          normalizedReadings[normalizedReadings.length - 1] ||
          normalizeRow({
            timestamp:
              overview?.last_timestamp ||
              normalizedMap[0]?.timestamp ||
              new Date().toISOString(),
            rsrp: fallbackRsrp,
            rssi: null,
            rsrq: toNumber(overview?.mean_rsrq ?? overview?.avg_rsrq ?? overview?.rsrq),
            asu: estimateAsuFromRsrp(fallbackRsrp),
            level: estimateLevelFromRsrp(fallbackRsrp),
            latitude: normalizedMap[0]?.latitude ?? null,
            longitude: normalizedMap[0]?.longitude ?? null,
            operator: validOperator !== "all" ? validOperator : "Mixed",
            city: "Mobile",
            country: "Data",
          });

        const mobileCountry = [{ id: ALL_ID, label: "All countries", reading_count: normalizedMap.length }];
        const mobileCity = [{ id: ALL_ID, label: "All cities", reading_count: normalizedMap.length }];
        setCountries(mobileCountry);
        setCities(mobileCity);
        setSelectedCountry(ALL_ID);
        setSelectedCity(ALL_ID);
        setRegions([{ id: "Mobile, Data", label: "Mobile, Data" }]);
        setSelectedRegion("Mobile, Data");
        setDevices([]);

        setLatestReading(latest);
        setReadings(normalizedReadings);
        setTrendPoints(aggregateTrendRows(normalizedReadings, selectedPeriod));
        setMapPoints(normalizedMap);
        setHeatmapPoints(normalizedMap);
        setPredictionPoints([]);
        setSelectedPoint(normalizedMap[0] || null);
        return;
      }

      const loadDevices =
        effectiveApiMode === "supabase" ? getSupabaseDeviceSources : getDevicesWithInfo;
      const loadReadings =
        effectiveApiMode === "supabase" ? getSupabaseDeviceReadings : getDeviceReadings;

      const devicesData = await loadDevices();
      setDevices(devicesData || []);

      const regularDevices = (devicesData || []).filter(
        (d) => d?.device_id && !isPredictionSource(d.device_id)
      );
      const denseReadingsLimit = effectiveApiMode === "supabase" ? 20000 : 1000;

      const regularHistories = await Promise.all(
        regularDevices.map((device) =>
          loadReadings(device.device_id, denseReadingsLimit).catch(() => [])
        )
      );

      const regularRows = regularHistories
        .flat()
        .map((row) => normalizeRow(row, { isPrediction: false }))
        .filter((row) => row?.latitude != null && row?.longitude != null && row?.timestamp)
        .filter(isEgyptRow);

      const predictionHistory = await Promise.all([
        loadReadings("predicted", denseReadingsLimit).catch(() => [])
      ]);

      const rawPredictionRows = predictionHistory
        .flat()
        .map((row) =>
          normalizeRow({
            ...row,
            source: "predicted",
          }, { isPrediction: true })
        );

      const periodRegular = filterByPeriod(regularRows, selectedPeriod);
      const periodPredictions = filterByPeriod(rawPredictionRows, selectedPeriod);
      const periodCombined = assignNearbyUnknownRegions([
        ...periodRegular,
        ...periodPredictions,
      ]);
      const scopedRegular = periodCombined.filter(
        (row) => !isPredictionSource(row.source)
      );
      const scopedPredictions = periodCombined.filter(
        (row) => isPredictionSource(row.source)
      );

      let rowsForOptions = scopedRegular;
      if (dataSourceMode === "predicted") rowsForOptions = scopedPredictions;
      else if (dataSourceMode === "both") rowsForOptions = periodCombined;

      const countryOptions = buildCountryOptions(rowsForOptions);
      setCountries(countryOptions);

      const validCountry = countryOptions.some((c) => c.id === selectedCountry)
        ? selectedCountry
        : countryOptions[0]?.id || ALL_ID;

      const cityOptions = buildCityOptions(rowsForOptions, validCountry);
      setCities(cityOptions);

      const validCity = cityOptions.some((c) => c.id === selectedCity)
        ? selectedCity
        : ALL_ID;

      const regionMap = new Map();
      for (const row of rowsForOptions) {
        const key = row.region_label;
        const entry = regionMap.get(key) || { id: key, label: key, reading_count: 0 };
        entry.reading_count += 1;
        regionMap.set(key, entry);
      }
      const regionOptions = Array.from(regionMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label)
      );
      const total = regionOptions.reduce((sum, o) => sum + (o.reading_count || 0), 0);
      const regionOptionsWithAll =
        regionOptions.length > 0
          ? [{ id: ALL_ID, label: "All regions", reading_count: total }, ...regionOptions]
          : regionOptions;
      setRegions(regionOptionsWithAll);
      const validRegion = regionOptionsWithAll.some((r) => r.id === selectedRegion)
        ? selectedRegion
        : regionOptionsWithAll[0]?.id || "";
      setSelectedRegion(validRegion);

      const applyGeoFilter = (rows) => filterByCity(filterByCountry(rows, validCountry), validCity);

      const geoRegular = applyGeoFilter(scopedRegular);
      const geoPredictions = applyGeoFilter(scopedPredictions);

      const networkTypeSet = new Set(
        [...geoRegular, ...geoPredictions].map(
          (row) => String(row.network_type || "Unknown network").trim() || "Unknown network"
        )
      );
      const networkTypeOptions = [
        { id: "all", label: "All network types" },
        ...Array.from(networkTypeSet)
          .sort((a, b) => a.localeCompare(b))
          .map((nt) => ({ id: nt, label: nt })),
      ];
      setNetworkTypes(networkTypeOptions);

      const validNetworkType = networkTypeOptions.some((o) => o.id === selectedNetworkType)
        ? selectedNetworkType
        : "all";
      setSelectedNetworkType(validNetworkType);

      const ntFilter = (rows) =>
        validNetworkType === "all"
          ? rows
          : rows.filter(
              (row) =>
                (String(row.network_type || "Unknown network").trim() || "Unknown network") ===
                validNetworkType
            );

      const ntRegular = ntFilter(geoRegular);
      const ntPredictions = ntFilter(geoPredictions);

      const operatorSet = new Set(
        [...ntRegular, ...ntPredictions].map((row) => row.operator).filter(Boolean)
      );
      const operatorOptions = [
        { id: "all", label: "All operators" },
        ...Array.from(operatorSet)
          .sort((a, b) => a.localeCompare(b))
          .map((op) => ({ id: op, label: op })),
      ];
      setOperators(operatorOptions);

      const validOperator = operatorOptions.some((o) => o.id === selectedOperator)
        ? selectedOperator
        : "all";
      setSelectedOperator(validOperator);

      const opFilter = (rows) =>
        validOperator === "all" ? rows : rows.filter((row) => row.operator === validOperator);

      const opRegularAll = opFilter(
        validNetworkType === "all"
          ? applyGeoFilter(scopedRegular)
          : applyGeoFilter(scopedRegular).filter(
              (row) =>
                (String(row.network_type || "Unknown network").trim() || "Unknown network") ===
                validNetworkType
            )
      );

      const opPredictionsBase = opFilter(
        validNetworkType === "all"
          ? applyGeoFilter(scopedPredictions)
          : applyGeoFilter(scopedPredictions).filter(
              (row) =>
                (String(row.network_type || "Unknown network").trim() || "Unknown network") ===
                validNetworkType
            )
      );

      const opPredictionsAll =
        predictionConfidenceMin > 0
          ? opPredictionsBase.filter(
              (row) =>
                row.prediction_confidence != null &&
                row.prediction_confidence >= predictionConfidenceMin
            )
          : opPredictionsBase;

      let effectiveRowsAll = opRegularAll;
      if (dataSourceMode === "predicted") effectiveRowsAll = opPredictionsAll;
      else if (dataSourceMode === "both") effectiveRowsAll = [...opRegularAll, ...opPredictionsAll];

      setPredictionPoints(opPredictionsAll);
      setHeatmapPoints(effectiveRowsAll);

      const latestByDevice = new Map();
      for (const row of effectiveRowsAll) {
        const did = row.device_id || "unknown-device";
        const existing = latestByDevice.get(did);
        if (!existing || new Date(row.timestamp) > new Date(existing.timestamp)) {
          latestByDevice.set(did, row);
        }
      }
      setMapPoints(Array.from(latestByDevice.values()));

      const history = [...effectiveRowsAll].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
      const latest = history[history.length - 1] || null;

      setLatestReading(latest);
      setReadings(history.slice(-250));
      setTrendPoints(aggregateTrendRows(history, selectedPeriod));
      setOverviewMetrics(computeOverviewMetrics(effectiveRowsAll));
      setCitySummaries(buildCitySummaries(effectiveRowsAll));
      setSelectedPoint(Array.from(latestByDevice.values())[0] || latest || null);
    } catch (err) {
      setDevices([]);
      setCountries([]);
      setCities([]);
      setRegions([]);
      setOperators([]);
      setNetworkTypes([]);
      setSelectedCountry(ALL_ID);
      setSelectedCity(ALL_ID);
      setSelectedRegion("");
      setSelectedOperator("all");
      setSelectedNetworkType("all");
      setLatestReading(null);
      setReadings([]);
      setTrendPoints([]);
      setOverviewMetrics(OVERVIEW_FALLBACK);
      setCitySummaries([]);
      setMapPoints([]);
      setHeatmapPoints([]);
      setPredictionPoints([]);
      setError(err.message || "Failed to load data from server API");
    } finally {
      setLoading(false);
    }
  }, [
    effectiveApiMode,
    selectedCountry,
    selectedCity,
    selectedOperator,
    selectedNetworkType,
    selectedPeriod,
    dataSourceMode,
    predictionConfidenceMin,
    selectedRegion,
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedRegionInfo = regions.find((r) => r.id === selectedRegion) || null;

  const setSelectedFromMap = useCallback((point) => {
    setSelectedPoint(point);
  }, []);

  return {
    devices,
    countries,
    cities,
    selectedCountry,
    setSelectedCountry: handleSetSelectedCountry,
    selectedCity,
    setSelectedCity,
    regions,
    selectedRegion,
    setSelectedRegion,
    operators,
    networkTypes,
    selectedOperator,
    setSelectedOperator,
    selectedNetworkType,
    setSelectedNetworkType,
    selectedPeriod,
    setSelectedPeriod,
    dataSourceMode,
    setDataSourceMode,
    predictionConfidenceMin,
    setPredictionConfidenceMin,
    selectedRegionInfo,
    latestReading,
    readings,
    trendPoints,
    trendAggregationLabel: trendAggregationLabel(selectedPeriod),
    overviewMetrics,
    citySummaries,
    mapPoints,
    heatmapPoints,
    predictionPoints,
    selectedPoint,
    setSelectedPoint: setSelectedFromMap,
    loading,
    error,
    readingsError,
    refresh,
    // Export helpers so MapPage can use them for display
    getConfidenceLevel,
  };
}

export { getConfidenceLevel, CONFIDENCE_LEVELS };
