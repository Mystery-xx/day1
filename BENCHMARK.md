# Chunk Size Optimization Benchmark

## Methodology

### Objective
Determine the optimal chunk size for RAG (Retrieval-Augmented Generation) indexing that balances:
- **Indexing speed** - Time to process and embed documents
- **Search latency** - Time to retrieve relevant chunks
- **Accuracy** - Content coverage and retrieval quality

### Test Configuration

| Parameter | Value |
|-----------|-------|
| **Chunk sizes tested** | 300, 500, 700, 1000 tokens |
| **Overlap** | 50 tokens (constant) |
| **Embedding model** | nomic-embed-text (768 dimensions) |
| **Sample document** | ~2000 words, multi-topic technical content |
| **Search iterations** | 5 queries per chunk size |
| **Top-K results** | 10 |

### Metrics Measured

1. **Indexing Time (ms)** - Total time to chunk, embed, and store document
2. **Time Per Chunk (ms)** - Average processing time per individual chunk
3. **Search Latency (ms)** - Average time for similarity search queries
4. **Accuracy (%)** - Composite score based on:
   - Content coverage (70% weight) - percentage of original content preserved
   - Embedding quality (30% weight) - valid vector embeddings

### Test Environment

- **Backend**: Spring Boot 3.2, Java 17
- **Storage**: In-memory with disk persistence
- **Similarity**: Cosine similarity with brute-force search
- **Caching**: Caffeine cache for embeddings (10,000 entries, 1 hour expiry)

---

## Results

### Benchmark Results Table

| Chunk Size | Chunks | Index Time (ms) | Time/Chunk (ms) | Search Latency (ms) | Accuracy (%) | Composite Score |
|------------|--------|-----------------|-----------------|---------------------|--------------|-----------------|
| 300 | - | - | - | - | - | - |
| 500 | - | - | - | - | - | - |
| 700 | - | - | - | - | - | - |
| 1000 | - | - | - | - | - | - |

> **Note**: Run the benchmark service to populate actual results. Execute via:
> ```bash
> curl -X POST http://localhost:8082/api/benchmark/run
> ```

### Expected Trade-offs

| Chunk Size | Pros | Cons |
|------------|------|------|
| **300 tokens** | - Fine-grained retrieval<br>- Higher precision<br>- Lower memory per chunk | - More chunks to process<br>- Higher indexing overhead<br>- May lose context |
| **500 tokens** (default) | - Balanced approach<br>- Good context preservation<br>- Moderate overhead | - May split semantic units<br>- Not optimal for all content |
| **700 tokens** | - Better context retention<br>- Fewer chunks to manage<br>- Reduced indexing overhead | - Slightly higher latency<br>- May include irrelevant content |
| **1000 tokens** | - Maximum context<br>- Minimal chunk count<br>- Lowest indexing overhead | - Risk of diluted relevance<br>- Higher search latency<br>- May exceed model limits |

---

## Recommendations

### For Production Deployment

Based on the benchmark methodology, the following recommendations apply:

#### **Default Configuration (Recommended)**
```yaml
rag:
  chunking:
    strategy: SEMANTIC
    fixedSize: 500    # Balanced default
    overlap: 50
    semanticMax: 1000
```

**Rationale**: 500 tokens provides the best balance for general-purpose RAG applications with mixed content types.

#### **Use Case Specific Recommendations**

| Use Case | Recommended Chunk Size | Reasoning |
|----------|----------------------|-----------|
| **Technical documentation** | 700 tokens | Preserves complete code examples and explanations |
| **FAQ / Q&A pairs** | 300 tokens | Each question-answer pair fits in single chunk |
| **Long-form articles** | 500 tokens | Balances context and retrieval precision |
| **Research papers** | 1000 tokens | Maintains section-level context |
| **Chat logs / Dialogues** | 300 tokens | Individual conversations are short |

#### **Performance Optimization Tips**

1. **Enable caching**: Embedding cache reduces redundant API calls
   ```yaml
   # Already configured in EmbeddingService
   # Caffeine: 10,000 entries, 1 hour expiry
   ```

2. **Batch embeddings**: Process multiple chunks in parallel
   ```java
   embeddingService.generateBatch(chunkTexts);
   ```

3. **Adjust ef-search**: For HNSW-based search, tune based on latency requirements
   ```yaml
   rag:
     eclipse-store:
       hnsw:
         ef-search: 50  # Increase for better accuracy, decrease for speed
   ```

4. **Monitor accuracy**: Track retrieval quality in production
   - Measure user satisfaction with search results
   - A/B test different chunk sizes
   - Log similarity scores for analysis

---

## How to Run Benchmark

### 1. Start the Application

```bash
docker-compose up --build
```

### 2. Execute Benchmark

```bash
# Via API (when endpoint is added)
curl -X POST http://localhost:8082/api/benchmark/run

# Or call directly in code
@Autowired
private BenchmarkService benchmarkService;

BenchmarkResults results = benchmarkService.runFullBenchmark();
System.out.println(results.toMarkdownTable());
```

### 3. Analyze Results

The benchmark service outputs:
- Detailed metrics for each chunk size
- Composite score ranking
- Recommended optimal chunk size
- Markdown table for documentation

---

## Appendix: BenchmarkService API

### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `runFullBenchmark()` | Tests all chunk sizes (300, 500, 700, 1000) | `BenchmarkResults` |
| `testChunkSize(int size)` | Tests a specific chunk size | `BenchmarkResult` |

### BenchmarkResult Fields

| Field | Type | Description |
|-------|------|-------------|
| `chunkSize` | int | Tested chunk size in tokens |
| `chunkCount` | int | Number of chunks generated |
| `indexingTimeMs` | long | Total indexing time |
| `timePerDocumentMs` | long | Average time per chunk |
| `avgSearchLatencyMs` | long | Average search query time |
| `accuracy` | double | Accuracy score (0.0 - 1.0) |
| `compositeScore` | double | Combined metric (lower is better) |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-07-01 | 1.0 | Initial benchmark framework |

---

**Status**: Framework implemented, awaiting execution for production data.
**Default**: 500 tokens (balanced for general use cases).
