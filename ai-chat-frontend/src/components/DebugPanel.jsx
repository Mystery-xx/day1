function DebugPanel({ 
  lastRequest, 
  lastResponse, 
  requestHistory, 
  stickyFactsList = [], 
  contextStrategy = 'summary',
  activeProfile = null,
  recentHistory = []
}) {
  const debugRequest = lastResponse?.debugRequest || lastRequest;
  const debugResponse = lastResponse?.debugResponse;
  const debugSummaryRequest = lastResponse?.debugSummaryRequest;
  const debugSummaryResponse = lastResponse?.debugSummaryResponse;
  const debugStickyFacts = lastResponse?.debugStickyFacts;
  
  const factsFromResponse = debugStickyFacts?.stickyFacts || [];
  const allFacts = stickyFactsList.length > 0 ? stickyFactsList : factsFromResponse;



  // Truncate text to max length
  const truncate = (text, maxLength = 100) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="debug-panel">
      {/* Long-term Memory (Profile) */}
      <div className="debug-section">
        <h3 className="debug-section-title">Long-term Memory (Profile)</h3>
        <div className="debug-content">
          {activeProfile ? (
            <div className="profile-details">
              <div className="profile-item">
                <strong>Profile:</strong> {activeProfile.profileName || 'Default'}
              </div>
              {activeProfile.promptTemplate && (
                <div className="profile-item">
                  <strong>Prompt Template:</strong>
                  <pre className="debug-json">{activeProfile.promptTemplate}</pre>
                </div>
              )}
              {activeProfile.communicationStyle && (
                <div className="profile-item">
                  <strong>Communication Style:</strong> {activeProfile.communicationStyle}
                </div>
              )}
              {activeProfile.language && (
                <div className="profile-item">
                  <strong>Language:</strong> {activeProfile.language}
                </div>
              )}
            </div>
          ) : (
            <div className="debug-empty">No active profile</div>
          )}
        </div>
      </div>

      {/* Working Memory (Sticky Facts) */}
      <div className="debug-section">
        <h3 className="debug-section-title">Working Memory (Sticky Facts)</h3>
        <div className="debug-content">
          {allFacts.length > 0 ? (
            <div className="sticky-facts-list">
              {allFacts.map((fact, index) => (
                <div key={index} className="sticky-fact-item">
                  <strong>{fact.factKey}:</strong> {fact.factValue}
                </div>
              ))}
            </div>
          ) : (
            <div className="debug-empty">Рабочая память пуста</div>
          )}
        </div>
      </div>

      {/* Short-term Memory (Recent Messages) */}
      <div className="debug-section">
        <h3 className="debug-section-title">Short-term Memory (Recent Messages)</h3>
        <div className="debug-content">
          {recentHistory.length > 0 ? (
            <div className="recent-messages-list">
              {recentHistory.slice(-10).reverse().map((msg, index) => (
                <div key={index} className="recent-message-item">
                  <div className="message-header">
                    <span className={`message-role role-${msg.role}`}>{msg.role}</span>
                  </div>
                  <div className="message-content">{truncate(msg.content, 100)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="debug-empty">Нет сообщений</div>
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

      {debugSummaryRequest && (
        <div className="debug-section">
          <h3 className="debug-section-title">Summary Generation → AI Request</h3>
          <div className="debug-content">
            <pre className="debug-json">{JSON.stringify(debugSummaryRequest, null, 2)}</pre>
          </div>
        </div>
      )}

      {debugSummaryResponse && (
        <div className="debug-section">
          <h3 className="debug-section-title">Summary Generation ← AI Response</h3>
          <div className="debug-content">
            <pre className="debug-json">{JSON.stringify(debugSummaryResponse, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default DebugPanel;
