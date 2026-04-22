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
} from "recharts";
import Header from "../components/Header/Header";
import useDeviceData from "../hooks/useDeviceData";
import "../components/charts/SignalCharts.css";
import "./ReportsPage.css";

const ALL_REGIONS_ID = "__all__";

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
      coverage_quality_percent: entry.rsrpCount > 0 ? (entry.rsrpGood / entry.rsrpCount) * 100 : null,
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
  return Array.from(map.values()).sort((x, y) => new Date(x.timestamp) - new Date(y.timestamp));
}

function buildHistogram(rows, field, min, max, step) {
  const bins = [];
  for (let start = min; start < max; start += step) {
    bins.push({
      range: `${start}..${start + step}`,
      count: 0,
    });
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

function ReportsPage({ activePage, onNavigate, apiMode, onApiModeChange }) {
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
  } = useDeviceData(apiMode);

  const [compareCityA, setCompareCityA] = useState("");
  const [compareCityB, setCompareCityB] = useState("");

  const scopedRows = useMemo(() => {
    if (!selectedRegion || selectedRegion === ALL_REGIONS_ID) return heatmapPoints;
    return heatmapPoints.filter((row) => getRegionLabel(row) === selectedRegion);
  }, [heatmapPoints, selectedRegion]);

  const cityOptions = useMemo(() => citySummaries.map((city) => city.city_label), [citySummaries]);

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

  const trendA = useMemo(() => aggregateCityTrend(cityRowsA, selectedPeriod), [cityRowsA, selectedPeriod]);
  const trendB = useMemo(() => aggregateCityTrend(cityRowsB, selectedPeriod), [cityRowsB, selectedPeriod]);

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
          <span className="page-tag">Page 04</span>
          <h2>Historical Reports</h2>
          <p>
            City-level analytics, regional comparison trends, and signal distribution views for deep reporting.
          </p>
        </section>

        <section className="map-filters" style={{ marginBottom: 16 }}>
          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Operator</span>
            <select className="header-device-select" value={selectedOperator} onChange={(e) => setSelectedOperator(e.target.value)}>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>{operator.label}</option>
              ))}
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Network type</span>
            <select className="header-device-select" value={selectedNetworkType} onChange={(e) => setSelectedNetworkType(e.target.value)}>
              {networkTypes.map((networkType) => (
                <option key={networkType.id} value={networkType.id}>{networkType.label}</option>
              ))}
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Period</span>
            <select className="header-device-select" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
              <option value="24h">Last 24h</option>
              <option value="week">Last week</option>
              <option value="month">Last month</option>
              <option value="all">All history</option>
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Data source</span>
            <select className="header-device-select" value={dataSourceMode} onChange={(e) => setDataSourceMode(e.target.value)}>
              <option value="crowdsourced">Crowdsourced only</option>
              <option value="predicted">ML model (predicted)</option>
              <option value="both">Both</option>
            </select>
          </div>

          {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
            <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Min prediction confidence</span>
              <select className="header-device-select" value={String(predictionConfidenceMin)} onChange={(e) => setPredictionConfidenceMin(Number(e.target.value))}>
                <option value="0">Any</option>
                <option value="0.5">50%+</option>
                <option value="0.7">70%+</option>
                <option value="0.85">85%+</option>
              </select>
            </div>
          )}
        </section>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        <section className="reports-two-col">
          <div className="chart-card">
            <h3 className="chart-card-title">Mean RSRP Per City</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={citySummaries} margin={{ top: 8, right: 8, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="city" angle={-30} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `${formatNumber(value, 2)} dBm`} />
                <Bar dataKey="mean_rsrp" fill="#2563eb" name="Mean RSRP" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3 className="chart-card-title">Mean RSRQ Per City</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={citySummaries} margin={{ top: 8, right: 8, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="city" angle={-30} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `${formatNumber(value, 2)} dB`} />
                <Bar dataKey="mean_rsrq" fill="#7c3aed" name="Mean RSRQ" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>City</th>
                <th>Country</th>
                <th>Coverage Quality %</th>
                <th>Measurements Density</th>
                <th>Devices Count</th>
                <th>Detected Cells Count</th>
                <th>Total Readings</th>
              </tr>
            </thead>
            <tbody>
              {citySummaries.map((city) => (
                <tr key={city.city_label}>
                  <td>{city.city}</td>
                  <td>{city.country}</td>
                  <td>{formatNumber(city.coverage_quality_percent, 1)}%</td>
                  <td>{formatNumber(city.measurements_density, 2)}</td>
                  <td>{city.devices_count ?? 0}</td>
                  <td>{city.detected_cells_count ?? 0}</td>
                  <td>{city.total_readings ?? 0}</td>
                </tr>
              ))}
              {!citySummaries.length && (
                <tr>
                  <td colSpan={7}>No city-level data available for the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="reports-section-head">
          <h3>Regional Comparison</h3>
          <p>Compare trends between any two cities in the currently filtered dataset.</p>
        </section>

        <section className="reports-two-col compact">
          <div className="comparison-filter">
            <span>City A</span>
            <select className="header-device-select" value={defaultCityA} onChange={(e) => setCompareCityA(e.target.value)}>
              {cityOptions.map((city) => (
                <option key={`A-${city}`} value={city}>{city}</option>
              ))}
            </select>
          </div>
          <div className="comparison-filter">
            <span>City B</span>
            <select className="header-device-select" value={defaultCityB} onChange={(e) => setCompareCityB(e.target.value)}>
              {cityOptions.map((city) => (
                <option key={`B-${city}`} value={city}>{city}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="reports-three-col">
          <div className="chart-card">
            <h3 className="chart-card-title">Mean RSRP Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rsrpComparisonTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
                <Legend />
                <Line type="monotone" dataKey="cityA" stroke="#2563eb" dot={false} name={defaultCityA || "City A"} />
                <Line type="monotone" dataKey="cityB" stroke="#7c3aed" dot={false} name={defaultCityB || "City B"} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3 className="chart-card-title">Mean RSRQ Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rsrqComparisonTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
                <Legend />
                <Line type="monotone" dataKey="cityA" stroke="#0ea5e9" dot={false} name={defaultCityA || "City A"} />
                <Line type="monotone" dataKey="cityB" stroke="#9333ea" dot={false} name={defaultCityB || "City B"} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3 className="chart-card-title">Coverage Quality % Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={coverageComparisonTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} formatter={(v) => `${formatNumber(v, 1)}%`} />
                <Legend />
                <Line type="monotone" dataKey="cityA" stroke="#16a34a" dot={false} name={defaultCityA || "City A"} />
                <Line type="monotone" dataKey="cityB" stroke="#15803d" dot={false} name={defaultCityB || "City B"} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="reports-section-head">
          <h3>Signal Distribution</h3>
          <p>Histogram views for RSRP and RSRQ to inspect spread and outliers.</p>
        </section>

        <section className="reports-two-col">
          <div className="chart-card">
            <h3 className="chart-card-title">RSRP Distribution</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={rsrpHistogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} interval={1} angle={-20} textAnchor="end" height={55} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3 className="chart-card-title">RSRQ Distribution</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={rsrqHistogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={55} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#7c3aed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </main>
    </div>
  );
}

export default ReportsPage;
