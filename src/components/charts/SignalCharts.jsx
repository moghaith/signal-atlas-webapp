import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import ChartWrapper from "./ChartWrapper";

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTrendTick(ts, period) {
  if (!ts) return "";
  const d = new Date(ts);
  if (period === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (period === "week") return d.toLocaleString([], { weekday: "short", hour: "2-digit" });
  if (period === "month") return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function MeanRsrpTrendChart({ data, period = "all", aggregationLabel = "weekly" }) {
  return (
    <ChartCard title={`Mean RSRP Over Time (${aggregationLabel})`}>
      <ChartWrapper height={220}>
        {(width) => (
          <ResponsiveContainer width={width} height={220}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="timestamp" tickFormatter={(v) => formatTrendTick(v, period)} tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <Tooltip formatter={(v) => v == null ? "-" : Number(v).toFixed(1)} labelFormatter={(v) => new Date(v).toLocaleString()} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Line type="monotone" dataKey="mean_rsrp" stroke="#2563eb" strokeWidth={2} dot={false} name="Mean RSRP" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartWrapper>
    </ChartCard>
  );
}

export function MeanRsrqTrendChart({ data, period = "all", aggregationLabel = "weekly" }) {
  return (
    <ChartCard title={`Mean RSRQ Over Time (${aggregationLabel})`}>
      <ChartWrapper height={220}>
        {(width) => (
          <ResponsiveContainer width={width} height={220}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="timestamp" tickFormatter={(v) => formatTrendTick(v, period)} tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <Tooltip formatter={(v) => v == null ? "-" : Number(v).toFixed(1)} labelFormatter={(v) => new Date(v).toLocaleString()} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Line type="monotone" dataKey="mean_rsrq" stroke="#7c3aed" strokeWidth={2} dot={false} name="Mean RSRQ" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartWrapper>
    </ChartCard>
  );
}

export function CoverageQualityTrendChart({ data, period = "all", aggregationLabel = "weekly" }) {
  return (
    <ChartCard title={`Coverage Quality % (${aggregationLabel})`}>
      <ChartWrapper height={220}>
        {(width) => (
          <ResponsiveContainer width={width} height={220}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="timestamp" tickFormatter={(v) => formatTrendTick(v, period)} tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" domain={[0, 100]} />
              <Tooltip formatter={(v) => v == null ? "-" : `${Number(v).toFixed(1)}%`} labelFormatter={(v) => new Date(v).toLocaleString()} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Line type="monotone" dataKey="coverage_quality_percent" stroke="#16a34a" strokeWidth={2} dot={false} name="Coverage Quality %" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartWrapper>
    </ChartCard>
  );
}

/* ── Signal Level Chart ─────────────────────────────────── */
export function SignalLevelChart({ data }) {
  return (
    <ChartCard title="Signal Level">
      <ChartWrapper height={180}>
        {(width) => (
          <ResponsiveContainer width={width} height={180}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" domain={[0, 5]} />
              <Tooltip formatter={(v) => v == null ? "-" : Number(v).toFixed(0)} labelFormatter={(v) => new Date(v).toLocaleString()} />
              <Line type="monotone" dataKey="level" stroke="#9b8ec4" strokeWidth={2} dot={false} name="Level" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartWrapper>
    </ChartCard>
  );
}

/* ── RSRP / RSSI Dual Chart ────────────────────────────── */
export function DualSignalChart({ data }) {
  return (
    <ChartCard title="RSRP / RSSI">
      <ChartWrapper height={200}>
        {(width) => (
          <ResponsiveContainer width={width} height={200}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <Tooltip formatter={(v, name) => [Number(v).toFixed(1), name]} labelFormatter={(v) => new Date(v).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="rsrp" stroke="#6b9ae8" strokeWidth={2} dot={false} name="RSRP" />
              <Line type="monotone" dataKey="rssi" stroke="#9b8ec4" strokeWidth={2} dot={false} name="RSSI" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartWrapper>
    </ChartCard>
  );
}

/* ── RSRQ Chart with threshold line ─────────────────────── */
export function RSRQChart({ data }) {
  return (
    <ChartCard title="RSRQ">
      <ChartWrapper height={200}>
        {(width) => (
          <ResponsiveContainer width={width} height={200}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <Tooltip formatter={(v) => v == null ? "-" : Number(v).toFixed(1)} labelFormatter={(v) => new Date(v).toLocaleString()} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <ReferenceLine y={-12} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "Fair", fill: "#f59e0b", fontSize: 11, position: "insideTopLeft" }} />
              <ReferenceLine y={-15} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "Poor", fill: "#ef4444", fontSize: 11, position: "insideTopLeft" }} />
              <Line type="monotone" dataKey="rsrq" stroke="#7c6fcd" strokeWidth={2} dot={false} name="RSRQ" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartWrapper>
    </ChartCard>
  );
}

/* ── Shared chart wrapper ───────────────────────────────── */
function ChartCard({ title, children }) {
  return (
    <div className="chart-card">
      <h3 className="chart-card-title">{title}</h3>
      {children}
    </div>
  );
}
