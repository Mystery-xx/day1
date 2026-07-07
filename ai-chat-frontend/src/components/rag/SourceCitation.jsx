import { useState } from 'react';
import './SourceCitation.css';

function SourceCitation({ sources }) {
  const [expanded, setExpanded] = useState(false);

  // Без источников → не рендерим
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="source-citation">
      <div 
        className="source-header" 
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', color: '#666', fontSize: '12px' }}
      >
        📚 Sources: {sources.map(s => s.title || s.source).join(', ')}
        {expanded ? ' ▲' : ' ▼'}
      </div>
      
      {expanded && (
        <div className="source-details">
          {sources.map((source, idx) => (
            <div key={idx} className="source-item">
              <strong>{source.title || source.source}</strong>
              {source.section && <div className="section">Section: {source.section}</div>}
              {source.similarity !== undefined && (
                <div className="similarity">Relevance: {(source.similarity * 100).toFixed(1)}%</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SourceCitation;
