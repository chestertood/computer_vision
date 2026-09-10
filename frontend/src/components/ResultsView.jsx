export default function ResultsView({ result, onReset }) {
  const { counts, total } = result
  return (
    <div className="results-view">
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
      <button onClick={onReset}>Run another</button>
    </div>
  )
}
