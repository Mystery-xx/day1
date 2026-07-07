import { useState, useEffect } from 'react'
import { useMcp } from '../hooks/useMcp'
import UploadPanel from './rag/UploadPanel'
import StatisticsPanel from './rag/StatisticsPanel'
import SearchPanel from './rag/SearchPanel'

const STRATEGY_OPTIONS = [
  { value: 'summary', label: 'Summary', description: 'Keep recent messages plus an AI-generated summary of older history' },
  { value: 'slidingWindow', label: 'Sliding Window', description: 'Keep only the last N messages' },
  { value: 'stickyFacts', label: 'Sticky Facts', description: 'Inject stored key-value facts as a system message plus recent messages' }
]

const TABS = [
  { id: 'rag', label: '📎 RAG', description: 'RAG settings' },
  { id: 'upload', label: '📤 Upload', description: 'Upload documents for RAG' },
  { id: 'statistics', label: '📊 Statistics', description: 'RAG index statistics' },
  { id: 'search', label: '🔍 Search', description: 'Search uploaded documents' },
  { id: 'model', label: '🤖 Model', description: 'AI model settings' },
  { id: 'context', label: '📚 Context', description: 'Context management' },
  { id: 'mcp', label: '🔧 MCP', description: 'MCP servers' },
  { id: 'session', label: '💬 Session', description: 'Session management' }
]

