import { useState } from 'react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes

const STRATEGY_OPTIONS = [
  { value: 'SEMANTIC', label: 'Semantic Chunking', description: 'Splits by Markdown headers, preserves document structure' },
  { value: 'FIXED_SIZE', label: 'Fixed Size Chunking', description: 'Splits into fixed-size chunks (500 words with 50 word overlap)' }
]

function UploadPanel() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [strategy, setStrategy] = useState('SEMANTIC')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [error, setError] = useState(null)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) {
      setSelectedFile(null)
      return
    }

    // Client-side validation: file size < 10MB
    if (file.size > MAX_FILE_SIZE) {
      setError(`File size exceeds 10MB limit. Selected file is ${(file.size / (1024 * 1024)).toFixed(2)}MB`)
      setSelectedFile(null)
      e.target.value = ''
      return
    }

    // Validate file type
    const validExtensions = ['.txt', '.md']
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase()
    if (!validExtensions.includes(fileExtension)) {
      setError('Invalid file type. Please select a .txt or .md file')
      setSelectedFile(null)
      e.target.value = ''
      return
    }

    setError(null)
    setSelectedFile(file)
    setUploadResult(null)
  }

  const handleStrategyChange = (e) => {
    setStrategy(e.target.value)
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file to upload')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setError(null)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      // Simulate progress during upload
      const simulateProgress = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(simulateProgress)
            return 90
          }
          return prev + 10
        })
      }, 200)

      const response = await fetch(`/api/rag/upload?strategy=${strategy}`, {
        method: 'POST',
        body: formData
      })

      clearInterval(simulateProgress)
      setUploadProgress(100)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Upload failed with status ${response.status}`)
      }

      const result = await response.json()
      setUploadResult(result)
      setSelectedFile(null)
      setStrategy('SEMANTIC')
      
      // Reset file input
      const fileInput = document.getElementById('file-upload')
      if (fileInput) {
        fileInput.value = ''
      }
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
      setUploadProgress(0)
    } finally {
      setIsUploading(false)
    }
  }

  const clearMessages = () => {
    setError(null)
    setUploadResult(null)
  }

  return (
    <div className="upload-panel">
      <div className="upload-header">
        <h3>Upload Document</h3>
        <p className="upload-description">Upload .txt or .md files for RAG indexing (max 10MB)</p>
      </div>

      <div className="upload-content">
        {/* File Picker */}
        <div className="upload-section">
          <label htmlFor="file-upload" className="upload-label">
            Select File
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".txt,.md"
            onChange={handleFileChange}
            disabled={isUploading}
            className="file-input"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              marginTop: '6px',
              cursor: isUploading ? 'not-allowed' : 'pointer'
            }}
          />
          {selectedFile && (
            <div className="selected-file" style={{
              marginTop: '8px',
              padding: '8px',
              background: '#e3f2fd',
              borderRadius: '4px',
              fontSize: '13px',
              color: '#1976D2'
            }}>
              📄 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
            </div>
          )}
        </div>

        {/* Strategy Selector */}
        <div className="upload-section" style={{ marginTop: '16px' }}>
          <label htmlFor="strategy-select" className="upload-label">
            Chunking Strategy
          </label>
          <select
            id="strategy-select"
            value={strategy}
            onChange={handleStrategyChange}
            disabled={isUploading}
            className="strategy-select"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              marginTop: '6px',
              background: '#fff',
              cursor: isUploading ? 'not-allowed' : 'pointer'
            }}
          >
            {STRATEGY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="strategy-description" style={{
            marginTop: '6px',
            fontSize: '12px',
            color: '#666'
          }}>
            {STRATEGY_OPTIONS.find(o => o.value === strategy)?.description}
          </div>
        </div>

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
          className="upload-button"
          style={{
            width: '100%',
            marginTop: '20px',
            padding: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: (!selectedFile || isUploading) ? 'not-allowed' : 'pointer',
            borderRadius: '6px',
            border: 'none',
            background: (!selectedFile || isUploading) ? '#ccc' : '#4CAF50',
            color: 'white',
            transition: 'all 0.2s'
          }}
        >
          {isUploading ? 'Uploading...' : '📤 Upload Document'}
        </button>

        {/* Progress Bar */}
        {isUploading && (
          <div className="upload-progress" style={{
            marginTop: '16px',
            width: '100%'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
              fontSize: '12px',
              color: '#666'
            }}>
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              background: '#e0e0e0',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${uploadProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #2196F3, #4CAF50)',
                transition: 'width 0.3s ease',
                borderRadius: '4px'
              }} />
            </div>
          </div>
        )}

        {/* Success Message */}
        {uploadResult && (
          <div className="upload-success" style={{
            marginTop: '16px',
            padding: '12px',
            border: '1px solid #4CAF50',
            borderRadius: '6px',
            background: '#e8f5e9',
            color: '#2e7d32'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '14px' }}>
              ✓ Upload Successful
            </div>
            <div style={{ fontSize: '13px' }}>
              {uploadResult.message || 'Document uploaded and indexed successfully'}
              {uploadResult.chunks !== undefined && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#1b5e20' }}>
                  Created {uploadResult.chunks} chunk(s) with strategy: {uploadResult.strategy || strategy}
                </div>
              )}
            </div>
            <button
              onClick={clearMessages}
              style={{
                marginTop: '10px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                borderRadius: '4px',
                border: '1px solid #4CAF50',
                background: 'transparent',
                color: '#4CAF50'
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="upload-error" style={{
            marginTop: '16px',
            padding: '12px',
            border: '1px solid #f44336',
            borderRadius: '6px',
            background: '#ffebee',
            color: '#c62828'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '14px' }}>
              ⚠️ Upload Failed
            </div>
            <div style={{ fontSize: '13px' }}>
              {error}
            </div>
            <button
              onClick={clearMessages}
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
      </div>
    </div>
  )
}

export default UploadPanel
