# RAG Test Queries

## Overview

This document contains a curated set of test queries for validating the RAG (Retrieval Augmented Generation) system. Each query includes expected answers, source documents, and difficulty ratings to ensure consistent testing across development cycles.

**Total Queries**: 8  
**Multilingual Pairs**: 3 (Russian + English)  
**Reranking-Critical**: 2  
**Coverage**: Factual, How-To, Comparison, Edge Cases

---

## Query 1: Basic Factual - Architecture Component

**Query (English)**: What is the responsibility of RagIndexingService?  
**Query (Russian)**: Какова ответственность RagIndexingService?

**Expected Answer**:  
The RagIndexingService is responsible for processing uploaded documents and preparing them for storage in the vector index. Its responsibilities include:
1. Document Parsing - extracting text content from uploaded files (Markdown, plain text)
2. Chunking - splitting documents into manageable segments using configurable strategies
3. Embedding Generation - converting each chunk to a vector representation
4. Index Update - adding vectors to the persistent storage with metadata

**Expected Sources**:  
- Primary: `06-rag-architecture.md` (Section: Component Architecture → RagIndexingService)
- Secondary: `01-project-overview.md` (Section: RAG)

**Difficulty**: Easy

**Expected Behavior**:  
- Query should return `06-rag-architecture.md` with similarity score > 0.85
- Top-3 results should all contain "RagIndexingService" or "indexing"
- Reranking impact: LOW - query terms match document structure exactly

---

## Query 2: How-To - MCP Server Setup

**Query (English)**: How do I configure an MCP server with HTTP transport?  
**Query (Russian)**: Как настроить MCP сервер с HTTP транспортом?

**Expected Answer**:  
To configure an MCP server with HTTP transport:

1. Create a JSON configuration with the following structure:
```json
{
  "name": "weather-server",
  "url": "http://host.docker.internal:8080/mcp",
  "transportType": "HTTP"
}
```

2. Register via API:
```bash
curl -X POST http://localhost:8082/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{"name": "weather-server", "url": "http://host.docker.internal:8080/mcp", "transportType": "HTTP"}'
```

3. Connect to the server:
```bash
curl -X POST http://localhost:8082/api/mcp/servers/1/connect
```

**Expected Sources**:  
- Primary: `02-mcp-setup-guide.md` (Sections: MCP Server Configuration, Example: Weather Server MCP)
- Secondary: `03-api-reference.md` (Section: MCP API)

**Difficulty**: Easy

**Expected Behavior**:  
- Query should return `02-mcp-setup-guide.md` with similarity score > 0.80
- Must include JSON configuration example in retrieved chunks
- Reranking impact: LOW - procedural query with clear keywords

---

## Query 3: Comparison - Chunking Strategies ⭐ RERANKING TEST

**Query (English)**: What are the differences between SEMANTIC and FIXED_SIZE chunking strategies? When should I use each?  
**Query (Russian)**: В чем разница между стратегиями чанкования SEMANTIC и FIXED_SIZE? Когда следует использовать каждую?

**Expected Answer**:  

**SEMANTIC Chunking**:
- Splits documents at natural semantic boundaries (paragraph breaks, section headers, topic transitions)
- Advantages: Preserves contextual coherence, produces variable-length chunks optimized for meaning, better retrieval quality for conceptual queries
- Use when: Document has clear structure, queries are conceptual, quality is more important than predictability

**FIXED_SIZE Chunking**:
- Splits documents into uniform token counts (target: 512 tokens, overlap: 50 tokens)
- Advantages: Predictable memory usage, consistent embedding dimensions, simpler implementation
- Use when: Need predictable memory usage, processing large volumes, performance is critical

**Expected Sources**:  
- Primary: `06-rag-architecture.md` (Section: Component Architecture → Chunking Strategies)
- Secondary: `README.md` (Section: Chunking Strategies)

**Difficulty**: Medium

**Expected Behavior**:  
- Initial retrieval may return mixed results from multiple documents
- **Reranking should significantly improve results** by promoting chunks that contain BOTH strategy names
- Before reranking: May get separate chunks about SEMANTIC and FIXED_SIZE
- After reranking: Should get chunks that explicitly compare both strategies
- Expected reranking improvement: Top-1 relevance score should increase by 0.15-0.25

---

## Query 4: Technical Specification - Embedding Configuration

**Query (English)**: What embedding model and dimensions are used in the RAG system?  
**Query (Russian)**: Какая модель эмбеддингов и размерность используются в RAG системе?

