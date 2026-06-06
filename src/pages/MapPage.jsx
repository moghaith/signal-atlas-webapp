import { useCallback, useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { selectStyles } from "../styles/selectStyles";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import 'leaflet/dist/leaflet.css';
import useDeviceData from "../hooks/useDeviceData";
import {
  getSupabaseReadingAggregates,
  getSupabaseReadingDistributions,
} from "../data/dataService";
import "./MapPage.css";
import "../styles/global.css";

const ALL_REGIONS_ID = "__all__";

const QUALITY_SCALE = [
  { t: 0.0, label: "No Signal", color: "#1d4ed8" },
  { t: 0.1, label: "Poor", color: "#2563eb" },
  { t: 0.25, label: "Fair", color: "#06b6d4" },
  { t: 0.5, label: "Good", color: "#84cc16" },
  { t: 0.75, label: "Excellent", color: "#facc15" },
];

const SHARED_HEAT_GRADIENT = Object.fromEntries(
  QUALITY_SCALE.filter(s => s.t > 0).map(s => [s.t, s.color])
);

const heatGradientString = Object.entries(SHARED_HEAT_GRADIENT)
  .sort(([a], [b]) => Number(a) - Number(b))
  .map(([t, color], i, arr) => {
    const percent = Number(t) * 100;
    return `${color} ${percent}%`;
  })
  .join(", ");

const KPI_RANGES = {
  rsrp: { min: -140, max: -43 },
  rsrq: { min: -20, max: -3 },
  rssi: { min: -113, max: -51 },
  asu:  { min: 0, max: 97 },
};

function getRegionLabel(point) {
  if (point?.region_label) return point.region_label;
  const city = String(point?.city || "").trim();
  const country = String(point?.country || "").trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return "Unknown region";
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  return [
    (bigint >> 16) & 255,
    (bigint >> 8) & 255,
    bigint & 255,
  ];
}

function computeIntensity(point, metric, densityMap) {
  if (metric === "density") {
    return densityMap.get(
      `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`
    ) ?? 0;
  }

  return normalizeKpi(metric, point?.[metric]);
}
function computeDensity(points, bounds) {
  const filtered = points.filter(p =>
    bounds.contains([p.latitude, p.longitude])
  );

  const counts = new Map();

  for (const p of filtered) {
    const key = `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const max = Math.max(...counts.values(), 1);

  const normalized = new Map();
  for (const [key, count] of counts.entries()) {
    normalized.set(key, count / max);
  }

  return normalized;
}

function normalizeKpi(metric, value) {
  if (value == null || !Number.isFinite(Number(value))) return 0.2;

  const v = Number(value);
  const key = String(metric).toLowerCase();

  const range = KPI_RANGES[key];

  // fallback if unknown metric
  if (!range) return 0.2;

  const { min, max } = range;

  // normalize to 0–1
  const normalized = (v - min) / (max - min);

  // clamp + keep visible floor so weak signals still show
  return Math.max(0.05, Math.min(1, normalized));
}

function zoomToPrecision(zoom) {
  if (zoom <= 8) return 2;
  if (zoom <= 11) return 3;
  if (zoom <= 14) return 4;
  if (zoom <= 16) return 5;
  return 6;
}

function HeatLayer({ points, metric, densityMap }) {
  const map = useMap();

  const [currentZoom, setCurrentZoom] = useState(
    () => map?.getZoom?.() ?? 11
  );

  const [viewVersion, setViewVersion] = useState(0);

  useEffect(() => {
    if (!map) return;

    const handleViewChange = () => {
      setCurrentZoom(map.getZoom());
      setViewVersion(v => v + 1);
    };

    map.on("zoomend", handleViewChange);
    map.on("moveend", handleViewChange);

    return () => {
      map.off("zoomend", handleViewChange);
      map.off("moveend", handleViewChange);
    };
  }, [map]);

  const GRADIENT = Object.entries(SHARED_HEAT_GRADIENT)
    .map(([threshold, hex]) => ({
      threshold: Number(threshold),
      color: hexToRgb(hex),
    }))
    .sort((a, b) => a.threshold - b.threshold);

  function interpolateColor(value) {
    const clamped = Math.max(0, Math.min(1, value));

    let lower = GRADIENT[0];
    let upper = GRADIENT[GRADIENT.length - 1];

    for (let i = 0; i < GRADIENT.length - 1; i++) {
      if (
        clamped >= GRADIENT[i].threshold &&
        clamped <= GRADIENT[i + 1].threshold
      ) {
        lower = GRADIENT[i];
        upper = GRADIENT[i + 1];
        break;
      }
    }

    const range = upper.threshold - lower.threshold || 1;
    const t = (clamped - lower.threshold) / range;

    return lower.color.map((c, i) =>
      Math.round(c + (upper.color[i] - c) * t)
    );
  }

  useEffect(() => {
    if (!map || !points?.length) return;

    const layer = L.layerGroup();

    // render extra area around viewport
    const bounds = map.getBounds().pad(0.5);

    const zoomFactor = Math.max(
      0,
      Math.min(1, (currentZoom - 10) / 8)
    );

    const showCore = currentZoom >= 15;

    const processedPoints = points
      .filter(
        p =>
          p?.latitude != null &&
          p?.longitude != null &&
          bounds.contains([p.latitude, p.longitude])
      )
      .map(point => {
        const intensity = computeIntensity(point, metric, densityMap);

        return { point, intensity };
      })
      .sort((a, b) => a.intensity - b.intensity);

    for (const { point, intensity } of processedPoints) {
      const [r, g, b] = interpolateColor(intensity);

      const pointSize = Math.min(
        60,
        Math.max(8, 8 + (currentZoom - 10) * 4)
      );

      const blurRadius = Math.min(
        8,
        Math.max(2, 2 + (currentZoom - 10))
      );

      const centerAlpha =
        0.08 + zoomFactor * 0.18;

      const midAlpha =
        0.03 + zoomFactor * 0.08;

      const centerDotSize =
        Math.max(4, 6 + (currentZoom - 15));

      const finalSize =
        pointSize * (0.9 + intensity * 0.3);

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="
            position:relative;
            width:${finalSize}px;
            height:${finalSize}px;
            pointer-events:none;
          ">
            <div style="
              position:absolute;
              inset:0;
              border-radius:50%;
              background: radial-gradient(circle,
                rgba(${r},${g},${b},${centerAlpha}) 0%,
                rgba(${r},${g},${b},${midAlpha}) 35%,
                rgba(${r},${g},${b},0.01) 65%,
                rgba(${r},${g},${b},0) 100%
              );
              filter:blur(${blurRadius}px);
            "></div>

            ${
              showCore
                ? `
                <div style="
                  position:absolute;
                  top:50%;
                  left:50%;
                  width:${centerDotSize}px;
                  height:${centerDotSize}px;
                  transform:translate(-50%, -50%);
                  border-radius:50%;
                  background:rgb(${r},${g},${b});
                  border:1px solid rgba(255,255,255,0.6);
                "></div>
              `
                : ""
            }
          </div>
        `,
        iconSize: [finalSize, finalSize],
        iconAnchor: [
          finalSize / 2,
          finalSize / 2,
        ],
      });

      L.marker(
        [point.latitude, point.longitude],
        {
          icon,
          interactive: false,
          keyboard: false,
        }
      ).addTo(layer);
    }

    layer.addTo(map);

    return () => {
      layer.remove();
    };
  }, [
    map,
    points,
    metric,
    currentZoom,
    viewVersion,
  ]);

  return null;
}

