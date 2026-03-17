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

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ── Signal Level Chart ─────────────────────────────────── */
export function SignalLevelChart({ data }) {
  return (
    <ChartCard title="Signal Level">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} stroke="#cbd5e1" />
          <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" domain={[0, 5]} />
          <Tooltip
            labelFormatter={(v) => new Date(v).toLocaleString()}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <Line type="monotone" dataKey="level" stroke="#9b8ec4" strokeWidth={2} dot={false} name="Level" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ── RSRP / RSSI Dual Chart ────────────────────────────── */
export function DualSignalChart({ data }) {
  return (
    <ChartCard title="RSRP / RSSI">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} stroke="#cbd5e1" />
          <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
          <Tooltip
            labelFormatter={(v) => new Date(v).toLocaleString()}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="rsrp" stroke="#6b9ae8" strokeWidth={2} dot={false} name="RSRP" />
          <Line type="monotone" dataKey="rssi" stroke="#9b8ec4" strokeWidth={2} dot={false} name="RSSI" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ── RSRQ Chart with threshold line ─────────────────────── */
export function RSRQChart({ data }) {
  return (
    <ChartCard title="RSRQ">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} stroke="#cbd5e1" />
          <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
          <Tooltip
            labelFormatter={(v) => new Date(v).toLocaleString()}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <ReferenceLine y={-12} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "Fair", fill: "#f59e0b", fontSize: 11, position: "insideTopLeft" }} />
          <ReferenceLine y={-15} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "Poor", fill: "#ef4444", fontSize: 11, position: "insideTopLeft" }} />
          <Line type="monotone" dataKey="rsrq" stroke="#7c6fcd" strokeWidth={2} dot={false} name="RSRQ" />
        </LineChart>
      </ResponsiveContainer>
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
