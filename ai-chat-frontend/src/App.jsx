import { useState } from 'react'
import ReservationPanel from './components/ReservationPanel'

function App() {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [reservation, setReservation] = useState(null)

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = { role: 'user', content: inputValue.trim() }
    const newMessages = [...messages, userMessage]
    
    setMessages(newMessages)
    setInputValue('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.map(m => ({ role: m.role, content: m.content }))
        })
      })

      const data = await response.json()

      if (data.error) {
        setMessages([...newMessages, { role: 'error', content: data.error }])
      } else {
        setMessages([...newMessages, { role: 'assistant', content: data.content }])
        if (data.reservation) {
          setReservation(data.reservation)
        }
      }
    } catch (error) {
      setMessages([...newMessages, { 
        role: 'error', 
        content: 'Network error: ' + error.message 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="app-container">
      <div className="chat-section">
        <div className="chat-header">
          AI Chat
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              Начните чат для бронирования столика
            </div>
          ) : (
            messages.map((message, index) => (
              <div 
                key={index} 
                className={`message ${message.role}`}
              >
                {message.content}
              </div>
            ))
          )}
          {isLoading && (
            <div className="message assistant">
              <span className="loading"></span>
            </div>
          )}
        </div>

        <div className="chat-input-container">
          <input
            type="text"
            className="chat-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Например: Хочу заказать столик на завтра..."
            disabled={isLoading}
          />
          <button
            className="send-button"
            onClick={sendMessage}
            disabled={isLoading || !inputValue.trim()}
          >
            {isLoading ? <span className="loading"></span> : 'Отправить'}
          </button>
        </div>
      </div>

      <ReservationPanel reservation={reservation} />
    </div>
  )
}

export default App
