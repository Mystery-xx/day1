import ReactMarkdown from 'react-markdown'
import { ToolCallDisplay } from './ToolCallDisplay'
import SourceCitation from './rag/SourceCitation'

export function Message({ message, index, onBranch }) {
  const parseToolData = () => {
    try {
      const toolCalls = message.toolCalls ? JSON.parse(message.toolCallsJson) : null
      const toolResults = message.toolResults ? JSON.parse(message.toolResultsJson) : null
      return { toolCalls, toolResults }
    } catch {
      return { toolCalls: null, toolResults: null }
    }
  }

  const { toolCalls, toolResults } = parseToolData()
  const hasToolCalls = toolCalls && toolCalls.length > 0

  return (
    <div className={`message-wrapper ${message.role}`}>
      <div className="message-content">
        {hasToolCalls && toolCalls.map((toolCall, toolIndex) => (
          <ToolCallDisplay
            key={toolCall.id || toolIndex}
            toolCall={toolCall}
            toolResult={toolResults ? toolResults[toolIndex] : null}
          />
        ))}
        <ReactMarkdown>{message.content}</ReactMarkdown>
        {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
          <SourceCitation sources={message.sources} />
        )}
      </div>
      {message.role === 'assistant' && (
        <button
          className="branch-button"
          onClick={() => onBranch(index)}
          title="Создать ветку с этим сообщением"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="6" y1="3" x2="6" y2="15"></line>
            <circle cx="18" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <path d="M18 9a9 9 0 0 1-9 9"></path>
          </svg>
        </button>
      )}
    </div>
  )
}
