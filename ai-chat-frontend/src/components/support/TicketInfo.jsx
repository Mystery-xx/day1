/**
 * TicketInfo — panel displaying support ticket details.
 *
 * Props:
 *   ticket  - TicketDTO object with fields:
 *             ticketId, subject, status, priority, description,
 *             userName, userEmail, createdAt
 *
 * Status badges:
 *   OPEN        → green
 *   IN_PROGRESS → blue
 *   PENDING     → yellow
 *   CLOSED      → gray
 *
 * Priority badges:
 *   LOW      → gray
 *   MEDIUM   → yellow
 *   HIGH     → orange
 *   CRITICAL → red
 */

const STATUS_CONFIG = {
  OPEN:         { label: 'Открыт',       className: 'ticket-badge ticket-badge-open' },
  IN_PROGRESS:  { label: 'В работе',     className: 'ticket-badge ticket-badge-in-progress' },
  PENDING:      { label: 'Ожидание',     className: 'ticket-badge ticket-badge-pending' },
  CLOSED:       { label: 'Закрыт',       className: 'ticket-badge ticket-badge-closed' },
}

const PRIORITY_CONFIG = {
  LOW:      { label: 'Низкий',   className: 'ticket-badge ticket-badge-low' },
  MEDIUM:   { label: 'Средний',  className: 'ticket-badge ticket-badge-medium' },
  HIGH:     { label: 'Высокий',  className: 'ticket-badge ticket-badge-high' },
  CRITICAL: { label: 'Критичный', className: 'ticket-badge ticket-badge-critical' },
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function TicketInfo({ ticket }) {
  if (!ticket) {
    return (
      <div className="ticket-info ticket-info-empty">
        Выберите тикет для просмотра деталей
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[ticket.status] || { label: ticket.status, className: 'ticket-badge' }
  const priorityCfg = PRIORITY_CONFIG[ticket.priority] || { label: ticket.priority, className: 'ticket-badge' }

  return (
    <div className="ticket-info">
      <h3 className="ticket-info-subject">{ticket.subject}</h3>

      <div className="ticket-info-badges">
        <span className={statusCfg.className}>{statusCfg.label}</span>
        <span className={priorityCfg.className}>{priorityCfg.label}</span>
      </div>

      <table className="ticket-info-table">
        <tbody>
          <tr>
            <td className="ticket-info-label">ID</td>
            <td className="ticket-info-value">{ticket.ticketId}</td>
          </tr>
          <tr>
            <td className="ticket-info-label">Пользователь</td>
            <td className="ticket-info-value">
              {ticket.userName}
              {ticket.userEmail && <span className="ticket-info-email"> ({ticket.userEmail})</span>}
            </td>
          </tr>
          <tr>
            <td className="ticket-info-label">Создан</td>
            <td className="ticket-info-value">{formatDate(ticket.createdAt)}</td>
          </tr>
        </tbody>
      </table>

      {ticket.description && (
        <div className="ticket-info-description">
          <h4 className="ticket-info-section-title">Описание</h4>
          <p>{ticket.description}</p>
        </div>
      )}
    </div>
  )
}
