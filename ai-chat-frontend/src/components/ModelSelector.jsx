import { useState, useEffect, useCallback } from 'react'

/**
 * ModelSelector - Dropdown with loading/error/empty states
 * Fetches models from /api/models/local when provider="local"
 */
function ModelSelector({ 
  provider, 
  selectedModel, 
  onModelChange, 
  onRefresh,
  models,
  loading,
  error,
  onRetry 
}) {
  const [localModels, setLocalModels] = useState([])
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState(null)

  const fetchLocalModels = useCallback(async () => {
    setLocalLoading(true)
    setLocalError(null)
    
    try {
      const response = await fetch('/api/models/local')
      
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = `HTTP ${response.status}`
        try {
          const errorData = await response.json()
          if (errorData.message) {
            errorMessage = errorData.message
          } else if (errorData.error) {
            errorMessage = errorData.error
          }
        } catch (e) {
          // Response body is not JSON, use status as message
        }
        throw new Error(`Failed to load models: ${errorMessage}`)
      }
      
      const data = await response.json()
      setLocalModels(data || [])
    } catch (err) {
      setLocalError(err.message || 'Failed to load models: Unknown error')
    } finally {
      setLocalLoading(false)
    }
  }, [])

  // Fetch local models when provider changes to 'local'
  useEffect(() => {
    if (provider === 'local') {
      fetchLocalModels()
    }
  }, [provider, fetchLocalModels])

  // Determine which models to use based on provider
  const displayedModels = provider === 'local' ? localModels : models
  const isLoading = provider === 'local' ? localLoading : loading
  const currentError = provider === 'local' ? localError : null

  // Handle retry for local provider
  const handleRetry = () => {
    if (provider === 'local') {
      fetchLocalModels()
    } else if (onRetry) {
      onRetry()
    }
  }

  // Handle refresh
  const handleRefresh = () => {
    if (provider === 'local') {
      fetchLocalModels()
    } else if (onRefresh) {
      onRefresh()
    }
  }

  // Determine categories from models
  const getCategoryLabel = (category) => {
    const labels = {
      'weak': '🔴 Weak models (fast)',
      'medium': '🟡 Medium models (balanced)',
      'strong': '🟢 Strong models (powerful)',
      'super': '🟣 Super models (300B+)',
      'text-generation': '📝 Text Generation Models'
    }
    return labels[category] || `📦 ${category}`
  }

  // Group models by category
  const groupedModels = displayedModels.reduce((acc, model) => {
    const category = model.category || 'other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(model)
    return acc
  }, {})

  const hasModels = displayedModels && displayedModels.length > 0

  return (
    <div className="model-selector">
      <div className="setting-row" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '8px' 
      }}>
        <label htmlFor="model" style={{ marginBottom: 0 }}>Model</label>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          style={{
            padding: '4px 8px', 
            fontSize: '12px', 
            cursor: isLoading ? 'not-allowed' : 'pointer', 
            borderRadius: '4px', 
            border: '1px solid #ccc', 
            background: isLoading ? '#e0e0e0' : '#f5f5f5',
            opacity: isLoading ? 0.6 : 1
          }}
          title="Refresh models list"
        >
          {isLoading ? '⏳...' : '↻ Refresh'}
        </button>
      </div>

      <select
        id="model"
        value={selectedModel || ''}
        onChange={(e) => onModelChange(e.target.value)}
        style={{
          width: '100%', 
          padding: '8px', 
          borderRadius: '4px', 
          border: `1px solid ${currentError ? '#f44336' : '#ccc'}`,
          backgroundColor: isLoading ? '#f9f9f9' : '#fff'
        }}
        disabled={isLoading || (provider === 'local' && !hasModels && !currentError)}
      >
        {isLoading ? (
          <option value="">Loading models...</option>
        ) : currentError ? (
          <option value="">Error loading models</option>
        ) : !hasModels ? (
          <option value="">No models loaded</option>
        ) : (
          <>
            <option value="">-- Select a model --</option>
            {Object.entries(groupedModels).map(([category, categoryModels]) => (
              <optgroup key={category} label={getCategoryLabel(category)}>
                {categoryModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name || model.id}
                  </option>
                ))}
              </optgroup>
            ))}
          </>
        )}
      </select>

      {/* Inline Error State */}
      {currentError && (
        <div style={{
          marginTop: '8px',
          padding: '10px',
          border: '1px solid #f44336',
          borderRadius: '4px',
          background: '#ffebee',
          color: '#c62828',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', marginBottom: '4px' }}>
              ⚠️ {currentError}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>
              Check that Ollama is running: <code style={{ background: '#ffcdd2', padding: '2px 4px', borderRadius: '2px' }}>ollama serve</code>
            </div>
          </div>
          <button
            onClick={handleRetry}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              borderRadius: '4px',
              border: '1px solid #f44336',
              background: '#fff',
              color: '#f44336',
              fontWeight: '500',
              whiteSpace: 'nowrap'
            }}
          >
            🔄 Retry
          </button>
        </div>
      )}

      {/* Empty State Hint */}
      {!isLoading && !currentError && !hasModels && (
        <div style={{
          marginTop: '8px',
          padding: '10px',
          border: '1px solid #ff9800',
          borderRadius: '4px',
          background: '#fff3e0',
          color: '#e65100',
          fontSize: '13px'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '4px' }}>
            💡 No models available
          </div>
          <div>
            Run in terminal: 
            <code style={{ 
              display: 'block', 
              marginTop: '6px',
              background: '#fff', 
              padding: '8px 12px', 
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}>
              ollama pull llama3.2
            </code>
          </div>
        </div>
      )}

      <div className="setting-description" style={{ marginTop: '8px' }}>
        {provider === 'local' 
          ? 'Select a local Ollama model' 
          : 'Select a model for generation'}
      </div>
    </div>
  )
}

export default ModelSelector