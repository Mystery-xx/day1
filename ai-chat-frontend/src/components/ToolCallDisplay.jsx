import { useState } from 'react'

export function ToolCallDisplay({ toolCall, toolResult }) {
  const [expanded, setExpanded] = useState(false)

  const toolName = toolCall?.function?.name || toolCall?.name || 'Unknown'
  const toolArgs = toolCall?.function?.arguments || toolCall?.arguments || '{}'
  const resultContent = toolResult?.content || toolResult?.result || toolResult

  const parseArgs = () => {
    try {
      return typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs
    } catch {
      return toolArgs
    }
  }

  const args = parseArgs()
  const hasResult = resultContent !== undefined && resultContent !== null

  return (
    <div style={{
      margin: '8px 0',
      padding: '10px',
      backgroundColor: '#f0f4f8',
      borderRadius: '6px',
      border: '1px solid #d1d9e6',
      fontSize: '13px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '6px'
      }}>
        <span style={{ fontSize: '16px' }}>🔧</span>
        <span style={{ fontWeight: '600', color: '#2c5282' }}>
          Using {toolName}...
        </span>
      </div>

      {args && Object.keys(args).length > 0 && (
        <div style={{
          marginTop: '6px',
          padding: '6px',
          backgroundColor: '#e2e8f0',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
          overflowX: 'auto'
        }}>
          <span style={{ color: '#4a5568' }}>Args: </span>
          <span style={{ color: '#2d3748' }}>
            {JSON.stringify(args, null, 2)}
          </span>
        </div>
      )}

      {hasResult && (
        <div style={{ marginTop: '6px' }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: expanded ? '#4299e1' : '#edf2f7',
              color: expanded ? 'white' : '#4a5568',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {expanded ? '▼ Hide result' : '▶ Show result'}
          </button>

          {expanded && (
            <div style={{
              marginTop: '6px',
              padding: '8px',
              backgroundColor: '#e6fffa',
              borderRadius: '4px',
              border: '1px solid #81e6d9',
              fontSize: '12px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              <span style={{ color: '#234e52', fontWeight: '600' }}>Result: </span>
              <span style={{ color: '#285e61' }}>
                {typeof resultContent === 'object'
                  ? JSON.stringify(resultContent, null, 2)
                  : String(resultContent)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