function getQualityFromIntensity(i) {
  const v = Math.max(0, Math.min(1, i));

  let result = QUALITY_SCALE[0];

  for (const step of QUALITY_SCALE) {
    if (v >= step.t) {
      result = step;
    } else {
      break;
    }
  }

  return {
    label: result.label,
    color: result.color,
  };
}

function DirectMarkers({ points, onPointClick, heatMetric = "rsrp", densityMap }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !points.length) return undefined;

    const layer = L.layerGroup();
    for (const point of points) {
      if (point.latitude == null || point.longitude == null) continue;
      const intensity = computeIntensity(point, heatMetric, densityMap);
      const quality = getQualityFromIntensity(intensity);

      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: 5,
        color: "#ffffff",
        weight: 1,
        fillColor: quality.color,
        fillOpacity: 0.85,
      });

      marker.bindPopup(`
        <div style="font-size:12px;line-height:1.5">
          <strong>${point.device_id || "Unknown device"}</strong>
          <div>Region: ${getRegionLabel(point)}</div>
          <div>RSRP: ${point.rsrp ?? "—"}</div>
          <div>RSRQ: ${point.rsrq ?? "—"}</div>
          <div>Quality: ${quality.label}</div>
        </div>
      `);

      marker.on("click", (e) => {
        onPointClick?.(point, e);
      });

      layer.addLayer(marker);
    }

    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, onPointClick, heatMetric, densityMap]);

  return null;
}

