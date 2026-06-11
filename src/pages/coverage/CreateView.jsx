import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./CoverageRequests.css";
import { useAuth } from "../../contexts/AuthContext";
import { createCoverageRequest, getPolygonDensityScore } from "../../data/coverageRequestService";
import { get } from "../../services/apiClient";
import {
  HiOutlineMap,
  HiOutlineSignal,
  HiOutlineExclamationTriangle,
  HiOutlineClock
} from "react-icons/hi2";

// ─── Polygon drawing controller ───────────────────────────────────────────────

function snapToFirst(latlngs, thresholdPx, map) {
  if (latlngs.length < 3) return false;
  const first = map.latLngToContainerPoint(latlngs[0]);
  const last = map.latLngToContainerPoint(latlngs[latlngs.length - 1]);
  return first.distanceTo(last) <= thresholdPx;
}

function selfIntersects(latlngs) {
  // Check if any two non-adjacent segments intersect (simple O(n²) check)
  const pts = latlngs.map((ll) => ({ x: ll.lng, y: ll.lat }));
  const n = pts.length;
  function seg(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = cross(c, d, a), d2 = cross(c, d, b);
    const d3 = cross(a, b, c), d4 = cross(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (i === 0 && j === n - 2) continue;
      if (seg(pts[i], pts[i + 1], pts[j], pts[j + 1])) return true;
    }
  }
  return false;
}

function latlngsToGeoJsonPolygon(latlngs) {
  const coords = [...latlngs, latlngs[0]].map((ll) => [ll.lng, ll.lat]);
  return { type: "Polygon", coordinates: [coords] };
}

function polygonCentroid(latlngs) {
  const lat = latlngs.reduce((s, ll) => s + ll.lat, 0) / latlngs.length;
  const lng = latlngs.reduce((s, ll) => s + ll.lng, 0) / latlngs.length;
  return { lat, lng };
}

// ─── Map drawing layer (mounts inside MapContainer) ──────────────────────────

