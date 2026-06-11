import { useCallback, useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { selectStyles } from "../styles/selectStyles";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import 'leaflet/dist/leaflet.css';
import { getConfidenceLevel } from "../hooks/useDeviceData";
import "./MapPage.css";
import "../styles/global.css";

const ALL_REGIONS_ID = "__all__";

const QUALITY_SCALE = [
  { t: 0.0,  label: "No Signal", color: "#1d4ed8" },
  { t: 0.1,  label: "Poor",      color: "#2563eb" },
  { t: 0.25, label: "Fair",      color: "#06b6d4" },
  { t: 0.5,  label: "Good",      color: "#84cc16" },
  { t: 0.75, label: "Excellent", color: "#facc15" },
];

const KPI_RANGES = {
  rsrp: { min: -140, max: -43 },
  rsrq: { min: -20,  max: -3  },
  rssi: { min: -113, max: -51 },
  asu:  { min: 0,    max: 97  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRegionLabel(point) {
  if (point?.region_label) return point.region_label;
  const city = String(point?.city || "").trim();
  const country = String(point?.country || "").trim();
  if (city && country) return `${city}, ${country}`;
  return city || country || "Unknown region";
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function normalizeKpi(metric, value) {
  if (value == null || !Number.isFinite(Number(value))) return 0.2;
  const v = Number(value);
  const range = KPI_RANGES[String(metric).toLowerCase()];
  if (!range) return 0.2;
  const normalized = (v - range.min) / (range.max - range.min);
  return Math.max(0.05, Math.min(1, normalized));
}

function computeIntensity(point, metric, densityMap) {
  if (metric === "density") {
    return densityMap.get(`${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`) ?? 0;
  }
  return normalizeKpi(metric, point?.[metric]);
}

function computeDensity(points, bounds) {
  const filtered = points.filter(p => bounds.contains([p.latitude, p.longitude]));
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

function getQualityFromIntensity(i) {
  const v = Math.max(0, Math.min(1, i));
  let result = QUALITY_SCALE[0];
  for (const step of QUALITY_SCALE) {
    if (v >= step.t) result = step;
    else break;
  }
  return result;
}

function getQuality(point, metric = "rsrp") {
  const value = point?.[metric];
  if (value == null || !Number.isFinite(Number(value))) return { label: "No Signal", color: "#94a3b8" };
  const intensity = normalizeKpi(metric, Number(value));
  return getQualityFromIntensity(intensity);
}

const GRADIENT = Object.entries(
  Object.fromEntries(QUALITY_SCALE.filter(s => s.t > 0).map(s => [s.t, s.color]))
)
  .map(([threshold, hex]) => ({ threshold: Number(threshold), color: hexToRgb(hex) }))
  .sort((a, b) => a.threshold - b.threshold);

function interpolateColor(value) {
  const clamped = Math.max(0, Math.min(1, value));
  let lower = GRADIENT[0], upper = GRADIENT[GRADIENT.length - 1];
  for (let i = 0; i < GRADIENT.length - 1; i++) {
    if (clamped >= GRADIENT[i].threshold && clamped <= GRADIENT[i + 1].threshold) {
      lower = GRADIENT[i]; upper = GRADIENT[i + 1]; break;
    }
  }
  const range = upper.threshold - lower.threshold || 1;
  const t = (clamped - lower.threshold) / range;
  return lower.color.map((c, i) => Math.round(c + (upper.color[i] - c) * t));
}

// ── Map components ────────────────────────────────────────────────────────────

function HeatLayer({ points, metric, densityMap }) {
  const map = useMap();
  const [currentZoom, setCurrentZoom] = useState(() => map?.getZoom?.() ?? 11);
  const [viewVersion, setViewVersion] = useState(0);

  useEffect(() => {
    if (!map) return;
    const handle = () => { setCurrentZoom(map.getZoom()); setViewVersion(v => v + 1); };
    map.on("zoomend", handle);
    map.on("moveend", handle);
    return () => { map.off("zoomend", handle); map.off("moveend", handle); };
  }, [map]);

  useEffect(() => {
    if (!map || !points?.length) return;

    const layer = L.layerGroup();
    const bounds = map.getBounds().pad(0.5);
    const zoomFactor = Math.max(0, Math.min(1, (currentZoom - 10) / 8));
    const showCore = currentZoom >= 15;

    const processedPoints = points
      .filter(p => p?.latitude != null && p?.longitude != null && bounds.contains([p.latitude, p.longitude]))
      .map(point => ({ point, intensity: computeIntensity(point, metric, densityMap) }))
      .sort((a, b) => a.intensity - b.intensity);

    for (const { point, intensity } of processedPoints) {
      const [r, g, b] = interpolateColor(intensity);
      const pointSize = Math.min(60, Math.max(8, 8 + (currentZoom - 10) * 4));
      const blurRadius = Math.min(8, Math.max(2, 2 + (currentZoom - 10)));
      const centerAlpha = 0.08 + zoomFactor * 0.18;
      const midAlpha = 0.03 + zoomFactor * 0.08;
      const centerDotSize = Math.max(4, 6 + (currentZoom - 15));
      const finalSize = pointSize * (0.9 + intensity * 0.3);

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="position:relative;width:${finalSize}px;height:${finalSize}px;pointer-events:none;">
            <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,
              rgba(${r},${g},${b},${centerAlpha}) 0%,rgba(${r},${g},${b},${midAlpha}) 35%,
              rgba(${r},${g},${b},0.01) 65%,rgba(${r},${g},${b},0) 100%);filter:blur(${blurRadius}px);"></div>
            ${showCore ? `<div style="position:absolute;top:50%;left:50%;width:${centerDotSize}px;height:${centerDotSize}px;
              transform:translate(-50%,-50%);border-radius:50%;background:rgb(${r},${g},${b});
              border:1px solid rgba(255,255,255,0.6);"></div>` : ""}
          </div>`,
        iconSize: [finalSize, finalSize],
        iconAnchor: [finalSize / 2, finalSize / 2],
      });

      L.marker([point.latitude, point.longitude], { icon, interactive: false, keyboard: false }).addTo(layer);
    }

    layer.addTo(map);
    return () => layer.remove();
  }, [map, points, metric, currentZoom, viewVersion, densityMap]);

  return null;
}

function DirectMarkers({ points, onPointClick, heatMetric = "rsrp", densityMap }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !points.length) return;

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
          <strong>Crowdsourced</strong>
          <div>Region: ${getRegionLabel(point)}</div>
          <div>RSRP: ${point.rsrp ?? "—"}</div>
          <div>RSRQ: ${point.rsrq ?? "—"}</div>
          <div>Quality: ${quality.label}</div>
        </div>`);

      marker.on("click", (e) => onPointClick?.(point, e));
      layer.addLayer(marker);
    }

    map.addLayer(layer);
    return () => map.removeLayer(layer);
  }, [map, points, onPointClick, heatMetric, densityMap]);

  return null;
}

function PredictionMarkers({ points, onPointClick, heatMetric = "rsrp", densityMap }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !points.length) return;

    const layer = L.layerGroup();

    for (const point of points) {
      if (point.latitude == null || point.longitude == null) continue;

      const intensity = computeIntensity(point, heatMetric, densityMap);
      const quality = getQualityFromIntensity(intensity);

      // Combined confidence drives opacity: low confidence = more transparent
      const confidence = point.prediction_confidence;
      // Map confidence 0–1 → opacity 0.2–0.85
      const fillOpacity = confidence != null
        ? 0.2 + confidence * 0.65
        : 0.45;
      // Outline is always fully visible so the marker is always findable
      const strokeOpacity = confidence != null
        ? 0.5 + confidence * 0.5
        : 0.75;

      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: 4,
        color: "#0f172a",
        weight: 1.5,
        opacity: strokeOpacity,
        fillColor: quality.color,
        fillOpacity,
      });

      const rsrpConf = point.rsrp_confidence;
      const rsrqConf = point.rsrq_confidence;
      const rsrpUncert = point.rsrp_uncertainty;
      const rsrqUncert = point.rsrq_uncertainty;
      const confLevel = getConfidenceLevel(confidence);

      const fmtConf = (v) => v != null ? `${Math.round(v * 100)}%` : "—";
      const fmtUncert = (v, unit) => v != null ? `±${v.toFixed(2)} ${unit}` : "—";

      marker.bindPopup(`
        <div style="font-size:12px;line-height:1.6;min-width:160px">
          <div style="font-weight:700;margin-bottom:4px">ML Prediction</div>
          <div>Region: ${getRegionLabel(point)}</div>
          <div>RSRP: ${point.rsrp ?? "—"} dBm</div>
          <div>RSRQ: ${point.rsrq ?? "—"} dB</div>
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;font-weight:600">Confidence</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
            <span style="width:8px;height:8px;border-radius:50%;background:${confLevel?.color ?? "#94a3b8"};display:inline-block;flex-shrink:0"></span>
            <span>${confLevel?.label ?? "Unknown"} (${fmtConf(confidence)})</span>
          </div>
          <div style="margin-top:4px">RSRP conf: ${fmtConf(rsrpConf)} <span style="color:#94a3b8">${fmtUncert(rsrpUncert, "dBm")}</span></div>
          <div>RSRQ conf: ${fmtConf(rsrqConf)} <span style="color:#94a3b8">${fmtUncert(rsrqUncert, "dB")}</span></div>
          ${point.predictionCount > 1 ? `<div style="margin-top:4px;color:#64748b;font-size:0.85em">${point.predictionCount} predicted samples here</div>` : ""}
        </div>`);

      marker.on("click", (e) => onPointClick?.({ ...point, is_prediction: true }, e));
      layer.addLayer(marker);
    }

    map.addLayer(layer);
    return () => map.removeLayer(layer);
  }, [map, points, onPointClick, heatMetric, densityMap]);

  return null;
}

