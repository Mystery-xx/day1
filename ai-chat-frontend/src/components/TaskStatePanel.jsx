const STATUS_OPTIONS = [
  { value: 'CLARIFYING', label: '🔍 Clarifying', description: 'Asking clarifying questions' },
  { value: 'PLANNING', label: '📋 Planning', description: 'Creating execution plan' },
  { value: 'EXECUTING', label: '⚡ Executing', description: 'Running tasks' },
  { value: 'DONE', label: '✅ Done', description: 'Task completed' }
]

const CONSTRAINT_TYPES = [
  { value: 'DEADLINE', label: '📅 Deadline', description: 'Time constraint' },
  { value: 'BUDGET', label: '💰 Budget', description: 'Resource constraint' },
  { value: 'SCOPE', label: '📦 Scope', description: 'Feature/requirement constraint' },
  { value: 'TECHNICAL', label: '⚙️ Technical', description: 'Technical limitation' },
  { value: 'OTHER', label: '📌 Other', description: 'Custom constraint' }
]

function TaskStatePanel({ sessionId, taskState }) {
  const constraints = taskState?.constraints || []
  const clarifications = taskState?.clarifications || []
  const currentStatus = taskState?.status || 'CLARIFYING'
  const statusOption = STATUS_OPTIONS.find(o => o.value === currentStatus)

  const formatDate = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="task-state-panel">
      {/* AI-managed Badge */}
      <div className="ai-managed-badge" style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        marginBottom: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#fff',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: '600',
        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
      }}>
        🤖 AI-managed
      </div>

      {/* Goal Section */}
      <div className="task-section" style={{
        marginBottom: '24px',
        paddingBottom: '24px',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <label style={{ fontWeight: '600', fontSize: '14px', display: 'block', marginBottom: '12px' }}>
          🎯 Task Goal
        </label>
        <div style={{
          padding: '12px',
          background: '#f9f9f9',
          borderRadius: '4px',
          border: '1px solid #e0e0e0',
          fontSize: '13px',
          lineHeight: '1.5',
          minHeight: '60px',
          whiteSpace: 'pre-wrap'
        }}>
          {taskState?.goal || 'No goal defined yet'}
        </div>
      </div>

      {/* Status Section */}
      <div className="task-section" style={{
        marginBottom: '24px',
        paddingBottom: '24px',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <label style={{ fontWeight: '600', fontSize: '14px', display: 'block', marginBottom: '12px' }}>
          📊 Task Status
        </label>
        <span className="status-badge" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          borderRadius: '4px',
          fontSize: '13px',
          fontWeight: '600',
          background: '#e3f2fd',
          color: '#1976D2',
          border: '1px solid #1976D2'
        }}>
          {statusOption?.label || currentStatus}
        </span>
        <div style={{
          marginTop: '8px',
          fontSize: '12px',
          color: '#666'
        }}>
          {statusOption?.description}
        </div>
      </div>

      {/* Constraints Section */}
      <div className="task-section" style={{
        marginBottom: '24px',
        paddingBottom: '24px',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <label style={{ fontWeight: '600', fontSize: '14px', display: 'block', marginBottom: '12px' }}>
          📋 Constraints
        </label>

        {constraints.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {constraints.map((constraint, index) => (
              <div
                key={index}
                style={{
                  padding: '10px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  background: '#fafafa'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '2px 8px',
                    borderRadius: '3px',
                    background: '#e3f2fd',
                    color: '#1976D2'
                  }}>
                    {CONSTRAINT_TYPES.find(t => t.value === constraint.type)?.label || constraint.type}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#333' }}>
                  {constraint.description}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: '#999',
            fontSize: '13px',
            background: '#f9f9f9',
            borderRadius: '4px',
            border: '1px dashed #e0e0e0'
          }}>
            No constraints defined
          </div>
        )}
      </div>

      {/* Clarifications Section */}
      <div className="task-section">
        <label style={{ fontWeight: '600', fontSize: '14px', display: 'block', marginBottom: '12px' }}>
          💬 Clarifications
        </label>

        {clarifications.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {clarifications.map((item, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  background: '#fff'
                }}
              >
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>
                    {formatDate(item.timestamp)}
                  </div>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: '#1976D2', marginBottom: '6px' }}>
                    ❓ {item.question}
                  </div>
                  <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.5' }}>
                    💡 {item.answer}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: '#999',
            fontSize: '13px',
            background: '#f9f9f9',
            borderRadius: '4px',
            border: '1px dashed #e0e0e0'
          }}>
            No clarifications yet
          </div>
        )}
      </div>
    </div>
  )
}

export default TaskStatePanel