function AutoFitBounds({ points, enabled }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !map || !points.length) return;
    const valid = points.filter((p) => p?.latitude != null && p?.longitude != null);
    if (!valid.length) return;

    if (valid.length === 1) {
      map.setView([valid[0].latitude, valid[0].longitude], 14);
      return;
    }

    const bounds = L.latLngBounds(valid.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }, [enabled, map, points]);

  return null;
}

function getQuality(point, metric = "rsrp") {
  const value = point?.[metric];

  if (value == null || !Number.isFinite(Number(value))) {
    return { label: "No Signal", color: "#94a3b8" };
  }

  const v = Number(value);
  const range = KPI_RANGES[metric];

  if (!range) {
    return { label: "Unknown", color: "#94a3b8" };
  }

  const intensity = normalizeKpi(metric, v);

  if (intensity >= 0.75) return { label: "Excellent", color: "#22c55e" };
  if (intensity >= 0.5)  return { label: "Good", color: "#6b9ae8" };
  if (intensity >= 0.25) return { label: "Fair", color: "#f59e0b" };
  if (intensity >= 0.1)  return { label: "Poor", color: "#ef4444" };

  return { label: "No Signal", color: "#94a3b8" };
}

function ResizeMap({ expanded }) {
  const map = useMap();

  // On mount
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 100);
    return () => clearTimeout(t);
  }, [map]);

  // On expand toggle
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 250);
    return () => clearTimeout(t);
  }, [expanded, map]);

  return null;
}

