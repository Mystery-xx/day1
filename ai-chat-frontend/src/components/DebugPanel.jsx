function DebugPanel({ lastRequest, lastResponse, requestHistory }) {
  const debugRequest = lastResponse?.debugRequest || lastRequest;
  const debugResponse = lastResponse?.debugResponse;

  return (
    <div className="debug-panel">
      <div className="debug-section">
        <h3 className="debug-section-title">Last 5 Requests</h3>
        <div className="debug-content">
          {requestHistory && requestHistory.length > 0 ? (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Prompt Tokens</th>
                  <th>Completion Tokens</th>
                  <th>Total Tokens</th>
                  <th>Response Time</th>
                </tr>
              </thead>
              <tbody>
                {requestHistory.map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.provider || '-'}</td>
                    <td>{entry.model || '-'}</td>
                    <td>{entry.promptTokens ?? '-'}</td>
                    <td>{entry.completionTokens ?? '-'}</td>
                    <td>{entry.totalTokens ?? '-'}</td>
                    <td>{entry.responseTime != null ? `${entry.responseTime} ms` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="debug-empty">No requests yet</div>
          )}
        </div>
      </div>

      <div className="debug-section">
        <h3 className="debug-section-title">Backend → AI API Request</h3>
        <div className="debug-content">
          {debugRequest ? (
            <pre className="debug-json">{JSON.stringify(debugRequest, null, 2)}</pre>
          ) : (
            <div className="debug-empty">No request sent yet</div>
          )}
        </div>
      </div>

      <div className="debug-section">
        <h3 className="debug-section-title">Backend ← AI API Response</h3>
        <div className="debug-content">
          {debugResponse ? (
            <pre className="debug-json">{JSON.stringify(debugResponse, null, 2)}</pre>
          ) : (
            <div className="debug-empty">No response received yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DebugPanel;
