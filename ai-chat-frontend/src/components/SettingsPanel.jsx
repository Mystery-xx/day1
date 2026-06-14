function SettingsPanel({ settings, onSettingsChange, models, onRefreshModels, sessionId, onNewChat, onClearHistory, sessions, onSessionSelect, onDeleteSession, sessionsLoading }) {
  const handleChange = (key, value) => {
    onSettingsChange({
      ...settings,
      [key]: value
    })
  }

  const handleStopChange = (value) => {
    const stopArray = value.split(',').map(s => s.trim()).filter(s => s.length > 0)
    handleChange('stop', stopArray)
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h3>Настройки модели</h3>
      </div>

      <div className="settings-content">
        <div className="setting-item">
          <label htmlFor="provider">AI Provider</label>
          <select
            id="provider"
            value={settings.provider || 'gpustack'}
            onChange={(e) => handleChange('provider', e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="gpustack">GPUStack</option>
            <option value="huggingface">HuggingFace</option>
          </select>
          <div className="setting-description">Выберите провайдера для доступа к ИИ модели</div>
        </div>
        <div className="setting-item">
          <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="model" style={{ marginBottom: 0 }}>Model</label>
            <button 
              onClick={onRefreshModels}
              style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc', background: '#f5f5f5' }}
              title="Refresh models list"
            >
              ↻ Refresh
            </button>
          </div>
          <select
            id="model"
            value={settings.model || ''}
            onChange={(e) => handleChange('model', e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            disabled={!models || models.length === 0}
          >
            {(!models || models.length === 0) ? (
              <option value="">No models loaded</option>
            ) : (
              <>
                <optgroup label="🔴 Слабые модели (быстрые)">
                  {models.filter(m => m.category === 'weak').map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="🟡 Средние модели (сбалансированные)">
                  {models.filter(m => m.category === 'medium').map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="🟢 Сильные модели (мощные)">
                  {models.filter(m => m.category === 'strong').map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="🟣 Супер-сильные модели (300B+)">
                  {models.filter(m => m.category === 'super').map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
                </optgroup>
              </>
            )}
          </select>
          <div className="setting-description">Выберите модель для генерации ответов</div>
        </div>
        <div className="setting-item">
          <label htmlFor="temperature">Temperature: {settings.temperature}</label>
          <input
            id="temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
          />
          <div className="setting-description">Креативность (0 = детерминировано, 2 = максимально случайно)</div>
        </div>

        <div className="setting-item">
          <label htmlFor="maxTokens">Max Tokens: {settings.maxTokens}</label>
          <input
            id="maxTokens"
            type="range"
            min="64"
            max="16384"
            step="64"
            value={settings.maxTokens}
            onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
          />
          <div className="setting-description">Максимальная длина ответа (до 16K для qwen3.5-397b)</div>
        </div>

        <div className="setting-item">
          <label htmlFor="topP">Top P: {settings.topP}</label>
          <input
            id="topP"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.topP}
            onChange={(e) => handleChange('topP', parseFloat(e.target.value))}
          />
          <div className="setting-description">Ядро выборки (0.1 = консервативно, 1 = все токены)</div>
        </div>

        <div className="setting-item">
          <label htmlFor="frequencyPenalty">Frequency Penalty: {settings.frequencyPenalty}</label>
          <input
            id="frequencyPenalty"
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={settings.frequencyPenalty}
            onChange={(e) => handleChange('frequencyPenalty', parseFloat(e.target.value))}
          />
          <div className="setting-description">Снижение повторяемости (0 = нет, 2 = сильно избегать повторов)</div>
        </div>

        <div className="setting-item">
          <label htmlFor="presencePenalty">Presence Penalty: {settings.presencePenalty}</label>
          <input
            id="presencePenalty"
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={settings.presencePenalty}
            onChange={(e) => handleChange('presencePenalty', parseFloat(e.target.value))}
          />
          <div className="setting-description">Исследование новых тем (0 = нет, 2 = избегать старых тем)</div>
        </div>

        <div className="setting-item">
          <label htmlFor="stop">Stop Sequences</label>
          <input
            id="stop"
            type="text"
            placeholder="seq1, seq2, seq3"
            value={Array.isArray(settings.stop) ? settings.stop.join(', ') : ''}
            onChange={(e) => handleStopChange(e.target.value)}
          />
          <div className="setting-description">Последовательности для остановки генерации (через запятую)</div>
        </div>

        <div className="setting-item">
          <div className="setting-toggle-container">
            <label htmlFor="sendHistory">Отправлять историю чата</label>
            <input
              id="sendHistory"
              type="checkbox"
              className="toggle-switch"
              checked={settings.sendHistory}
              onChange={(e) => handleChange('sendHistory', e.target.checked)}
            />
          </div>
          <div className="setting-description">Если отключено, AI получает только текущее сообщение без истории диалога</div>
        </div>

        <div className="setting-item" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e0e0e0' }}>
          <label>Управление сессией</label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={onNewChat}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                cursor: 'pointer',
                borderRadius: '4px',
                border: '1px solid #4CAF50',
                background: '#4CAF50',
                color: 'white',
                fontWeight: '500'
              }}
            >
              + Новый чат
            </button>
            {sessionId && (
              <>
                <button
                  onClick={onClearHistory}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    border: '1px solid #ff9800',
                    background: '#ff9800',
                    color: 'white',
                    fontWeight: '500'
                  }}
                >
                  Очистить историю
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Удалить summary текущей сессии? История сообщений сохранится.')) {
                      fetch(`/api/chat/sessions/${sessionId}/summary`, { method: 'DELETE' })
                        .then(response => {
                          if (response.ok) {
                            alert('Summary удалён');
                            window.location.reload();
                          } else {
                            alert('Ошибка при удалении summary');
                          }
                        })
                        .catch(error => {
                          console.error('Error deleting summary:', error);
                          alert('Ошибка: ' + error.message);
                        });
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    border: '1px solid #9c27b0',
                    background: '#9c27b0',
                    color: 'white',
                    fontWeight: '500'
                  }}
                >
                  Удалить summary
                </button>
              </>
            )}
          </div>
          {sessionId && (
            <div className="setting-description" style={{ marginTop: '8px' }}>
              Текущая сессия: {sessionId.substring(0, 8)}...
            </div>
          )}
        </div>

        <div className="setting-item" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e0e0e0' }}>
          <label>Список сессий</label>
          <div style={{ marginTop: '10px' }}>
            {sessionsLoading ? (
              <div style={{ padding: '10px', textAlign: 'center', color: '#666' }}>
                <span className="loading"></span>
                <span style={{ marginLeft: '8px' }}>Загрузка...</span>
              </div>
            ) : sessions && sessions.length > 0 ? (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className={`session-item ${session.sessionId === sessionId ? 'session-item-active' : ''}`}
                    onClick={() => onSessionSelect(session.sessionId)}
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      border: `1px solid ${session.sessionId === sessionId ? '#4CAF50' : '#e0e0e0'}`,
                      background: session.sessionId === sessionId ? '#f0f9f0' : '#fff',
                      cursor: 'pointer',
                      marginBottom: '8px',
                      transition: 'all 0.2s'
                    }}
                    title={session.sessionId}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
                        {session.sessionId.substring(0, 8)}...
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('Вы уверены, что хотите удалить эту сессию?')) {
                            onDeleteSession(session.sessionId);
                          }
                        }}
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
                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.preview ? (session.preview.length > 50 ? session.preview.substring(0, 50) + '...' : session.preview) : 'Пустая сессия'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999' }}>
                      <span>Сообщений: {session.messageCount}</span>
                      <span>
                        {session.lastMessageAt ? new Date(session.lastMessageAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                Нет сохраненных сессий
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
