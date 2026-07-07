# AI Chat Application

Интерактивный чат с ИИ-моделями через OpenAI-совместимый API с поддержкой MCP (Model Context Protocol) для вызова инструментов.

## Возможности

- 💬 **Чат с ИИ** - Общение с языковыми моделями через веб-интерфейс
- 🛠️ **MCP Integration** - Автоматический вызов инструментов через MCP серверы
- 🔄 **Tool Calling** - Полная поддержка цикла: запрос → инструмент → результат → ответ
- 📊 **Детальное логирование** - Полные логи MCP запросов и ответов
- 🐳 **Docker First** - Развёртывание в контейнерах без локальных зависимостей

## Быстрый старт

### Порт 8082 (по умолчанию)

```bash
# Копируем конфигурацию
cp .env.example .env

# Редактируем .env - устанавливаем API ключ
# AI_API_KEY=your-api-key-here

# Запускаем
docker-compose up --build

# Открываем http://localhost:5173
```

### Порт 8081 (альтернативный)

```bash
# Копируем конфигурацию для порта 8081
cp .env-8081 .env

# Запускаем
docker-compose -f docker-compose-8081.yml up --build

# Открываем http://localhost:8086
```

## Архитектура

```
┌─────────────┐     ┌──────────┐     ┌─────────────┐     ┌─────────┐
│   Browser   │────▶│  React   │────▶│ Spring Boot │────▶│  AI API │
│  :5173/:8086│     │  :80     │     │  :8082/:8081│     │         │
└─────────────┘     └──────────┘     └─────────────┘     └─────────┘
                          │                │
                          └──────┬─────────┘
                                 │
                          ┌──────▼──────┐
                          │  MCP Server │
                          │  (external) │
                          └─────────────┘
```

### Технологический стек

**Backend:**
- Spring Boot 3.2
- Java 17
- Spring WebFlux (Reactive WebClient)
- Spring AI MCP SDK
- H2 Database (embedded)
- Lombok

**Frontend:**
- React 18
- Vite 5
- MCP SDK (@modelcontextprotocol/sdk)
- Axios

**Infrastructure:**
- Docker & Docker Compose
- Nginx (frontend serving)
- Multi-stage builds

## MCP Integration

### Что такое MCP?

MCP (Model Context Protocol) - протокол для вызова внешних инструментов ИИ-моделями.

### Как работает

1. Пользователь задаёт вопрос ("Какая погода в Москве?")
2. Backend отправляет определения инструментов ИИ
3. ИИ решает вызвать инструмент и возвращает tool_call
4. Backend выполняет инструмент через MCP клиент
5. Результат отправляется обратно ИИ
6. ИИ даёт финальный ответ с учётом данных инструмента

### Настройка MCP сервера

Через UI (Settings → MCP Servers):
- **Name**: weather-server
- **URL**: http://host.docker.internal:8080/mcp
- **Transport**: HTTP

Через API:
```bash
curl -X POST http://localhost:8082/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "weather-server",
    "url": "http://host.docker.internal:8080/mcp",
    "transportType": "HTTP"
  }'
```

### Логирование MCP

Полные логи всех операций:
```
>>> MCP REQUEST [initialize] to server 5 at http://...
<<< MCP RESPONSE [initialize] from server 5 - SUCCESS
>>> MCP REQUEST [listTools] to server 5 at http://...
<<< MCP RESPONSE [listTools] from server 5 - 4 tools
>>> MCP TOOL CALL [get_current_weather] on server local-mcp (id=5)
>>> MCP REQUEST [callTool] to server 5...
<<< MCP RESPONSE [callTool]... success=true
<<< MCP TOOL RESULT [get_current_weather] - success=true
```

Просмотр логов:
```bash
docker logs ai-chat-backend --tail 50 | grep -E ">>>|<<<|MCP"
```

## API Reference

### Chat API

**POST /api/chat**
```json
{
  "message": "Какая погода в Москве?",
  "modelSettings": {
    "model": "default-chat"
  }
}
```

**GET /api/chat/health**
```
OK
```

### MCP API

**GET /api/mcp/servers** - Список серверов
**POST /api/mcp/servers** - Добавить сервер
**PUT /api/mcp/servers/{id}** - Обновить сервер
**DELETE /api/mcp/servers/{id}** - Удалить сервер
**POST /api/mcp/servers/{id}/connect** - Подключиться
**POST /api/mcp/servers/{id}/disconnect** - Отключиться
**GET /api/mcp/servers/{id}/tools** - Список инструментов

