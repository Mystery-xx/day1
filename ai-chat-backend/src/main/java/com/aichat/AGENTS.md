# AGENTS.md - Backend

## Package Structure

```
com.aichat/
├── AiChatApplication.java      # @SpringBootApplication + @EnableAspectJAutoProxy
├── controller/                  # REST controllers (@RestController, @CrossOrigin("*"))
├── service/                     # Business logic (8 sub-packages)
├── entity/                      # JPA entities (@Entity, H2 persistence)
├── config/                      # Configuration (@Configuration, WebClient, MCP)
├── aspect/                      # Aspects (@Aspect, auto-extraction)
├── exception/                   # Exception handlers (@ControllerAdvice)
├── dto/                         # Data transfer objects (records)
└── util/                        # Utilities
```

## Patterns & Conventions

### Java Style
- **Classes**: PascalCase, descriptive names
- **Methods**: camelCase, verb-first for actions
- **Packages**: `com.aichat.{domain}`
- **Records**: Preferred for DTOs (immutable, concise)

### Spring Boot Patterns
- **Controllers**: `@RestController` + `@CrossOrigin("*")` for dev
- **Services**: `@Service` + interface-based strategy pattern
- **Config**: `@Configuration` + `@Bean` methods
- **Entities**: `@Entity` + JPA repositories
- **Aspects**: `@Aspect` for cross-cutting (auto-extraction)

### API Design
- **Endpoints**: `/api/{resource}/{action}` pattern
- **Errors**: Consistent JSON format `{error: "...", details: "..."}`
- **Reactive**: WebClient for external API calls (non-blocking)

## Service Layer (8 Sub-Packages)

The `service/` directory has its own AGENTS.md with detailed patterns for:
- `chunking/` - Document chunking strategies
- `context/` - Context management
- `embedding/` - Embedding generation
- `extract/` - Task extraction
- `ollama/` - Ollama integration
- `rerank/` - Reranking logic
- `search/` - Search strategies
- `vector/` - Vector store operations

See `service/AGENTS.md` for service-layer specifics.

## MCP Integration

Backend proxies MCP connections (frontend never connects directly):
- **Transport**: Streamable HTTP (Spring AI MCP SDK)
- **Persistence**: H2 database for server configs
- **Flow**: AI → tool_call → MCP execute → result → AI answer
- **Docker**: Use `host.docker.internal` to access host MCP servers

## Anti-Patterns

### Deprecated Code
- **ChatController.java:528-571** - 3 endpoints with manual TaskState updates (superseded by auto-extraction aspect)
- **DO NOT** use these endpoints - they will be removed

### TODOs
- **RerankService.java:26** - Add caching for rerank queries

## Build & Run

```bash
# Backend only (dev)
mvn spring-boot:run

# Docker (production)
docker-compose build backend && docker-compose up backend
```

## Testing

No test suite configured. Add tests in `src/test/java/com/aichat/` following same package structure.

## Key Files

| File | Purpose |
|------|---------|
| `AiChatApplication.java` | Entry point |
| `controller/ChatController.java` | Main REST API |
| `service/**` | Business logic (8 sub-packages) |
| `config/WebClientConfig.java` | Reactive HTTP client |
| `config/McpServerConfig.java` | MCP configuration |

## Gotchas

1. **CORS**: Allows all origins for dev - restrict in production
2. **H2 Database**: In-memory by default, file-backed for MCP configs
3. **WebClient**: Reactive, non-blocking - do not mix with RestTemplate
4. **Docker networking**: Use `host.docker.internal` for host access from containers
