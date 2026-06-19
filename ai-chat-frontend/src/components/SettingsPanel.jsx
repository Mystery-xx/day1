import { useState, useEffect } from 'react'

const STRATEGY_OPTIONS = [
  { value: 'summary', label: 'Summary', description: 'Keep recent messages plus an AI-generated summary of older history' },
  { value: 'slidingWindow', label: 'Sliding Window', description: 'Keep only the last N messages' },
  { value: 'stickyFacts', label: 'Sticky Facts', description: 'Inject stored key-value facts as a system message plus recent messages' }
]

function SettingsPanel({ settings, onSettingsChange, models, onRefreshModels, sessionId, onNewChat, onClearHistory, sessions, onSessionSelect, onDeleteSession, sessionsLoading, onFactsRefreshed, profiles, activeProfileId, onProfileActivate, profilesLoading }) {
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

  const [factsLoading, setFactsLoading] = useState(false)
  const [newFactKey, setNewFactKey] = useState('')
  const [newFactValue, setNewFactValue] = useState('')
  const [factsData, setFactsData] = useState([])
  const [autoExtractEnabled, setAutoExtractEnabled] = useState(true)

  // Load sticky facts for current session when strategy or session changes.
  useEffect(() => {
    if (!sessionId || settings.contextStrategy !== 'stickyFacts') {
      return
    }
    let cancelled = false
    setFactsLoading(true)
    fetch(`/api/chat/sessions/${sessionId}/sticky-facts`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (cancelled) return
        setFactsData(data)
        const facts = {}
        for (const item of data) {
          facts[item.factKey] = item.factValue
        }
        onSettingsChange(prev => ({
          ...prev,
          stickyFacts: facts,
          autoExtractFacts: prev.autoExtractFacts !== undefined ? prev.autoExtractFacts : true
        }))
      })
      .catch(err => console.error('Error loading sticky facts:', err))
      .finally(() => {
        if (!cancelled) setFactsLoading(false)
      })
    return () => { cancelled = true }
  }, [sessionId, settings.contextStrategy])

  const facts = settings.stickyFacts || {}
  const showWindowInput = settings.contextStrategy === 'slidingWindow' || settings.contextStrategy === 'stickyFacts'
  const showFactsEditor = settings.contextStrategy === 'stickyFacts'
  const autoExtractFactsEnabled = settings.autoExtractFacts !== undefined ? settings.autoExtractFacts : true

  const addFact = async () => {
    if (!sessionId || !newFactKey.trim() || !newFactValue.trim()) return
    const key = newFactKey.trim()
    const value = newFactValue.trim()
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/sticky-facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factKey: key, factValue: value })
      })
      if (response.ok) {
        const savedFact = await response.json()
        // Refresh facts data
        setFactsData(prev => [...prev.filter(f => f.factKey !== key), savedFact])
        onSettingsChange(prev => ({
          ...prev,
          stickyFacts: { ...prev.stickyFacts, [key]: value }
        }))
        // Refresh global sticky facts list in parent component
        onFactsRefreshed()
        setNewFactKey('')
        setNewFactValue('')
      }
    } catch (error) {
      console.error('Error saving sticky fact:', error)
    }
  }

  const deleteFact = async (key) => {
    if (!sessionId) return
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/sticky-facts/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setFactsData(prev => prev.filter(f => f.factKey !== key))
        onSettingsChange(prev => {
          const updated = { ...prev.stickyFacts }
          delete updated[key]
          return { ...prev, stickyFacts: updated }
        })
      }
    } catch (error) {
      console.error('Error deleting sticky fact:', error)
    }
  }

  const convertToManual = async (fact) => {
    if (!sessionId || !fact.isAutoExtracted) return
    // Re-save the fact as manual by posting it again
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/sticky-facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factKey: fact.factKey, factValue: fact.factValue })
      })
      if (response.ok) {
        const updatedFact = await response.json()
        setFactsData(prev => prev.map(f => f.factKey === fact.factKey ? updatedFact : f))
      }
    } catch (error) {
      console.error('Error converting fact to manual:', error)
    }
  }

  const triggerFactExtraction = async () => {
    if (!sessionId) return
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/extract-facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.model,
          provider: settings.provider
        })
      })
      if (response.ok) {
        // Reload facts to show newly extracted ones
        const factsResponse = await fetch(`/api/chat/sessions/${sessionId}/sticky-facts`)
        if (factsResponse.ok) {
          const data = await factsResponse.json()
          setFactsData(data)
          // Notify parent to refresh DebugPanel
          if (onFactsRefreshed) {
            onFactsRefreshed()
          }
          const facts = {}
          for (const item of data) {
            facts[item.factKey] = item.factValue
          }
          onSettingsChange(prev => ({
            ...prev,
            stickyFacts: facts
          }))
        }
      }
    } catch (error) {
      console.error('Error extracting facts:', error)
    }
  }

  const toggleAutoExtract = async (enabled) => {
    setAutoExtractEnabled(enabled)
    onSettingsChange(prev => ({
      ...prev,
      autoExtractFacts: enabled
    }))
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
          <label htmlFor="contextStrategy">Context Strategy</label>
          <select
            id="contextStrategy"
            value={settings.contextStrategy || 'summary'}
            onChange={(e) => handleChange('contextStrategy', e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '6px' }}
          >
            {STRATEGY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className="setting-description">
            {STRATEGY_OPTIONS.find(o => o.value === (settings.contextStrategy || 'summary'))?.description}
          </div>
        </div>

        <div className="setting-item" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e0e0e0' }}>
          <label>Developer Profile</label>
          <div className="setting-description" style={{ marginBottom: '12px' }}>
            Выберите стиль ответов AI
          </div>
          
          {profilesLoading ? (
            <div style={{ padding: '10px', textAlign: 'center', color: '#666' }}>
              <span className="loading"></span>
              <span style={{ marginLeft: '8px' }}>Загрузка профилей...</span>
            </div>
          ) : profiles && profiles.length > 0 ? (
            <div className="profile-selector">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className={`profile-item ${activeProfileId === profile.id ? 'profile-item-active' : ''}`}
                >
                  <div className="profile-header">
                    <div className="profile-name-container">
                      <span className="profile-name">{profile.profileName}</span>
                      {activeProfileId === profile.id && (
                        <span className="profile-active-badge">Active</span>
                      )}
                    </div>
                  </div>
                  <div className="profile-description">{profile.description}</div>
                  {activeProfileId !== profile.id && (
                    <button
                      onClick={() => onProfileActivate(profile.id)}
                      className="profile-activate-button"
                    >
                      Activate
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
              Нет доступных профилей
            </div>
          )}
        </div>

        {showWindowInput && (
          <div className="setting-item">
            <label htmlFor="contextWindowSize">Window Size: {settings.contextWindowSize}</label>
            <input
              id="contextWindowSize"
              type="range"
              min="1"
              max="50"
              step="1"
              value={settings.contextWindowSize || 10}
              onChange={(e) => handleChange('contextWindowSize', parseInt(e.target.value))}
            />
            <div className="setting-description">Количество последних сообщений, передаваемых в контекст</div>
          </div>
        )}

        {showFactsEditor && (
          <div className="setting-item">
            <label>Sticky Facts</label>
            <div className="setting-description" style={{ marginBottom: '10px' }}>
              Ключ-значение фактов, которые всегда передаются в контексте как system message
            </div>
            
            {/* Auto-extraction toggle */}
            <div className="setting-item" style={{ marginBottom: '12px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
              <div className="setting-toggle-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <label htmlFor="autoExtractFacts" style={{ fontWeight: '500', fontSize: '13px' }}>
                    Auto-extract facts from conversation
                  </label>
                  <div className="setting-description" style={{ fontSize: '12px', marginTop: '4px' }}>
                    Automatically extract key facts every 3 messages
                  </div>
                </div>
                <input
                  id="autoExtractFacts"
                  type="checkbox"
                  className="toggle-switch"
                  checked={autoExtractFactsEnabled}
                  onChange={(e) => toggleAutoExtract(e.target.checked)}
                />
              </div>
            </div>

            {/* Manual extraction button */}
            <button
              onClick={triggerFactExtraction}
              disabled={!sessionId}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                cursor: sessionId ? 'pointer' : 'not-allowed',
                borderRadius: '4px',
                border: '1px solid #2196F3',
                background: sessionId ? '#2196F3' : '#ccc',
                color: 'white',
                fontWeight: '500',
                marginBottom: '12px',
                width: '100%'
              }}
              title="Extract facts from conversation history now"
            >
              🤖 Extract Facts Now
            </button>
            
            {factsLoading ? (
              <div style={{ padding: '10px', textAlign: 'center', color: '#666' }}>
                <span className="loading"></span>
                <span style={{ marginLeft: '8px' }}>Загрузка...</span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  {factsData.map((fact) => (
                    <div
                      key={fact.factKey}
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        padding: '8px',
                        border: fact.isAutoExtracted ? '1px dashed #2196F3' : '1px solid #e0e0e0',
                        borderRadius: '4px',
                        background: fact.isAutoExtracted ? '#e3f2fd' : '#fafafa'
                      }}
                    >
                      <div style={{ flex: '0 0 30%', fontWeight: '600', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {fact.isAutoExtracted && <span title="Auto-extracted">🤖</span>}
                        {fact.factKey}
                      </div>
                      <div style={{ flex: 1, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fact.factValue}
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {fact.isAutoExtracted && (
                          <button
                            onClick={() => convertToManual(fact)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              borderRadius: '4px',
                              border: '1px solid #4CAF50',
                              background: '#fff',
                              color: '#4CAF50'
                            }}
                            title="Convert to manual fact"
                          >
                            Convert
                          </button>
                        )}
                        <button
                          onClick={() => deleteFact(fact.factKey)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            border: '1px solid #f44336',
                            background: '#fff',
                            color: '#f44336'
                          }}
                          title="Удалить факт"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  {factsData.length === 0 && (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                      Нет сохраненных фактов
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Ключ (например, имя пользователя)"
                    value={newFactKey}
                    onChange={(e) => setNewFactKey(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                  <input
                    type="text"
                    placeholder="Значение (например, Алексей)"
                    value={newFactValue}
                    onChange={(e) => setNewFactValue(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                  <button
                    onClick={addFact}
                    disabled={!newFactKey.trim() || !newFactValue.trim()}
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      border: '1px solid #4CAF50',
                      background: '#4CAF50',
                      color: 'white',
                      fontWeight: '500'
                    }}
                  >
                    + Добавить факт
                  </button>
                </div>
              </>
            )}
          </div>
        )}

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
                    if (settings.contextStrategy === 'stickyFacts') {
                      if (window.confirm('Удалить все факты текущей сессии? История сообщений сохранится.')) {
                        fetch(`/api/chat/sessions/${sessionId}/sticky-facts`, { method: 'DELETE' })
                          .then(response => {
                            if (response.ok) {
                              alert('Факты удалены')
                              if (onFactsRefreshed) onFactsRefreshed()
                              setFactsData([])
                            } else {
                              alert('Ошибка при удалении фактов')
                            }
                          })
                          .catch(error => {
                            console.error('Error deleting facts:', error)
                            alert('Ошибка: ' + error.message)
                          })
                      }
                    } else {
                      if (window.confirm('Удалить summary текущей сессии? История сообщений сохранится.')) {
                        fetch(`/api/chat/sessions/${sessionId}/summary`, { method: 'DELETE' })
                          .then(response => {
                            if (response.ok) {
                              alert('Summary удалён')
                              window.location.reload()
                            } else {
                              alert('Ошибка при удалении summary')
                            }
                          })
                          .catch(error => {
                            console.error('Error deleting summary:', error)
                            alert('Ошибка: ' + error.message)
                          })
                      }
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
                  {settings.contextStrategy === 'stickyFacts' ? 'Удалить факты' : 'Удалить summary'}
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
                          e.stopPropagation()
                          if (window.confirm('Вы уверены, что хотите удалить эту сессию?')) {
                            onDeleteSession(session.sessionId)
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
