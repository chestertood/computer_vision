const STATUS_LABEL = {
  queued: 'Queued…',
  running: 'Running…',
  stopped: 'Stopped',
  done: 'Done',
  error: 'Error',
}

export default function ResultsView({ result, onReset }) {
  const { status, counts = {}, total = 0, vehicles = [] } = result
  const finished = status === 'done' || status === 'stopped' || status === 'error'

  return (
    <div className="results-view">
      <p className="results-view__status">{STATUS_LABEL[status] || status}</p>
      <table>
        <tbody>
          {Object.entries(counts).map(([name, count]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{count}</td>
            </tr>
          ))}
          <tr>
            <td><strong>Total</strong></td>
            <td><strong>{total}</strong></td>
          </tr>
        </tbody>
      </table>
      {vehicles.length > 0 && (
        <ul className="vehicle-gallery">
          {[...vehicles].reverse().map((v, i) => (
            <li key={i} className="vehicle-card">
              <img src={`data:image/jpeg;base64,${v.image_b64}`} alt={v.type} />
              <span>{v.type}</span>
            </li>
          ))}
        </ul>
      )}
      {finished && <button onClick={onReset}>Run another</button>}
    </div>
  )
}
