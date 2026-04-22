import "./DeviceInfo.css";

function DeviceInfo({ reading }) {
  if (!reading) {
    return (
      <div className="device-info">
        <h3 className="device-info-title">Device Info</h3>
        <p className="device-info-empty">Select a device to view info</p>
      </div>
    );
  }

  const fields = [
    { label: "Operator", value: reading.operator },
    { label: "Network Type", value: reading.network_type },
    { label: "Physical Cell ID", value: reading.physical_cell_id },
    { label: "Tracking Area Code", value: reading.tracking_area_code },
    { label: "Cell ID", value: reading.cell_id },
    {
      label: "Coordinates",
      value:
        reading.latitude != null && reading.longitude != null
          ? `${reading.latitude.toFixed(4)}, ${reading.longitude.toFixed(4)}`
          : "—",
    },
    {
      label: "Last Reading",
      value: reading.timestamp
        ? new Date(reading.timestamp).toLocaleString()
        : "—",
    },
  ];

  return (
    <div className="device-info">
      <h3 className="device-info-title">Device Info</h3>
      <div className="device-info-grid">
        {fields.map((f) => (
          <div key={f.label} className="device-info-field">
            <span className="field-label">{f.label}</span>
            <span className="field-value">{f.value ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DeviceInfo;