### RAG Indexing API

#### POST /api/rag/upload

Upload a document for indexing.

**Request:**
- `file`: multipart file (.txt or .md, max 10MB)
- `strategy`: chunking strategy (SEMANTIC or FIXED_SIZE, default: SEMANTIC)

**curl:**
```bash
curl -X POST http://localhost:8082/api/rag/upload \
  -F "file=@document.md" \
  -F "strategy=SEMANTIC"
```

**Response:**
```json
{
  "documentId": "test-1234567890",
  "chunkCount": 5,
  "strategy": "SEMANTIC",
  "status": "SUCCESS"
}
```

**Error Response:**
```json
{
  "status": "FAILED",
  "errorMessage": "File size exceeds 10MB limit"
}
```

#### GET /api/rag/search

Search indexed documents.

**Request:**
- `query`: search query (required)
- `topK`: number of results (default: 10)

**curl:**
```bash
curl "http://localhost:8082/api/rag/search?query=weather+api&topK=5"
```

**Response:**
```json
{
  "query": "weather api",
  "topK": 5,
  "results": [
    {
      "chunkId": "test.md-0",
      "content": "chunk content...",
      "similarity": 0.95,
      "metadata": {
        "source": "test.md",
        "title": "Weather API Documentation",
        "section": "Introduction"
      }
    }
  ]
}
```

#### GET /api/rag/search/enhanced

Enhanced RAG search with optional reranking and query rewriting for improved result quality.

**Flow:** rewrite query → embed → vector search (top 20) → rerank → filter by threshold → take top 5

**Request:**
- `query`: search query (required)
- `topK`: number of results to return (default: 5)
- `rerank`: enable reranking (default: false)
- `threshold`: reranking score threshold for filtering (default: 0.5)
- `rewrite`: enable query rewriting (default: false)

**curl - Basic search with reranking:**
```bash
curl "http://localhost:8082/api/rag/search/enhanced?query=machine+learning&rerank=true&threshold=0.7"
```

**curl - Disable reranking:**
```bash
curl "http://localhost:8082/api/rag/search/enhanced?query=machine+learning&rerank=false"
```

**curl - Query rewriting enabled:**
```bash
curl "http://localhost:8082/api/rag/search/enhanced?query=rag+pipeline&rewrite=true"
```

**Response:**
```json
{
  "context": "Use the following context from the knowledge base:\n\n...",
  "sources": [
    {
      "source": "ml.md",
      "title": "Machine Learning",
      "section": "Introduction",
      "similarity": 0.92
    }
  ],
  "rerankScores": [0.95, 0.87, 0.76],
  "queryWasRewritten": true
}
```

**Response Fields:**
- `context`: Formatted context string for RAG prompts
- `sources`: List of source documents with metadata
- `rerankScores`: Array of reranking scores for each result (null if rerank disabled)
- `queryWasRewritten`: Boolean indicating if query was successfully rewritten

**Error Response:**
```json
{
  "error": "Query parameter is required"
}
```

#### DELETE /api/rag/documents/{source}

Delete indexed document.

**curl:**
```bash
curl -X DELETE http://localhost:8082/api/rag/documents/test.md
```

**Response:**
```json
{
  "deleted": true,
  "chunksDeleted": 5
}
```

**Error Response:**
```json
{
  "error": "Document not found: test.md"
}
```

### Ollama Setup

1. Install Ollama: https://ollama.ai
2. Pull model: `ollama pull nomic-embed-text`
3. Start Ollama: `ollama serve`

### TEI Reranker Setup

TEI (Text Embeddings Inference) provides reranking for improved search relevance.

**Docker Compose (included):**
```yaml
services:
  tei-reranker:
    image: ghcr.io/huggingface/text-embeddings-inference:cpu-1.6
    container_name: tei-reranker
    ports:
      - "8099:80"
    volumes:
      - ./models:/data
    command: --model-id BAAI/bge-reranker-v2-m3
    networks:
      - ai-chat-network
```

**Start TEI:**
```bash
docker-compose up tei-reranker
```

**Verify:**
```bash
curl http://localhost:8099/health
```

**Note:** First startup takes 30-60 seconds to download the model.

### Chunking Strategies

