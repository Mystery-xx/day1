import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import DebugPanel from './components/DebugPanel'
import SettingsPanel from './components/SettingsPanel'
import { useSession } from './hooks/useSession'
import { useChatHistory } from './hooks/useChatHistory'

function App() {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastRequest, setLastRequest] = useState(null)
  const [lastResponse, setLastResponse] = useState(null)
  
  // Use session management
  const { sessionId, isLoading: sessionLoading, createNewSession, clearSession } = useSession()
  // Use backend chat history
  const { history: backendHistory, addEntry, refresh } = useChatHistory(sessionId)
  
  const [settings, setSettings] = useState({
    provider: 'gpustack',
    model: 'qwen3.5-397b-a17b',
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

  // Load messages from backend history when it changes
  useEffect(() => {
    if (backendHistory.length > 0) {
      // Convert backend DTO to frontend message format
      const convertedMessages = backendHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
      setMessages(convertedMessages)
    }
  }, [backendHistory])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    let cancelled = false
    const provider = settings.provider

    setModels([])

    const loadModels = async () => {
      try {
        const response = await fetch(`/api/chat/models?provider=${provider}`)
        if (response.ok && !cancelled) {
          const data = await response.json()
          setModels(data)
          // Set default model: prefer qwen3.5-397b-a17b if available, otherwise first model
          if (data && data.length > 0) {
            setSettings(prev => {
              // Extract model IDs - handle both string arrays and model objects
              const modelIds = data.map(m => typeof m === 'string' ? m : m.id)
              const currentModelId = typeof prev.model === 'string' ? prev.model : prev.model?.id
              
              if (!currentModelId || !modelIds.includes(currentModelId)) {
                const preferredModel = 'qwen3.5-397b-a17b'
                const selectedModel = modelIds.includes(preferredModel) ? preferredModel : modelIds[0]
                return { ...prev, model: selectedModel }
              }
              // Ensure model is stored as string ID, not object
              if (typeof prev.model === 'object') {
                return { ...prev, model: prev.model.id }
              }
              return prev
            })
          }
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
    if (!inputValue.trim() || isLoading || !sessionId) return

    const userMessage = { role: 'user', content: inputValue.trim() }
    const newMessages = [...messages, userMessage]
    
    setMessages(newMessages)
    setInputValue('')
    setIsLoading(true)

    try {
      // Create settings object without empty stop array to avoid JSON parsing issues
      const { stop, ...settingsWithoutStop } = settings
      const requestBody = {
        sessionId: sessionId,
        message: userMessage.content,
        settings: {
          ...settingsWithoutStop,
          // Only include stop if it has values
          ...(stop && stop.length > 0 ? { stop } : {})
        }
      }

      console.log('Sending request body:', JSON.stringify(requestBody, null, 2))

      // Track response time
      const startTime = performance.now()

      // Use SSE streaming with POST
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
              
              // Calculate response time in milliseconds
              const responseTime = Math.round(performance.now() - startTime)
              
              // Save to history (backend already saved, this is for local analytics)
              if (response.usage) {
                addEntry({
                  provider: settings.provider,
                  model: response.model || settings.model,
                  promptTokens: response.usage.prompt_tokens || response.usage.promptTokens,
                  completionTokens: response.usage.completion_tokens || response.usage.completionTokens,
                  totalTokens: response.usage.total_tokens || response.usage.totalTokens,
                  responseTime: responseTime
                })
              }
              
              if (response.error) {
                setMessages(prev => [...prev, { role: 'system', content: `Error: ${response.error}` }])
              } else if (response.content) {
                setMessages(prev => [...prev, { role: 'assistant', content: response.content }])
                // Refresh history from backend to show persisted messages
                refresh()
              } else {
                console.warn('No content in response:', response)
              }
            }
          }
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: `Network error: ${error.message}` 
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
    const provider = settings.provider
    fetch(`/api/chat/models?provider=${provider}`)
      .then(res => res.json())
      .then(setModels)
      .catch(() => setModels([]))
  }

  const handleNewChat = async () => {
    await createNewSession()
    setMessages([])
    setLastRequest(null)
    setLastResponse(null)
  }

  const handleClearHistory = async () => {
    // Clear history on backend for current session
    if (sessionId) {
      try {
        await fetch(`/api/chat/history/${sessionId}`, { method: 'DELETE' })
        await refresh()
      } catch (error) {
        console.error('Error clearing history:', error)
      }
    }
    setMessages([])
    setLastRequest(null)
    setLastResponse(null)
  }

  return (
    <div className="app-container">
      <SettingsPanel 
        settings={settings} 
        onSettingsChange={setSettings} 
        models={models} 
        onRefreshModels={handleRefreshModels}
        sessionId={sessionId}
        onNewChat={handleNewChat}
        onClearHistory={handleClearHistory}
      />
      <DebugPanel lastRequest={lastRequest} lastResponse={lastResponse} requestHistory={backendHistory} />
      <div className="chat-section">
        <div className="chat-header">
          AI Chat
          {sessionId && (
            <span className="session-id" title={sessionId}>
              Session: {sessionId.substring(0, 8)}...
            </span>
          )}
        </div>

        <div className="chat-messages">
          {sessionLoading ? (
            <div className="empty-state">Loading session...</div>
          ) : messages.length === 0 ? (
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
            disabled={isLoading || sessionLoading}
          />
          <button
            className="send-button"
            onClick={sendMessage}
            disabled={isLoading || sessionLoading || !inputValue.trim()}
          >
            {isLoading ? <span className="loading"></span> : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
