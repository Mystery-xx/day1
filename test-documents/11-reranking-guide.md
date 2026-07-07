# Reranking Guide

## What is Reranking?

Reranking is an optional second-stage retrieval process that improves the relevance of RAG (Retrieval-Augmented Generation) results. It uses a **cross-encoder model** to re-score documents that were initially retrieved by a **bi-encoder** (embedding) model.

## Why Reranking?

### The Problem with Embedding-Only Retrieval

Bi-encoder models (like `nomic-embed-text`) are efficient for semantic search but have limitations:

- **Coarse similarity**: Cosine similarity on embeddings is approximate
- **Query-document mismatch**: Embeddings may not capture fine-grained relevance
- **Keyword dilution**: Important specific terms may be lost in semantic averaging

### How Reranking Helps

Cross-encoder models (like `BAAI/bge-reranker-v2-minified`) provide:

- **Fine-grained scoring**: Evaluates query-document pairs jointly
- **Better precision**: More accurately identifies truly relevant documents
- **Context awareness**: Understands nuance and specific terminology

## RAG Pipeline with Reranking

### Without Reranking (Baseline)

```
User Query → Embedding → Vector Search (cosine similarity) → Top-K Results → LLM
```

**Characteristics:**
- Fast (~100-500ms)
- Good for general semantic similarity
- May miss highly relevant specific documents

### With Reranking (Enhanced)

```
User Query → Embedding → Vector Search (top 20) → Reranker (cross-encoder) → Filter by threshold → Top-K Results → LLM
```

**Characteristics:**
- Slower (~500-2000ms additional latency)
- Much higher precision
- Better for technical/specific queries

## Architecture

### Components

| Component | Model | Purpose |
|-----------|-------|---------|
| **Embedding** | `nomic-embed-text` | Initial semantic retrieval |
| **Reranker** | `BAAI/bge-reranker-v2-minified` | Fine-grained relevance scoring |
| **Threshold** | Configurable (default: 0.0) | Filters low-relevance results |

### Flow Diagram

```
┌─────────────┐
│ User Query  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ 1. Query Rewrite        │ (optional)
│    - Enhances short     │
│      queries            │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 2. Embedding Generation │
│    - nomic-embed-text   │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 3. Vector Search        │
│    - Top 20 results     │
│    - Cosine similarity  │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 4. Reranking            │ (if enabled)
│    - BGE-reranker-v2    │
│    - Cross-encoder      │
│    - Returns logits     │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 5. Threshold Filtering  │
│    - Keep score >= 0.0  │
│    - (logit = 50% prob) │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 6. Take Top-K           │
│    - Usually top 5      │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 7. Build Context        │
│    - Format for LLM     │
│    - Include citations  │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 8. Send to LLM          │
│    - AI generates answer│
│    - With citations     │
└─────────────────────────┘
```

## Technical Details

### TEI Reranker API

The backend uses **Hugging Face Text Embeddings Inference (TEI)** for reranking.

**Request Format:**
```json
{
  "query": "How to configure MCP server?",
  "texts": [
    "MCP servers use JSON configuration",
    "Weather API provides real-time data",
    "Docker networking requires host.docker.internal"
  ],
  "top_n": 3
}
```

**Response Format:**
```json
[
  {"index": 0, "score": 2.5},
  {"index": 2, "score": 1.8},
  {"index": 1, "score": -0.3}
}
```

### Understanding Reranker Scores

**CRITICAL**: TEI returns **raw logits**, NOT probabilities!

| Logit Score | Probability (sigmoid) | Interpretation |
|-------------|----------------------|----------------|
| `-5.0`      | 0.7%                 | Definitely irrelevant |
| `-2.0`      | 12%                  | Likely irrelevant |
| `0.0`       | 50%                  | Neutral/uncertain |
| `2.0`       | 88%                  | Likely relevant |
| `5.0`       | 99.3%                | Highly relevant |
| `10.0`      | 99.995%              | Definitely relevant |

### Threshold Configuration

**Default threshold: `0.0`** (logit) = 50% probability

**Adjusting the threshold:**

| Threshold | Use Case | Effect |
|-----------|----------|--------|
| `-2.0`    | High recall | Keep most results, few filtered |
| `0.0`     | Balanced (default) | 50% probability cutoff |
| `2.0`     | High precision | Only highly relevant results |
| `5.0`     | Very strict | Only top-tier matches |

**Configuration:**
```bash
# In .env file
RAG_RERANK_THRESHOLD=0.0  # Default: 50% probability
```

### Performance Considerations

| Metric | Without Rerank | With Rerank |
|--------|---------------|-------------|
| **Latency** | ~200-500ms | ~700-2500ms |
| **Precision@5** | ~60% | ~85% |
| **MRR** | ~0.7 | ~0.9 |
| **CPU Usage** | Low | Medium-High |
| **Memory** | ~500MB | ~1-2GB |

**Recommendations:**
- Enable reranking for **production** use
- Disable for **development/testing** (faster iteration)
- Use threshold `0.0` as starting point
- Adjust based on your use case (higher for precision, lower for recall)

## Enabling Reranking

### Frontend Settings

1. Open Settings panel
2. Go to RAG tab
3. Enable "Use RAG" toggle
4. Enable "Enable Reranking" toggle
5. Adjust threshold slider if needed (-2.0 to 5.0)

