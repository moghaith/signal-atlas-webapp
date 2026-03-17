import { useState, useEffect, useCallback } from "react";
import {
  getDevicesWithInfo,
  getDeviceReadings,
  getDeviceLocations,
  getSupabaseDevicesWithInfo,
  getSupabaseDeviceReadings,
  getSupabaseDeviceLocations,
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

export default function useDeviceData(apiMode = "device") {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
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
        const currentOperator = selectedDevice || operators[0] || "";
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
        };

        setDevices((operators || []).map((operator) => ({ device_id: operator, label: operator })));
        setSelectedDevice(currentOperator);
        setLatestReading(latest);
        setReadings(normalizedReadings);
        setMapPoints(normalizedMap);
        setHeatmapPoints(normalizedMap);
        setPredictionPoints([]);
        setSelectedPoint(normalizedMap[0] || null);
        return;
      }

      const loadDevices = apiMode === "supabase" ? getSupabaseDevicesWithInfo : getDevicesWithInfo;
      const loadLocations = apiMode === "supabase" ? getSupabaseDeviceLocations : getDeviceLocations;
      const loadReadings = apiMode === "supabase" ? getSupabaseDeviceReadings : getDeviceReadings;

      const [devicesData, locationsData] = await Promise.all([
        loadDevices(),
        loadLocations(),
      ]);

      setDevices(devicesData || []);
      setMapPoints(locationsData || []);

      const deviceList = devicesData || [];
      const denseReadingsLimit = apiMode === "supabase" ? 20000 : 500;
      const perDeviceHistories = await Promise.all(
        deviceList.map((device) =>
          loadReadings(device.device_id, denseReadingsLimit).catch(() => [])
        )
      );

      const allHeatPoints = perDeviceHistories
        .flat()
        .filter((row) => row?.latitude != null && row?.longitude != null);
      setHeatmapPoints(allHeatPoints);

      if (PREDICTION_DEVICE_ID) {
        const predictionHistory = await loadReadings(PREDICTION_DEVICE_ID, denseReadingsLimit).catch(() => []);
        const predictionRows = (predictionHistory || [])
          .filter((row) => row?.latitude != null && row?.longitude != null)
          .map((row) => ({
            ...row,
            is_prediction: true,
            prediction_source: PREDICTION_DEVICE_ID,
          }));
        setPredictionPoints(predictionRows);
      } else {
        setPredictionPoints([]);
      }

      const preservedDevice = (devicesData || []).some((device) => device.device_id === selectedDevice)
        ? selectedDevice
        : "";
      const currentDevice = preservedDevice || devicesData?.[0]?.device_id || "";
      if (currentDevice) {
        setSelectedDevice(currentDevice);
        const history = await loadReadings(currentDevice, 50);
        const latest = history[history.length - 1] || null;
        setLatestReading(latest);
        setReadings(history);
      } else {
        setSelectedDevice("");
        setLatestReading(null);
        setReadings([]);
      }
    } catch (err) {
      setDevices([]);
      setSelectedDevice("");
      setLatestReading(null);
      setReadings([]);
      setMapPoints([]);
      setHeatmapPoints([]);
      setPredictionPoints([]);
      setError(err.message || "Failed to load data from server API");
    } finally {
      setLoading(false);
    }
  }, [apiMode, selectedDevice]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedDevice || (apiMode !== "device" && apiMode !== "supabase")) return;

    let cancelled = false;
    async function loadSelectedDevice() {
      setReadingsError(null);
      try {
        const history = await (apiMode === "supabase"
          ? getSupabaseDeviceReadings(selectedDevice, 50)
          : getDeviceReadings(selectedDevice, 50));
        const latest = history[history.length - 1] || null;

        if (cancelled) return;
        setLatestReading(latest);
        setReadings(history);

        const mapPoint = mapPoints.find((point) => point.device_id === selectedDevice);
        if (mapPoint) setSelectedPoint(mapPoint);
      } catch (err) {
        if (!cancelled) {
          setReadingsError(err.message || "Failed to load selected device readings");
        }
      }
    }

    loadSelectedDevice();
    return () => {
      cancelled = true;
    };
  }, [apiMode, selectedDevice, mapPoints]);

  const selectedDeviceInfo = devices.find((d) => d.device_id === selectedDevice) || null;

  const setSelectedFromMap = useCallback((point) => {
    setSelectedPoint(point);
    if (point?.device_id) setSelectedDevice(point.device_id);
  }, []);

  return {
    devices,
    selectedDevice,
    setSelectedDevice,
    selectedDeviceInfo,
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