- **SEMANTIC**: Splits by Markdown headers, preserves structure, max 1000 tokens per section
- **FIXED_SIZE**: Splits into fixed 500-word chunks with 50-word overlap

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `AI_API_KEY` | (required) | API ключ для ИИ |
| `AI_API_URL` | (required) | Базовый URL ИИ API |
| `AI_MODEL` | (required) | Название модели |
| `AI_PROVIDER` | `gpustack` | Провайдер (gpustack, huggingface) |
| `SERVER_PORT` | `8082` | Порт backend сервера |
| `GPUSTACK_API_URL` | (optional) | URL GPUStack API |
| `HUGGINGFACE_API_URL` | (optional) | URL HuggingFace API |
| `HUGGINGFACE_TOKEN` | (optional) | Токен HuggingFace |
| `TEI_RERANKER_URL` | `http://tei-reranker:80` | URL TEI reranker service |
| `RAG_RERANK_ENABLED` | `false` | Enable RAG reranking |
| `RAG_RERANK_TOP_K_BEFORE` | `20` | Documents to fetch before reranking |
| `RAG_RERANK_TOP_K_AFTER` | `10` | Documents to return after reranking |
| `RAG_RERANK_THRESHOLD` | `0.5` | Reranking score threshold |
| `RAG_QUERY_REWRITE_ENABLED` | `true` | Enable query rewriting |
| `RAG_QUERY_REWRITE_MODEL` | `default-chat` | Model for query rewriting |
| `RAG_QUERY_REWRITE_TIMEOUT` | `2` | Query rewrite timeout (seconds) |

## Структура проекта

```
day1/
├── ai-chat-backend/
│   ├── src/main/java/com/aichat/
│   │   ├── controller/
│   │   │   ├── ChatController.java
│   │   │   └── McpController.java
│   │   ├── service/
│   │   │   ├── AiChatService.java
│   │   │   ├── McpClientService.java
│   │   │   └── McpSessionClient.java
│   │   └── entity/
│   │       └── McpServerConfig.java
│   ├── pom.xml
│   └── Dockerfile
├── ai-chat-frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SettingsPanel.jsx
│   │   │   └── ToolCallDisplay.jsx
│   │   └── hooks/
│   │       └── useMcp.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose-8081.yml
├── .env.example
├── .env-8081
├── AGENTS.md
└── README.md
```

## Ветки

- `main` - Основная ветка
- `day16` - MCP интеграция с полной поддержкой tool calling
- `day19` - Детальное логирование MCP запросов/ответов

## Troubleshooting

### Backend не запускается на порту 8081
Проверьте SERVER_PORT в docker-compose-8081.yml:
```bash
docker-compose -f docker-compose-8081.yml config | grep SERVER_PORT
```

### Таймаут подключения к MCP
Из Docker используйте `host.docker.internal` вместо `localhost`:
```json
{
  "url": "http://host.docker.internal:8080/mcp"
}
```

### Tool calling не работает
1. Проверьте подключение: `GET /api/mcp/servers/{id}/tools`
2. Проверьте логи: `docker logs ai-chat-backend | grep "MCP"`
3. Убедитесь что модель поддерживает tool calling (qwen3.6-27b работает)

### Frontend не подключается к backend
Проверьте nginx конфигурацию в `ai-chat-frontend/nginx.conf`

### Reranking не работает

1. **Проверьте TEI контейнер:**
   ```bash
   docker ps | grep tei-reranker
   docker logs tei-reranker --tail 20
   ```

2. **Проверьте health endpoint:**
   ```bash
   curl http://localhost:8082/api/rag/health
   ```
   Ожидается: `{"rerankerStatus":"UP","message":"TEI reranker service is healthy"}`

3. **Проверьте переменную окружения:**
   ```bash
   docker-compose config | grep TEI_RERANKER_URL
   ```
   Ожидается: `TEI_RERANKER_URL=http://tei-reranker:80`

4. **Подождите загрузки модели:**
   При первом запуске TEI загружает модель (30-60 секунд). Проверьте логи:
   ```bash
   docker logs tei-reranker | grep "Ready"
   ```

5. **Проверьте логи backend:**
   ```bash
   docker logs ai-chat-backend | grep -E "Rerank|TEI"
   ```

## Разработка

### Внесение изменений

```bash
# 1. Редактируем код
# 2. Пересобираем контейнеры
docker-compose up --build

# 3. Проверяем
curl http://localhost:8082/api/chat/health
```

### Селективная пересборка

```bash
# Только frontend
docker-compose build frontend && docker-compose up frontend

# Только backend
docker-compose build backend && docker-compose up backend
```

## Лицензия

MIT