### Backend Configuration

```yaml
# application.yml
rag:
  rerank:
    enabled: true
    base-url: http://tei-reranker:80
    top-k-before: 20      # Retrieve top 20 initially
    top-k-after: 5        # Return top 5 after reranking
    threshold: 0.0        # Logit threshold (0.0 = 50% probability)
```

### API Usage

**Enhanced Search Endpoint:**
```bash
curl -X GET "http://localhost:8082/api/rag/search/enhanced?query=MCP+configuration&topK=5&rerank=true&threshold=0.0&rewrite=false"
```

**Response includes rerank scores:**
```json
{
  "context": "...",
  "sources": [...],
  "rerankScores": [0.92, 0.87, 0.76, 0.65, 0.54],
  "queryWasRewritten": false
}
```

## Troubleshooting

### Reranking returns no results

**Problem**: `rerank=true` returns empty results, `rerank=false` works

**Causes:**
1. **Threshold too high**: TEI returns logits, not probabilities
2. **TEI container down**: Check `docker ps`
3. **Network issue**: Backend can't reach TEI service

**Solutions:**
```bash
# 1. Lower threshold
RAG_RERANK_THRESHOLD=0.0  # or even -1.0 for testing

# 2. Check TEI status
docker ps | grep tei

# 3. Test TEI directly
curl http://localhost:8080/health

# 4. Check backend logs
docker logs ai-chat-backend | grep -i rerank
```

### Reranking is slow

**Problem**: Queries take > 3 seconds with reranking

**Causes:**
1. **Large batch**: Reranking 20+ documents
2. **CPU bottleneck**: Cross-encoder is compute-intensive
3. **Network latency**: TEI service on slow network

**Solutions:**
```yaml
# Reduce initial retrieval size
rag:
  rerank:
    top-k-before: 10  # Was 20
    top-k-after: 5
```

### Scores seem wrong

**Problem**: Relevant documents get low scores

**Remember**: TEI returns **logits**, not probabilities!

- Score `0.5` ≠ 50% probability
- Score `0.5` = logit, which is ~62% probability (sigmoid(0.5) ≈ 0.62)
- Use threshold `0.0` for 50% probability cutoff

## Best Practices

### When to Enable Reranking

✅ **Enable reranking for:**
- Technical documentation search
- Specific question answering
- Production deployments
- When precision matters more than latency

❌ **Disable reranking for:**
- General browsing/exploration
- Development/testing (faster iteration)
- Very large document collections (>1000 chunks)
- When latency is critical (<500ms response time)

### Optimal Configuration

**Production (balanced):**
```bash
RAG_RERANK_ENABLED=true
RAG_RERANK_TOP_K_BEFORE=20
RAG_RERANK_TOP_K_AFTER=5
RAG_RERANK_THRESHOLD=0.0
```

**High Precision (strict):**
```bash
RAG_RERANK_ENABLED=true
RAG_RERANK_TOP_K_BEFORE=15
RAG_RERANK_TOP_K_AFTER=3
RAG_RERANK_THRESHOLD=2.0  # Only highly relevant
```

**High Recall (lenient):**
```bash
RAG_RERANK_ENABLED=true
RAG_RERANK_TOP_K_BEFORE=30
RAG_RERANK_TOP_K_AFTER=10
RAG_RERANK_THRESHOLD=-1.0  # Keep more results
```

## Example Scenarios

### Scenario 1: Technical Question

**Query**: "How to configure MCP server for weather API?"

**Without Reranking:**
- Gets general MCP docs
- May miss specific configuration example
- Precision@5: ~60%

**With Reranking:**
- Reranks configuration examples higher
- Surfaces exact JSON format
- Precision@5: ~85%

### Scenario 2: Troubleshooting

**Query**: "Docker backend connection timeout"

**Without Reranking:**
- Gets general Docker docs
- May miss `host.docker.internal` solution
- Precision@5: ~50%

**With Reranking:**
- Identifies troubleshooting section
- Surfaces specific networking fix
- Precision@5: ~80%

### Scenario 3: Comparison Question

**Query**: "Difference between SEMANTIC and FIXED_SIZE chunking?"

**Without Reranking:**
- Gets separate chunks about each strategy
- May not find direct comparison
- Precision@5: ~55%

**With Reranking:**
- Finds chunks with both terms
- Surfaces comparison language
- Precision@5: ~75%

## Monitoring

### Key Metrics

Track these metrics to optimize reranking:

1. **Rerank Hit Rate**: % of queries where reranking changes top-3 results
2. **Score Distribution**: Histogram of rerank scores
3. **Filter Rate**: % of results filtered by threshold
4. **Latency Impact**: Additional time from reranking

### Logging

Backend logs reranking operations:

```
>>> MCP TOOL CALL [rerank] with 20 documents
<<< MCP TOOL RESULT - 20 scores: [2.5, 1.8, -0.3, ...]
Reranking 20 documents, TEI response: 20 scores
After threshold=0.0: 12 results remain
Taking top 5 for context
```

Check logs with:
```bash
docker logs ai-chat-backend | grep -i rerank
```

## Related Documentation

- `06-rag-architecture.md` - Overall RAG system design
- `09-model-settings.md` - Model configuration
- `08-troubleshooting.md` - Common issues and solutions