function AutoFitBounds({ points, enabled }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || !map || !points.length) return;
    const valid = points.filter(p => p?.latitude != null && p?.longitude != null);
    if (!valid.length) return;
    if (valid.length === 1) { map.setView([valid[0].latitude, valid[0].longitude], 14); return; }
    const bounds = L.latLngBounds(valid.map(p => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }, [enabled, map, points]);
  return null;
}

function ResizeMap({ expanded }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 100);
    return () => clearTimeout(t);
  }, [map]);
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 250);
    return () => clearTimeout(t);
  }, [expanded, map]);
  return null;
}

// ── Confidence bar (side panel) ───────────────────────────────────────────────

function ConfidenceBar({ label, confidence, uncertainty, unit }) {
  const level = getConfidenceLevel(confidence);
  const pct = confidence != null ? Math.round(confidence * 100) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", color: "#94a3b8", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: level?.color ?? "#94a3b8" }}>
          {pct != null ? `${pct}%` : "—"}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "#f1f5f9", overflow: "hidden" }}>
        {pct != null && (
          <div style={{ width: `${pct}%`, height: "100%", background: level?.color ?? "#94a3b8", borderRadius: 3, transition: "width 0.3s" }} />
        )}
      </div>
      {uncertainty != null && (
        <span style={{ fontSize: 10, color: "#94a3b8" }}>
          ±{uncertainty.toFixed(2)} {unit} uncertainty
        </span>
      )}
    </div>
  );
}

