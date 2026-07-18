# RAG Architecture

## Overview

The Retrieval Augmented Generation (RAG) system enhances AI responses by retrieving relevant information from a custom document corpus before generating answers. This architecture allows the AI Chat application to provide domain-specific knowledge that may not be present in the base model's training data.

The RAG implementation consists of four main components working together: document ingestion, embedding generation, vector storage, and semantic retrieval.

## Component Architecture

### RagIndexingService

The `RagIndexingService` is responsible for processing uploaded documents and preparing them for storage in the vector index.

**Responsibilities:**
1. **Document Parsing**: Extract text content from uploaded files (Markdown, plain text)
2. **Chunking**: Split documents into manageable segments using configurable strategies
3. **Embedding Generation**: Convert each chunk to a vector representation
4. **Index Update**: Add vectors to the persistent storage with metadata

**Chunking Strategies:**

#### SEMANTIC Chunking

Splits documents at natural semantic boundaries:
- Paragraph breaks
- Section headers
- Logical topic transitions

**Advantages:**
- Preserves contextual coherence
- Produces variable-length chunks optimized for meaning
- Better retrieval quality for conceptual queries

**Implementation:**
```java
public List<String> semanticChunk(String text) {
    // Split by paragraph boundaries
    String[] paragraphs = text.split("\\n\\n+");
    // Group related paragraphs into chunks
    // Return list of coherent text segments
}
```

#### FIXED_SIZE Chunking

Splits documents into uniform token counts:
- Target size: 512 tokens (configurable via `RAG_CHUNK_SIZE`)
- Overlap: 50 tokens between consecutive chunks (configurable via `RAG_CHUNK_OVERLAP`)

**Advantages:**
- Predictable memory usage
- Consistent embedding dimensions
- Simpler implementation

**Implementation:**
```java
public List<String> fixedSizeChunk(String text, int chunkSize, int overlap) {
    // Tokenize text
    // Create chunks of fixed size with overlap
    // Return list of equal-length segments
}
```

### EmbeddingService

The `EmbeddingService` handles communication with the Ollama embedding API to generate vector representations of text chunks.

**Configuration:**
- **Model**: `nomic-embed-text` (default, configurable via `OLLAMA_EMBEDDING_MODEL`)
- **Dimension**: 768 (configurable via `EMBEDDING_DIMENSION`)
- **API Endpoint**: Derived from `AI_API_URL` with `/embeddings` path

**Request Format:**
```json
{
  "model": "nomic-embed-text",
  "input": ["Text chunk to embed..."],
  "encoding_format": "float"
}
```

**Response Format:**
```json
{
  "data": [
    {
      "embedding": [0.023, -0.451, 0.789, ...],
      "index": 0
    }
  ],
  "model": "nomic-embed-text",
  "usage": {
    "prompt_tokens": 45,
    "total_tokens": 45
  }
}
```

**Error Handling:**
- Retry logic for transient network failures
- Fallback to cached embeddings for identical chunks
- Graceful degradation when Ollama is unavailable

### VectorStorageService

The `VectorStorageService` manages the in-memory vector index with HNSW-inspired organization for efficient similarity search.

**Data Structure:**
```java
public class VectorIndex {
    private Map<Long, VectorEntry> entries;
    private List<float[]> vectors;
    private HNSWGraph graph; // Approximate nearest neighbor graph
}
```

**Vector Entry Structure:**
```java
public class VectorEntry {
    private Long id;
    private String chunkId;
    private String documentId;
    private float[] embedding;
    private String content;
    private Map<String, String> metadata;
    private Instant createdAt;
}
```

**Persistence:**
- **Location**: `/data/rag-index/vectors.dat` (configurable via `RAG_INDEX_PATH`)
- **Format**: Binary serialization for compact storage
- **Trigger**: Automatic save after each indexing operation
- **Recovery**: Load on application startup if file exists

### Similarity Search

The retrieval system uses cosine similarity to find the most relevant chunks for a given query.

**Cosine Similarity Formula:**
```
similarity(A, B) = (A · B) / (||A|| × ||B||)
```

Where:
- `A · B` is the dot product of vectors A and B
- `||A||` and `||B||` are the magnitudes (L2 norms) of the vectors

**Search Process:**
1. Generate embedding for the query text
2. Compute cosine similarity with all stored vectors
3. Sort results by similarity score (descending)
4. Return top-K results above the threshold

**Query Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `topK` | 5 | Number of results to return |
| `threshold` | 0.5 | Minimum similarity score (0.0-1.0) |

**Example Search:**
```java
List<SearchResult> results = vectorStorage.search(
    queryEmbedding,
    5,      // topK
    0.6f    // threshold
);
```

## End-to-End Flow

### Document Upload Flow

```
User Upload → Controller → RagIndexingService
                                  ↓
                          Split into Chunks
                                  ↓
                          EmbeddingService (Ollama)
                                  ↓
                          VectorStorageService
                                  ↓
                          Persist to /data/rag-index/vectors.dat
                                  ↓
                          Return: documentId, chunkCount
```

### Query Flow

```
User Query → Controller → EmbeddingService (generate query embedding)
                                  ↓
                          VectorStorageService (cosine similarity search)
                                  ↓
                          Top-K Results Retrieved
                                  ↓
                          Results injected into AI prompt
                                  ↓
                          AI generates response with context
                                  ↓
                          Response returned to user
```

## Enhanced Prompt Construction

When RAG results are available, the AI prompt is augmented with retrieved context:

```
System: You are a helpful assistant. Use the following context to answer the question.

Context:
[1] {retrieved_chunk_1}
[2] {retrieved_chunk_2}
[3] {retrieved_chunk_3}

Question: {user_query}

Answer:
```

**Context Injection Rules:**
- Maximum 5 chunks injected (configurable)
- Chunks sorted by similarity score
- Each chunk prefixed with source number for reference
- Context section clearly delimited from user query

## Performance Considerations

### Indexing Performance

| Operation | Time (avg) | Notes |
|-----------|------------|-------|
| Document parsing | <100ms | Depends on file size |
| Chunking (1000 words) | ~50ms | SEMANTIC slower than FIXED_SIZE |
| Embedding (per chunk) | ~200ms | Network call to Ollama |
| Vector insertion | <10ms | In-memory operation |

### Search Performance

| Index Size | Search Time | Notes |
|------------|-------------|-------|
| 100 chunks | <10ms | Brute-force feasible |
| 1,000 chunks | ~50ms | HNSW graph beneficial |
| 10,000 chunks | ~100ms | HNSW provides 10x speedup |

### Memory Usage

| Component | Memory (approx) |
|-----------|-----------------|
| Vector (768-dim, float32) | 3 KB |
| 1,000 chunks | ~3 MB |
| 10,000 chunks | ~30 MB |
| HNSW graph overhead | ~20% of vector storage |

## Limitations and Future Improvements

### Current Limitations

1. **In-Memory Index**: Full index loaded into RAM, limiting maximum size
2. **Single-Threaded Indexing**: Documents processed sequentially
3. **No Incremental Updates**: Full reindex required for document changes
4. **Basic Chunking**: No advanced NLP for semantic boundary detection

### Planned Improvements

1. **Disk-Based Index**: Use memory-mapped files for larger corpora
2. **Parallel Indexing**: Multi-threaded document processing
3. **Incremental Updates**: Add/delete individual chunks without full rebuild
4. **Hybrid Search**: Combine semantic similarity with keyword matching (BM25)
5. **Query Expansion**: Automatically expand queries with synonyms and related terms
