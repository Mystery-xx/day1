import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import DebugPanel from './components/DebugPanel'
import SettingsPanel from './components/SettingsPanel'
import { Message } from './components/Message'
import { useSession } from './hooks/useSession'
import { useChatHistory } from './hooks/useChatHistory'
import { useSessionList } from './hooks/useSessionList'

function App() {
  const inputRef = useRef(null)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastRequest, setLastRequest] = useState(null)
  const [lastResponse, setLastResponse] = useState(null)
  const [stickyFactsList, setStickyFactsList] = useState([])
  
  const { sessionId, isLoading: sessionLoading, createNewSession, clearSession } = useSession()
  const { history: backendHistory, addEntry, refresh } = useChatHistory(sessionId)
  const { sessions, isLoading: sessionsLoading, fetchSessions, deleteSession: deleteSessionFromList } = useSessionList()
  
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('chat_settings')
    const defaults = {
      provider: 'gpustack',
      model: 'qwen3.5-397b-a17b',
      temperature: 1.0,
      maxTokens: 16384,
      topP: 1.0,
      frequencyPenalty: 0.0,
      presencePenalty: 0.0,
      stop: [],
      sendHistory: true,
      contextStrategy: 'summary',
      contextWindowSize: 10,
      stickyFacts: {}
    }
    if (saved) {
      try {
        return { ...defaults, ...JSON.parse(saved) }
      } catch {
        return defaults
      }
    }
    return defaults
  })
  const [models, setModels] = useState([])

  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load messages from backend history when it changes
  useEffect(() => {
    if (backendHistory.length > 0) {
      const convertedMessages = backendHistory.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        toolCalls: msg.toolCallsJson,
        toolResults: msg.toolResultsJson
      }))
      setMessages(convertedMessages)
      setTimeout(() => scrollToBottom(), 100)
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [backendHistory])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    fetchSessions()
  }, [sessionId, fetchSessions])

  // Load sticky facts when session or strategy changes
  useEffect(() => {
    if (sessionId && settings.contextStrategy === 'stickyFacts') {
      fetch(`/api/chat/sessions/${sessionId}/sticky-facts`)
        .then(res => res.ok ? res.json() : Promise.resolve([]))
        .then(facts => setStickyFactsList(facts))
        .catch(() => setStickyFactsList([]))
    } else {
      setStickyFactsList([])
    }
  }, [sessionId, settings.contextStrategy])

  // Function to manually refresh sticky facts (called after manual extraction)
  const refreshStickyFacts = async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/sticky-facts`);
      if (response.ok) {
        const facts = await response.json();
        setStickyFactsList(facts);
      }
    } catch (error) {
      console.error('Failed to refresh sticky facts:', error);
    }
  };

  useEffect(() => {
    localStorage.setItem('chat_settings', JSON.stringify(settings))
  }, [settings])

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
    
    setTimeout(() => scrollToBottom(), 50)
    setTimeout(() => inputRef.current?.focus(), 100)

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
            } else if (data.type === 'toolCall') {
              // AI is invoking a tool - display inline message
              const toolCall = data.data
              console.log('Tool call:', toolCall)
              setMessages(prev => [...prev, { 
                role: 'system', 
                content: `🔧 Using ${toolCall.toolName || toolCall.name}...`,
                metadata: { type: 'toolCall', toolCall }
              }])
            } else if (data.type === 'toolResult') {
              // Tool execution completed - integrate result into flow
              const toolResult = data.data
              console.log('Tool result:', toolResult)
              // Tool results are typically incorporated into the next AI response
              // Store for potential display if needed
              setLastResponse(prev => ({ 
                ...prev, 
                lastToolResult: toolResult 
              }))
            } else if (data.type === 'toolError') {
              // Tool execution failed - display error gracefully
              const toolError = data.data
              console.log('Tool error:', toolError)
              setMessages(prev => [...prev, { 
                role: 'system', 
                content: `⚠️ Tool error: ${toolError.toolName || toolError.name} - ${toolError.error || toolError.message || 'Unknown error'}`,
                metadata: { type: 'toolError', toolError }
              }])
            } else if (data.type === 'response') {
              const response = data.data
              console.log('Full response:', response)
              console.log('response.content:', response.content)
              setLastResponse(response)
              setIsLoading(false)
              
              // Refresh sticky facts if backend indicates they were updated (auto-extraction)
              if (response.stickyFactsUpdated && settings.contextStrategy === 'stickyFacts') {
                refreshStickyFacts()
              }
              
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
                refresh()
                fetchSessions()  // Update session list with new message count/timestamps
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

  const handleBranchChat = async (messageIndex) => {
    if (!sessionId) return
    
    try {
      const response = await fetch(
        `/api/chat/sessions/${sessionId}/branch?messageIndex=${messageIndex}`,
        { method: 'POST' }
      )
      
      if (response.ok) {
        const newSessionId = await response.text()
        localStorage.setItem('chat_current_session', newSessionId)
        window.location.reload()
      } else {
        console.error('Failed to create branch:', response.status)
      }
    } catch (error) {
      console.error('Error creating branch:', error)
    }
  }

  const handleClearHistory = async () => {
    // Clear history on backend for current session
    if (sessionId) {
      try {
        await fetch(`/api/chat/history/${sessionId}`, { method: 'DELETE' })
        await refresh()
        await fetchSessions()
      } catch (error) {
        console.error('Error clearing history:', error)
      }
    }
    setMessages([])
    setLastRequest(null)
    setLastResponse(null)
  }

  const handleSessionSelect = async (newSessionId) => {
    if (newSessionId === sessionId) return
    
    try {
      localStorage.setItem('chat_current_session', newSessionId)
      window.location.reload()
    } catch (error) {
      console.error('Error switching session:', error)
    }
  }

  const handleDeleteSession = async (sessionIdToDelete) => {
    try {
      const success = await deleteSessionFromList(sessionIdToDelete)
      if (success) {
        // If deleted current session, create new one
        if (sessionIdToDelete === sessionId) {
          await handleNewChat()
        } else {
          await fetchSessions()
        }
      }
    } catch (error) {
      console.error('Error deleting session:', error)
    }
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
        sessions={sessions}
        onSessionSelect={handleSessionSelect}
        onDeleteSession={handleDeleteSession}
        sessionsLoading={sessionsLoading}
        onFactsRefreshed={refreshStickyFacts}
      />
      <DebugPanel 
        lastRequest={lastRequest} 
        lastResponse={lastResponse} 
        requestHistory={backendHistory}
        stickyFactsList={stickyFactsList}
        contextStrategy={settings.contextStrategy}
      />
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
              <Message
                key={message.id || index}
                message={message}
                index={index}
                onBranch={handleBranchChat}
              />
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
            ref={inputRef}
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
