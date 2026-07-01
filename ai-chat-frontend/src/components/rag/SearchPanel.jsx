import { useState } from 'react'

function SearchPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState(null)

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

  return (
    <div className="search-panel">
      <div className="search-header">
        <h3>Search Documents</h3>
        <p className="search-description">Search across uploaded documents using semantic similarity</p>
      </div>

      <div className="search-content">
        {/* Search Form */}
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-group">
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
                marginLeft: '10px',
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
                gridTemplateColumns: '2fr 1fr 100px 3fr',
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
                      gridTemplateColumns: '2fr 1fr 100px 3fr',
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
                      {result.metadata?.source || result.source || 'Unknown'}
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
                      fontWeight: '600',
                      color: result.similarity > 0.7 ? '#4CAF50' : result.similarity > 0.4 ? '#ff9800' : '#f44336'
                    }}>
                      {formatSimilarity(result.similarity)}
                    </div>
                    <div style={{
                      color: '#333',
                      lineHeight: '1.5',
                      overflow: 'hidden'
                    }}>
                      {truncateContent(result.content || result.chunk || '', 200)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

export default SearchPanel
