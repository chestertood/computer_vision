export const STATUS_LABEL = {
  queued: 'Queued',
  running: 'Running',
  stopped: 'Stopped',
  done: 'Done',
  error: 'Error',
}

export default function ResultsView({ result, onReset }) {
  const { status, counts = {}, directions = {}, total = 0, vehicles = [] } = result
  const finished = status === 'done' || status === 'stopped' || status === 'error'
  const hasDirections = (directions.in || 0) + (directions.out || 0) > 0
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return (
    <div className="results-view">
      <div className="tally">
        <span className="tally__value num">{total}</span>
        <span className="tally__unit">counted</span>
      </div>

      {hasDirections && (
        <div className="split">
          <div className="split__half">
            <span className="split__value num">{directions.in || 0}</span>
            <span className="split__key">crossed A then B</span>
          </div>
          <div className="split__half">
            <span className="split__value num">{directions.out || 0}</span>
            <span className="split__key">crossed B then A</span>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <table>
          <tbody>
            {rows.map(([name, count]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="num">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {vehicles.length > 0 && (
        <ul className="vehicle-gallery">
          {[...vehicles].reverse().map((v, i) => (
            <li key={vehicles.length - 1 - i} className="vehicle-card">
              <img src={`data:image/jpeg;base64,${v.image_b64}`} alt={v.type} />
              <span>{v.type}</span>
            </li>
          ))}
        </ul>
      )}

      {finished && (
        <button className="ghost-button" onClick={onReset}>
          Run another
        </button>
      )}
    </div>
  )
}
