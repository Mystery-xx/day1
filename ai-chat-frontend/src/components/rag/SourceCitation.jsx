import { useState } from 'react';

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
        📚 Sources: {sources.map(s => s.source).join(', ')}
        {expanded ? ' ▲' : ' ▼'}
      </div>
      
      {expanded && (
        <div className="source-details">
          {sources.map((source, idx) => (
            <div key={idx} className="source-item">
              <strong>{source.source}</strong>
              {source.title && <div>Title: {source.title}</div>}
              {source.section && <div>Section: {source.section}</div>}
              {source.similarity !== undefined && (
                <div>Similarity: {(source.similarity * 100).toFixed(1)}%</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SourceCitation;
