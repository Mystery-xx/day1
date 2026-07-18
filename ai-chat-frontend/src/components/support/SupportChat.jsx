import { useState, useRef, useEffect } from 'react'

/**
 * SupportChat — chat component for support conversations.
 *
 * Props:
 *   ticketId      - current ticket ID (null if new ticket)
 *   messages      - array of { role, content, createdAt }
 *   onSendMessage - callback(text, ticketId) when user sends a message
 *
 * Auto-scrolls to the latest message.
 * Shows loading indicator while sending.
 */
export default function SupportChat({ ticketId, messages = [], onSendMessage }) {
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!sending) {
      inputRef.current?.focus()
    }
  }, [sending])

  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text || sending || !ticketId) return

    setSending(true)
    setInputValue('')

    try {
      await onSendMessage(text, ticketId)
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isEmpty = !ticketId

  return (
    <div className="support-chat">
      {isEmpty ? (
        <div className="support-chat-placeholder">
          Выберите или создайте тикет для начала чата
        </div>
      ) : (
        <>
          <div className="support-chat-messages">
            {messages.length === 0 && (
              <div className="support-chat-empty">
                Начните диалог с поддержкой
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`support-chat-message support-chat-message-${msg.role || 'user'}`}
              >
                <div className="support-chat-message-content">{msg.content}</div>
                {msg.createdAt && (
                  <div className="support-chat-message-time">
                    {formatChatTime(msg.createdAt)}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="support-chat-message support-chat-message-system">
                <div className="support-chat-sending">
                  <span className="loading"></span>
                  <span>Отправка...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="support-chat-input-row">
            <input
              ref={inputRef}
              className="support-chat-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Введите сообщение..."
              disabled={sending}
            />
            <button
              className="support-chat-send"
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
            >
              {sending ? '...' : 'Отправить'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function formatChatTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
