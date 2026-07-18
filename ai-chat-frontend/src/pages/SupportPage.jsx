import { useState, useEffect, useCallback } from 'react'
import TicketSelector from '../components/support/TicketSelector'
import TicketInfo from '../components/support/TicketInfo'
import SupportChat from '../components/support/SupportChat'
import NewTicketForm from '../components/support/NewTicketForm'
import '../components/support/Support.css'
import './SupportSkeleton.css'

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
      <header className="page-header">
        <h1>Поддержка</h1>
        <a href="/" className="back-link">
          ← Назад к чату
        </a>
      </header>

      <div className="support-content">
        {/* Error banner */}
        {error && (
          <div className="support-error">
            {error}
          </div>
        )}

        {/* Ticket selector row */}
        <div className="support-ticket-selector">
          <TicketSelector
            selectedTicketId={selectedTicketId}
            onSelectTicket={handleSelectTicket}
            tickets={tickets}
          />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="support-loading">
            <div className="skeleton skeleton-card" />
          </div>
        )}

        {/* New ticket form */}
        {!isLoading && selectedTicketId === '__new__' && (
          <div className="support-layout">
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
          <div className="support-layout">
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
          <div className="support-empty">
            <span className="support-empty-icon">🎫</span>
            <div className="support-empty-title">
              Выберите тикет
            </div>
            <div className="support-empty-desc">
              Выберите существующий тикет из списка или создайте новый
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SupportPage
