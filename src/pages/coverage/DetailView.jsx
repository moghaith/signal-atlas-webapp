import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import {
  getCoverageRequest,
  getCoverageRequestProgress,
  getCoverageRequestContributions,
} from "../../data/coverageRequestService";

function PolygonLayer({ geojson }) {
  const map = useMap();
  useEffect(() => {
    if (!geojson) return;
    const coords = geojson.coordinates[0].map(([lng, lat]) => [lat, lng]);
    const poly = L.polygon(coords, {
      color: "#2563eb", weight: 2, fillColor: "#2563eb", fillOpacity: 0.15,
    }).addTo(map);
    map.fitBounds(poly.getBounds(), { padding: [30, 30] });
    return () => map.removeLayer(poly);
  }, [map, geojson]);
  return null;
}

const STATUS_COLORS = {
  OPEN:      { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  COMPLETED: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  CANCELLED: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
};

export default function DetailView({ id, onBack, onEdit }) {
  const [request,       setRequest]       = useState(null);
  const [progress,      setProgress]      = useState(null);
  const [contributions, setContributions] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  useEffect(() => {
    if (!id) {
      setError("No request ID provided.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      getCoverageRequest(id),
      getCoverageRequestProgress(id),
      getCoverageRequestContributions(id),
    ])
      .then(([req, prog, contrib]) => {
        setRequest(req);
        setProgress(prog);
        setContributions(contrib?.contributors || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="cr-loading">Loading request…</div>;
  if (error)   return <div className="cr-error-banner">{error}</div>;
  if (!request) return null;

  const sc = STATUS_COLORS[request.status] || STATUS_COLORS.OPEN;
  const progressPct = progress?.progress_percentage ?? 0;
  const mapCenter = request.area
    ? (() => {
        const coords = request.area.coordinates[0];
        const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
        const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
        return [lat, lng];
      })()
    : [26.8206, 30.8025];

  return (
    <div className="cr-detail-view">
      <div className="cr-detail-header">
        <button className="cr-back-btn" onClick={onBack}>← Back</button>
        <div className="cr-detail-title-row">
          <h3>{request.title}</h3>
          <span className="cr-status-badge" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
            {request.status}
          </span>
        </div>
        <button className="cr-btn cr-btn-secondary" onClick={() => onEdit(id)}>Edit</button>
      </div>

      {request.description && (
        <p className="cr-detail-description">{request.description}</p>
      )}

      <div className="cr-detail-meta-grid">
        <div className="cr-meta-item"><span>Country</span><strong>{request.country || "—"}</strong></div>
        <div className="cr-meta-item"><span>City</span><strong>{request.city || "—"}</strong></div>
        <div className="cr-meta-item"><span>Created by</span><strong>{request.created_by_display ?? request.created_by ?? "—"}</strong></div>
        <div className="cr-meta-item"><span>Created</span><strong>{new Date(request.created_at).toLocaleDateString()}</strong></div>
        <div className="cr-meta-item"><span>Reward</span><strong>{Number(request.reward_amount).toLocaleString()} EGP</strong></div>
        <div className="cr-meta-item"><span>Contributors</span><strong>{request.contributors_count ?? 0}</strong></div>
      </div>

      {/* Progress */}
      <div className="cr-detail-section">
        <h4>Progress</h4>
        <div className="cr-progress-row">
          <div className="cr-progress-bar cr-progress-bar-lg">
            <div className="cr-progress-fill" style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
          <span className="cr-progress-pct">{progressPct.toFixed(1)}%</span>
        </div>
        <div className="cr-progress-stats">
          <div className="cr-ps-stat">
            <span>Current density</span>
            <strong>{progress?.current_density_score?.toFixed(2) ?? "—"}</strong>
          </div>
          <div className="cr-ps-stat">
            <span>Target density</span>
            <strong>{progress?.target_density_score?.toFixed(2) ?? "—"}</strong>
          </div>
          <div className="cr-ps-stat">
            <span>Valid readings</span>
            <strong>{progress?.total_valid_readings ?? 0}</strong>
          </div>
        </div>
      </div>

      {/* Map */}
      {request.area && (
        <div className="cr-detail-section">
          <h4>Coverage Area</h4>
          <div className="cr-map-wrap">
            <MapContainer center={mapCenter} zoom={11} className="cr-leaflet-map" zoomControl scrollWheelZoom>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <PolygonLayer geojson={request.area} />
            </MapContainer>
          </div>
        </div>
      )}

      {/* Contributions table */}
      {contributions.length > 0 && (
          <div className="cr-detail-section">
            <h4>Contributors</h4>
            <div className="cr-contributors-table">
              <div className="cr-contrib-header">
                <span>Device / Source</span>
                <span>Readings</span>
                <span>Density contribution</span>
                <span>Reward share</span>
              </div>
              {contributions.map((c, i) => {
                const pct = progress?.current_density_score > 0
                  ? (c.density_contribution / progress.current_density_score) * 100
                  : 0;
                return (
                  <div key={c.device_id} className="cr-contrib-row">
                    <div className="cr-contrib-device">
                      <span className="cr-contrib-rank">#{i + 1}</span>
                      <span className="cr-contrib-id">{c.device_id}</span>
                    </div>
                    <div className="cr-contrib-cell">
                      <span className="cr-contrib-value">{c.total_readings.toLocaleString()}</span>
                      <span className="cr-contrib-label">readings</span>
                    </div>
                    <div className="cr-contrib-cell">
                      <span className="cr-contrib-value">{c.density_contribution?.toFixed(4) ?? "—"}</span>
                      <div className="cr-contrib-bar-wrap">
                        <div className="cr-contrib-bar">
                          <div className="cr-contrib-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="cr-contrib-bar-label">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="cr-contrib-cell">
                      <span className="cr-contrib-reward">
                        {c.reward_share != null
                          ? `${Number(c.reward_share).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`
                          : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="cr-contrib-footer">
                <span>{contributions.length} contributor{contributions.length !== 1 ? "s" : ""}</span>
                <span>
                  Total:{" "}
                  {contributions
                    .reduce((s, c) => s + (Number(c.reward_share) || 0), 0)
                    .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  EGP distributed
                </span>
              </div>
            </div>
          </div>
      )} 
    </div>
  );
}
