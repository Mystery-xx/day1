import { Link } from 'react-router-dom'
import SearchPanel from '../components/rag/SearchPanel'

function SearchPage() {
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
        <SearchPanel />
      </div>
    </div>
  )
}

export default SearchPage