**Expected Answer**:  
- **Model**: `nomic-embed-text` (configurable via `OLLAMA_EMBEDDING_MODEL`)
- **Dimensions**: 768 (configurable via `EMBEDDING_DIMENSION`)
- **API Endpoint**: Derived from `AI_API_URL` with `/embeddings` path
- **Request format**: JSON with model, input array, and encoding_format: "float"

**Expected Sources**:  
- Primary: `06-rag-architecture.md` (Section: Component Architecture → EmbeddingService)
- Secondary: `README.md` (Section: Ollama Setup)

**Difficulty**: Easy

**Expected Behavior**:  
- Query should return exact model name "nomic-embed-text" in top result
- Similarity score > 0.80 for embedding-related sections
- Reranking impact: LOW - specific technical terms match exactly

---

## Query 5: Troubleshooting - Docker Network ⭐ RERANKING TEST

**Query (English)**: I'm getting connection timeout when connecting to MCP server from Docker. How do I fix this?  
**Query (Russian)**: Я получаю таймаут подключения при подключении к MCP серверу из Docker. Как это исправить?

**Expected Answer**:  
When running in Docker containers, use `host.docker.internal` instead of `localhost` or `127.0.0.1` in the MCP server URL.

**Correct configuration**:
```json
{
  "name": "weather-server",
  "url": "http://host.docker.internal:8080/mcp",
  "transportType": "HTTP"
}
```

**Incorrect configuration** (will timeout):
```json
{
  "url": "http://localhost:8080/mcp"  // WRONG from Docker
}
```

This is because Docker containers have isolated network namespaces and cannot access the host machine via localhost.

**Expected Sources**:  
- Primary: `02-mcp-setup-guide.md` (Section: Troubleshooting Tips)
- Secondary: `README.md` (Section: Troubleshooting → Таймаут подключения к MCP)
- Tertiary: `AGENTS.md` (Section: Gotchas → MCP server access)

**Difficulty**: Medium

**Expected Behavior**:  
- Initial retrieval may return generic MCP configuration docs
- **Reranking should significantly improve results** by promoting chunks containing "timeout", "host.docker.internal", and "Docker" together
- Before reranking: May get general MCP setup docs without troubleshooting info
- After reranking: Should surface specific troubleshooting section with the exact solution
- Expected reranking improvement: Top-1 should shift from generic config to troubleshooting section, relevance increase 0.20-0.30

---

## Query 6: Edge Case - Empty Query Handling

**Query (English)**: What happens if I send an empty query to the RAG search endpoint?  
**Query (Russian)**: Что произойдет, если отправить пустой запрос к RAG search эндпоинту?

**Expected Answer**:  
The RAG search endpoint requires a query parameter. Sending an empty or missing query should return an error response:

```json
{
  "error": "Query parameter is required"
}
```

This is documented in the API reference under error responses for the GET /api/rag/search endpoint.

**Expected Sources**:  
- Primary: `README.md` (Section: API Reference → GET /api/rag/search → Error Response)
- Secondary: `03-api-reference.md` (if exists with detailed error handling)

**Difficulty**: Medium

**Expected Behavior**:  
- Query terms like "empty", "error", "required" should match API documentation
- May be challenging if error handling is only briefly mentioned
- Reranking impact: MEDIUM - error handling details may be buried in larger API docs

---

## Query 7: Architecture Flow - End-to-End Document Upload

**Query (English)**: Describe the complete flow from document upload to vector storage persistence.  
**Query (Russian)**: Опишите полный поток от загрузки документа до сохранения векторного хранилища.

**Expected Answer**:  

**Document Upload Flow**:
```
User Upload → Controller → RagIndexingService
                        ↓
                Split into Chunks (SEMANTIC or FIXED_SIZE)
                        ↓
                EmbeddingService calls Ollama API
                        ↓
                VectorStorageService receives embeddings
                        ↓
                Vectors inserted into in-memory HNSW index
                        ↓
                Automatic save to /data/rag-index/vectors.dat
                        ↓
                Return: documentId, chunkCount, status
```

**Key Components Involved**:
1. **RagIndexingService**: Orchestrates the flow, handles chunking
2. **EmbeddingService**: Makes HTTP call to Ollama for vector generation
3. **VectorStorageService**: Manages in-memory index and binary persistence

**Persistence Details**:
- Location: `/data/rag-index/vectors.dat` (configurable via `RAG_INDEX_PATH`)
- Format: Binary serialization
- Trigger: Automatic save after each indexing operation
- Recovery: Load on application startup if file exists

