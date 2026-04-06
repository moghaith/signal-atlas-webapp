import { useEffect, useMemo, useState } from "react";
import Header from "../components/Header/Header";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import useDeviceData from "../hooks/useDeviceData";
import "./MapPage.css";

const SHARED_HEAT_GRADIENT = {
  0.0: "#1d4ed8",
  0.25: "#2563eb",
  0.5: "#06b6d4",
  0.75: "#84cc16",
  1.0: "#facc15",
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

function metricToIntensity(metric, value) {
  if (value == null || !Number.isFinite(Number(value))) return 0.2;
  const v = Number(value);

  if (metric === "rsrq") {
    return Math.max(0.1, Math.min(1, (v + 20) / 17));
  }

  return Math.max(0.1, Math.min(1, (v + 125) / 45));
}

function HeatLayer({ points, metric }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !points.length) return undefined;

    const byCoordinate = new Map();
    for (const point of points) {
      if (point?.latitude == null || point?.longitude == null) continue;
      const lat = Number(point.latitude);
      const lng = Number(point.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      const existing = byCoordinate.get(key) || {
        lat,
        lng,
        sum: 0,
        count: 0,
        density: 0,
      };

      existing.density += 1;

      if (metric !== "density") {
        const metricValue = Number(point[metric]);
        if (Number.isFinite(metricValue)) {
          existing.sum += metricValue;
          existing.count += 1;
        }
      }

      byCoordinate.set(key, existing);
    }

    const grouped = Array.from(byCoordinate.values());
    const maxDensity = grouped.reduce((max, row) => Math.max(max, row.density), 1);

    const heatData = grouped.map((entry) => {
      if (metric === "density") {
        const densityIntensity = Math.max(0.1, Math.min(1, entry.density / maxDensity));
        return [entry.lat, entry.lng, densityIntensity];
      }

      const avg = entry.count > 0 ? entry.sum / entry.count : null;
      return [entry.lat, entry.lng, metricToIntensity(metric, avg)];
    });

    const layer = L.heatLayer(heatData, {
      radius: 28,
      blur: 20,
      maxZoom: 17,
      minOpacity: 0.35,
      gradient: SHARED_HEAT_GRADIENT,
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, metric, points]);

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

function getQuality(point) {
  if (point?.rsrp == null) return { label: "No data", color: "#94a3b8" };
  if (point.rsrp >= -90) return { label: "Excellent", color: "#22c55e" };
  if (point.rsrp >= -100) return { label: "Good", color: "#6b9ae8" };
  if (point.rsrp >= -110) return { label: "Fair", color: "#f59e0b" };
  return { label: "Poor", color: "#ef4444" };
}

function MapPage({ activePage, onNavigate, apiMode, onApiModeChange }) {
  const {
    regions,
    selectedRegion,
    setSelectedRegion,
    mapPoints,
    heatmapPoints,
    predictionPoints,
    selectedPoint,
    setSelectedPoint,
    loading,
    error,
    refresh,
  } = useDeviceData(apiMode);

  const [showAllRegions, setShowAllRegions] = useState(false);
  const [showAllReadings, setShowAllReadings] = useState(true);
  const [showHeatView, setShowHeatView] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const [heatMetric, setHeatMetric] = useState("rsrp");

  const pointsToRender = showAllRegions
    ? mapPoints
    : mapPoints.filter((point) => getRegionLabel(point) === selectedRegion);

  const allReadingPoints = showAllRegions
    ? heatmapPoints
    : heatmapPoints.filter((point) => getRegionLabel(point) === selectedRegion);

  const displayedPoints = showAllReadings ? allReadingPoints : pointsToRender;

  const predictionPointsForView = useMemo(() => {
    if (showAllRegions) return predictionPoints;
    if (!selectedRegion) return predictionPoints;
    return predictionPoints.filter((point) => getRegionLabel(point) === selectedRegion);
  }, [predictionPoints, selectedRegion, showAllRegions]);

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

  const heatPointsForView = useMemo(() => {
    if (!showPredictions) return displayedPoints;
    return [...displayedPoints, ...predictionPointsForView];
  }, [displayedPoints, predictionPointsForView, showPredictions]);

  const dedupedMarkers = useMemo(() => {
    const coordMap = new Map();
    for (const point of displayedPoints) {
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
  }, [displayedPoints]);

  const uniqueCoordinatesCount = new Set(
    displayedPoints
      .filter((point) => point?.latitude != null && point?.longitude != null)
      .map((point) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`)
  ).size;

  const selectedRegionPoint = pointsToRender[0] || null;
  const sidePanelPoint = selectedPoint || displayedPoints[0] || selectedRegionPoint || null;

  const mapCenter = sidePanelPoint
    ? [sidePanelPoint.latitude, sidePanelPoint.longitude]
    : [30.0444, 31.2357];

  const mapKey = `${mapCenter[0]}-${mapCenter[1]}-${showAllRegions}-${selectedRegion}`;

  return (
    <div className="page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        onRefresh={refresh}
        loading={loading}
        regions={regions}
        selectedRegion={selectedRegion}
        onRegionChange={setSelectedRegion}
        apiMode={apiMode}
        onApiModeChange={onApiModeChange}
      />

      <main className="page-content">
        <section className="page-intro">
          <span className="page-tag">Page 03</span>
          <h2>Map View</h2>
          <p>
            Regional map analytics for signal quality. Heat mode supports average RSRP, average RSRQ,
            or measurement density with a shared blue-to-yellow palette.
          </p>
        </section>

        <section className="map-filters">
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

          <label className="map-toggle">
            <input
              type="checkbox"
              checked={showHeatView}
              onChange={(e) => setShowHeatView(e.target.checked)}
            />
            <span>Heat view overlay</span>
          </label>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Heat metric</span>
            <select
              className="header-device-select"
              value={heatMetric}
              onChange={(e) => setHeatMetric(e.target.value)}
            >
              <option value="rsrp">RSRP (avg)</option>
              <option value="rsrq">RSRQ (avg)</option>
              <option value="density">Density</option>
            </select>
          </div>

          <label className="map-toggle">
            <input
              type="checkbox"
              checked={showPredictions}
              onChange={(e) => setShowPredictions(e.target.checked)}
            />
            <span>Show ML predictions</span>
          </label>

          <button type="button" className="map-refresh" onClick={refresh}>
            Refresh map
          </button>
        </section>

        <section className="map-stats">
          <span><strong>Total readings:</strong> {displayedPoints.length}</span>
          <span><strong>Unique coordinates:</strong> {uniqueCoordinatesCount}</span>
          <span><strong>Shown markers:</strong> {dedupedMarkers.length}</span>
          <span><strong>Predictions:</strong> {showPredictions ? dedupedPredictionMarkers.length : 0}</span>
          <span><strong>Heat metric:</strong> {heatMetric.toUpperCase()}</span>
        </section>

        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        <section className="map-layout">
          <div className="map-canvas">
            {loading && <p className="map-status">Loading map points...</p>}
            {!loading && displayedPoints.length === 0 && (
              <p className="map-status">No map points available for the selected region view.</p>
            )}

            {!loading && displayedPoints.length > 0 && (
              <MapContainer key={mapKey} center={mapCenter} zoom={11} className="leaflet-map">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <AutoFitBounds points={displayedPoints} enabled={showAllRegions} />

                {showHeatView && heatPointsForView.length > 0 && (
                  <HeatLayer points={heatPointsForView} metric={heatMetric} />
                )}

                {dedupedMarkers.map((point, index) => {
                  const quality = getQuality(point);
                  return (
                    <CircleMarker
                      key={`${point.device_id || "point"}-${point.latitude}-${point.longitude}-${index}`}
                      center={[point.latitude, point.longitude]}
                      radius={showAllReadings ? 5 : 7}
                      pathOptions={{
                        color: "#ffffff",
                        weight: showAllReadings ? 1 : 2,
                        fillColor: quality.color,
                        fillOpacity: showAllReadings ? 0.85 : 0.95,
                      }}
                      eventHandlers={{
                        click: () => setSelectedPoint(point),
                      }}
                    >
                      <Popup>
                        <div className="marker-popup">
                          <strong>{point.device_id || "Unknown device"}</strong>
                          {point.readingCount > 1 && (
                            <div style={{ color: "#64748b", fontSize: "0.8em" }}>
                              {point.readingCount} readings at this location
                            </div>
                          )}
                          <div>Region: {getRegionLabel(point)}</div>
                          <div>RSRP: {point.rsrp ?? "—"} (best)</div>
                          <div>RSRQ: {point.rsrq ?? "—"}</div>
                          <div>Quality: {quality.label}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}

                {showPredictions && dedupedPredictionMarkers.map((point, index) => (
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
                      click: () => setSelectedPoint({
                        ...point,
                        is_prediction: true,
                      }),
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
                        <div>Predicted RSRP: {point.rsrp ?? "—"}</div>
                        <div>Predicted RSRQ: {point.rsrq ?? "—"}</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            )}
          </div>

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
                <div><span>Quality</span><strong>{getQuality(sidePanelPoint).label}</strong></div>
              </div>
            )}
          </aside>
        </section>

        <section className="map-legend">
          <span><i style={{ background: "#22c55e" }} /> Excellent</span>
          <span><i style={{ background: "#6b9ae8" }} /> Good</span>
          <span><i style={{ background: "#f59e0b" }} /> Fair</span>
          <span><i style={{ background: "#ef4444" }} /> Poor</span>
          <span><i style={{ background: "#94a3b8" }} /> No data</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 30, background: "linear-gradient(90deg, #1d4ed8 0%, #06b6d4 50%, #facc15 100%)" }} />
            Heat palette (shared web + android)
          </span>
        </section>
      </main>
    </div>
  );
}

export default MapPage;
