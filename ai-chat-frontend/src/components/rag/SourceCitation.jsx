import './SourceCitation.css';

function SourceCitation({ sources }) {
  // Без источников → не рендерим
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="source-citation">
      <div className="source-header">
        📚 Источники:
      </div>
      
      <div className="source-details">
        {sources.map((source, idx) => (
          <div key={idx} className="source-item">
            <div className="source-number">[{idx + 1}]</div>
            <div className="source-main">
              <strong className="source-title">{source.title || source.source}</strong>
              {source.section && <div className="source-section">📖 {source.section}</div>}
              <div className="source-metrics">
                {source.similarity !== undefined && (
                  <span className="metric similarity" title="Векторное сходство">
                    🎯 {(source.similarity * 100).toFixed(1)}%
                  </span>
                )}
                {source.rerankScore !== undefined && (
                  <span className="metric rerank" title="Rerank score">
                    ⭐ {(source.rerankScore * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            <a
              href={`/search?query=${encodeURIComponent(`${source.title || source.source} ${source.section || ''}`.trim())}`}
              className="source-search-btn"
              title="Найти этот документ"
              target="_blank"
              rel="noopener noreferrer"
            >
              🔍 Найти
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SourceCitation;
