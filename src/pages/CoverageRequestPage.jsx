import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import Header from "../components/Header/Header";
import "./CoverageRequestPage.css";

export default function CoverageRequestPage({ activePage, onNavigate, apiMode, onApiModeChange }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [operator, setOperator] = useState("");
  const [networkType, setNetworkType] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  useEffect(() => {
    if (user) {
      loadRequests();
    }
  }, [user]);

  async function loadRequests() {
    setLoadingRequests(true);
    try {
      const { data, error } = await supabase
        .from("coverage_requests")
        .select("*")
        .eq("created_by", user.email)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRequests(data || []);
    } catch {
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    setMessageType("");

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setMessage("Please enter valid latitude and longitude values.");
      setMessageType("error");
      setSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase.from("coverage_requests").insert({
        title: title || "Coverage Request",
        created_by: user.email,
        latitude: lat,
        longitude: lng,
        operator: operator || null,
        network_type: networkType || null,
        description: description || null,
        country: "",
        city: "",
      });
      if (error) throw error;
      setMessage("Coverage request submitted successfully!");
      setMessageType("success");
      setTitle("");
      setLatitude("");
      setLongitude("");
      setOperator("");
      setNetworkType("");
      setDescription("");
      await loadRequests();
    } catch (err) {
      setMessage(err.message || "Failed to submit coverage request.");
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        apiMode={apiMode}
        onApiModeChange={onApiModeChange}
      />
      <main className="page-content">
        <section className="page-intro">
          <span className="page-tag">Coverage</span>
          <h2>Request Coverage</h2>
          <p>Submit a request for mobile network coverage at a specific location.</p>
        </section>

        <div className="coverage-layout">
          <div className="coverage-card">
            <form onSubmit={handleSubmit} className="coverage-form">
              <div className="form-group">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Poor signal in downtown area"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="lat">Latitude</label>
                  <input
                    id="lat"
                    type="text"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="e.g. 29.9422"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="lng">Longitude</label>
                  <input
                    id="lng"
                    type="text"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="e.g. 31.0659"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="op">Operator (optional)</label>
                  <input
                    id="op"
                    type="text"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    placeholder="e.g. Vodafone, Orange"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="net">Network type (optional)</label>
                  <input
                    id="net"
                    type="text"
                    value={networkType}
                    onChange={(e) => setNetworkType(e.target.value)}
                    placeholder="e.g. 4G, 5G"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="desc">Description (optional)</label>
                <textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the coverage issue or request details..."
                  rows={3}
                />
              </div>

              {message && (
                <div className={`form-message ${messageType === "success" ? "success" : ""}`}>
                  {message}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </form>
          </div>

          <div className="coverage-card">
            <h3 className="coverage-card-title">Your Requests</h3>
            {loadingRequests ? (
              <p className="coverage-empty">Loading...</p>
            ) : requests.length === 0 ? (
              <p className="coverage-empty">No coverage requests yet.</p>
            ) : (
              <div className="coverage-requests-list">
                {requests.map((req) => (
                  <div key={req.id} className="coverage-request-item">
                    <div className="coverage-request-title">{req.title}</div>
                    {req.latitude != null && req.longitude != null && (
                      <div className="coverage-request-coords">
                        {Number(req.latitude).toFixed(4)}, {Number(req.longitude).toFixed(4)}
                      </div>
                    )}
                    {req.operator && <div className="coverage-request-op">Operator: {req.operator}</div>}
                    {req.network_type && <div className="coverage-request-net">Network: {req.network_type}</div>}
                    {req.description && <div className="coverage-request-desc">{req.description}</div>}
                    <div className="coverage-request-status">
                      Status: <span className={`status-${req.status || "pending"}`}>{req.status || "pending"}</span>
                    </div>
                    <div className="coverage-request-date">
                      {new Date(req.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
