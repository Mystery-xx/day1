import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function DebugPanel({ lastRequest, lastResponse, requestHistory }) {
  const debugRequest = lastResponse?.debugRequest || lastRequest;
  const debugResponse = lastResponse?.debugResponse;
  
  const lastAssistantEntry = requestHistory && requestHistory.length > 0
    ? requestHistory.filter(entry => entry.role === 'assistant').at(-1)
    : null;
  
  const lastPromptTokens = lastResponse?.usage?.prompt_tokens ?? lastResponse?.usage?.promptTokens ?? lastAssistantEntry?.promptTokens ?? 0;
  const lastCompletionTokens = lastResponse?.usage?.completion_tokens ?? lastResponse?.usage?.completionTokens ?? lastAssistantEntry?.completionTokens ?? 0;
  const lastTotalTokens = lastResponse?.usage?.total_tokens ?? lastResponse?.usage?.totalTokens ?? lastAssistantEntry?.totalTokens ?? 0;
  
  const sessionPromptTokens = lastResponse?.sessionTotalPromptTokens ?? (lastAssistantEntry ? requestHistory.filter(e => e.role === 'assistant').reduce((sum, e) => sum + (e.promptTokens || 0), 0) : '-');
  const sessionCompletionTokens = lastResponse?.sessionTotalCompletionTokens ?? (lastAssistantEntry ? requestHistory.filter(e => e.role === 'assistant').reduce((sum, e) => sum + (e.completionTokens || 0), 0) : '-');
  const sessionTotalTokens = lastResponse?.sessionTotalTokens ?? (lastAssistantEntry ? requestHistory.filter(e => e.role === 'assistant').reduce((sum, e) => sum + (e.totalTokens || 0), 0) : '-');

  const chartData = requestHistory && requestHistory.length > 0
    ? requestHistory
        .filter(entry => entry.role === 'assistant' && (entry.promptTokens || entry.completionTokens || entry.totalTokens))
        .map((entry, index) => ({
          name: `#${index + 1}`,
          promptTokens: entry.promptTokens ?? 0,
          completionTokens: entry.completionTokens ?? 0,
          totalTokens: entry.totalTokens ?? 0
        }))
    : [];

  return (
    <div className="debug-panel">
      <div className="debug-section">
        <h3 className="debug-section-title">Token Usage Summary</h3>
        <div className="debug-content">
          {(lastResponse || lastAssistantEntry) ? (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Prompt Tokens</th>
                  <th>Completion Tokens</th>
                  <th>Total Tokens</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Last Request</strong></td>
                  <td>{lastPromptTokens}</td>
                  <td>{lastCompletionTokens}</td>
                  <td>{lastTotalTokens}</td>
                </tr>
                <tr>
                  <td><strong>Session Total</strong></td>
                  <td>{sessionPromptTokens}</td>
                  <td>{sessionCompletionTokens}</td>
                  <td>{sessionTotalTokens}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="debug-empty">No requests yet</div>
          )}
        </div>
      </div>

      <div className="debug-section">
        <h3 className="debug-section-title">Token Usage History</h3>
        <div className="debug-content">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="promptTokens" stroke="#8884d8" name="Prompt Tokens" />
                <Line type="monotone" dataKey="completionTokens" stroke="#82ca9d" name="Completion Tokens" />
                <Line type="monotone" dataKey="totalTokens" stroke="#ffc658" name="Total Tokens" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="debug-empty">No token usage data yet</div>
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
