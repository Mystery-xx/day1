import { useState, useEffect } from 'react'

function StatisticsPanel() {
  const [statistics, setStatistics] = useState({
    totalDocuments: 0,
    totalChunks: 0,
    avgChunksPerDoc: 0,
    indexSize: '0 B'
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchStatistics = async () => {
    try {
      const response = await fetch('/api/rag/statistics')
      if (!response.ok) {
        throw new Error('Failed to fetch statistics')
      }
      const data = await response.json()
      setStatistics(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-refresh on mount and every 30 seconds
  useEffect(() => {
    fetchStatistics()
    
    const interval = setInterval(fetchStatistics, 30000)
    return () => clearInterval(interval)
  }, [])

  const cards = [
    {
      title: 'Documents',
      value: statistics.totalDocuments,
      icon: '📄',
      color: '#4CAF50'
    },
    {
      title: 'Chunks',
      value: statistics.totalChunks,
      icon: '🔗',
      color: '#2196F3'
    },
    {
      title: 'Avg Chunks/Doc',
      value: statistics.avgChunksPerDoc,
      icon: '📊',
      color: '#FF9800'
    },
    {
      title: 'Index Size',
      value: statistics.indexSize,
      icon: '💾',
      color: '#9C27B0'
    }
  ]

  if (loading && !statistics.totalDocuments) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <span className="loading"></span>
        <span style={{ marginLeft: '8px' }}>Loading statistics...</span>
      </div>
    )
  }

  return (
    <div className="statistics-panel">
      {error && (
        <div style={{
          padding: '10px',
          marginBottom: '16px',
          border: '1px solid #f44336',
          borderRadius: '4px',
          background: '#ffebee',
          color: '#f44336',
          fontSize: '13px'
        }}>
          ⚠️ {error}
        </div>
      )}
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        padding: '16px 0'
      }}>
        {cards.map((card) => (
          <div
            key={card.title}
            style={{
              padding: '20px',
              border: `1px solid ${card.color}30`,
              borderRadius: '8px',
              background: `linear-gradient(135deg, ${card.color}08 0%, #ffffff 100%)`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'default'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <span style={{ fontSize: '24px' }}>{card.icon}</span>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: card.color
              }} />
            </div>
            
            <div style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#333',
              marginBottom: '4px'
            }}>
              {card.value}
            </div>
            
            <div style={{
              fontSize: '13px',
              color: '#666',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {card.title}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{
        marginTop: '16px',
        padding: '12px',
        background: '#f5f5f5',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#666'
      }}>
        🔄 Auto-refreshing every 30 seconds
      </div>
    </div>
  )
}

export default StatisticsPanel
