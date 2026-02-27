function StatCard(props) {
  return (
    <div className="stat-card">
      <h3>{props.title}</h3>
      <p>{props.value}</p>
      <p>{props.unit}</p>
    </div>
  )
}

export default StatCard