function DrawingLayer({
    mode,
    polygon,
    setPolygon,
    editIndex,
    setEditIndex,
    drawingError,
    setDrawingError,
    setDensityScore,
    setDensityLoading,
    setDensityError,
    setForm
  }) {
  const map = useMap();
  const layerRef = useRef(null);
  const previewLineRef = useRef(null);
  const vertexLayerRef = useRef(null);
  const mousePosRef = useRef(null);

  const redraw = useCallback((latlngs, closed) => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (vertexLayerRef.current) { map.removeLayer(vertexLayerRef.current); vertexLayerRef.current = null; }
    if (!latlngs.length) return;

    const style = closed
      ? { color: "#2563eb", weight: 2, fillColor: "#2563eb", fillOpacity: 0.15, dashArray: null }
      : { color: "#2563eb", weight: 2, fillColor: "transparent", fillOpacity: 0, dashArray: "6 4" };

    layerRef.current = closed
      ? L.polygon(latlngs, style).addTo(map)
      : L.polyline(latlngs, style).addTo(map);

    // vertex markers
    const vg = L.layerGroup().addTo(map);
    vertexLayerRef.current = vg;

    latlngs.forEach((ll, i) => {
      const isFirst = i === 0;
      const marker = L.circleMarker(ll, {
        radius: isFirst ? 7 : 5,
        color: "#ffffff",
        weight: 2,
        fillColor: isFirst ? "#2563eb" : "#64748b",
        fillOpacity: 1,
        interactive: closed || mode === "edit",
      });

      if (closed && mode === "edit") {
        marker.on("mousedown", (e) => {
          L.DomEvent.stopPropagation(e);
          setEditIndex(i);
          map.dragging.disable();
        });
      }

      // Snap hint on first vertex while drawing
      if (!closed && isFirst && latlngs.length >= 3) {
        marker.setStyle({ fillColor: "#16a34a", radius: 9 });
        marker.bindTooltip("Click to close", { permanent: false, direction: "top" });
      }

      marker.addTo(vg);
    });
  }, [map, mode, setEditIndex]);

  // Mouse tracking for preview line
  useMapEvents({
    mousemove(e) {
      mousePosRef.current = e.latlng;
      if (mode !== "draw" || !polygon.length || polygon.closed) return;
      if (previewLineRef.current) map.removeLayer(previewLineRef.current);
      const last = polygon.points[polygon.points.length - 1];
      previewLineRef.current = L.polyline([last, e.latlng], {
        color: "#94a3b8", weight: 1.5, dashArray: "4 4", interactive: false,
      }).addTo(map);
    },
    mouseout() {
      if (previewLineRef.current) { map.removeLayer(previewLineRef.current); previewLineRef.current = null; }
    },
    click(e) {
      if (mode !== "draw" || polygon.closed) return;
      const latlng = e.latlng;
      const current = polygon.points;

      // Snap to close?
      if (current.length >= 3 && snapToFirst(current, 20, map)) {
        if (previewLineRef.current) { map.removeLayer(previewLineRef.current); previewLineRef.current = null; }
        setPolygon({ points: current, closed: true });
        setDrawingError(null);
        return;
      }

      const next = [...current, latlng];

      // Self-intersection check
      if (next.length >= 4 && selfIntersects(next)) {
        setDrawingError("Lines cannot cross — polygon would self-intersect.");
        return;
      }

      setDrawingError(null);
      setPolygon({ points: next, closed: false });
    },
    mousedown(e) {
      if (mode !== "edit" || editIndex === null || !polygon.closed) return;
      // handled by vertex marker
    },
    mousemove_edit(e) {},
  });

  // Edit drag handling
  useEffect(() => {
    if (mode !== "edit" || !polygon.closed) return;
    const onMouseMove = (e) => {
      if (editIndex === null) return;
      const latlng = map.mouseEventToLatLng(e.originalEvent || e);
      const next = [...polygon.points];
      next[editIndex] = latlng;
      if (next.length >= 4 && selfIntersects(next)) return;
      setPolygon({ points: next, closed: true });
    };
    const onMouseUp = () => {
      if (editIndex !== null) {
        setEditIndex(null);
        map.dragging.enable();
      }
    };
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    return () => { map.off("mousemove", onMouseMove); map.off("mouseup", onMouseUp); };
  }, [map, mode, polygon, editIndex, setPolygon, setEditIndex]);

  // Redraw whenever polygon changes
  useEffect(() => {
    redraw(polygon.points, polygon.closed);
  }, [polygon, redraw]);

  // Cleanup preview line when mode changes
  useEffect(() => {
    if (mode !== "draw") {
      if (previewLineRef.current) { map.removeLayer(previewLineRef.current); previewLineRef.current = null; }
    }
  }, [mode, map]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (layerRef.current) map.removeLayer(layerRef.current);
    if (previewLineRef.current) map.removeLayer(previewLineRef.current);
    if (vertexLayerRef.current) map.removeLayer(vertexLayerRef.current);
  }, [map]);

  // calculate density score when polygon closes
  useEffect(() => {
    if (!polygon.closed || polygon.points.length < 3) {
      setDensityScore(null);
      setDensityError(null);
      return;
    }

    let cancelled = false;
    setDensityLoading(true);
    setDensityError(null);
    setDensityScore(null);

    getPolygonDensityScore(latlngsToGeoJsonPolygon(polygon.points))
      .then((result) => {
        if (cancelled) return;
        setDensityScore(result);
        // Pre-fill target only if field is empty
        setForm((f) => ({
          ...f,
          target_density_score: f.target_density_score === ""
            ? String((result.density_score * 2).toFixed(2))
            : f.target_density_score,
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        setDensityError(err.message);
      })
      .finally(() => {
        if (!cancelled) setDensityLoading(false);
      });

    return () => { cancelled = true; };
  }, [polygon.closed, polygon.points]);

  return null;
}

// ─── Area + centroid info ─────────────────────────────────────────────────────

function polygonAreaKm2(latlngs) {
  if (latlngs.length < 3) return 0;
  const R = 6371; // Earth radius km
  const pts = latlngs.map((ll) => ({
    lat: (ll.lat * Math.PI) / 180,
    lng: (ll.lng * Math.PI) / 180,
  }));
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].lng * pts[j].lat;
    area -= pts[j].lng * pts[i].lat;
  }
  // Convert from steradians to km²
  area = (Math.abs(area) / 2) * R * R * Math.cos(
    pts.reduce((s, p) => s + p.lat, 0) / pts.length
  );
  return area;
}

