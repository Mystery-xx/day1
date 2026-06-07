function SettingsPanel({ settings, onSettingsChange, models, onRefreshModels }) {
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
      </div>
    </div>
  )
}

export default SettingsPanel