// ── Side panel point details ──────────────────────────────────────────────────

function SidePanelDetails({ point, heatMetric }) {
  if (!point) return <p className="side-empty">Click a marker to view details</p>;

  const quality = getQuality(point, heatMetric === "density" ? "rsrp" : heatMetric);
  const isPred = point.is_prediction;
  const confLevel = getConfidenceLevel(point.prediction_confidence);

  return (
    <div className="side-grid">
      <div><span>Region</span><strong>{getRegionLabel(point)}</strong></div>

      <div className="side-grid-row">
        <div><span>Latitude</span><strong>{point.latitude?.toFixed?.(5) ?? point.latitude}</strong></div>
        <div><span>Longitude</span><strong>{point.longitude?.toFixed?.(5) ?? point.longitude}</strong></div>
      </div>

      <div className="side-grid-row">
        <div><span>RSRP</span><strong>{point.rsrp != null ? `${point.rsrp} dBm` : "—"}</strong></div>
        <div><span>RSRQ</span><strong>{point.rsrq != null ? `${point.rsrq} dB` : "—"}</strong></div>
      </div>

      <div>
        <span>Quality</span>
        <strong style={{ color: quality.color }}>{quality.label}</strong>
      </div>

      {isPred && (
        <>
          <div style={{ gridColumn: "1 / -1", height: 1, background: "#f1f5f9", margin: "4px 0" }} />

          <div style={{ gridColumn: "1 / -1" }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: 8 }}>
              Prediction Confidence
            </span>

            {/* Combined */}
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 11, textTransform: "uppercase", color: "#94a3b8", fontWeight: 600, flexShrink: 0 }}>
                Confidence
              </span>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: confLevel?.color ?? "#94a3b8", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                {confLevel?.label ?? "Unknown"}
              </span>
              {point.prediction_confidence != null && (
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  ({Math.round(point.prediction_confidence * 100)}% combined)
                </span>
              )}
            </div>

            {/* Per-metric bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <ConfidenceBar
                label="RSRP"
                confidence={point.rsrp_confidence}
                uncertainty={point.rsrp_uncertainty}
                unit="dBm"
              />
              <ConfidenceBar
                label="RSRQ"
                confidence={point.rsrq_confidence}
                uncertainty={point.rsrq_uncertainty}
                unit="dB"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

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



  const allRegionsEnabled = showAllRegions || selectedRegion === ALL_REGIONS_ID;

  const filteredMapPoints = useMemo(() => {
    if (allRegionsEnabled) return mapPoints;
    return mapPoints.filter(p => getRegionLabel(p) === selectedRegion);
  }, [mapPoints, allRegionsEnabled, selectedRegion]);

  const filteredHeatPoints = useMemo(() => {
    if (allRegionsEnabled) return heatmapPoints;
    return heatmapPoints.filter(p => getRegionLabel(p) === selectedRegion);
  }, [heatmapPoints, allRegionsEnabled, selectedRegion]);

  const displayedPoints = showAllReadings ? filteredHeatPoints : filteredMapPoints;
  const crowdsourcedPoints = useMemo(() => displayedPoints.filter(p => !p.is_prediction), [displayedPoints]);

  const densityMap = useMemo(() => {
    if (heatMetric !== "density") return new Map();
    const validPoints = displayedPoints.filter(p => p.latitude != null && p.longitude != null);
    if (!validPoints.length) return new Map();
    const bounds = L.latLngBounds(validPoints.map(p => [p.latitude, p.longitude]));
    return computeDensity(validPoints, bounds);
  }, [displayedPoints, heatMetric]);

  const predictionPointsForView = useMemo(() => {
    if (dataSourceMode === "crowdsourced") return [];
    if (allRegionsEnabled) return predictionPoints;
    if (!selectedRegion) return predictionPoints;
    return predictionPoints.filter(p => getRegionLabel(p) === selectedRegion);
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
      .filter(p => p?.latitude != null && p?.longitude != null)
      .map(p => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`)
  ).size;

  const sidePanelPoint = selectedPoint || displayedPoints[0] || null;
  const mapCenter = sidePanelPoint
    ? [sidePanelPoint.latitude, sidePanelPoint.longitude]
    : [30.0444, 31.2357];

  const mapKey = `${showAllRegions}-${selectedRegion}-${expanded}`;

  const handlePointFocus = useCallback((point, leafletEvent) => {
    setSelectedPoint(point);
    const map = leafletEvent?.target?._map;
    if (!map || point?.latitude == null || point?.longitude == null) return;
    const currentZoom = map.getZoom?.() ?? 11;
    map.flyTo([point.latitude, point.longitude], Math.max(currentZoom, 15), { animate: true, duration: 0.6 });
  }, [setSelectedPoint]);

  return (
    <div className={`page${expanded ? ' map-expanded' : ''}`}>
      <main className="page-content">
        <section className="page-intro">
          <h2>Map View</h2>
          <p>Interactive regional signal quality visualization. Supports heatmap modes for RSRP, RSRQ, or measurement density.</p>
        </section>

        <section className="map-filters">
          <div className="map-toggle">
            <span>Operator</span>
            <Select value={operators.map(o => ({ value: o.id, label: o.label })).find(o => o.value === selectedOperator)}
              onChange={opt => setSelectedOperator(opt?.value)}
              options={operators.map(o => ({ value: o.id, label: o.label }))}
              isSearchable={false} styles={selectStyles} />
          </div>
          <div className="map-toggle">
            <span>Network type</span>
            <Select value={networkTypes.map(n => ({ value: n.id, label: n.label })).find(o => o.value === selectedNetworkType)}
              onChange={opt => setSelectedNetworkType(opt?.value)}
              options={networkTypes.map(n => ({ value: n.id, label: n.label }))}
              isSearchable={false} styles={selectStyles} />
          </div>
          <div className="map-toggle">
            <span>Period</span>
            <Select
              value={[{ value: "24h", label: "Last 24h" }, { value: "week", label: "Last week" }, { value: "month", label: "Last month" }, { value: "all", label: "All history" }].find(o => o.value === selectedPeriod)}
              onChange={opt => setSelectedPeriod(opt?.value)}
              options={[{ value: "24h", label: "Last 24h" }, { value: "week", label: "Last week" }, { value: "month", label: "Last month" }, { value: "all", label: "All history" }]}
              isSearchable={false} styles={selectStyles} />
          </div>
          <div className="map-toggle">
            <span>Data source</span>
            <Select
              value={[{ value: "crowdsourced", label: "Crowdsourced only" }, { value: "predicted", label: "ML model (predicted)" }, { value: "both", label: "Both" }].find(o => o.value === dataSourceMode)}
              onChange={opt => setDataSourceMode(opt?.value)}
              options={[{ value: "crowdsourced", label: "Crowdsourced only" }, { value: "predicted", label: "ML model (predicted)" }, { value: "both", label: "Both" }]}
              isSearchable={false} styles={selectStyles} />
          </div>
          <label className="map-toggle">
            <input type="checkbox" checked={showHeatView} onChange={e => setShowHeatView(e.target.checked)} />
            <span>Heat view overlay</span>
          </label>
          <div className="map-toggle">
            <span>Heat metric</span>
            <Select
              value={[{ value: "rsrp", label: "RSRP (avg)" }, { value: "rsrq", label: "RSRQ (avg)" }, { value: "density", label: "Density" }].find(o => o.value === heatMetric)}
              onChange={opt => setHeatMetric(opt?.value)}
              options={[{ value: "rsrp", label: "RSRP (avg)" }, { value: "rsrq", label: "RSRQ (avg)" }, { value: "density", label: "Density" }]}
              isSearchable={false} styles={selectStyles} />
          </div>
          {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
            <div className="map-toggle">
              <span>Min prediction confidence</span>
              <Select
                value={[{ value: 0, label: "Any" }, { value: 0.5, label: "50%+" }, { value: 0.7, label: "70%+" }, { value: 0.85, label: "85%+" }].find(o => o.value === predictionConfidenceMin)}
                onChange={opt => setPredictionConfidenceMin(opt?.value)}
                options={[{ value: 0, label: "Any" }, { value: 0.5, label: "50%+" }, { value: 0.7, label: "70%+" }, { value: 0.85, label: "85%+" }]}
                isSearchable={false} styles={selectStyles} />
            </div>
          )}
          <label className="map-toggle">
            <input type="checkbox" checked={showAllRegions} onChange={e => setShowAllRegions(e.target.checked)} />
            <span>Show all regions</span>
          </label>
          <label className="map-toggle">
            <input type="checkbox" checked={showAllReadings} onChange={e => setShowAllReadings(e.target.checked)} />
            <span>Show all readings</span>
          </label>
          <button type="button" className="map-refresh" onClick={refresh}>Refresh map</button>
        </section>

        <section className="map-stats">
          <span><strong>Total readings:</strong> {displayedPoints.length}</span>
          <span><strong>Unique coordinates:</strong> {uniqueCoordinatesCount}</span>
          <span><strong>Markers:</strong> {showAllReadings ? crowdsourcedPoints.length : dedupedMarkers.length}</span>
          <span><strong>Predictions:</strong> {dataSourceMode === "crowdsourced" ? 0 : dedupedPredictionMarkers.length}</span>
          <span><strong>Heat metric:</strong> {heatMetric.toUpperCase()}</span>
        </section>

        {error && <div className="error-banner"><span>⚠️ {error}</span><button onClick={refresh}>Retry</button></div>}

        <section className={`map-layout${expanded ? ' map-layout-expanded' : ''}`}>
          <div className="map-canvas">
            <button type="button" className="map-expand-btn" onClick={() => setExpanded(v => !v)}
              title={expanded ? "Collapse map" : "Expand map"}>
              {expanded ? "✕" : "⛶"}
            </button>

            {loading && <p className="map-status">Loading map points...</p>}
            {!loading && displayedPoints.length === 0 && (
              <p className="map-status">No map points available for the selected filters.</p>
            )}

            {!loading && displayedPoints.length > 0 && (
              <MapContainer key={mapKey} center={mapCenter} zoom={11} className="leaflet-map" preferCanvas={true}>
                <ResizeMap expanded={expanded} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <AutoFitBounds points={displayedPoints} enabled={showAllRegions} />

                {showHeatView && displayedPoints.length > 0 && (
                  <HeatLayer points={displayedPoints} metric={heatMetric} densityMap={densityMap} />
                )}

                {/* Crowdsourced markers */}
                <DirectMarkers
                  points={showAllReadings ? crowdsourcedPoints : dedupedMarkers}
                  onPointClick={handlePointFocus}
                  heatMetric={heatMetric}
                  densityMap={densityMap}
                />

                {/* Prediction markers — new component, color + opacity from confidence */}
                {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
                  <PredictionMarkers
                    points={dedupedPredictionMarkers}
                    onPointClick={handlePointFocus}
                    heatMetric={heatMetric}
                    densityMap={densityMap}
                  />
                )}
              </MapContainer>
            )}
          </div>

          {!expanded && (
            <aside className="map-side-panel">
              <h3>Point Details</h3>
              <SidePanelDetails point={sidePanelPoint} heatMetric={heatMetric} />
            </aside>
          )}
        </section>

        <section className="map-legend">
          {QUALITY_SCALE.map(item => (
            <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 30, background: `linear-gradient(90deg, ${QUALITY_SCALE.filter(s => s.t > 0).map(s => `${s.color} ${s.t * 100}%`).join(", ")})` }} />
            Heat palette
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="6" fill="rgba(107,154,232,0.4)" stroke="#0f172a" strokeWidth="2" />
            </svg>
            Prediction (opacity = confidence)
          </span>
        </section>


      </main>
    </div>
  );
}

export default MapPage;