function MapPage({ deviceData, apiMode }) {
  const {
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
    mapPoints,
    heatmapPoints,
    predictionPoints,
    selectedPoint,
    setSelectedPoint,
    loading,
    error,
    refresh,
  } = deviceData;

  const [showAllRegions, setShowAllRegions] = useState(false);
  const [showAllReadings, setShowAllReadings] = useState(true);
  const [showHeatView, setShowHeatView] = useState(false);
  const [heatMetric, setHeatMetric] = useState("rsrp");
  const [expanded, setExpanded] = useState(false);

  const [globalStats, setGlobalStats] = useState(null);
  const [globalDistributions, setGlobalDistributions] = useState(null);

  useEffect(() => {
    if (apiMode !== "supabase") return;
    Promise.all([
      getSupabaseReadingAggregates().catch(() => null),
      getSupabaseReadingDistributions().catch(() => null),
    ]).then(([aggs, dists]) => {
      setGlobalStats(aggs?.[0] ?? null);
      if (dists?.[0]) {
        const dist = dists[0].get_reading_distributions;
        if (dist) {
          const netTypes = (dist.network_types || []).reduce((acc, item) => {
            const key = item.type || "Unknown";
            const existing = acc.find((e) => e.type === key);
            if (existing) existing.count += item.count;
            else acc.push({ type: key, count: item.count });
            return acc;
          }, []);
          setGlobalDistributions({
            network_types: netTypes,
            operators: dist.operators || [],
            top_cities: dist.top_cities || [],
          });
        }
      }
    });
  }, [apiMode]);

  const ALL_REGIONS_ID = "__all__";

  const allRegionsEnabled = showAllRegions || selectedRegion === ALL_REGIONS_ID;

  const filteredMapPoints = useMemo(() => {
    if (allRegionsEnabled) return mapPoints;
    return mapPoints.filter(
      (p) => getRegionLabel(p) === selectedRegion
    );
  }, [mapPoints, allRegionsEnabled, selectedRegion]);

  const filteredHeatPoints = useMemo(() => {
    if (allRegionsEnabled) return heatmapPoints;
    return heatmapPoints.filter(
      (p) => getRegionLabel(p) === selectedRegion
    );
  }, [heatmapPoints, allRegionsEnabled, selectedRegion]);

  const displayedPoints = showAllReadings
    ? filteredHeatPoints
    : filteredMapPoints;

  const crowdsourcedPoints = useMemo(
    () => displayedPoints.filter((p) => !p.is_prediction),
    [displayedPoints]
  );

  const densityMap = useMemo(() => {
    if (heatMetric !== "density") return new Map();

    const validPoints = displayedPoints.filter(
      p => p.latitude != null && p.longitude != null
    );

    if (!validPoints.length) return new Map();

    const bounds = L.latLngBounds(
      validPoints.map(p => [p.latitude, p.longitude])
    );

    return computeDensity(validPoints, bounds);
  }, [displayedPoints, heatMetric]);

  const predictionPointsForView = useMemo(() => {
    if (dataSourceMode === "crowdsourced") return [];
    if (allRegionsEnabled) return predictionPoints;
    if (!selectedRegion) return predictionPoints;
    return predictionPoints.filter((point) => getRegionLabel(point) === selectedRegion);
  }, [allRegionsEnabled, dataSourceMode, predictionPoints, selectedRegion]);

  const dedupedPredictionMarkers = useMemo(() => {
    const coordMap = new Map();
    for (const point of predictionPointsForView) {
      if (point.latitude == null || point.longitude == null) continue;
      const key = `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
      const existing = coordMap.get(key);
      if (!existing || new Date(point.timestamp || 0) > new Date(existing.timestamp || 0)) {
        coordMap.set(key, { ...point, predictionCount: (existing?.predictionCount || 0) + 1 });
      } else {
        existing.predictionCount += 1;
      }
    }
    return Array.from(coordMap.values());
  }, [predictionPointsForView]);

  const heatPointsForView = displayedPoints;

  const dedupedMarkers = useMemo(() => {
    const coordMap = new Map();
    for (const point of crowdsourcedPoints) {
      if (point.latitude == null || point.longitude == null) continue;
      const key = `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
      const existing = coordMap.get(key);
      if (!existing) {
        coordMap.set(key, { ...point, readingCount: 1 });
      } else {
        existing.readingCount += 1;
        if ((point.rsrp ?? -999) > (existing.rsrp ?? -999)) {
          coordMap.set(key, { ...point, readingCount: existing.readingCount });
        }
      }
    }
    return Array.from(coordMap.values());
  }, [crowdsourcedPoints]);

  const uniqueCoordinatesCount = new Set(
    displayedPoints
      .filter((point) => point?.latitude != null && point?.longitude != null)
      .map((point) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`)
  ).size;

  const selectedRegionPoint = displayedPoints[0] || null;
  const sidePanelPoint = selectedPoint || displayedPoints[0] || selectedRegionPoint || null;

  const mapCenter = sidePanelPoint
    ? [sidePanelPoint.latitude, sidePanelPoint.longitude]
    : [30.0444, 31.2357];

  const mapKey = `${showAllRegions}-${selectedRegion}-${expanded}`;

  const handlePointFocus = useCallback((point, leafletEvent) => {
    setSelectedPoint(point);

    const map = leafletEvent?.target?._map;
    if (!map || point?.latitude == null || point?.longitude == null) return;

    const currentZoom = map.getZoom?.() ?? 11;
    const nextZoom = Math.max(currentZoom, 15);
    map.flyTo([point.latitude, point.longitude], nextZoom, { animate: true, duration: 0.6 });
  }, [setSelectedPoint]);

  return (
    <div className={`page${expanded ? ' map-expanded' : ''}`}>

      <main className="page-content">
        <section className="page-intro">
          <h2>Map View</h2>
          <p>
            Interactive regional signal quality visualization.
            Supports heatmap modes for average RSRP, average RSRQ, or measurement density.
          </p>
        </section>

        <section className="map-filters">

          {/* ================= CORE DATA ================= */}

          <div className="map-toggle">
            <span>Operator</span>
            <Select
              value={operators
                .map((o) => ({ value: o.id, label: o.label }))
                .find((o) => o.value === selectedOperator)}
              onChange={(opt) => setSelectedOperator(opt?.value)}
              options={operators.map((o) => ({
                value: o.id,
                label: o.label,
              }))}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          <div className="map-toggle">
            <span>Network type</span>
            <Select
              value={networkTypes
                .map((n) => ({ value: n.id, label: n.label }))
                .find((o) => o.value === selectedNetworkType)}
              onChange={(opt) => setSelectedNetworkType(opt?.value)}
              options={networkTypes.map((n) => ({
                value: n.id,
                label: n.label,
              }))}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          <div className="map-toggle">
            <span>Period</span>
            <Select
              value={[
                { value: "24h", label: "Last 24h" },
                { value: "week", label: "Last week" },
                { value: "month", label: "Last month" },
                { value: "all", label: "All history" },
              ].find((o) => o.value === selectedPeriod)}
              onChange={(opt) => setSelectedPeriod(opt?.value)}
              options={[
                { value: "24h", label: "Last 24h" },
                { value: "week", label: "Last week" },
                { value: "month", label: "Last month" },
                { value: "all", label: "All history" },
              ]}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          <div className="map-toggle">
            <span>Data source</span>
            <Select
              value={[
                { value: "crowdsourced", label: "Crowdsourced only" },
                { value: "predicted", label: "ML model (predicted)" },
                { value: "both", label: "Both" },
              ].find((o) => o.value === dataSourceMode)}
              onChange={(opt) => setDataSourceMode(opt?.value)}
              options={[
                { value: "crowdsourced", label: "Crowdsourced only" },
                { value: "predicted", label: "ML model (predicted)" },
                { value: "both", label: "Both" },
              ]}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          {/* ================= VISUALIZATION ================= */}

          <label className="map-toggle">
            <input
              type="checkbox"
              checked={showHeatView}
              onChange={(e) => setShowHeatView(e.target.checked)}
            />
            <span>Heat view overlay</span>
          </label>

          <div className="map-toggle">
            <span>Heat metric</span>
            <Select
              value={[
                { value: "rsrp", label: "RSRP (avg)" },
                { value: "rsrq", label: "RSRQ (avg)" },
                { value: "density", label: "Density" },
              ].find((o) => o.value === heatMetric)}
              onChange={(opt) => setHeatMetric(opt?.value)}
              options={[
                { value: "rsrp", label: "RSRP (avg)" },
                { value: "rsrq", label: "RSRQ (avg)" },
                { value: "density", label: "Density" },
              ]}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          {/* ================= ADVANCED ================= */}

          {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
            <div className="map-toggle">
              <span>Min prediction confidence</span>
              <Select
                value={[
                  { value: 0, label: "Any" },
                  { value: 0.5, label: "50%+" },
                  { value: 0.7, label: "70%+" },
                  { value: 0.85, label: "85%+" },
                ].find((o) => o.value === predictionConfidenceMin)}
                onChange={(opt) => setPredictionConfidenceMin(opt?.value)}
                options={[
                  { value: 0, label: "Any" },
                  { value: 0.5, label: "50%+" },
                  { value: 0.7, label: "70%+" },
                  { value: 0.85, label: "85%+" },
                ]}
                isSearchable={false}
                styles={selectStyles}
              />
            </div>
          )}

          {/* ================= TOGGLES ================= */}

          <label className="map-toggle">
            <input
              type="checkbox"
              checked={showAllRegions}
              onChange={(e) => setShowAllRegions(e.target.checked)}
            />
            <span>Show all regions</span>
          </label>

          <label className="map-toggle">
            <input
              type="checkbox"
              checked={showAllReadings}
              onChange={(e) => setShowAllReadings(e.target.checked)}
            />
            <span>Show all readings points</span>
          </label>

          {/* ================= ACTION ================= */}

          <button type="button" className="map-refresh" onClick={refresh}>
            Refresh map
          </button>

        </section>

        <section className="map-stats">
          <span><strong>Total readings:</strong> {displayedPoints.length}</span>
          <span><strong>Unique coordinates:</strong> {uniqueCoordinatesCount}</span>
          <span><strong>Markers rendered:</strong> {showAllReadings ? crowdsourcedPoints.length : dedupedMarkers.length}</span>
          <span><strong>Predictions:</strong> {dataSourceMode === "crowdsourced" ? 0 : dedupedPredictionMarkers.length}</span>
          <span><strong>Heat metric:</strong> {heatMetric.toUpperCase()}</span>
        </section>

        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        <section className={`map-layout${expanded ? ' map-layout-expanded' : ''}`}>
          <div className="map-canvas">
            <button
              type="button"
              className="map-expand-btn"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Collapse map" : "Expand map"}
            >
              {expanded ? "✕" : "⛶"}
            </button>

            {loading && <p className="map-status">Loading map points...</p>}
            {!loading && displayedPoints.length === 0 && (
              <p className="map-status">No map points available for the selected region view.</p>
            )}

            {!loading && displayedPoints.length > 0 && (
              <MapContainer
                key={mapKey}
                center={mapCenter}
                zoom={11}
                className="leaflet-map"
                preferCanvas={true}
              >
                <ResizeMap expanded={expanded} />

                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <AutoFitBounds points={displayedPoints} enabled={showAllRegions} />

                {showHeatView && heatPointsForView.length > 0 && (
                  <HeatLayer
                    points={heatPointsForView}
                    metric={heatMetric}
                    densityMap={densityMap}
                  />
                )}

                {showAllReadings ? (
                  <DirectMarkers
                    points={crowdsourcedPoints}
                    onPointClick={handlePointFocus}
                    heatMetric={heatMetric}
                    densityMap={densityMap}
                  />
                ) : (
                  <DirectMarkers
                    points={dedupedMarkers}
                    onPointClick={handlePointFocus}
                    heatMetric={heatMetric}
                    densityMap={densityMap}
                  />
                )}

                {(dataSourceMode === "predicted" || dataSourceMode === "both") && dedupedPredictionMarkers.map((point, index) => (
                  <CircleMarker
                    key={`pred-${point.latitude}-${point.longitude}-${index}`}
                    center={[point.latitude, point.longitude]}
                    radius={7}
                    pathOptions={{
                      color: "#0f172a",
                      weight: 2,
                      fillColor: "#22d3ee",
                      fillOpacity: 0.35,
                    }}
                    eventHandlers={{
                      click: (event) => handlePointFocus({
                        ...point,
                        is_prediction: true,
                      }, event),
                    }}
                  >
                    <Popup>
                      <div className="marker-popup">
                        <strong>ML prediction</strong>
                        <div>Source: {point.prediction_source || point.device_id || "Model"}</div>
                        <div>Region: {getRegionLabel(point)}</div>
                        {point.predictionCount > 1 && (
                          <div style={{ color: "#64748b", fontSize: "0.8em" }}>
                            {point.predictionCount} predicted samples at this location
                          </div>
                        )}
                        <div>
                          Confidence: {point.prediction_confidence != null ? `${Math.round(point.prediction_confidence * 100)}%` : "N/A"}
                        </div>
                        <div>Predicted RSRP: {point.rsrp ?? "—"}</div>
                        <div>Predicted RSRQ: {point.rsrq ?? "—"}</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            )}
          </div>

          {!expanded && (
            <aside className="map-side-panel">
              <h3>Point Details</h3>
              {!sidePanelPoint && <p className="side-empty">Click a marker to view details</p>}
              {sidePanelPoint && (
                <div className="side-grid">
                  <div><span>Region</span><strong>{getRegionLabel(sidePanelPoint)}</strong></div>
                  <div><span>Latitude</span><strong>{sidePanelPoint.latitude?.toFixed?.(5) ?? sidePanelPoint.latitude}</strong></div>
                  <div><span>Longitude</span><strong>{sidePanelPoint.longitude?.toFixed?.(5) ?? sidePanelPoint.longitude}</strong></div>
                  <div><span>RSRP</span><strong>{sidePanelPoint.rsrp ?? "—"}</strong></div>
                  <div><span>RSRQ</span><strong>{sidePanelPoint.rsrq ?? "—"}</strong></div>
                  {sidePanelPoint.is_prediction && (
                    <div>
                      <span>Confidence</span>
                      <strong>{sidePanelPoint.prediction_confidence != null ? `${Math.round(sidePanelPoint.prediction_confidence * 100)}%` : "N/A"}</strong>
                    </div>
                  )}
                  <div><span>Quality</span><strong>{getQuality(sidePanelPoint).label}</strong></div>
                </div>
              )}
            </aside>
          )}
        </section>

        <section className="map-legend">
  {QUALITY_SCALE.map((item) => (
    <span key={item.label}>
      <i style={{ background: item.color }} />
      {item.label}
    </span>
  ))}

  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <i
      style={{
        width: 30,
        background: `linear-gradient(90deg, ${QUALITY_SCALE
          .filter(s => s.t > 0) // skip "No Signal"
          .map(s => `${s.color} ${s.t * 100}%`)
          .join(", ")})`,
      }}
    />
    Heat palette
  </span>
</section>

        {globalStats && (
          <section className="map-db-stats">
            <h3>Database Statistics</h3>
            <div className="db-stats-grid">
              <div className="db-stat-card">
                <span className="stat-label">Total Readings</span>
                <span className="stat-value">{globalStats.total_readings?.toLocaleString()}</span>
              </div>
              <div className="db-stat-card">
                <span className="stat-label">Unique Sources</span>
                <span className="stat-value">{globalStats.unique_sources}</span>
              </div>
              <div className="db-stat-card">
                <span className="stat-label">Unique Cells</span>
                <span className="stat-value">{globalStats.unique_cells}</span>
              </div>
              <div className="db-stat-card">
                <span className="stat-label">Cities</span>
                <span className="stat-value">{globalStats.unique_cities}</span>
              </div>
              <div className="db-stat-card">
                <span className="stat-label">Avg RSRP</span>
                <span className="stat-value">{globalStats.avg_rsrp} <span style={{fontSize:12,fontWeight:400,color:"#64748b"}}>dBm</span></span>
              </div>
              <div className="db-stat-card">
                <span className="stat-label">Avg RSRQ</span>
                <span className="stat-value">{globalStats.avg_rsrq} <span style={{fontSize:12,fontWeight:400,color:"#64748b"}}>dB</span></span>
              </div>
              <div className="db-stat-card">
                <span className="stat-label">Avg RSSI</span>
                <span className="stat-value">{globalStats.avg_rssi} <span style={{fontSize:12,fontWeight:400,color:"#64748b"}}>dBm</span></span>
              </div>
              <div className="db-stat-card">
                <span className="stat-label">Date Range</span>
                <span className="stat-value" style={{fontSize:13}}>{globalStats.earliest_reading?.slice(0,10)}</span>
                <span className="stat-sub">to {globalStats.latest_reading?.slice(0,10)}</span>
              </div>
            </div>

            <div className="db-stat-card" style={{padding:"14px 16px"}}>
              <span className="stat-label">Signal Quality Distribution</span>
              {(() => {
                const total = globalStats.total_readings || 1;
                const excellent = globalStats.excellent_count || 0;
                const good = globalStats.good_count || 0;
                const fair = globalStats.fair_count || 0;
                const poor = globalStats.poor_count || 0;
                const noSignal = globalStats.no_signal_count || 0;
                return (
                  <div>
                    <div className="db-quality-bar">
                      <div style={{width:`${(excellent/total)*100}%`,background:"#22c55e",minWidth:excellent?24:0}}>{excellent ? `${Math.round(excellent/total*100)}%` : ""}</div>
                      <div style={{width:`${(good/total)*100}%`,background:"#6b9ae8",minWidth:good?24:0}}>{good ? `${Math.round(good/total*100)}%` : ""}</div>
                      <div style={{width:`${(fair/total)*100}%`,background:"#f59e0b",minWidth:fair?24:0}}>{fair ? `${Math.round(fair/total*100)}%` : ""}</div>
                      <div style={{width:`${(poor/total)*100}%`,background:"#ef4444",minWidth:poor?24:0}}>{poor ? `${Math.round(poor/total*100)}%` : ""}</div>
                      <div style={{width:`${(noSignal/total)*100}%`,background:"#94a3b8",minWidth:noSignal?24:0}}>{noSignal ? `${Math.round(noSignal/total*100)}%` : ""}</div>
                    </div>
                    <div style={{display:"flex",gap:12,fontSize:11,color:"#64748b",marginTop:6,flexWrap:"wrap"}}>
                      <span>Excellent: {excellent.toLocaleString()}</span>
                      <span>Good: {good.toLocaleString()}</span>
                      <span>Fair: {fair.toLocaleString()}</span>
                      <span>Poor: {poor.toLocaleString()}</span>
                      <span>No data: {noSignal.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {globalDistributions && (
              <div className="db-dist-grid">
                <div className="db-dist-table">
                  <h4>Network Type Distribution</h4>
                  <table>
                    <tbody>
                      {globalDistributions.network_types.map((item) => {
                        const maxCount = globalDistributions.network_types[0]?.count || 1;
                        return (
                          <tr key={item.type}>
                            <td>{item.type}</td>
                            <td>
                              <div className="dist-bar-wrap">
                                <div className="dist-bar">
                                  <div className="dist-bar-fill" style={{width:`${(item.count/maxCount)*100}%`}} />
                                </div>
                                <span>{item.count.toLocaleString()}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="db-dist-table">
                  <h4>Top Operators</h4>
                  <table>
                    <tbody>
                      {globalDistributions.operators.map((item) => {
                        const maxCount = globalDistributions.operators[0]?.count || 1;
                        return (
                          <tr key={item.name}>
                            <td>{item.name}</td>
                            <td>
                              <div className="dist-bar-wrap">
                                <div className="dist-bar">
                                  <div className="dist-bar-fill" style={{width:`${(item.count/maxCount)*100}%`}} />
                                </div>
                                <span>{item.count.toLocaleString()}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default MapPage;