function SettingsPanel({ settings, onSettingsChange, models, onRefreshModels, sessionId, onNewChat, onClearHistory, sessions, onSessionSelect, onDeleteSession, sessionsLoading, onFactsRefreshed }) {
  const { servers, connectedServer, tools, status, error, fetchServers, addServer, connect, disconnect, deleteServer } = useMcp()
  
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
  
  // MCP server management state
  const [showAddServer, setShowAddServer] = useState(false)
  const [newServerName, setNewServerName] = useState('')
  const [newServerUrl, setNewServerUrl] = useState('')
  const [selectedServerId, setSelectedServerId] = useState(null)
  const [testToolName, setTestToolName] = useState('')
  const [testToolArgs, setTestToolArgs] = useState('{}')
  const [testResult, setTestResult] = useState(null)
  
  // Tab state
  const [activeTab, setActiveTab] = useState('upload')

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
  
  // Fetch MCP servers on mount
  useEffect(() => {
    fetchServers()
  }, [fetchServers])

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
  
  // MCP server management handlers
  const handleAddServer = async () => {
    if (!newServerName.trim() || !newServerUrl.trim()) return
    try {
      await addServer({
        name: newServerName.trim(),
        url: newServerUrl.trim(),
        transportType: 'SSE'
      })
      setNewServerName('')
      setNewServerUrl('')
      setShowAddServer(false)
      fetchServers()
    } catch (err) {
      console.error('Error adding server:', err)
    }
  }
  
  const handleConnect = async (serverId) => {
    try {
      setSelectedServerId(serverId)
      await connect(serverId)
    } catch (err) {
      console.error('Error connecting:', err)
    }
  }
  
  const handleDisconnect = async (serverId) => {
    try {
      await disconnect(serverId)
      setSelectedServerId(null)
      setTestResult(null)
    } catch (err) {
      console.error('Error disconnecting:', err)
    }
  }
  
  const handleDelete = async (serverId, serverName) => {
    if (!window.confirm(`Удалить MCP сервер "${serverName}"?\n\nЭто действие нельзя отменить.`)) {
      return
    }
    
    try {
      await deleteServer(serverId)
      if (connectedServer?.id === serverId) {
        setSelectedServerId(null)
        setTestResult(null)
      }
    } catch (err) {
      console.error('Error deleting server:', err)
      alert('Ошибка при удалении сервера: ' + (err.message || 'Неизвестная ошибка'))
    }
  }
  
  const handleTestTool = async (serverId, toolName) => {
    if (!serverId || !toolName) return
    setTestResult({ loading: true })
    try {
      const args = JSON.parse(testToolArgs || '{}')
      const response = await fetch(`/api/mcp/servers/${serverId}/tools?tool=${encodeURIComponent(toolName)}&args=${encodeURIComponent(JSON.stringify(args))}`)
      if (response.ok) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let result = null
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5))
                if (data.type === 'result' || data.type === 'complete') {
                  result = data.data
                }
              } catch (e) {
                // Non-JSON data
              }
            }
          }
        }
        
        setTestResult({ success: true, data: result })
      } else {
        setTestResult({ success: false, error: 'Tool invocation failed' })
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message })
    }
  }

  return (
    <div className="settings-panel">
      {/* Tab Navigation */}
      <div className="settings-tabs" style={{
        display: 'flex',
        borderBottom: '1px solid #e0e0e0',
        background: '#f9f9f9',
        padding: '0 16px',
        paddingTop: '16px'
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.description}
            style={{
              padding: '10px 16px',
              marginRight: '4px',
              background: activeTab === tab.id ? '#fff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #4CAF50' : '2px solid transparent',
              color: activeTab === tab.id ? '#4CAF50' : '#666',
              fontWeight: activeTab === tab.id ? '600' : '400',
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'all 0.2s',
              borderRadius: '4px 4px 0 0'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-content" style={{ padding: '16px' }}>
        {/* RAG Settings Tab */}
        {activeTab === 'rag' && (
          <>
          <div className="setting-item">
            <div className="setting-toggle-container">
              <label htmlFor="useRag">Enable RAG</label>
              <input
                id="useRag"
                type="checkbox"
                className="toggle-switch"
                checked={settings.useRag || false}
                onChange={(e) => handleChange('useRag', e.target.checked)}
              />
            </div>
            <div className="setting-description">
              When enabled, the chat will search your uploaded documents and use them as context for better answers.
            </div>
          </div>
          
          <div className="setting-item" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e0e0e0' }}>
            <div className="setting-toggle-container">
              <label htmlFor="useRerank">Enable Reranking</label>
              <input
                id="useRerank"
                type="checkbox"
                className="toggle-switch"
                checked={settings.useRerank || false}
                onChange={(e) => handleChange('useRerank', e.target.checked)}
                disabled={!settings.useRag}
              />
            </div>
            <div className="setting-description">
              When enabled (requires RAG), documents are reranked by relevance using TEI reranker. Improves result quality but adds latency.
            </div>
            {!settings.useRag && (
              <div className="setting-description" style={{ color: '#ff9800', fontSize: '12px', marginTop: '4px' }}>
                ⚠️ Enable RAG first to use reranking
              </div>
            )}
          </div>
          
          <div className="setting-item" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e0e0e0' }}>
            <label htmlFor="ragThreshold">Rerank Threshold: {(settings.ragThreshold || 0.0).toFixed(1)}</label>
            <input
              id="ragThreshold"
              type="range"
              min="-2"
              max="5"
              step="0.1"
              value={settings.ragThreshold || 0.0}
              onChange={(e) => handleChange('ragThreshold', parseFloat(e.target.value))}
              disabled={!settings.useRerank}
              style={{ width: '100%', marginTop: '8px' }}
            />
            <div className="setting-description">
              Minimum score for documents to be included. Lower = more documents, higher = stricter quality. TEI uses logits (0.0 = 50% probability).
            </div>
            {!settings.useRerank && (
              <div className="setting-description" style={{ color: '#ff9800', fontSize: '12px', marginTop: '4px' }}>
                ⚠️ Enable reranking to adjust threshold
              </div>
            )}
          </div>
          
          <div className="setting-item" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e0e0e0' }}>
            <div className="setting-toggle-container">
              <label htmlFor="useRewrite">Enable Query Rewrite</label>
              <input
                id="useRewrite"
                type="checkbox"
                className="toggle-switch"
                checked={settings.useRewrite || false}
                onChange={(e) => handleChange('useRewrite', e.target.checked)}
                disabled={!settings.useRag}
              />
            </div>
            <div className="setting-description">
              When enabled (requires RAG), short queries are automatically rewritten to be more specific and detailed before search. Improves retrieval accuracy but adds latency.
            </div>
            {!settings.useRag && (
              <div className="setting-description" style={{ color: '#ff9800', fontSize: '12px', marginTop: '4px' }}>
                ⚠️ Enable RAG first to use query rewrite
              </div>
            )}
          </div>
          </>
        )}
        
        {/* Upload Panel Tab */}
        {activeTab === 'upload' && <UploadPanel />}
        
        {/* Statistics Tab */}
        {activeTab === 'statistics' && <StatisticsPanel />}
        
        {/* Search Panel Tab */}
        {activeTab === 'search' && <SearchPanel />}
        
        {/* Model Settings Tab */}
        {activeTab === 'model' && (
        <>
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

        {/* Context section moved to context tab - removed from model tab */}
        </>
        )}
        
        {/* Context Management Tab */}
        {activeTab === 'context' && (
        <>
        <div className="setting-item">
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
        </>
        )}
        
        {/* MCP Servers Tab */}
        {activeTab === 'mcp' && (
        <>
        <div className="setting-item" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e0e0e0' }}>
          <label>MCP Servers</label>
          
          {/* Server List */}
          <div style={{ marginTop: '10px' }}>
            {servers && servers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {servers.map((server) => (
                  <div
                    key={server.id}
                    style={{
                      padding: '10px',
                      border: `1px solid ${connectedServer?.id === server.id ? '#4CAF50' : '#e0e0e0'}`,
                      borderRadius: '6px',
                      background: connectedServer?.id === server.id ? '#f0f9f0' : '#fff',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{server.name}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{server.url}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {connectedServer?.id === server.id ? (
                          <button
                            onClick={() => handleDisconnect(server.id)}
                            disabled={status === 'disconnecting'}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              cursor: status === 'disconnecting' ? 'not-allowed' : 'pointer',
                              borderRadius: '4px',
                              border: '1px solid #f44336',
                              background: status === 'disconnecting' ? '#ccc' : '#f44336',
                              color: 'white'
                            }}
                          >
                            {status === 'disconnecting' ? '...' : 'Disconnect'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConnect(server.id)}
                            disabled={status === 'connecting'}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              cursor: status === 'connecting' ? 'not-allowed' : 'pointer',
                              borderRadius: '4px',
                              border: '1px solid #2196F3',
                              background: status === 'connecting' ? '#ccc' : '#2196F3',
                              color: 'white'
                            }}
                          >
                            {status === 'connecting' ? '...' : 'Connect'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(server.id, server.name)}
                          disabled={status === 'deleting'}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            cursor: status === 'deleting' ? 'not-allowed' : 'pointer',
                            borderRadius: '4px',
                            border: '1px solid #f44336',
                            background: status === 'deleting' ? '#ccc' : '#f44336',
                            color: 'white'
                          }}
                          title="Delete MCP server"
                        >
                          {status === 'deleting' ? '...' : '🗑 Delete'}
                        </button>
                      </div>
                    </div>
                    
                    {/* Connection Status */}
                    {connectedServer?.id === server.id && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #e0e0e0' }}>
                        <div style={{ fontSize: '12px', color: '#4CAF50', marginBottom: '8px', fontWeight: '600' }}>
                          ✓ Connected
                        </div>
                        
                        {/* Tool List */}
                        {tools && tools.length > 0 ? (
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
                              Available Tools ({tools.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {tools.map((tool, index) => (
                                <div
                                  key={index}
                                  style={{
                                    padding: '10px',
                                    border: '1px solid #e0e0e0',
                                    borderRadius: '4px',
                                    background: '#fafafa'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#333' }}>
                                      {tool.name}
                                    </div>
                                    <button
                                      onClick={() => {
                                        setTestToolName(tool.name)
                                        setTestToolArgs('{}')
                                        setTestResult(null)
                                        handleTestTool(server.id, tool.name)
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        borderRadius: '4px',
                                        border: '1px solid #ff9800',
                                        background: '#fff',
                                        color: '#ff9800'
                                      }}
                                      title="Test this tool (debugging)"
                                    >
                                      🧪 Test
                                    </button>
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>
                                    {tool.description}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#999' }}>
                                    <strong>Parameters:</strong>
                                    <pre style={{
                                      margin: '4px 0 0 0',
                                      padding: '6px',
                                      background: '#f5f5f5',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      overflow: 'auto',
                                      maxHeight: '100px'
                                    }}>
                                      {tool.parameters}
                                    </pre>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* Test Result */}
                            {testResult && (
                              <div style={{
                                marginTop: '12px',
                                padding: '10px',
                                border: `1px solid ${testResult.success ? '#4CAF50' : '#f44336'}`,
                                borderRadius: '4px',
                                background: testResult.success ? '#e8f5e9' : '#ffebee'
                              }}>
                                <div style={{ fontWeight: '600', fontSize: '12px', marginBottom: '6px' }}>
                                  {testResult.loading ? '⏳ Running...' : (testResult.success ? '✓ Success' : '✗ Error')}
                                </div>
                                {!testResult.loading && testResult.data && (
                                  <pre style={{
                                    margin: 0,
                                    padding: '6px',
                                    background: '#fff',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    overflow: 'auto',
                                    maxHeight: '200px'
                                  }}>
                                    {JSON.stringify(testResult.data, null, 2)}
                                  </pre>
                                )}
                                {!testResult.loading && testResult.error && (
                                  <div style={{ fontSize: '12px', color: '#f44336' }}>
                                    {testResult.error}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                            No tools available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                No MCP servers configured
              </div>
            )}
          </div>
          
          {/* Add Server Form */}
          <div style={{ marginTop: '12px' }}>
            {showAddServer ? (
              <div style={{ padding: '12px', border: '1px solid #e0e0e0', borderRadius: '6px', background: '#f9f9f9' }}>
                <div style={{ marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="Server name"
                    value={newServerName}
                    onChange={(e) => setNewServerName(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginBottom: '8px' }}
                  />
                  <input
                    type="text"
                    placeholder="Server URL (e.g., http://localhost:3000/sse)"
                    value={newServerUrl}
                    onChange={(e) => setNewServerUrl(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleAddServer}
                    disabled={!newServerName.trim() || !newServerUrl.trim()}
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      cursor: newServerName.trim() && newServerUrl.trim() ? 'pointer' : 'not-allowed',
                      borderRadius: '4px',
                      border: '1px solid #4CAF50',
                      background: newServerName.trim() && newServerUrl.trim() ? '#4CAF50' : '#ccc',
                      color: 'white',
                      fontWeight: '500'
                    }}
                  >
                    Add Server
                  </button>
                  <button
                    onClick={() => {
                      setShowAddServer(false)
                      setNewServerName('')
                      setNewServerUrl('')
                    }}
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      border: '1px solid #999',
                      background: '#fff',
                      color: '#666'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddServer(true)}
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  border: '1px solid #2196F3',
                  background: '#fff',
                  color: '#2196F3',
                  width: '100%'
                }}
              >
                + Add MCP Server
              </button>
            )}
          </div>
          
          {/* Connection Error */}
          {error && (
            <div style={{
              marginTop: '12px',
              padding: '10px',
              border: '1px solid #f44336',
              borderRadius: '4px',
              background: '#ffebee',
              color: '#f44336',
              fontSize: '13px'
            }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        </>
        )}
        
        {/* Session Management Tab */}
        {activeTab === 'session' && (
        <>
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
        </>
        )}

      </div>
    </div>
  )
}

export default SettingsPanel