// ─── Main page ────────────────────────────────────────────────────────────────

const INITIAL_POLYGON = { points: [], closed: false };
const MAP_CENTER = [26.8206, 30.8025]; // Egypt center

export default function CreateView({ onBack, onCreated, deviceData }) {
  const { user, profile } = useAuth();
  const [mapMode, setMapMode] = useState("pan"); // "pan" | "draw" | "edit"
  const [polygon, setPolygon] = useState(INITIAL_POLYGON);
  const [editIndex, setEditIndex] = useState(null);
  const [drawingError, setDrawingError] = useState(null);

  const [densityScore, setDensityScore]     = useState(null);
  const [densityLoading, setDensityLoading] = useState(false);
  const [densityError, setDensityError]     = useState(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    country: "",
    city: "",
    target_density_score: "",
    reward_amount: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [creditBalance, setCreditBalance] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);

  const areaKm2 = polygon.closed && polygon.points.length >= 3
    ? polygonAreaKm2(polygon.points).toFixed(2)
    : null;

  const centroid = polygon.closed && polygon.points.length >= 3
    ? polygonCentroid(polygon.points)
    : null;

  const handleModeSwitch = (next) => {
    if (next === "draw" && polygon.closed) {
      // Reset polygon when re-entering draw
      if (!window.confirm("Switch to draw mode? This will clear the current polygon.")) return;
      setPolygon(INITIAL_POLYGON);
      setDrawingError(null);
    }
    if (next === "pan") setEditIndex(null);
    setMapMode(next);
  };

  const handleResetPolygon = () => {
    setPolygon(INITIAL_POLYGON);
    setDrawingError(null);
    setMapMode("draw");
  };

  const handleClosePolygon = () => {
    if (polygon.points.length >= 3 && !polygon.closed) {
      setPolygon((p) => ({ ...p, closed: true }));
      setMapMode("edit");
    }
  };

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // Auto-fill country/city from centroid if deviceData has regions
  useEffect(() => {
    if (!centroid || !deviceData) return;
    // If the form fields are empty and we can infer from centroid proximity, fill them
    // (This is a best-effort hint; user can override)
  }, [centroid, deviceData]);

  useEffect(() => {
    if (!user?.id) {
      setCreditBalance(null);
      setCreditLoading(false);
      return;
    }

    let cancelled = false;
    setCreditLoading(true);

    get('/api/users/me', { auth: true })
      .then((data) => {
        if (cancelled) return;
        setCreditBalance(Number(data?.credits ?? 0));
      })
      .catch(() => {
        if (!cancelled) {
          setCreditBalance(Number(profile?.credits ?? 0));
        }
      })
      .finally(() => {
        if (!cancelled) setCreditLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile?.credits, user?.id]);

  const targetDensity = Number(form.target_density_score);
  const currentDensity = densityScore?.density_score ?? 0;
  const availableCredits = Number(creditBalance ?? profile?.credits ?? 0);
  const rewardAmount = Number(form.reward_amount);
  const rewardTooHigh =
    Number.isFinite(rewardAmount) && rewardAmount > 0 && rewardAmount > availableCredits;
  const isSignedIn = Boolean(user?.id);

  const canSubmit =
    isSignedIn &&
    polygon.closed &&
    polygon.points.length >= 3 &&
    form.title.trim() &&
    targetDensity > 0 &&
    targetDensity > currentDensity &&
    form.reward_amount &&
    rewardAmount > 0 &&
    !rewardTooHigh &&
    !densityLoading &&
    !creditLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const latestProfile = await get('/api/users/me', { auth: true });
      const latestCredits = Number(latestProfile?.credits ?? 0);
      const requestedReward = Number(form.reward_amount);

      if (requestedReward > latestCredits) {
        throw new Error(
          `Reward cannot exceed your available balance of ${latestCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP.`
        );
      }

      const result = await createCoverageRequest({
        title:                form.title.trim(),
        description:          form.description.trim() || null,
        created_by:           user.email,
        created_by_id:        user.id || null,
        ...(form.country.trim() ? { country: form.country.trim() } : {}),
        ...(form.city.trim()    ? { city:    form.city.trim()    } : {}),
        area:                 latlngsToGeoJsonPolygon(polygon.points),
        target_density_score: Number(form.target_density_score),
        reward_amount:        requestedReward,
      });
      // onCreated(result.id); // navigate straight to detail
      const newId = result?.request_id;
      if (!newId) {
        console.error("createCoverageRequest response:", result);
        setSubmitError("Request created but response did not include request_id.");
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      onCreated(newId);
    } catch (err) {
      setSubmitError(err.message || "Failed to create coverage request.");
      setSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
        <div>
            <div className="cr-detail-header" style={{ marginBottom: 16 }}>
                <button className="cr-back-btn" onClick={onBack}>← Back to list</button>
                <h3>New Coverage Request</h3>
            </div>
            <main className="page-content cr-page">
                <div className="cr-success">
                <div className="cr-success-icon">✓</div>
                <h2>Coverage request created</h2>
          <p>Your request has been submitted. Credits will be deducted after approval.</p>
                <button
                    className="cr-btn cr-btn-primary"
                    onClick={() => {
                    setSubmitSuccess(false);
                    setPolygon(INITIAL_POLYGON);
                    setForm({ title: "", description: "", country: "", city: "", target_density_score: "", reward_amount: "" });
                    setMapMode("pan");
                    }}
                >
                    Create another
                </button>
                </div>
            </main>
      </div>
    );
  }

  return (
    <div>
        <div className="cr-detail-header" style={{ marginBottom: 16 }}>
            <button className="cr-back-btn" onClick={onBack}>← Back to list</button>
            <h3>New Coverage Request</h3>
        </div>
        <main className="page-content cr-page">
        {/* <section className="page-intro">
            <h2>Create Coverage Request</h2>
            <p>Draw an area on the map, set your density target and reward, and publish the request for contributors.</p>
        </section> */}

        {/* ── Map + drawing toolbar ── */}
        <section className="cr-map-section">
            <div className="cr-map-toolbar">
            <div className="cr-mode-group">
                <button
                className={`cr-tool-btn${mapMode === "pan" ? " active" : ""}`}
                onClick={() => handleModeSwitch("pan")}
                title="Pan / zoom"
                >
                ✥ Pan
                </button>
                <button
                className={`cr-tool-btn${mapMode === "draw" ? " active" : ""}`}
                onClick={() => handleModeSwitch("draw")}
                title="Draw polygon"
                >
                ✎ Draw
                </button>
                {polygon.closed && (
                <button
                    className={`cr-tool-btn${mapMode === "edit" ? " active" : ""}`}
                    onClick={() => handleModeSwitch("edit")}
                    title="Edit vertices"
                >
                    ⌖ Edit
                </button>
                )}
            </div>

            <div className="cr-map-actions">
                {!polygon.closed && polygon.points.length >= 3 && mapMode === "draw" && (
                <button className="cr-tool-btn cr-tool-close" onClick={handleClosePolygon}>
                    ⬡ Close polygon
                </button>
                )}
                {polygon.points.length > 0 && (
                <button className="cr-tool-btn cr-tool-reset" onClick={handleResetPolygon}>
                    ✕ Reset
                </button>
                )}
            </div>

            <div className="cr-map-badges">

              {areaKm2 && (
                <div className="cr-area-badge">
                  <HiOutlineMap />
                  <span>{areaKm2} km²</span>
                </div>
              )}

              {densityLoading && (
                <div className="cr-density-badge cr-density-badge-loading">
                  <HiOutlineClock />
                  <span>Calculating density...</span>
                </div>
              )}

              {!densityLoading && densityError && (
                <div className="cr-density-badge cr-density-badge-error">
                  <HiOutlineExclamationTriangle />
                  <span>Density unavailable</span>
                </div>
              )}

              {!densityLoading && densityScore && (
                <div className="cr-density-badge">
                  <HiOutlineSignal />
                  <span>
                    Density: {densityScore.density_score.toFixed(2)}
                  </span>
                </div>
              )}

            </div>
            
            </div>

            {drawingError && (
            <div className="cr-drawing-error">{drawingError}</div>
            )}

            <div className={`cr-map-wrap${mapMode === "draw" ? " cr-cursor-crosshair" : mapMode === "edit" ? " cr-cursor-move" : ""}`}>
            <MapContainer
                center={MAP_CENTER}
                zoom={6}
                className="cr-leaflet-map"
                zoomControl={true}
                scrollWheelZoom={true}
                dragging={mapMode !== "edit" || editIndex === null}
            >
                <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <DrawingLayer
                  mode={mapMode}
                  polygon={polygon}
                  setPolygon={setPolygon}
                  editIndex={editIndex}
                  setEditIndex={setEditIndex}
                  drawingError={drawingError}
                  setDrawingError={setDrawingError}
                  setDensityScore={setDensityScore}
                  setDensityLoading={setDensityLoading}
                  setDensityError={setDensityError}
                  setForm={setForm}
                />
            </MapContainer>
            </div>

            {mapMode === "draw" && !polygon.closed && (
            <p className="cr-map-hint">
                {polygon.points.length === 0
                ? "Click on the map to start drawing your coverage area."
                : polygon.points.length < 3
                ? `${polygon.points.length} point${polygon.points.length > 1 ? "s" : ""} — add at least ${3 - polygon.points.length} more.`
                : "Click the first point (green) or the 'Close polygon' button to finish."}
            </p>
            )}
            {mapMode === "edit" && polygon.closed && (
            <p className="cr-map-hint">Drag any vertex to reshape the polygon.</p>
            )}
        </section>

        {/* ── Form ── */}
        <section className="cr-form-section">
            <div className="cr-form-grid">

            <div className="cr-form-group cr-span-2">
                <label className="cr-label" htmlFor="cr-title">Title <span className="cr-required">*</span></label>
                <input
                id="cr-title"
                className="cr-input"
                name="title"
                value={form.title}
                onChange={handleFieldChange}
                placeholder="e.g. Cairo Downtown Coverage Survey"
                maxLength={255}
                />
            </div>

            <div className="cr-form-group cr-span-2">
                <label className="cr-label" htmlFor="cr-description">Description</label>
                <textarea
                id="cr-description"
                className="cr-input cr-textarea"
                name="description"
                value={form.description}
                onChange={handleFieldChange}
                placeholder="Describe the purpose of this coverage request..."
                rows={3}
                />
            </div>

            <div className="cr-form-group">
                <label className="cr-label" htmlFor="cr-created-by">Created by <span className="cr-required">*</span></label>
                <input
                id="cr-created-by"
                className="cr-input"
                name="created_by"
              value={user?.email ?? ""}
              readOnly
              placeholder={user ? "Signed-in account" : "Sign in required"}
                maxLength={100}
                />
            </div>

            <div className="cr-form-group">
                <label className="cr-label" htmlFor="cr-country">Country</label>
                <input
                id="cr-country"
                className="cr-input"
                name="country"
                value={form.country}
                onChange={handleFieldChange}
                placeholder="e.g. Egypt"
                maxLength={100}
                />
            </div>

            <div className="cr-form-group">
                <label className="cr-label" htmlFor="cr-city">City</label>
                <input
                id="cr-city"
                className="cr-input"
                name="city"
                value={form.city}
                onChange={handleFieldChange}
                placeholder="e.g. Cairo"
                maxLength={100}
                />
            </div>

            <div className="cr-form-group">
              <label className="cr-label" htmlFor="cr-density">
                Target density score <span className="cr-required">*</span>
                <span className="cr-label-hint"> (readings / km²)</span>
              </label>
              <input
                id="cr-density"
                className={`cr-input${
                  densityScore != null && targetDensity > 0 && targetDensity <= currentDensity
                    ? " cr-input-error"
                    : ""
                }`}
                name="target_density_score"
                type="number"
                min={densityScore != null ? densityScore.density_score + 0.01 : 0}
                step="0.01"
                value={form.target_density_score}
                onChange={handleFieldChange}
                placeholder="e.g. 10.0"
              />
              {densityScore != null && targetDensity > 0 && targetDensity <= currentDensity && (
                <span className="cr-field-error">
                  Must exceed current density of {densityScore.density_score.toFixed(4)}
                </span>
              )}
              {densityScore != null && targetDensity > currentDensity && (
                <span className="cr-field-hint">
                  +{(targetDensity - currentDensity).toFixed(4)} above current
                </span>
              )}
            </div>

            <div className="cr-form-group">
                <label className="cr-label" htmlFor="cr-reward">
                Reward amount <span className="cr-required">*</span>
                <span className="cr-label-hint"> (EGP)</span>
                </label>
                <input
                id="cr-reward"
                className="cr-input"
                name="reward_amount"
                type="number"
                min="0"
                step="0.01"
                value={form.reward_amount}
                onChange={handleFieldChange}
                placeholder="e.g. 500.00"
                />
                <span className="cr-label-hint">
                  Available balance: {availableCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP. Credits are deducted after approval.
                </span>
                {rewardTooHigh && (
                  <span className="cr-field-error">
                    Reward amount cannot exceed your current balance.
                  </span>
                )}
            </div>

            </div>

            {/* Polygon summary */}
            {polygon.closed && (
              <div className="cr-polygon-summary">
                <span className="cr-ps-label">Area defined</span>
                <span className="cr-ps-detail">{polygon.points.length} vertices · {areaKm2} km²</span>
                {centroid && (
                  <span className="cr-ps-detail">
                    centroid {centroid.lat.toFixed(4)}°, {centroid.lng.toFixed(4)}°
                  </span>
                )}

                {densityLoading && (
                  <span className="cr-ps-density cr-ps-density--loading">
                    Calculating current density…
                  </span>
                )}

                {!densityLoading && densityError && (
                  <span className="cr-ps-density cr-ps-density--error">
                    Could not fetch density: {densityError}
                  </span>
                )}

                {!densityLoading && densityScore != null && (
                  <span className="cr-ps-density cr-ps-density--value">
                    Current density: <strong>{densityScore.density_score.toFixed(4)}</strong>
                    <span className="cr-ps-density-sub">
                      ({densityScore.readings_count.toLocaleString()} unique coordinates)
                    </span>
                  </span>
                )}
              </div>
            )}

            {!polygon.closed && (
            <div className="cr-polygon-missing">
                ⚠ Draw and close a polygon on the map to define the coverage area.
            </div>
            )}

            {submitError && (
            <div className="cr-submit-error">{submitError}</div>
            )}

            <div className="cr-form-footer">
            <button
                className="cr-btn cr-btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
            >
                {submitting ? "Submitting…" : "Create coverage request"}
            </button>
            {!canSubmit && (
                <span className="cr-submit-hint">
              {!isSignedIn
                ? "Sign in to create a request"
                : rewardTooHigh
                ? "Lower the reward to fit your available balance"
                : !polygon.closed
                  ? "Draw an area first"
                  : "Fill in all required fields"}
                </span>
            )}
            </div>
        </section>
        </main>
    
    </div>
  );
}
