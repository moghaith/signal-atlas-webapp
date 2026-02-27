import { useState } from "react";

const COLORS = {
  bg: "#f0f4f8",
  surface: "#ffffff",
  card: "#f8fafc",
  border: "#e2e8f0",
  accent1: "#6b9ae8",  
  accent2: "#9b8ec4",   
  accent3: "#7c6fcd",
  text: "#1e293b",
  muted: "#64748b",
};
// i just made simple mockup to start with, so you guys can edit whatever/ suggest changes, will work on backend api later
const pages = [
  {
    id: "overview",
    title: "Home / Overview",
    tag: "Page 01",
    description:
      "Landing page showing a high-level summary of the selected device. Stat cards for key metrics, device info panel, and time-series charts.",
    accent: COLORS.accent1,
    layout: [
      { area: "Header — Logo · Nav · Device Selector · Refresh", h: 56, col: "1 / -1", accent: COLORS.accent1 },
      { area: "Stat Card — RSRP", h: 100, note: "Value · Unit · Quality label · Color indicator", accent: COLORS.accent1 },
      { area: "Stat Card — RSSI", h: 100, note: "Value · Unit · Quality label", accent: COLORS.accent1 },
      { area: "Stat Card — RSRQ", h: 100, note: "Value · Unit · Quality label", accent: COLORS.accent2 },
      { area: "Stat Card — ASU", h: 100, note: "Value 0–97 · Progress bar", accent: COLORS.accent2 },
      { area: "Device Info Panel", h: 130, col: "1 / 3", note: "Operator · Network Type · Physical Cell ID · Tracking Area Code · Coordinates", accent: COLORS.accent3 },
      { area: "Signal Level Chart", h: 130, col: "3 / 5", note: "Line chart — signal level over last N readings", accent: COLORS.accent2 },
      { area: "RSRP / RSSI Dual Chart", h: 150, col: "1 / 3", note: "Two lines — RSRP (blue) and RSSI (purple)", accent: COLORS.accent1 },
      { area: "RSRQ Chart", h: 150, col: "3 / 5", note: "Line chart — RSRQ over time with threshold reference line", accent: COLORS.accent2 },
    ],
    apis: [
      { method: "GET", endpoint: "/api/devices", description: "Returns list of all device IDs for the selector dropdown.", response: "[ device_id, ... ]" },
      { method: "GET", endpoint: "/api/readings/latest?device_id={id}", description: "Single most recent reading for the selected device. Populates stat cards and device info.", response: "{ device_id, timestamp, rsrp, rssi, rsrq, asu, level, operator, network_type, physical_cell_id, tracking_area_code, latitude, longitude }" },
      { method: "GET", endpoint: "/api/readings/history?device_id={id}&limit=50", description: "Last N readings for time-series charts. Only signal fields returned.", response: "[ { timestamp, rsrp, rssi, rsrq, asu, level }, ... ]" },
    ],
  },
  {
    id: "detail",
    title: "Device Detail",
    tag: "Page 02",
    description: "Full deep-dive into a single device. Per-metric charts across full history, and a paginated raw readings table.",
    accent: COLORS.accent2,
    layout: [
      { area: "Header + Back to Overview", h: 56, col: "1 / -1", accent: COLORS.accent2 },
      { area: "Device Identity Card", h: 100, col: "1 / -1", note: "Device ID · Operator · Network Type · Cell ID · TAC · Last seen", accent: COLORS.accent2 },
      { area: "RSRP over Time", h: 160, col: "1 / 3", note: "Full history — blue line chart", accent: COLORS.accent1 },
      { area: "RSSI over Time", h: 160, col: "3 / 5", note: "Full history — purple line chart", accent: COLORS.accent2 },
      { area: "RSRQ over Time", h: 160, col: "1 / 3", note: "Full history with quality threshold bands", accent: COLORS.accent3 },
      { area: "ASU over Time", h: 160, col: "3 / 5", note: "Full history — 0 to 97 range", accent: COLORS.accent1 },
      { area: "Raw Readings Table — paginated", h: 190, col: "1 / -1", note: "Timestamp · RSRP · RSSI · RSRQ · ASU · Level · Network Type", accent: COLORS.muted },
    ],
    apis: [
      { method: "GET", endpoint: "/api/readings/history?device_id={id}", description: "Full reading history. Used for all four charts and the table.", response: "[ { timestamp, rsrp, rssi, rsrq, asu, level, operator, network_type }, ... ]" },
      { method: "GET", endpoint: "/api/devices/{id}/info", description: "Static device metadata for the identity card.", response: "{ device_id, operator, network_type, cell_id, physical_cell_id, tracking_area_code }" },
    ],
  },
  {
    id: "map",
    title: "Map View",
    tag: "Page 03",
    description: "Geographic view of all device readings. Color-coded markers by signal quality. Click a marker to see the latest reading in a side panel.",
    accent: COLORS.accent3,
    layout: [
      { area: "Header + Filter Bar", h: 56, col: "1 / -1", note: "Filter: operator · network type · signal quality · date range", accent: COLORS.accent3 },
      { area: "Interactive Map (Leaflet.js)", h: 400, col: "1 / 4", note: "Color-coded markers per device. Green = good · Yellow = fair · Red = poor. Clustered when zoomed out.", accent: COLORS.accent1 },
      { area: "Device Side Panel", h: 400, col: "4 / 5", note: "Appears on marker click. Device ID · RSRP · RSSI · RSRQ · ASU · Operator · Link to Detail page", accent: COLORS.accent2 },
      { area: "Legend — signal quality color key", h: 56, col: "1 / -1", note: "Green: Excellent  ·  Yellow: Fair  ·  Red: Poor  ·  Grey: No data", accent: COLORS.muted },
    ],
    apis: [
      { method: "GET", endpoint: "/api/readings/locations", description: "One row per device — latest lat, lng, signal level, device_id only. Lightweight endpoint for placing markers.", response: "[ { device_id, latitude, longitude, level, rsrp }, ... ]" },
      { method: "GET", endpoint: "/api/readings/latest?device_id={id}", description: "Called on marker click. Returns full latest reading to populate the side panel.", response: "{ device_id, rsrp, rssi, rsrq, asu, operator, network_type, timestamp }" },
    ],
  },
  {
    id: "reports",
    title: "Historical Reports",
    tag: "Page 04",
    description: "Query and export historical signal data across devices and custom date ranges. Summary statistics computed server-side.",
    accent: COLORS.accent1,
    layout: [
      { area: "Header", h: 56, col: "1 / -1", accent: COLORS.accent1 },
      { area: "Query Builder — Device · From · To · Metrics · Apply", h: 72, col: "1 / -1", note: "Multi-select metrics: RSRP · RSSI · RSRQ · ASU", accent: COLORS.accent1 },
      { area: "Trend Chart", h: 200, col: "1 / -1", note: "Multi-line chart for selected metrics over chosen date range", accent: COLORS.accent2 },
      { area: "Min", h: 80, note: "Per-metric minimum", accent: COLORS.accent1 },
      { area: "Max", h: 80, note: "Per-metric maximum", accent: COLORS.accent1 },
      { area: "Average", h: 80, note: "Per-metric mean", accent: COLORS.accent2 },
      { area: "Std Dev", h: 80, note: "Standard deviation", accent: COLORS.accent2 },
      { area: "Data Table — paginated", h: 190, col: "1 / -1", note: "Timestamp · RSRP · RSSI · RSRQ · ASU · Level", accent: COLORS.muted },
      { area: "Export as CSV", h: 48, col: "1 / -1", note: "Downloads current query result as .csv file", accent: COLORS.accent3 },
    ],
    apis: [
      { method: "GET", endpoint: "/api/readings?device_id={id}&from={date}&to={date}&fields=timestamp,rsrp,rssi,rsrq,asu,level", description: "Filtered readings for the selected device and date range. Only requested fields returned.", response: "[ { timestamp, rsrp, rssi, rsrq, asu, level }, ... ]" },
      { method: "GET", endpoint: "/api/readings/stats?device_id={id}&from={date}&to={date}", description: "Pre-computed summary stats (min, max, avg, std). Computed server-side.", response: "{ rsrp: { min, max, avg, std }, rssi: {...}, rsrq: {...}, asu: {...} }" },
      { method: "GET", endpoint: "/api/readings/export?device_id={id}&from={date}&to={date}", description: "Returns a CSV file download of the filtered readings.", response: "text/csv file" },
    ],
  },
];

