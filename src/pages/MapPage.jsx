import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "../components/Header/Header";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import useDeviceData from "../hooks/useDeviceData";
import {
  getSupabaseReadingAggregates,
  getSupabaseReadingDistributions,
} from "../data/dataService";
import "./MapPage.css";

const ALL_REGIONS_ID = "__all__";

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

function zoomToPrecision(zoom) {
  if (zoom <= 8) return 2;
  if (zoom <= 11) return 3;
  if (zoom <= 14) return 4;
  if (zoom <= 16) return 5;
  return 6;
}

function HeatLayer({ points, metric }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map?.getZoom?.() ?? 11);

  useEffect(() => {
    if (!map) return undefined;

    const onZoomEnd = () => setZoom(map.getZoom());
    map.on("zoomend", onZoomEnd);

    return () => {
      map.off("zoomend", onZoomEnd);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !points.length) return undefined;

    const precision = zoomToPrecision(zoom);

    const byCoordinate = new Map();
    for (const point of points) {
      if (point?.latitude == null || point?.longitude == null) continue;
      const lat = Number(point.latitude);
      const lng = Number(point.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const bucketLat = Number(lat.toFixed(precision));
      const bucketLng = Number(lng.toFixed(precision));
      const key = `${bucketLat},${bucketLng}`;
      const existing = byCoordinate.get(key) || {
        latSum: 0,
        lngSum: 0,
        pointCount: 0,
        sum: 0,
        count: 0,
        density: 0,
      };

      existing.latSum += lat;
      existing.lngSum += lng;
      existing.pointCount += 1;
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
      const avgLat = entry.pointCount > 0 ? entry.latSum / entry.pointCount : null;
      const avgLng = entry.pointCount > 0 ? entry.lngSum / entry.pointCount : null;

      if (metric === "density") {
        const densityIntensity = Math.max(0.1, Math.min(1, entry.density / maxDensity));
        return [avgLat, avgLng, densityIntensity];
      }

      const avg = entry.count > 0 ? entry.sum / entry.count : null;
      return [avgLat, avgLng, metricToIntensity(metric, avg)];
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
  }, [map, metric, points, zoom]);

  return null;
}

function DirectMarkers({ points, onPointClick }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !points.length) return undefined;

    const layer = L.layerGroup();
    for (const point of points) {
      if (point.latitude == null || point.longitude == null) continue;
      const quality = getQuality(point);

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
  }, [map, points, onPointClick]);

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
  } = useDeviceData(apiMode);

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

  const allRegionsEnabled = showAllRegions || selectedRegion === ALL_REGIONS_ID;

  const pointsToRender = allRegionsEnabled
    ? mapPoints
    : mapPoints.filter((point) => getRegionLabel(point) === selectedRegion);

  const allReadingPoints = allRegionsEnabled
    ? heatmapPoints
    : heatmapPoints.filter((point) => getRegionLabel(point) === selectedRegion);

  const displayedPoints = showAllReadings ? allReadingPoints : pointsToRender;
  const crowdsourcedPoints = displayedPoints.filter((point) => !point.is_prediction);

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

  const heatPointsForView = useMemo(() => {
    return displayedPoints;
  }, [displayedPoints]);

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

  const selectedRegionPoint = pointsToRender[0] || null;
  const sidePanelPoint = selectedPoint || displayedPoints[0] || selectedRegionPoint || null;

  const mapCenter = sidePanelPoint
    ? [sidePanelPoint.latitude, sidePanelPoint.longitude]
    : [30.0444, 31.2357];

  const mapKey = `${showAllRegions}-${selectedRegion}`;

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

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Operator</span>
            <select
              className="header-device-select"
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
            >
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>{operator.label}</option>
              ))}
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Period</span>
            <select
              className="header-device-select"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <option value="24h">Last 24h</option>
              <option value="week">Last week</option>
              <option value="month">Last month</option>
              <option value="all">All history</option>
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Network type</span>
            <select
              className="header-device-select"
              value={selectedNetworkType}
              onChange={(e) => setSelectedNetworkType(e.target.value)}
            >
              {networkTypes.map((networkType) => (
                <option key={networkType.id} value={networkType.id}>{networkType.label}</option>
              ))}
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Data source</span>
            <select
              className="header-device-select"
              value={dataSourceMode}
              onChange={(e) => setDataSourceMode(e.target.value)}
            >
              <option value="crowdsourced">Crowdsourced only</option>
              <option value="predicted">ML model (predicted)</option>
              <option value="both">Both</option>
            </select>
          </div>

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

          {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
            <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Min prediction confidence</span>
              <select
                className="header-device-select"
                value={String(predictionConfidenceMin)}
                onChange={(e) => setPredictionConfidenceMin(Number(e.target.value))}
              >
                <option value="0">Any</option>
                <option value="0.5">50%+</option>
                <option value="0.7">70%+</option>
                <option value="0.85">85%+</option>
              </select>
            </div>
          )}

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
              <MapContainer key={mapKey} center={mapCenter} zoom={11} className="leaflet-map" preferCanvas={true}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <AutoFitBounds points={displayedPoints} enabled={showAllRegions} />

                {showHeatView && heatPointsForView.length > 0 && (
                  <HeatLayer points={heatPointsForView} metric={heatMetric} />
                )}

                {showAllReadings ? (
                  <DirectMarkers
                    points={crowdsourcedPoints}
                    onPointClick={handlePointFocus}
                  />
                ) : (
                  <DirectMarkers
                    points={dedupedMarkers}
                    onPointClick={handlePointFocus}
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
