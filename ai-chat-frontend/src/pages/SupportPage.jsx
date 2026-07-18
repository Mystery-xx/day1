import { useState, useEffect, useCallback } from 'react'
import TicketSelector from '../components/support/TicketSelector'
import TicketInfo from '../components/support/TicketInfo'
import SupportChat from '../components/support/SupportChat'
import NewTicketForm from '../components/support/NewTicketForm'

/**
 * SupportPage — page for managing support tickets and chat conversations.
 *
 * Integrates TicketSelector, TicketInfo, and SupportChat components.
 *
 * State:
 *   tickets          - list of TicketDTO objects
 *   selectedTicketId - currently selected ticket ID (or null / '__new__')
 *   ticket           - full TicketDTO for the selected ticket
 *   messages         - chat messages for the selected ticket
 *   isLoading        - loading flag for ticket detail and messages
 *
 * API calls:
 *   GET  /api/support/tickets         - list all tickets
 *   GET  /api/support/tickets/{id}    - get single ticket details
 *   POST /api/support/chat            - send a chat message
 */
function SupportPage() {
  const [tickets, setTickets] = useState([])
  const [selectedTicketId, setSelectedTicketId] = useState(null)
  const [ticket, setTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch ticket list on mount
  useEffect(() => {
    let cancelled = false

    const fetchTickets = async () => {
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
      }
    }

    fetchTickets()
    return () => { cancelled = true }
  }, [])

  // Fetch ticket details when selection changes
  useEffect(() => {
    if (!selectedTicketId || selectedTicketId === '__new__') {
      setTicket(null)
      setMessages([])
      return
    }

    let cancelled = false

    const fetchTicket = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/support/tickets/${selectedTicketId}`)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const data = await response.json()
        if (!cancelled) {
          setTicket(data)
          setMessages(data.messages || [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Ошибка загрузки тикета')
          setTicket(null)
          setMessages([])
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchTicket()
    return () => { cancelled = true }
  }, [selectedTicketId])

  const handleSelectTicket = useCallback((ticketId) => {
    setSelectedTicketId(ticketId)
  }, [])

  const handleSendMessage = useCallback(async (text, ticketId) => {
    const response = await fetch('/api/support/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, ticketId }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    // Append user message and assistant response to local state
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, createdAt: new Date().toISOString() },
      { role: 'assistant', content: data.answer || data.response || data.content, createdAt: new Date().toISOString() },
    ])

    // Refresh ticket details to get latest state
    try {
      const ticketResp = await fetch(`/api/support/tickets/${ticketId}`)
      if (ticketResp.ok) {
        const ticketData = await ticketResp.json()
        setTicket(ticketData)
      }
    } catch {
      // Silently fail on refresh
    }
  }, [])

  const handleCreateTicket = useCallback(async ({ subject, description, priority }) => {
    const response = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, description, priority, userId: 'user1' }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const newTicket = await response.json()

    // Add new ticket to the list and select it
    setTickets((prev) => [...prev, newTicket])
    setSelectedTicketId(newTicket.ticketId)
    setTicket(newTicket)
    setMessages(newTicket.messages || [])
  }, [])

  return (
    <div className="support-page">
      <div className="page-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', color: '#333' }}>
          Поддержка
        </h1>
        <a
          href="/"
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: '600',
            textDecoration: 'none',
            color: '#2196F3',
            border: '2px solid #2196F3',
            borderRadius: '6px',
            background: 'transparent',
            transition: 'all 0.2s',
          }}
        >
          ← Назад к чату
        </a>
      </div>

      <div className="support-content" style={{
        padding: '24px',
        maxWidth: '1400px',
        margin: '0 auto',
      }}>
        {/* Error banner */}
        {error && (
          <div className="support-error" style={{
            padding: '12px 16px',
            marginBottom: '16px',
            background: '#ffebee',
            color: '#c62828',
            border: '1px solid #f44336',
            borderRadius: '6px',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        {/* Ticket selector row */}
        <div className="support-ticket-selector" style={{ marginBottom: '24px' }}>
          <TicketSelector
            selectedTicketId={selectedTicketId}
            onSelectTicket={handleSelectTicket}
            tickets={tickets}
          />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="support-loading" style={{
            textAlign: 'center',
            padding: '48px',
            color: '#666',
          }}>
            <span className="loading"></span>
            <span style={{ marginLeft: '8px' }}>Загрузка тикета...</span>
          </div>
        )}

        {/* New ticket form */}
        {!isLoading && selectedTicketId === '__new__' && (
          <div className="support-layout" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '24px',
            alignItems: 'start',
          }}>
            <div className="support-layout-info">
              <NewTicketForm
                onSubmit={handleCreateTicket}
                onCancel={() => setSelectedTicketId(null)}
              />
            </div>
            <div className="support-layout-chat">
              <SupportChat
                ticketId={null}
                messages={[]}
                onSendMessage={handleSendMessage}
              />
            </div>
          </div>
        )}

        {/* Main layout: ticket info + chat */}
        {!isLoading && selectedTicketId && selectedTicketId !== '__new__' && (
          <div className="support-layout" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '24px',
            alignItems: 'start',
          }}>
            <div className="support-layout-info">
              <TicketInfo ticket={ticket} />
            </div>
            <div className="support-layout-chat">
              <SupportChat
                ticketId={selectedTicketId}
                messages={messages}
                onSendMessage={handleSendMessage}
              />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !selectedTicketId && (
          <div className="support-empty" style={{
            textAlign: 'center',
            padding: '48px',
            color: '#999',
            background: '#f9f9f9',
            borderRadius: '6px',
            border: '1px dashed #e0e0e0',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎫</div>
            <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '8px' }}>
              Выберите тикет
            </div>
            <div style={{ fontSize: '13px' }}>
              Выберите существующий тикет из списка или создайте новый
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SupportPage
