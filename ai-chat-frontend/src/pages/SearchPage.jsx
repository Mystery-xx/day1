import { useState } from 'react'
import { Link } from 'react-router-dom'

function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState(null)
  const [hoveredChunk, setHoveredChunk] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) {
      setError('Please enter a search query')
      return
    }

    setLoading(true)
    setError(null)
    setSearched(true)
    setResults([])

    try {
      const response = await fetch(`/api/rag/search?query=${encodeURIComponent(query)}&topK=10`)
      
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`)
      }

      const data = await response.json()
      setResults(data.results || [])
    } catch (err) {
      setError(err.message || 'Search failed. Please try again.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const truncateContent = (content, maxLength = 200) => {
    if (!content) return ''
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength) + '...'
  }

  const formatSimilarity = (similarity) => {
    if (typeof similarity !== 'number') return '0%'
    return `${(similarity * 100).toFixed(1)}%`
  }

  const clearResults = () => {
    setResults([])
    setSearched(false)
    setError(null)
    setQuery('')
  }

  const handleMouseEnter = (e, content) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltipPosition({
      x: rect.left,
      y: rect.bottom + 2
    })
    setHoveredChunk(content)
  }

  const handleMouseLeave = () => {
    setHoveredChunk(null)
  }

  return (
    <div className="search-page">
      {/* Navigation Header */}
      <div className="page-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', color: '#333' }}>
          🔍 Document Search
        </h1>
        <Link
          to="/"
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: '600',
            textDecoration: 'none',
            color: '#2196F3',
            border: '2px solid #2196F3',
            borderRadius: '6px',
            background: 'transparent',
            transition: 'all 0.2s'
          }}
        >
          ← Back to Chat
        </Link>
      </div>

      <div className="search-content" style={{
        padding: '24px',
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {/* Search Form */}
        <form onSubmit={handleSearch} className="search-form" style={{
          marginBottom: '24px'
        }}>
          <div className="search-input-group" style={{
            display: 'flex',
            gap: '10px'
          }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter your search query..."
              disabled={loading}
              className="search-input"
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="search-button"
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: (loading || !query.trim()) ? 'not-allowed' : 'pointer',
                borderRadius: '6px',
                border: 'none',
                background: (loading || !query.trim()) ? '#ccc' : '#2196F3',
                color: 'white',
                transition: 'all 0.2s',
                minWidth: '120px'
              }}
            >
              {loading ? 'Searching...' : '🔍 Search'}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="search-error" style={{
            marginTop: '16px',
            padding: '12px',
            border: '1px solid #f44336',
            borderRadius: '6px',
            background: '#ffebee',
            color: '#c62828'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '14px' }}>
              ⚠️ Search Failed
            </div>
            <div style={{ fontSize: '13px' }}>
              {error}
            </div>
            <button
              onClick={clearResults}
              style={{
                marginTop: '10px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                borderRadius: '4px',
                border: '1px solid #f44336',
                background: 'transparent',
                color: '#f44336'
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="search-loading" style={{
            marginTop: '24px',
            padding: '24px',
            textAlign: 'center',
            color: '#666'
          }}>
            <span className="loading"></span>
            <span style={{ marginLeft: '8px' }}>Searching documents...</span>
          </div>
        )}

        {/* Results Table */}
        {!loading && searched && results.length > 0 && (
          <div className="search-results" style={{
            marginTop: '24px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <h4 style={{ margin: 0, fontSize: '16px', color: '#333' }}>
                Results ({results.length})
              </h4>
              <button
                onClick={clearResults}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  border: '1px solid #999',
                  background: '#fff',
                  color: '#666'
                }}
              >
                Clear Results
              </button>
            </div>

            <div className="results-table" style={{
              width: '100%',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              overflow: 'hidden',
              background: '#fff'
            }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 80px 80px 80px 100px 3fr',
                gap: '1px',
                background: '#e0e0e0',
                padding: '12px',
                fontWeight: '600',
                fontSize: '13px',
                color: '#333',
                borderBottom: '2px solid #ccc'
              }}>
                <div>Source</div>
                <div>Section</div>
                <div>Chunk #</div>
                <div>Start</div>
                <div>End</div>
                <div>Similarity</div>
                <div>Content Preview</div>
              </div>

              {/* Table Body */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1px',
                background: '#e0e0e0'
              }}>
                {results.map((result, index) => (
                  <div
                    key={result.chunkId || index}
                    className="result-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 80px 80px 80px 100px 3fr',
                      gap: '1px',
                      background: '#fff',
                      padding: '12px',
                      fontSize: '13px',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{
                      fontWeight: '500',
                      color: '#1976D2',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {result.metadata?.title || result.metadata?.source || result.source || 'Unknown'}
                    </div>
                    <div style={{
                      color: '#666',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {result.metadata?.section || result.section || '—'}
                    </div>
                    <div style={{
                      color: '#666',
                      textAlign: 'center'
                    }}>
                      {result.metadata?.chunkIndex ?? '—'}
                    </div>
                    <div style={{
                      color: '#666',
                      textAlign: 'center',
                      fontSize: '12px'
                    }}>
                      {result.metadata?.startToken ?? '—'}
                    </div>
                    <div style={{
                      color: '#666',
                      textAlign: 'center',
                      fontSize: '12px'
                    }}>
                      {result.metadata?.endToken ?? '—'}
                    </div>
                    <div style={{
                      fontWeight: '600',
                      color: result.similarity > 0.7 ? '#4CAF50' : result.similarity > 0.4 ? '#ff9800' : '#f44336',
                      textAlign: 'center'
                    }}>
                      {formatSimilarity(result.similarity)}
                    </div>
                    <div
                      onMouseEnter={(e) => handleMouseEnter(e, result.content || result.chunk || '')}
                      onMouseLeave={handleMouseLeave}
                      style={{
                        color: '#333',
                        lineHeight: '1.5',
                        overflow: 'hidden',
                        cursor: 'help',
                        position: 'relative'
                      }}
                    >
                      {truncateContent(result.content || result.chunk || '', 200)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Custom Tooltip */}
        {hoveredChunk && (
          <div
            onMouseEnter={() => setHoveredChunk(hoveredChunk)}
            onMouseLeave={handleMouseLeave}
            style={{
              position: 'fixed',
              left: tooltipPosition.x,
              top: tooltipPosition.y,
              maxWidth: '600px',
              maxHeight: '400px',
              overflow: 'auto',
              padding: '12px 16px',
              background: 'rgba(0, 0, 0, 0.95)',
              color: 'white',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: '1.6',
              zIndex: 10000,
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              pointerEvents: 'auto'
            }}
          >
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit'
            }}>
              {hoveredChunk}
            </pre>
          </div>
        )}

        {/* Empty State */}
        {!loading && searched && results.length === 0 && !error && (
          <div className="search-empty" style={{
            marginTop: '24px',
            padding: '32px',
            textAlign: 'center',
            color: '#999',
            background: '#f9f9f9',
            borderRadius: '6px',
            border: '1px dashed #e0e0e0'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '8px' }}>
              No results found
            </div>
            <div style={{ fontSize: '13px' }}>
              Try adjusting your search query or upload more documents
            </div>
            <button
              onClick={clearResults}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: '4px',
                border: '1px solid #2196F3',
                background: '#fff',
                color: '#2196F3'
              }}
            >
              Try New Search
            </button>
          </div>
        )}

        {/* Initial State */}
        {!searched && !loading && (
          <div className="search-initial" style={{
            marginTop: '24px',
            padding: '32px',
            textAlign: 'center',
            color: '#999',
            background: '#f9f9f9',
            borderRadius: '6px',
            border: '1px dashed #e0e0e0'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📚</div>
            <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '8px' }}>
              Ready to search
            </div>
            <div style={{ fontSize: '13px' }}>
              Enter a query above to search across your uploaded documents
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchPage
