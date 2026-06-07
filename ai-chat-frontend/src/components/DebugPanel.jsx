function DebugPanel({ lastRequest, lastResponse }) {
  // Use backend's debugRequest if available, otherwise use frontend request
  const debugRequest = lastResponse?.debugRequest || lastRequest;
  const debugResponse = lastResponse?.debugResponse;

  return (
    <div className="debug-panel">
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