function WireframeBlock({ area, h, col, note, accent }) {
  return (
    <div style={{
      gridColumn: col || "span 1",
      height: h,
      border: `1.5px dashed ${accent}55`,
      borderRadius: 10,
      padding: "10px 14px",
      background: `${accent}0d`,
      display: "flex",
      flexDirection: "column",
      gap: 5,
      boxSizing: "border-box",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accent}99, transparent)`,
        borderRadius: "10px 10px 0 0",
      }} />
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: accent, marginTop: 2 }}>
        {area}
      </div>
      {note && <div style={{ fontSize: 11, color: COLORS.muted, lineHeight: 1.5 }}>{note}</div>}
    </div>
  );
}

function ApiRow({ method, endpoint, description, response }) {
  return (
    <div style={{
      border: `1px solid ${COLORS.border}`,
      borderRadius: 10,
      overflow: "hidden",
      marginBottom: 10,
      background: COLORS.card,
    }}>
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
        padding: "8px 14px",
        background: COLORS.surface,
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <span style={{
          background: "#1a3a5c", color: COLORS.accent1,
          border: `1px solid ${COLORS.accent1}44`,
          borderRadius: 4, padding: "2px 8px",
          fontSize: 11, fontWeight: 700, fontFamily: "monospace",
        }}>
          {method}
        </span>
        <code style={{ fontSize: 12, color: COLORS.accent2, wordBreak: "break-all" }}>{endpoint}</code>
      </div>
      <div style={{ padding: "10px 14px" }}>
        <p style={{ margin: "0 0 6px", fontSize: 13, color: COLORS.text }}>{description}</p>
        <div style={{ fontSize: 11, color: COLORS.muted }}>
          <strong>Response: </strong>
          <code style={{
            background: COLORS.bg, color: COLORS.accent1,
            padding: "2px 6px", borderRadius: 4, wordBreak: "break-all",
          }}>
            {response}
          </code>
        </div>
      </div>
    </div>
  );
}

export default function Mockup() {
  const [activePage, setActivePage] = useState("overview");
  const page = pages.find((p) => p.id === activePage);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: COLORS.text }}>

      {/* Header */}
      <div style={{
        background: COLORS.surface,
        borderBottom: `1px solid ${COLORS.border}`,
        padding: "0 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 64,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/src/assets/logo_transparent_with_border.png" alt="Signal Atlas" style={{
            width: 38, height: 38,
            borderRadius: 8,
            objectFit: "cover",
          }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Signal Atlas</div>
          </div>
        </div>
        <div style={{
          fontSize: 11, color: COLORS.muted,
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          padding: "5px 12px", borderRadius: 6,
        }}>
          4 Pages · REST API Design
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", background: COLORS.surface,
        borderBottom: `1px solid ${COLORS.border}`,
        padding: "0 40px", gap: 4,
      }}>
        {pages.map((p) => (
          <button key={p.id} onClick={() => setActivePage(p.id)} style={{
            padding: "13px 20px", border: "none",
            borderBottom: activePage === p.id ? `2px solid ${p.accent}` : "2px solid transparent",
            background: "none", cursor: "pointer",
            fontSize: 13, fontWeight: activePage === p.id ? 600 : 400,
            color: activePage === p.id ? p.accent : COLORS.muted,
            transition: "all 0.15s",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: activePage === p.id ? p.accent : COLORS.border, fontFamily: "monospace" }}>
              {p.tag}
            </span>
            {p.title}
          </button>
        ))}
      </div>

      {/* Page content */}
      <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Page title */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: `${page.accent}18`, border: `1px solid ${page.accent}33`,
            color: page.accent, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "4px 10px", borderRadius: 20, marginBottom: 10,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: page.accent, display: "inline-block" }} />
            {page.tag}
          </div>
          <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700 }}>{page.title}</h2>
          <p style={{ margin: 0, color: COLORS.muted, fontSize: 14, maxWidth: 620, lineHeight: 1.6 }}>{page.description}</p>
        </div>

        {/* Wireframe */}
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
            ── Layout Wireframe
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {page.layout.map((block, i) => <WireframeBlock key={i} {...block} />)}
          </div>
        </div>

        {/* API Design */}
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
            ── API Calls — This Page
          </div>
          {page.apis.map((api, i) => <ApiRow key={i} {...api} />)}
          <div style={{
            marginTop: 12, padding: "10px 14px",
            background: `${COLORS.accent2}11`, border: `1px solid ${COLORS.accent2}33`,
            borderRadius: 8, fontSize: 12, color: COLORS.muted,
          }}>
          </div>
        </div>
      </div>
    </div>
  );
}