**Expected Sources**:  
- Primary: `06-rag-architecture.md` (Section: End-to-End Flow → Document Upload Flow)
- Secondary: `06-rag-architecture.md` (Section: VectorStorageService → Persistence)
- Tertiary: `01-project-overview.md` (Section: RAG)

**Difficulty**: Hard

**Expected Behavior**:  
- Requires retrieving and combining information from multiple sections
- Should return chunks containing the flow diagram or step-by-step description
- Reranking impact: MEDIUM - flow diagrams may be split across chunks

---

## Query 8: Performance - Search Time at Scale

**Query (English)**: What is the expected search performance for 10,000 chunks? How does HNSW help?  
**Query (Russian)**: Какова ожидаемая производительность поиска для 10,000 чанков? Как помогает HNSW?

**Expected Answer**:  

**Search Performance**:
| Index Size | Search Time | Notes |
|------------|-------------|-------|
| 100 chunks | <10ms | Brute-force feasible |
| 1,000 chunks | ~50ms | HNSW graph beneficial |
| 10,000 chunks | ~100ms | HNSW provides 10x speedup |

**HNSW Benefits**:
- HNSW (Hierarchical Navigable Small World) is an approximate nearest neighbor graph
- For 10,000 chunks, HNSW provides approximately 10x speedup compared to brute-force search
- Without HNSW: ~1000ms for 10,000 chunks (linear scan)
- With HNSW: ~100ms (logarithmic search)

**Memory Overhead**:
- HNSW graph adds approximately 20% overhead to vector storage
- For 10,000 chunks (~30MB vectors), HNSW adds ~6MB

**Expected Sources**:  
- Primary: `06-rag-architecture.md` (Section: Performance Considerations → Search Performance)
- Secondary: `06-rag-architecture.md` (Section: Performance Considerations → Memory Usage)

**Difficulty**: Medium

**Expected Behavior**:  
- Query should retrieve performance table with specific numbers
- Must include "HNSW" and "speedup" or "performance" in retrieved chunks
- Reranking impact: LOW - performance section is well-structured with tables

---

## Summary Matrix

| # | Type | Multilingual | Reranking-Critical | Difficulty | Expected Top Score |
|---|------|--------------|-------------------|------------|-------------------|
| 1 | Factual | ✅ Yes | ❌ No | Easy | > 0.85 |
| 2 | How-To | ✅ Yes | ❌ No | Easy | > 0.80 |
| 3 | Comparison | ✅ Yes | ⭐ **YES** | Medium | > 0.75 (after rerank) |
| 4 | Technical | ✅ Yes | ❌ No | Easy | > 0.80 |
| 5 | Troubleshooting | ✅ Yes | ⭐ **YES** | Medium | > 0.70 (after rerank) |
| 6 | Edge Case | ✅ Yes | ❌ No | Medium | > 0.65 |
| 7 | Architecture Flow | ✅ Yes | ❌ No | Hard | > 0.70 |
| 8 | Performance | ✅ Yes | ❌ No | Medium | > 0.75 |

---

## Reranking Validation Notes

### Query 3 (Comparison) - Success Criteria
- **Before reranking**: Top-3 results may contain separate chunks about SEMANTIC or FIXED_SIZE individually
- **After reranking**: Top result should contain BOTH terms with explicit comparison language
- **Metric**: NDCG@3 should improve by ≥ 0.15

### Query 5 (Troubleshooting) - Success Criteria
- **Before reranking**: May return generic MCP configuration without troubleshooting specifics
- **After reranking**: Should surface "host.docker.internal" solution in top-2
- **Metric**: MRR (Mean Reciprocal Rank) should improve from ≤ 0.5 to ≥ 0.8

---

## Manual Testing Instructions

1. **Setup**: Ensure all test documents (01-10) are indexed in the RAG system
2. **Execute**: Run each query through the RAG search endpoint:
   ```bash
   curl "http://localhost:8082/api/rag/search?query=<URL_ENCODED_QUERY>&topK=5"
   ```
3. **Record**: Document the actual similarity scores and retrieved sources
4. **Compare**: Check if expected sources appear in top-5 results
5. **Reranking Test**: For queries 3 and 5, compare results before and after applying reranking

**Pass Criteria**:
- Easy queries: Expected source in top-1 with score > 0.75
- Medium queries: Expected source in top-3 with score > 0.65
- Hard queries: Expected sources in top-5 with score > 0.60
- Reranking queries: Measurable improvement in relevance ranking
