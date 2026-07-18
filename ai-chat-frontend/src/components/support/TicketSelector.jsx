import { useState, useEffect } from 'react'

const TICKET_STATUS = {
  OPEN: { label: 'Открыт', className: 'badge-open' },
  IN_PROGRESS: { label: 'В работе', className: 'badge-in-progress' },
  PENDING: { label: 'Ожидание', className: 'badge-pending' },
  CLOSED: { label: 'Закрыт', className: 'badge-closed' },
}

/**
 * TicketSelector — component for selecting a support ticket from a dropdown list.
 *
 * Props:
 *   selectedTicketId  - currently selected ticket ID (or null)
 *   onSelectTicket    - callback(ticketId) when selection changes
 *   tickets           - optional pre-loaded ticket list; if omitted, fetches on mount
 *
 * Fetches GET /api/support/tickets on mount if `tickets` prop is not provided.
 */
export default function TicketSelector({ selectedTicketId, onSelectTicket, tickets: externalTickets }) {
  const [tickets, setTickets] = useState(externalTickets || [])
  const [loading, setLoading] = useState(!externalTickets)
  const [error, setError] = useState(null)

  useEffect(() => {
    // If tickets are provided externally, use them directly
    if (externalTickets) {
      setTickets(externalTickets)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    const fetchTickets = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/support/tickets')
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const data = await response.json()
        if (!cancelled) {
          setTickets(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Ошибка загрузки тикетов')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchTickets()
    return () => { cancelled = true }
  }, [externalTickets])

  const handleChange = (e) => {
    onSelectTicket(e.target.value || null)
  }

  const handleNewTicket = () => {
    onSelectTicket('__new__')
  }

  if (loading) {
    return (
      <div className="ticket-selector ticket-selector-loading">
        <span className="loading"></span>
        <span>Загрузка тикетов...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ticket-selector ticket-selector-error">
        <span className="error-icon">⚠</span>
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="ticket-selector">
      <div className="ticket-selector-row">
        <select
          className="ticket-selector-select"
          value={selectedTicketId || ''}
          onChange={handleChange}
        >
          <option value="">-- Выберите тикет --</option>
          {tickets.map((ticket) => {
            const statusInfo = TICKET_STATUS[ticket.status] || { label: ticket.status, className: '' }
            return (
              <option key={ticket.ticketId} value={ticket.ticketId}>
                [{statusInfo.label}] {ticket.ticketId} — {ticket.subject}
              </option>
            )
          })}
        </select>
        <button className="ticket-selector-new" onClick={handleNewTicket}>
          + Новый тикет
        </button>
      </div>
      {tickets.length === 0 && (
        <div className="ticket-selector-empty">Нет доступных тикетов</div>
      )}
    </div>
  )
}
