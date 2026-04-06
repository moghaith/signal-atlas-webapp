import { useState, useEffect, useCallback } from "react";
import {
  getDevicesWithInfo,
  getDeviceReadings,
  getSupabaseDevicesWithInfo,
  getSupabaseDeviceReadings,
  getMobileMap,
  getMobileOperators,
  getMobileOverview,
  getMobileTrends,
} from "../data/dataService";

const PREDICTION_DEVICE_ID = import.meta.env.VITE_PREDICTION_DEVICE_ID || "RandomForestRegressor";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizeRow(row) {
  const rsrp = toNumber(row?.rsrp);
  return {
    ...row,
    device_id: row?.device_id || row?.source || null,
    latitude: toNumber(row?.latitude),
    longitude: toNumber(row?.longitude),
    rsrp,
    rsrq: toNumber(row?.rsrq),
    rssi: toNumber(row?.rssi),
    asu: row?.asu ?? estimateAsuFromRsrp(rsrp),
    level: row?.level ?? estimateLevelFromRsrp(rsrp),
    region_label: getRegionLabel(row),
  };
}

export default function useDeviceData(apiMode = "device") {
  const [devices, setDevices] = useState([]);
  const [regions, setRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [latestReading, setLatestReading] = useState(null);
  const [readings, setReadings] = useState([]);
  const [mapPoints, setMapPoints] = useState([]);
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [predictionPoints, setPredictionPoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const [loading, setLoading] = useState(true);
  const [readingsError, setReadingsError] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReadingsError(null);

    try {
      if (apiMode === "mobile") {
        const operators = await getMobileOperators();
        const currentOperator = selectedRegion || operators[0] || "";
        const mobileFilters = {
          period: "week",
          source: "all",
          ...(currentOperator ? { operator: currentOperator } : {}),
        };

        const [overview, trends, map] = await Promise.all([
          getMobileOverview(mobileFilters),
          getMobileTrends(mobileFilters),
          getMobileMap(mobileFilters),
        ]);

        const normalizedMap = (map || [])
          .map((point, index) => ({
            device_id: point.device_id || `mobile-point-${index + 1}`,
            latitude: toNumber(point.latitude),
            longitude: toNumber(point.longitude),
            rsrp: toNumber(point.rsrp),
            rsrq: toNumber(point.rsrq),
            operator: currentOperator || "All operators",
            network_type: point.network_type || "Mixed",
            timestamp: point.timestamp || null,
            region_label: currentOperator || "All operators",
          }))
          .filter((point) => point.latitude != null && point.longitude != null);

        const normalizedReadings = (trends || []).map((row) => {
          const rsrp = toNumber(row.rsrp);
          return {
            timestamp: row.timestamp,
            rsrp,
            rssi: toNumber(row.rssi),
            rsrq: toNumber(row.rsrq),
            asu: estimateAsuFromRsrp(rsrp),
            level: estimateLevelFromRsrp(rsrp),
            latitude: normalizedMap[0]?.latitude ?? null,
            longitude: normalizedMap[0]?.longitude ?? null,
            operator: currentOperator || "All operators",
            network_type: "Mixed",
            physical_cell_id: null,
            tracking_area_code: null,
            region_label: currentOperator || "All operators",
          };
        });

        const fallbackRsrp = toNumber(overview?.mean_rsrp ?? overview?.avg_rsrp ?? overview?.rsrp);
        const latest = normalizedReadings[normalizedReadings.length - 1] || {
          timestamp: overview?.last_timestamp || normalizedMap[0]?.timestamp || new Date().toISOString(),
          rsrp: fallbackRsrp,
          rssi: null,
          rsrq: toNumber(overview?.mean_rsrq ?? overview?.avg_rsrq ?? overview?.rsrq),
          asu: estimateAsuFromRsrp(fallbackRsrp),
          level: estimateLevelFromRsrp(fallbackRsrp),
          latitude: normalizedMap[0]?.latitude ?? null,
          longitude: normalizedMap[0]?.longitude ?? null,
          operator: currentOperator || "All operators",
          network_type: "Mixed",
          physical_cell_id: null,
          tracking_area_code: null,
          region_label: currentOperator || "All operators",
        };

        const mobileRegions = (operators || []).map((operator) => ({
          id: operator,
          label: operator,
        }));

        setDevices((operators || []).map((operator) => ({ device_id: operator, label: operator })));
        setRegions(mobileRegions);
        setSelectedRegion(currentOperator);
        setLatestReading(latest);
        setReadings(normalizedReadings);
        setMapPoints(normalizedMap);
        setHeatmapPoints(normalizedMap);
        setPredictionPoints([]);
        setSelectedPoint(normalizedMap[0] || null);
        return;
      }

      const loadDevices = apiMode === "supabase" ? getSupabaseDevicesWithInfo : getDevicesWithInfo;
      const loadReadings = apiMode === "supabase" ? getSupabaseDeviceReadings : getDeviceReadings;

      const devicesData = await loadDevices();
      setDevices(devicesData || []);

      const deviceList = (devicesData || []).filter((device) => device?.device_id !== PREDICTION_DEVICE_ID);
      const denseReadingsLimit = apiMode === "supabase" ? 20000 : 800;
      const perDeviceHistories = await Promise.all(
        deviceList.map((device) => loadReadings(device.device_id, denseReadingsLimit).catch(() => []))
      );

      const allRows = perDeviceHistories
        .flat()
        .map((row) => normalizeRow(row))
        .filter((row) => row?.latitude != null && row?.longitude != null && row?.timestamp);

      const regionMap = new Map();
      for (const row of allRows) {
        const key = row.region_label;
        const entry = regionMap.get(key) || { id: key, label: key, reading_count: 0 };
        entry.reading_count += 1;
        regionMap.set(key, entry);
      }
      const regionOptions = Array.from(regionMap.values()).sort((a, b) => a.label.localeCompare(b.label));
      setRegions(regionOptions);

      const validRegion = regionOptions.some((r) => r.id === selectedRegion) ? selectedRegion : (regionOptions[0]?.id || "");
      setSelectedRegion(validRegion);

      const regionRows = validRegion
        ? allRows.filter((row) => row.region_label === validRegion)
        : allRows;

      setHeatmapPoints(regionRows);

      const latestByDevice = new Map();
      for (const row of regionRows) {
        const did = row.device_id || "unknown-device";
        const existing = latestByDevice.get(did);
        if (!existing || new Date(row.timestamp) > new Date(existing.timestamp)) {
          latestByDevice.set(did, row);
        }
      }
      const regionMapPoints = Array.from(latestByDevice.values());
      setMapPoints(regionMapPoints);

      if (PREDICTION_DEVICE_ID) {
        const predictionHistory = await loadReadings(PREDICTION_DEVICE_ID, denseReadingsLimit).catch(() => []);
        const predictionRows = (predictionHistory || [])
          .map((row) => normalizeRow(row))
          .filter((row) => row?.latitude != null && row?.longitude != null)
          .filter((row) => !validRegion || row.region_label === validRegion)
          .map((row) => ({
            ...row,
            is_prediction: true,
            prediction_source: PREDICTION_DEVICE_ID,
          }));
        setPredictionPoints(predictionRows);
      } else {
        setPredictionPoints([]);
      }

      const history = [...regionRows].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const latest = history[history.length - 1] || null;
      setLatestReading(latest);
      setReadings(history.slice(-250));
      setSelectedPoint(regionMapPoints[0] || latest || null);
    } catch (err) {
      setDevices([]);
      setRegions([]);
      setSelectedRegion("");
      setLatestReading(null);
      setReadings([]);
      setMapPoints([]);
      setHeatmapPoints([]);
      setPredictionPoints([]);
      setError(err.message || "Failed to load data from server API");
    } finally {
      setLoading(false);
    }
  }, [apiMode, selectedRegion]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedRegionInfo = regions.find((region) => region.id === selectedRegion) || null;

  const setSelectedFromMap = useCallback((point) => {
    setSelectedPoint(point);
    const mapRegion = point?.region_label || getRegionLabel(point);
    if (mapRegion) setSelectedRegion(mapRegion);
  }, []);

  return {
    devices,
    regions,
    selectedRegion,
    setSelectedRegion,
    selectedRegionInfo,
    latestReading,
    readings,
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
