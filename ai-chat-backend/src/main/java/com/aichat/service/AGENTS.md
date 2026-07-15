# AGENTS.md - Service Layer

## Package Overview

The service layer is organized into 8 specialized sub-packages, each following the strategy pattern:

```
service/
├── chunking/      # Document chunking strategies
├── context/       # Context management
├── embedding/     # Embedding generation
├── extract/       # Task extraction (auto-extraction aspect)
├── ollama/        # Ollama integration
├── rerank/        # Reranking logic
├── search/        # Search strategies
└── vector/        # Vector store operations
```

## Strategy Pattern

Each sub-package follows this pattern:
```java
// Interface
public interface ChunkingStrategy {
    List<Chunk> chunk(String content);
}

// Implementation
@Service
public class FixedSizeChunkingStrategy implements ChunkingStrategy {
    @Override
    public List<Chunk> chunk(String content) { ... }
}

// Context/Manager
@Service
public class ChunkingService {
    private final Map<String, ChunkingStrategy> strategies;
    
    public List<Chunk> chunk(String content, String strategyName) {
        return strategies.get(strategyName).chunk(content);
    }
}
```

## Sub-Package Responsibilities

### chunking/
- **Purpose**: Split documents into manageable chunks for RAG
- **Strategies**: Fixed-size, semantic, recursive
- **Output**: `List<Chunk>` with metadata (position, size)

### context/
- **Purpose**: Manage conversation context for AI
- **Features**: Context windowing, history trimming, summary injection
- **Integration**: Used by chat service before AI calls

### embedding/
- **Purpose**: Generate vector embeddings for documents/queries
- **Providers**: Multiple embedding model support
- **Caching**: Embedding results cached to avoid recomputation

### extract/
- **Purpose**: Extract structured data from AI responses
- **Auto-Extraction**: Aspect-oriented (`@Aspect`) automatic extraction
- **Replacement**: Supersedes manual TaskState updates (deprecated)

### ollama/
- **Purpose**: Ollama model integration
- **Features**: Model listing, health checks, streaming
- **Config**: URL, model name via environment variables

### rerank/
- **Purpose**: Rerank search results for relevance
- **TODO**: Add caching for rerank queries (line 26)
- **Integration**: Post-processing after vector search

### search/
- **Purpose**: Hybrid search strategies (keyword + vector)
- **Features**: Multi-stage retrieval, score fusion
- **Output**: Ranked list of relevant chunks

### vector/
- **Purpose**: Vector store operations (CRUD)
- **Integration**: H2 database with vector extensions
- **Operations**: Insert, query, delete, similarity search

## Conventions

### Naming
- **Interfaces**: `{Domain}Strategy` or `{Domain}Service`
- **Implementations**: `{Adjective}{Domain}Strategy` (e.g., `FixedSizeChunkingStrategy`)
- **Managers**: `{Domain}Service` (orchestrates strategies)

### Dependencies
- **Injection**: Constructor injection (preferred) or field injection
- **Strategy Selection**: Map-based lookup by name
- **Fallback**: Default strategy if name not found

### Error Handling
- **Custom Exceptions**: `{Domain}Exception` in `exception/` package
- **Logging**: SLF4J with structured logging
- **Recovery**: Graceful degradation where possible

## Anti-Patterns

### Manual TaskState Updates
- **Location**: `ChatController.java:528-571` (3 deprecated endpoints)
- **Problem**: Manual state management superseded by auto-extraction aspect
- **Solution**: Use auto-extraction aspect instead

### Missing Caching
- **Location**: `RerankService.java:26`
- **TODO**: Add caching for rerank queries
- **Impact**: Performance degradation on repeated queries

## Testing

No test suite configured. When adding tests:
```
src/test/java/com/aichat/service/
├── chunking/
│   └── ChunkingServiceTest.java
├── context/
│   └── ContextServiceTest.java
...
```

Use Mockito for mocking, AssertJ for assertions.

## Key Files

| File | Purpose |
|------|---------|
| `service/chunking/ChunkingService.java` | Chunking orchestrator |
| `service/embedding/EmbeddingService.java` | Embedding generation |
| `service/extract/ExtractAspect.java` | Auto-extraction aspect |
| `service/vector/VectorStoreService.java` | Vector CRUD operations |

## Gotchas

1. **Strategy Registration**: All `@Service` implementations auto-registered via Spring Map injection
2. **Circular Dependencies**: Watch for circular refs between services - use `@Lazy` if needed
3. **Transaction Boundaries**: Service methods are transactional by default (`@Transactional`)
4. **Async Operations**: Some services use `@Async` - do not block on async results
