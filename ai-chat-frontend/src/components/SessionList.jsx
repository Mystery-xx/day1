function SessionList({ sessions, isLoading, error, onSessionSelect, onDeleteSession, currentSessionId }) {
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPreview = (preview) => {
    if (!preview) return 'Пустая сессия';
    const trimmed = preview.trim();
    return trimmed.length > 50 ? trimmed.substring(0, 50) + '...' : trimmed;
  };

  const handleDelete = (e, sessionId) => {
    e.stopPropagation();
    if (window.confirm('Вы уверены, что хотите удалить эту сессию?')) {
      onDeleteSession(sessionId);
    }
  };

  if (isLoading) {
    return (
      <div className="session-list-loading">
        <span className="loading"></span>
        <span>Загрузка сессий...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="session-list-error">
        {error}
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="session-list-empty">
        Нет сохраненных сессий
      </div>
    );
  }

  return (
    <div className="session-list">
      <div className="session-list-header">
        <h4>Сессии ({sessions.length})</h4>
      </div>
      <div className="session-list-content">
        {sessions.map((session) => (
          <div
            key={session.sessionId}
            className={`session-item ${session.sessionId === currentSessionId ? 'session-item-active' : ''}`}
            onClick={() => onSessionSelect(session.sessionId)}
            style={{
              padding: '10px',
              borderRadius: '6px',
              border: `1px solid ${session.sessionId === currentSessionId ? '#4CAF50' : '#e0e0e0'}`,
              background: session.sessionId === currentSessionId ? '#f0f9f0' : '#fff',
              cursor: 'pointer',
              marginBottom: '8px',
              transition: 'all 0.2s'
            }}
            title={session.sessionId}
          >
            <div className="session-item-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span className="session-id-short" style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
                {session.sessionId.substring(0, 8)}...
              </span>
              <button
                onClick={(e) => handleDelete(e, session.sessionId)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  border: '1px solid #f44336',
                  background: '#fff',
                  color: '#f44336',
                  fontWeight: '500'
                }}
                title="Удалить сессию"
              >
                ✕
              </button>
            </div>
            <div className="session-item-preview" style={{ fontSize: '13px', color: '#666', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {formatPreview(session.preview)}
            </div>
            <div className="session-item-meta" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999' }}>
              <span>
                Сообщений: {session.messageCount}
              </span>
              <span>
                {formatDate(session.lastMessageAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SessionList;
