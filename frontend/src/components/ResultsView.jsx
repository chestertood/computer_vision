export default function ResultsView({ result, onReset }) {
  const { output_video_url, counts, total } = result
  return (
    <div className="results-view">
      <video src={output_video_url} controls width="480" data-testid="result-video" />
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
