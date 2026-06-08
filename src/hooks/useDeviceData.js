import { useState, useEffect, useCallback, useRef } from "react";
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

const PREDICTION_SOURCE_NAMES = String(
  import.meta.env.VITE_PREDICTION_SOURCE_NAMES || import.meta.env.VITE_PREDICTION_DEVICE_ID || "DKL"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const ALL_REGIONS_ID = "__all__";
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

function isPredictionSource(source) {
  if (!source) return false;
  return PREDICTION_SOURCE_NAMES.includes(String(source).trim());
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
  const countryLooksEgypt = country === "egypt" || country.includes("egypt") || country.includes("مصر");
  if (countryLooksEgypt) return true;

  return (
    lat >= EGYPT_BOUNDS.minLat
    && lat <= EGYPT_BOUNDS.maxLat
    && lng >= EGYPT_BOUNDS.minLng
    && lng <= EGYPT_BOUNDS.maxLng
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

function getRegionLabel(row) {
  const city = String(row?.city || "").trim();
  const country = String(row?.country || "").trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return "Unknown region";
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
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

function assignNearbyUnknownRegions(rows, maxDistanceKm = 25) {
  const regionClusters = new Map();

  for (const row of rows) {
    if (row.region_label === "Unknown region") continue;
    if (row.latitude == null || row.longitude == null) continue;

    const cluster = regionClusters.get(row.region_label) || { totalLat: 0, totalLng: 0, count: 0 };
    cluster.totalLat += row.latitude;
    cluster.totalLng += row.longitude;
    cluster.count += 1;
    regionClusters.set(row.region_label, cluster);
  }

  const regionCentroids = Array.from(regionClusters.entries())
    .map(([label, cluster]) => ({
      label,
      latitude: cluster.totalLat / cluster.count,
      longitude: cluster.totalLng / cluster.count,
    }));

  if (regionCentroids.length === 0) return rows;

  return rows.map((row) => {
    if (row.region_label !== "Unknown region") return row;
    if (row.latitude == null || row.longitude == null) return row;

    let nearest = null;
    let nearestDistance = Infinity;

    for (const centroid of regionCentroids) {
      const distance = getDistanceKm(row.latitude, row.longitude, centroid.latitude, centroid.longitude);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = centroid;
      }
    }

    if (!nearest || nearestDistance > maxDistanceKm) return row;
    return {
      ...row,
      region_label: nearest.label,
      region_label_source: "inferred",
    };
  });
}

function normalizeConfidence(value) {
  const num = toNumber(value);
  if (num == null) return null;
  if (num > 1 && num <= 100) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function getPredictionConfidence(row) {
  return normalizeConfidence(
    row?.prediction_confidence ?? row?.confidence ?? row?.confidence_score ?? row?.model_confidence
  );
}

function signalToNumber(value) {
  const num = toNumber(value);
  return num === 0 ? null : num;
}

function normalizeRow(row, options = {}) {
  const rsrp = signalToNumber(row?.rsrp);
  const isPrediction = Boolean(options.isPrediction);
  return {
    ...row,
    device_id: row?.device_id || row?.source || null,
    latitude: toNumber(row?.latitude),
    longitude: toNumber(row?.longitude),
    rsrp,
    rsrq: signalToNumber(row?.rsrq),
    rssi: signalToNumber(row?.rssi),
    dbm: signalToNumber(row?.dbm),
    asu: row?.asu ?? estimateAsuFromRsrp(rsrp),
    level: row?.level ?? estimateLevelFromRsrp(rsrp),
    region_label: getRegionLabel(row),
    operator: row?.operator || "Unknown operator",
    timestamp: row?.timestamp || row?.created_at || null,
    is_prediction: isPrediction,
    prediction_source: isPrediction ? row?.source || null : null,
    prediction_confidence: isPrediction ? getPredictionConfidence(row) : null,
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
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function normalizeRange(value, min, max) {
  if (value == null || max <= min) return null;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function computeOverviewMetrics(rows) {
  if (!rows.length) return OVERVIEW_FALLBACK;

  const rsrpValues = rows
    .map((row) => toNumber(row.rsrp))
    .filter((value) => value != null);
  const rsrqValues = rows
    .map((row) => toNumber(row.rsrq))
    .filter((value) => value != null);

  const meanRsrp = rsrpValues.length
    ? rsrpValues.reduce((sum, value) => sum + value, 0) / rsrpValues.length
    : null;
  const meanRsrq = rsrqValues.length
    ? rsrqValues.reduce((sum, value) => sum + value, 0) / rsrqValues.length
    : null;

  const coverageQualityPercent = rsrpValues.length
    ? (rsrpValues.filter((value) => value >= -100).length / rsrpValues.length) * 100
    : null;

  const rsrpNorm = normalizeRange(meanRsrp, -120, -70);
  const rsrqNorm = normalizeRange(meanRsrq, -20, -3);
  const signalQualityIndex = rsrpNorm != null && rsrqNorm != null
    ? (rsrpNorm + rsrqNorm) / 2
    : null;

  const uniqueCoordinates = new Set(
    rows
      .filter((row) => row.latitude != null && row.longitude != null)
      .map((row) => `${Number(row.latitude).toFixed(5)},${Number(row.longitude).toFixed(5)}`)
  ).size;
  const measurementsDensity = uniqueCoordinates > 0
    ? rows.length / uniqueCoordinates
    : null;

  const devicesCount = new Set(
    rows
      .map((row) => row.device_id)
      .filter(Boolean)
  ).size;

  const detectedCellsCount = new Set(
    rows
      .map((row) => row.cell_id)
      .filter(Boolean)
  ).size;

  const latestTimestamp = rows
    .map((row) => new Date(row.timestamp || 0).getTime())
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0);

  const hoursSinceLatest = latestTimestamp > 0
    ? (Date.now() - latestTimestamp) / (1000 * 60 * 60)
    : null;
  const freshnessScore = hoursSinceLatest == null
    ? null
    : Math.max(0, Math.min(1, 1 - (hoursSinceLatest / 168)));
  const samplesScore = Math.max(0, Math.min(1, rows.length / 500));
  const devicesScore = Math.max(0, Math.min(1, devicesCount / 20));

  const reliabilityParts = [samplesScore, devicesScore, freshnessScore].filter((value) => value != null);
  const coverageReliabilityScore = reliabilityParts.length
    ? reliabilityParts.reduce((sum, value) => sum + value, 0) / reliabilityParts.length
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
    const country = String(row.country || "").trim() || "Egypt";
    const cityLabel = `${city}, ${country}`;
    const entry = byCity.get(cityLabel) || {
      city,
      country,
      city_label: cityLabel,
      rows: [],
    };
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
      const rsrq = Number(row.rsrq);
      entry.rsrqSum += rsrq;
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
      coverage_quality_percent: entry.rsrpCount > 0 ? (entry.rsrpGood / entry.rsrpCount) * 100 : null,
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

export default function useDeviceData(apiMode = "device") {
  const effectiveApiMode = apiMode === "mobile" ? "supabase" : apiMode;

  const [devices, setDevices] = useState([]);
  const [regions, setRegions] = useState([]);
  const [operators, setOperators] = useState([]);
  const [networkTypes, setNetworkTypes] = useState([]);

  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedOperator, setSelectedOperator] = useState("all");
  const [selectedNetworkType, setSelectedNetworkType] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [dataSourceMode, setDataSourceMode] = useState("crowdsourced");
  const [predictionConfidenceMin, setPredictionConfidenceMin] = useState(0);

  const regionRef = useRef(selectedRegion);
  const operatorRef = useRef(selectedOperator);
  const networkTypeRef = useRef(selectedNetworkType);
  const periodRef = useRef(selectedPeriod);
  const dataSourceRef = useRef(dataSourceMode);
  const confidenceRef = useRef(predictionConfidenceMin);

  regionRef.current = selectedRegion;
  operatorRef.current = selectedOperator;
  networkTypeRef.current = selectedNetworkType;
  periodRef.current = selectedPeriod;
  dataSourceRef.current = dataSourceMode;
  confidenceRef.current = predictionConfidenceMin;

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

  const refresh = useCallback(async () => {
    const curRegion = regionRef.current;
    const curOperator = operatorRef.current;
    const curNetworkType = networkTypeRef.current;
    const curPeriod = periodRef.current;
    const curDataSource = dataSourceRef.current;
    const curConfidence = confidenceRef.current;

    setLoading(true);
    setError(null);
    setReadingsError(null);

    try {
      if (effectiveApiMode === "mobile") {
        const periodMap = {
          "24h": "day",
          week: "week",
          month: "month",
          all: "all",
        };

        const operatorList = await getMobileOperators();
        const operatorOptions = [
          { id: "all", label: "All operators" },
          ...(operatorList || []).map((operator) => ({ id: operator, label: operator })),
        ];
        setOperators(operatorOptions);

        const validOperator = operatorOptions.some((o) => o.id === curOperator)
          ? curOperator
          : "all";
        setSelectedOperator(validOperator);

        const mobileFilters = {
          period: periodMap[curPeriod] || "all",
          source: "all",
          ...(validOperator !== "all" ? { operator: validOperator } : {}),
        };

        const [overview, trends, map] = await Promise.all([
          getMobileOverview(mobileFilters),
          getMobileTrends(mobileFilters),
          getMobileMap(mobileFilters),
        ]);

        const normalizedMap = (map || [])
          .map((point, index) => normalizeRow({
            ...point,
            device_id: point.device_id || `mobile-point-${index + 1}`,
            operator: point.operator || (validOperator !== "all" ? validOperator : "Mixed"),
            city: "Mobile",
            country: "Data",
          }))
          .filter((point) => point.latitude != null && point.longitude != null);

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

        const fallbackRsrp = toNumber(overview?.mean_rsrp ?? overview?.avg_rsrp ?? overview?.rsrp);
        const latest = normalizedReadings[normalizedReadings.length - 1] || normalizeRow({
          timestamp: overview?.last_timestamp || normalizedMap[0]?.timestamp || new Date().toISOString(),
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

        const mobileRegion = [{ id: "Mobile, Data", label: "Mobile, Data" }];
        setRegions(mobileRegion);
        setSelectedRegion("Mobile, Data");
        setDevices([]);

        setLatestReading(latest);
        setReadings(normalizedReadings);
        setTrendPoints(aggregateTrendRows(normalizedReadings, curPeriod));
        setMapPoints(normalizedMap);
        setHeatmapPoints(normalizedMap);
        setPredictionPoints([]);
        setSelectedPoint(normalizedMap[0] || null);
        return;
      }

      const loadDevices = effectiveApiMode === "supabase" ? getSupabaseDeviceSources : getDevicesWithInfo;
      const loadReadings = effectiveApiMode === "supabase" ? getSupabaseDeviceReadings : getDeviceReadings;

      const devicesData = await loadDevices();
      setDevices(devicesData || []);

      const regularDevices = (devicesData || []).filter((d) => d?.device_id && !isPredictionSource(d.device_id));
      const denseReadingsLimit = effectiveApiMode === "supabase" ? 20000 : 1000;

      const regularHistories = await Promise.all(
        regularDevices.map((device) => loadReadings(device.device_id, denseReadingsLimit).catch(() => []))
      );

      const regularRows = regularHistories
        .flat()
        .map((row) => normalizeRow(row, { isPrediction: false }))
        .filter((row) => row?.latitude != null && row?.longitude != null && row?.timestamp)
        .filter(isEgyptRow);

      const predictionHistory = await Promise.all(
        PREDICTION_SOURCE_NAMES.map((predictionSource) =>
          loadReadings(predictionSource, denseReadingsLimit).catch(() => [])
        )
      );

      const rawPredictionRows = predictionHistory
        .flat()
        .map((row) => normalizeRow(row, { isPrediction: true }))
        .filter((row) => row?.latitude != null && row?.longitude != null && row?.timestamp)
        .filter(isEgyptRow);

      const periodRegular = filterByPeriod(regularRows, curPeriod);
      const periodPredictions = filterByPeriod(rawPredictionRows, curPeriod);
      const periodCombined = assignNearbyUnknownRegions([...periodRegular, ...periodPredictions]);
      const scopedRegular = periodCombined.filter((row) => !row.is_prediction);
      const scopedPredictions = periodCombined.filter((row) => row.is_prediction);

      let regionSourceRows = periodCombined;
      if (curDataSource === "predicted") {
        regionSourceRows = scopedPredictions;
      } else if (curDataSource === "crowdsourced") {
        regionSourceRows = scopedRegular;
      }

      const regionMap = new Map();
      for (const row of regionSourceRows) {
        const key = row.region_label;
        const entry = regionMap.get(key) || { id: key, label: key, reading_count: 0 };
        entry.reading_count += 1;
        regionMap.set(key, entry);
      }
      const regionOptions = Array.from(regionMap.values()).sort((a, b) => a.label.localeCompare(b.label));
      const totalRegionReadings = regionOptions.reduce((sum, option) => sum + (option.reading_count || 0), 0);
      const regionOptionsWithAll = regionOptions.length > 0
        ? [{ id: ALL_REGIONS_ID, label: "All regions", reading_count: totalRegionReadings }, ...regionOptions]
        : regionOptions;
      setRegions(regionOptionsWithAll);

      const validRegion = regionOptionsWithAll.some((r) => r.id === curRegion)
        ? curRegion
        : (regionOptionsWithAll[0]?.id || "");
      setSelectedRegion(validRegion);

      const regionFilter = validRegion && validRegion !== ALL_REGIONS_ID ? validRegion : null;
      const byRegionRegular = regionFilter ? scopedRegular.filter((r) => r.region_label === regionFilter) : scopedRegular;
      const byRegionPredictions = regionFilter ? scopedPredictions.filter((r) => r.region_label === regionFilter) : scopedPredictions;

      const networkTypeSet = new Set(
        [...byRegionRegular, ...byRegionPredictions]
          .map((row) => String(row.network_type || "Unknown network").trim() || "Unknown network")
      );
      const networkTypeOptions = [
        { id: "all", label: "All network types" },
        ...Array.from(networkTypeSet)
          .sort((a, b) => a.localeCompare(b))
          .map((networkType) => ({ id: networkType, label: networkType })),
      ];
      setNetworkTypes(networkTypeOptions);

      const validNetworkType = networkTypeOptions.some((o) => o.id === curNetworkType)
        ? curNetworkType
        : "all";
      setSelectedNetworkType(validNetworkType);

      const networkFilteredRegularAll = validNetworkType === "all"
        ? scopedRegular
        : scopedRegular.filter((row) => (String(row.network_type || "Unknown network").trim() || "Unknown network") === validNetworkType);

      const networkFilteredPredictionsAll = validNetworkType === "all"
        ? scopedPredictions
        : scopedPredictions.filter((row) => (String(row.network_type || "Unknown network").trim() || "Unknown network") === validNetworkType);

      const networkFilteredRegularRegion = regionFilter
        ? networkFilteredRegularAll.filter((row) => row.region_label === regionFilter)
        : networkFilteredRegularAll;

      const networkFilteredPredictionsRegion = regionFilter
        ? networkFilteredPredictionsAll.filter((row) => row.region_label === regionFilter)
        : networkFilteredPredictionsAll;

      const operatorSet = new Set(
        [...networkFilteredRegularRegion, ...networkFilteredPredictionsRegion]
          .map((row) => row.operator)
          .filter(Boolean)
      );
      const operatorOptions = [
        { id: "all", label: "All operators" },
        ...Array.from(operatorSet).sort((a, b) => a.localeCompare(b)).map((operator) => ({ id: operator, label: operator })),
      ];
      setOperators(operatorOptions);

      const validOperator = operatorOptions.some((o) => o.id === curOperator)
        ? curOperator
        : "all";
      setSelectedOperator(validOperator);

      const operatorFilteredRegularAll = validOperator === "all"
        ? networkFilteredRegularAll
        : networkFilteredRegularAll.filter((row) => row.operator === validOperator);

      const operatorFilteredPredictionsBaseAll = validOperator === "all"
        ? networkFilteredPredictionsAll
        : networkFilteredPredictionsAll.filter((row) => row.operator === validOperator);

      const operatorFilteredPredictionsAll = curConfidence > 0
        ? operatorFilteredPredictionsBaseAll.filter(
            (row) => row.prediction_confidence != null && row.prediction_confidence >= curConfidence
          )
        : operatorFilteredPredictionsBaseAll;

      const operatorFilteredRegularRegion = regionFilter
        ? operatorFilteredRegularAll.filter((row) => row.region_label === regionFilter)
        : operatorFilteredRegularAll;

      const operatorFilteredPredictionsRegion = regionFilter
        ? operatorFilteredPredictionsAll.filter((row) => row.region_label === regionFilter)
        : operatorFilteredPredictionsAll;

      let effectiveRowsAll = operatorFilteredRegularAll;
      let effectiveRowsRegion = operatorFilteredRegularRegion;
      if (curDataSource === "predicted") {
        effectiveRowsAll = operatorFilteredPredictionsAll;
        effectiveRowsRegion = operatorFilteredPredictionsRegion;
      } else if (curDataSource === "both") {
        effectiveRowsAll = [...operatorFilteredRegularAll, ...operatorFilteredPredictionsAll];
        effectiveRowsRegion = [...operatorFilteredRegularRegion, ...operatorFilteredPredictionsRegion];
      }

      setPredictionPoints(operatorFilteredPredictionsAll);
      setHeatmapPoints(effectiveRowsAll);

      const latestByDevice = new Map();
      for (const row of effectiveRowsAll) {
        const did = row.device_id || "unknown-device";
        const existing = latestByDevice.get(did);
        if (!existing || new Date(row.timestamp) > new Date(existing.timestamp)) {
          latestByDevice.set(did, row);
        }
      }
      const effectiveMapPoints = Array.from(latestByDevice.values());
      setMapPoints(effectiveMapPoints);

      const history = [...effectiveRowsRegion].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const latest = history[history.length - 1] || null;

      setLatestReading(latest);
      setReadings(history.slice(-250));
      setTrendPoints(aggregateTrendRows(history, curPeriod));
      setOverviewMetrics(computeOverviewMetrics(effectiveRowsRegion));
      setCitySummaries(buildCitySummaries(effectiveRowsAll));
      setSelectedPoint(effectiveMapPoints[0] || latest || null);
    } catch (err) {
      setDevices([]);
      setRegions([]);
      setOperators([]);
      setNetworkTypes([]);
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
  }, [effectiveApiMode]);

  const mountedRef = useRef(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (mountedRef.current) {
      refresh();
    }
    mountedRef.current = true;
  }, [selectedRegion, selectedOperator, selectedNetworkType, selectedPeriod, dataSourceMode, predictionConfidenceMin]);

  const selectedRegionInfo = regions.find((region) => region.id === selectedRegion) || null;

  const setSelectedFromMap = useCallback((point) => {
    setSelectedPoint(point);
  }, []);

  return {
    devices,
    regions,
    operators,
    networkTypes,
    selectedRegion,
    setSelectedRegion,
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
  };
}
