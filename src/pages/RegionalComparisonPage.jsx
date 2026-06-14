import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  Cell,
} from "recharts";
import Select from "react-select";
import { selectStyles } from "../styles/selectStyles";
import useDeviceData from "../hooks/useDeviceData";
import ChartWrapper from "../components/charts/ChartWrapper";
import "../components/charts/SignalCharts.css";
import "./RegionalComparisonPage.css";
import "../styles/global.css";

const ALL_REGIONS_ID = "__all__";
const PAGE_SIZE = 7;

function getRegionLabel(point) {
  if (point?.region_label) return point.region_label;
  const city = String(point?.city || "").trim();
  const country = String(point?.country || "").trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return "Unknown region";
}

function formatNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function formatChartDate(ts, period) {
  if (!ts) return "";

  const d = new Date(ts);

  switch (period) {
    case "24h":
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    case "week":
      return d.toLocaleDateString([], {
        weekday: "short",
      });

    case "month":
      return d.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });

    default:
      return d.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
  }
}

function bucketSizeForPeriod(period) {
  if (period === "24h") return 30 * 60 * 1000;
  if (period === "week") return 60 * 60 * 1000;
  if (period === "month") return 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function aggregateCityTrend(rows, period) {
  const bucketMs = bucketSizeForPeriod(period);
  const buckets = new Map();

  for (const row of rows) {
    const ts = new Date(row?.timestamp || 0).getTime();
    if (!Number.isFinite(ts)) continue;

    const start = Math.floor(ts / bucketMs) * bucketMs;
    const entry = buckets.get(start) || {
      ts: start,
      rsrpSum: 0,
      rsrpCount: 0,
      rsrqSum: 0,
      rsrqCount: 0,
      rsrpGood: 0,
    };

    if (row?.rsrp != null && Number.isFinite(Number(row.rsrp))) {
      const rsrp = Number(row.rsrp);
      entry.rsrpSum += rsrp;
      entry.rsrpCount += 1;
      if (rsrp >= -100) entry.rsrpGood += 1;
    }

    if (row?.rsrq != null && Number.isFinite(Number(row.rsrq))) {
      const rsrq = Number(row.rsrq);
      entry.rsrqSum += rsrq;
      entry.rsrqCount += 1;
    }

    buckets.set(start, entry);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.ts - b.ts)
    .map((entry) => ({
      timestamp: new Date(entry.ts).toISOString(),
      mean_rsrp: entry.rsrpCount > 0 ? entry.rsrpSum / entry.rsrpCount : null,
      mean_rsrq: entry.rsrqCount > 0 ? entry.rsrqSum / entry.rsrqCount : null,
      coverage_quality_percent:
        entry.rsrpCount > 0
          ? (entry.rsrpGood / entry.rsrpCount) * 100
          : null,
    }));
}

function mergeTrends(a, b, keyA, keyB, field) {
  const map = new Map();
  for (const row of a) {
    map.set(row.timestamp, { timestamp: row.timestamp, [keyA]: row[field] });
  }
  for (const row of b) {
    const existing = map.get(row.timestamp) || { timestamp: row.timestamp };
    existing[keyB] = row[field];
    map.set(row.timestamp, existing);
  }
  return Array.from(map.values()).sort(
    (x, y) => new Date(x.timestamp) - new Date(y.timestamp)
  );
}

function buildHistogram(rows, field, min, max, step) {
  const bins = [];
  for (let start = min; start < max; start += step) {
    bins.push({ range: `${start}`, count: 0 });
  }
  for (const row of rows) {
    const value = Number(row?.[field]);
    if (!Number.isFinite(value)) continue;
    if (value < min || value >= max) continue;
    const index = Math.floor((value - min) / step);
    if (bins[index]) bins[index].count += 1;
  }
  return bins;
}

// Truncate city label for X axis
function truncateLabel(label, maxLen = 10) {
  if (!label) return "";
  return label.length > maxLen ? label.slice(0, maxLen) + "…" : label;
}

// Custom bar shape with rounded top corners
function RoundedBar(props) {
  const { x, y, width, height, fill, stroke } = props;
  if (!height || height <= 0) return null;
  const r = Math.min(6, width / 2, height / 2);
  return (
    <g>
      <path
        d={`
          M${x},${y + r}
          Q${x},${y} ${x + r},${y}
          L${x + width - r},${y}
          Q${x + width},${y} ${x + width},${y + r}
          L${x + width},${y + height}
          L${x},${y + height}
          Z
        `}
        fill={fill}
        fillOpacity={0.75}
        stroke={stroke}
        strokeWidth={1.5}
      />
    </g>
  );
}

// Custom tooltip that shows original (negative) value
function NegativeTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;

  const fullCity =
  payload[0]?.payload?.city_label ||
  `${payload[0]?.payload?.city}, ${payload[0]?.payload?.country}`;

  return (
    <div className="custom-tooltip">
      <p className="custom-tooltip-label">{fullCity}</p>

      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.fill || p.color }}>
          {p.name}: {formatNumber(-Math.abs(p.value), 1)} {unit}
        </p>
      ))}
    </div>
  );
}

