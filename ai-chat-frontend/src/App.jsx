import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import DebugPanel from './components/DebugPanel'
import SettingsPanel from './components/SettingsPanel'

function App() {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastRequest, setLastRequest] = useState(null)
  const [lastResponse, setLastResponse] = useState(null)
  const [settings, setSettings] = useState({
    provider: 'gpustack',
    model: '',
    temperature: 1.0,
    maxTokens: 16384,
    topP: 1.0,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    stop: [],
    sendHistory: true
  })
  const [models, setModels] = useState([])

  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    let cancelled = false
    const provider = settings.provider

    // Reset model immediately when provider changes
    setSettings(prev => ({ ...prev, model: '' }))
    setModels([])

    const loadModels = async () => {
      try {
        const response = await fetch(`/api/chat/models?provider=${provider}`)
        if (response.ok && !cancelled) {
          const data = await response.json()
          setModels(data)
        }
      } catch (error) {
        console.error('Error fetching models:', error)
        if (!cancelled) setModels([])
      }
    }

    loadModels()
    return () => { cancelled = true }
  }, [settings.provider])

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = { role: 'user', content: inputValue.trim() }
    const newMessages = [...messages, userMessage]
    
    setMessages(newMessages)
    setInputValue('')
    setIsLoading(true)

    try {
      const requestBody = {
        message: userMessage.content,
        history: settings.sendHistory ? messages.map(m => ({ role: m.role, content: m.content })) : [],
        settings: settings
      }

      // Use SSE streaming with POST to get debugRequest immediately
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = JSON.parse(line.slice(5))
            console.log('SSE event:', data.type, data)
            
            if (data.type === 'debugRequest') {
              console.log('Setting debugRequest immediately:', data.data)
              setLastRequest(data.data)
              setLastResponse({ debugRequest: data.data })
            } else if (data.type === 'response') {
              const response = data.data
              console.log('Full response:', response)
              console.log('response.content:', response.content)
              setLastResponse(response)
              setIsLoading(false)
              
              if (response.error) {
                setMessages([...newMessages, { role: 'error', content: response.error }])
              } else if (response.content) {
                setMessages([...newMessages, { role: 'assistant', content: response.content }])
              } else {
                console.warn('No content in response:', response)
              }
            }
          }
        }
      }
    } catch (error) {
      setMessages([...newMessages, { 
        role: 'error', 
        content: 'Network error: ' + error.message 
      }])
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleRefreshModels = () => {
    fetchModels(settings.provider)
  }

  return (
    <div className="app-container">
      <SettingsPanel settings={settings} onSettingsChange={setSettings} models={models} onRefreshModels={handleRefreshModels} />
      <DebugPanel lastRequest={lastRequest} lastResponse={lastResponse} />
      <div className="chat-section">
        <div className="chat-header">
          AI Chat
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              Начните чат
            </div>
          ) : (
            messages.map((message, index) => (
              <div 
                key={index} 
                className={`message ${message.role}`}
              >
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            ))
          )}
          {isLoading && (
            <div className="message assistant">
              <span className="loading"></span>
            </div>
          )}
          <div ref={messagesEndRef} />
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
    </div>
  )
}

export default App
