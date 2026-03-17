import { useEffect, useState, useMemo } from "react";
import Header from "../components/Header/Header";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import useDeviceData from "../hooks/useDeviceData";
import "./MapPage.css";

function HeatLayer({ points }) {
  const map = useMap();

  const toIntensity = (rsrp) => {
    if (rsrp == null) return 0.35;
    return Math.max(0.2, Math.min(1, (Number(rsrp) + 130) / 50));
  };

  useEffect(() => {
    if (!map || !points.length) return undefined;

    const heatData = points
      .filter((point) => point?.latitude != null && point?.longitude != null)
      .map((point) => [point.latitude, point.longitude, toIntensity(point.rsrp)]);

    const layer = L.heatLayer(heatData, {
      radius: 20,
      blur: 14,
      maxZoom: 17,
      minOpacity: 0.35,
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);

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
    devices,
    selectedDevice,
    setSelectedDevice,
    mapPoints,
    heatmapPoints,
    predictionPoints,
    readings,
    selectedPoint,
    setSelectedPoint,
    loading,
    error,
    refresh,
  } = useDeviceData(apiMode);

  const [showAllDevices, setShowAllDevices] = useState(false);
  const [showAllReadings, setShowAllReadings] = useState(true);
  const [showHeatView, setShowHeatView] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);

  const pointsToRender = showAllDevices
    ? mapPoints
    : mapPoints.filter((point) => point.device_id === selectedDevice);

  const allReadingPoints = showAllDevices
    ? heatmapPoints
    : heatmapPoints.filter((point) => point.device_id === selectedDevice);

  const displayedPoints = showAllReadings ? allReadingPoints : pointsToRender;

  const predictionPointsForView = useMemo(() => {
    if (showAllDevices) return predictionPoints;
    if (!selectedDevice) return predictionPoints;

    const matched = predictionPoints.filter(
      (point) =>
        point?.target_device_id === selectedDevice ||
        point?.predicted_for === selectedDevice ||
        point?.device_id === selectedDevice
    );

    return matched.length > 0 ? matched : predictionPoints;
  }, [predictionPoints, selectedDevice, showAllDevices]);

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

  // Deduplicate to best RSRP reading per unique coordinate for rendering
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

  const selectedDevicePoint = mapPoints.find((point) => point.device_id === selectedDevice) || null;
  const sidePanelPoint = selectedPoint || displayedPoints[0] || selectedDevicePoint || pointsToRender[0] || null;

  const mapCenter = sidePanelPoint
    ? [sidePanelPoint.latitude, sidePanelPoint.longitude]
    : [30.0444, 31.2357];

  const mapKey = `${mapCenter[0]}-${mapCenter[1]}-${showAllDevices}-${selectedDevice}`;

  return (
    <div className="page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        onRefresh={refresh}
        loading={loading}
        devices={devices}
        selectedDevice={selectedDevice}
        onDeviceChange={setSelectedDevice}
        apiMode={apiMode}
        onApiModeChange={onApiModeChange}
      />

      <main className="page-content">
        <section className="page-intro">
          <span className="page-tag">Page 03</span>
          <h2>Map View</h2>
          <p>
            Geographic view of device signal samples. Markers are color-coded by quality; click a marker to
            inspect its details in the side panel.
          </p>
        </section>

        <section className="map-filters">
          <label className="map-toggle">
            <input
              type="checkbox"
              checked={showAllDevices}
              onChange={(e) => setShowAllDevices(e.target.checked)}
            />
            <span>Show all devices</span>
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
              <p className="map-status">No map points available for the selected device view.</p>
            )}

            {!loading && displayedPoints.length > 0 && (
              <MapContainer key={mapKey} center={mapCenter} zoom={11} className="leaflet-map">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <AutoFitBounds points={displayedPoints} enabled={showAllDevices} />

                {showHeatView && heatPointsForView.length > 0 && (
                  <HeatLayer points={heatPointsForView} />
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
                          {point.readingCount > 1 && <div style={{ color: "#64748b", fontSize: "0.8em" }}>{point.readingCount} readings at this location</div>}
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
                        device_id: selectedDevice || point.device_id,
                        is_prediction: true,
                      }),
                    }}
                  >
                    <Popup>
                      <div className="marker-popup">
                        <strong>ML prediction</strong>
                        <div>Source: {point.prediction_source || point.device_id || "Model"}</div>
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
        </section>
      </main>
    </div>
  );
}

export default MapPage;