// Paginator component
function Paginator({ page, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="table-paginator">
      <button
        className="pager-btn"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
      >
        ‹
      </button>
      <span className="pager-info">
        {page + 1} / {totalPages}
      </span>
      <button
        className="pager-btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
      >
        ›
      </button>
    </div>
  );
}

function RegionalComparisonPage({ deviceData, apiMode }) {
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
    heatmapPoints,
    citySummaries,
    loading,
    error,
    refresh,
  } = deviceData;

  const [compareCityA, setCompareCityA] = useState("");
  const [compareCityB, setCompareCityB] = useState("");
  const [tablePage, setTablePage] = useState(0);

  const scopedRows = useMemo(() => {
    if (!selectedRegion || selectedRegion === ALL_REGIONS_ID)
      return heatmapPoints;
    return heatmapPoints.filter((row) => getRegionLabel(row) === selectedRegion);
  }, [heatmapPoints, selectedRegion]);

  const cityOptions = useMemo(
    () => citySummaries.map((city) => city.city_label),
    [citySummaries]
  );

  const defaultCityA = compareCityA || cityOptions[0] || "";
  const defaultCityB = compareCityB || cityOptions[1] || cityOptions[0] || "";

  const cityRowsA = useMemo(
    () => scopedRows.filter((row) => getRegionLabel(row) === defaultCityA),
    [defaultCityA, scopedRows]
  );
  const cityRowsB = useMemo(
    () => scopedRows.filter((row) => getRegionLabel(row) === defaultCityB),
    [defaultCityB, scopedRows]
  );

  const trendA = useMemo(
    () => aggregateCityTrend(cityRowsA, selectedPeriod),
    [cityRowsA, selectedPeriod]
  );
  const trendB = useMemo(
    () => aggregateCityTrend(cityRowsB, selectedPeriod),
    [cityRowsB, selectedPeriod]
  );

  const rsrpComparisonTrend = useMemo(
    () => mergeTrends(trendA, trendB, "cityA", "cityB", "mean_rsrp"),
    [trendA, trendB]
  );
  const rsrqComparisonTrend = useMemo(
    () => mergeTrends(trendA, trendB, "cityA", "cityB", "mean_rsrq"),
    [trendA, trendB]
  );
  const coverageComparisonTrend = useMemo(
    () => mergeTrends(trendA, trendB, "cityA", "cityB", "coverage_quality_percent"),
    [trendA, trendB]
  );

  const rsrpHistogram = useMemo(
    () => buildHistogram(scopedRows, "rsrp", -130, -60, 5),
    [scopedRows]
  );
  const rsrqHistogram = useMemo(
    () => buildHistogram(scopedRows, "rsrq", -25, -3, 2),
    [scopedRows]
  );

  // Absolute value city chart data for cleaner plotting
  const rsrpCityData = useMemo(
    () =>
      citySummaries.map((c) => ({
        ...c,
        abs_rsrp: c.mean_rsrp != null ? Math.abs(c.mean_rsrp) : null,
        city_short: truncateLabel(c.city, 10),
      })),
    [citySummaries]
  );
  const rsrqCityData = useMemo(
    () =>
      citySummaries.map((c) => ({
        ...c,
        abs_rsrq: c.mean_rsrq != null ? Math.abs(c.mean_rsrq) : null,
        city_short: truncateLabel(c.city, 10),
      })),
    [citySummaries]
  );

  // Paginated table rows
  const pagedRows = useMemo(
    () => citySummaries.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE),
    [citySummaries, tablePage]
  );


  const citySelectOptions = useMemo(
    () =>
      cityOptions.map((city) => ({
        value: city,
        label: city,
      })),
    [cityOptions]
  );

  return (
    <div className="page">
      <main className="page-content">
        <section className="page-intro">
        <h2>Regional Comparison</h2>
        <p>
          Compare mobile network performance across cities and regions using
          historical signal measurements. Analyze coverage quality, average RSRP
          and RSRQ trends and
          network density metrics to identify strengths, weaknesses, and regional
          performance differences over time.
        </p>
      </section>

        <section className="map-filters">
          <div className="map-toggle">
            <span>Operator</span>
            <Select
              value={operators
                .map((o) => ({ value: o.id, label: o.label }))
                .find((o) => o.value === selectedOperator)}
              onChange={(opt) => setSelectedOperator(opt?.value)}
              options={operators.map((o) => ({ value: o.id, label: o.label }))}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          <div className="map-toggle">
            <span>Network type</span>
            <Select
              value={networkTypes
                .map((n) => ({ value: n.id, label: n.label }))
                .find((o) => o.value === selectedNetworkType)}
              onChange={(opt) => setSelectedNetworkType(opt?.value)}
              options={networkTypes.map((n) => ({ value: n.id, label: n.label }))}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          <div className="map-toggle">
            <span>Period</span>
            <Select
              value={[
                { value: "24h", label: "Last 24h" },
                { value: "week", label: "Last week" },
                { value: "month", label: "Last month" },
                { value: "all", label: "All history" },
              ].find((o) => o.value === selectedPeriod)}
              onChange={(opt) => setSelectedPeriod(opt?.value)}
              options={[
                { value: "24h", label: "Last 24h" },
                { value: "week", label: "Last week" },
                { value: "month", label: "Last month" },
                { value: "all", label: "All history" },
              ]}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          <div className="map-toggle">
            <span>Data source</span>
            <Select
              value={[
                { value: "crowdsourced", label: "Crowdsourced only" },
                { value: "predicted", label: "ML model (predicted)" },
                { value: "both", label: "Both" },
              ].find((o) => o.value === dataSourceMode)}
              onChange={(opt) => setDataSourceMode(opt?.value)}
              options={[
                { value: "crowdsourced", label: "Crowdsourced only" },
                { value: "predicted", label: "ML model (predicted)" },
                { value: "both", label: "Both" },
              ]}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
            <div className="map-toggle">
              <span>Min prediction confidence</span>
              <Select
                value={[
                  { value: 0, label: "Any" },
                  { value: 0.5, label: "50%+" },
                  { value: 0.7, label: "70%+" },
                  { value: 0.85, label: "85%+" },
                ].find((o) => o.value === predictionConfidenceMin)}
                onChange={(opt) => setPredictionConfidenceMin(opt?.value)}
                options={[
                  { value: 0, label: "Any" },
                  { value: 0.5, label: "50%+" },
                  { value: 0.7, label: "70%+" },
                  { value: 0.85, label: "85%+" },
                ]}
                isSearchable={false}
                styles={selectStyles}
              />
            </div>
          )}
        </section>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        {/* ── Full-width city bar charts ── */}
        <div className="reports-full-col">
          <div className="chart-card">
            <div className="chart-card-header">
              <h3 className="chart-card-title">Mean RSRP Per City</h3>
              <span className="chart-card-note">|RSRP| dBm — lower absolute value = stronger signal</span>
            </div>
            <ChartWrapper height={260}>
              {(width) => (
              <ResponsiveContainer width={width} height={260}>
              <BarChart
                data={rsrpCityData}
                margin={{ top: 8, right: 16, left: -10, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="city_short"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}`}
                  label={{
                    value: "|RSRP| dBm",
                    angle: -90,
                    position: "insideLeft",
                    offset: 16,
                    style: { fontSize: 11, fill: "#94a3b8" },
                  }}
                />
                <Tooltip
                  content={<NegativeTooltip unit="dBm" />}
                  cursor={{ fill: "rgba(107,154,232,0.07)" }}
                />
                <Bar
                  dataKey="abs_rsrp"
                  name="Mean RSRP"
                  shape={<RoundedBar fill="#2563eb" stroke="#1d4ed8" />}
                  isAnimationActive={false}
                />
              </BarChart>
              </ResponsiveContainer>
              )}
            </ChartWrapper>
          </div>

          <div className="chart-card">
            <div className="chart-card-header">
              <h3 className="chart-card-title">Mean RSRQ Per City</h3>
              <span className="chart-card-note">|RSRQ| dB — lower absolute value = better quality</span>
            </div>
            <ChartWrapper height={260}>
              {(width) => (
              <ResponsiveContainer width={width} height={260}>
              <BarChart
                data={rsrqCityData}
                margin={{ top: 8, right: 16, left: -10, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="city_short"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  label={{
                    value: "|RSRQ| dB",
                    angle: -90,
                    position: "insideLeft",
                    offset: 16,
                    style: { fontSize: 11, fill: "#94a3b8" },
                  }}
                />
                <Tooltip
                  content={<NegativeTooltip unit="dB" />}
                  cursor={{ fill: "rgba(124,58,237,0.07)" }}
                />
                <Bar
                  dataKey="abs_rsrq"
                  name="Mean RSRQ"
                  shape={<RoundedBar fill="#7c3aed" stroke="#6d28d9" />}
                  isAnimationActive={false}
                />
              </BarChart>
              </ResponsiveContainer>
              )}
            </ChartWrapper>
          </div>
        </div>

        {/* ── Paginated table ── */}
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>City</th>
                <th>Country</th>
                <th>Coverage Quality %</th>
                <th>Measurements Density</th>
                <th>Devices</th>
                <th>Cells</th>
                <th>Total Readings</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((city) => (
                <tr key={city.city_label}>
                  <td title={city.city}>{city.city}</td>
                  <td>{city.country}</td>
                  <td>
                    <div className="coverage-cell">
                      <div
                        className="coverage-bar"
                        style={{ width: `${Math.min(100, city.coverage_quality_percent ?? 0)}%` }}
                      />
                      <span>{formatNumber(city.coverage_quality_percent, 1)}%</span>
                    </div>
                  </td>
                  <td>{formatNumber(city.measurements_density, 2)}</td>
                  <td>{city.devices_count ?? 0}</td>
                  <td>{city.detected_cells_count ?? 0}</td>
                  <td>{(city.total_readings ?? 0).toLocaleString()}</td>
                </tr>
              ))}
              {!citySummaries.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8" }}>
                    No city-level data available for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="table-footer">
            <span className="table-count">
              {citySummaries.length} cities
            </span>
            <Paginator
              page={tablePage}
              total={citySummaries.length}
              pageSize={PAGE_SIZE}
              onChange={setTablePage}
            />
          </div>
        </div>

        {/* ── City comparison ── */}
        <section className="reports-section-head">
          <h3>Regional Comparison</h3>
          <p>Compare trends between any two cities in the currently filtered dataset.</p>
        </section>

        <section className="reports-two-col compact">
          <div className="comparison-filter">
            <span>City A</span>
            <Select
              value={citySelectOptions.find(
                (option) => option.value === defaultCityA
              )}
              onChange={(opt) => setCompareCityA(opt?.value || "")}
              options={citySelectOptions}
              isSearchable
              styles={selectStyles}
              placeholder="Select city"
            />
          </div>
          <div className="comparison-filter">
            <span>City B</span>
            <Select
              value={citySelectOptions.find(
                (option) => option.value === defaultCityB
              )}
              onChange={(opt) => setCompareCityB(opt?.value || "")}
              options={citySelectOptions}
              isSearchable
              styles={selectStyles}
              placeholder="Select city"
            />
          </div>
        </section>

        <section className="reports-three-col">
          <div className="chart-card">
            <h3 className="chart-card-title">Mean RSRP Trend</h3>
            <ChartWrapper height={220}>
              {(width) => (
              <ResponsiveContainer width={width} height={220}>
              <LineChart data={rsrpComparisonTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => formatChartDate(v, selectedPeriod)}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) =>
                    v == null ? "-" : Number(v).toFixed(1)
                  }
                  labelFormatter={(v) =>
                    formatChartDate(v, selectedPeriod)
                  }
                />
                <Legend />
                <Line type="monotone" dataKey="cityA" stroke="#2563eb" dot={false} strokeWidth={2} name={defaultCityA || "City A"} />
                <Line type="monotone" dataKey="cityB" stroke="#7c3aed" dot={false} strokeWidth={2} name={defaultCityB || "City B"} />
              </LineChart>
              </ResponsiveContainer>
              )}
            </ChartWrapper>
          </div>

          <div className="chart-card">
            <h3 className="chart-card-title">Mean RSRQ Trend</h3>
            <ChartWrapper height={220}>
              {(width) => (
              <ResponsiveContainer width={width} height={220}>
              <LineChart data={rsrqComparisonTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => formatChartDate(v, selectedPeriod)}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => v == null ? "-" : Number(v).toFixed(1)}
                  labelFormatter={(v) => formatChartDate(v, selectedPeriod)}
                />
                <Legend />
                <Line type="monotone" dataKey="cityA" stroke="#0ea5e9" dot={false} strokeWidth={2} name={defaultCityA || "City A"} />
                <Line type="monotone" dataKey="cityB" stroke="#9333ea" dot={false} strokeWidth={2} name={defaultCityB || "City B"} />
              </LineChart>
              </ResponsiveContainer>
              )}
            </ChartWrapper>
          </div>

          <div className="chart-card">
            <h3 className="chart-card-title">Coverage Quality % Trend</h3>
            <ChartWrapper height={220}>
              {(width) => (
              <ResponsiveContainer width={width} height={220}>
              <LineChart data={coverageComparisonTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => formatChartDate(v, selectedPeriod)}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip
                  formatter={(v) => v == null ? "-" : `${Number(v).toFixed(1)}%`}
                  labelFormatter={(v) => formatChartDate(v, selectedPeriod)}
                />
                <Legend />
                <Line type="monotone" dataKey="cityA" stroke="#16a34a" dot={false} strokeWidth={2} name={defaultCityA || "City A"} />
                <Line type="monotone" dataKey="cityB" stroke="#15803d" dot={false} strokeWidth={2} name={defaultCityB || "City B"} />
              </LineChart>
              </ResponsiveContainer>
              )}
            </ChartWrapper>
          </div>
        </section>
      </main>
    </div>
  );
}

export default RegionalComparisonPage;
