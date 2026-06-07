function SettingsPanel({ settings, onSettingsChange }) {
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
      </div>
    </div>
  )
}

export default SettingsPanel
