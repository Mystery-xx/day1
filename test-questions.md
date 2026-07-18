# Control Questions for RAG Testing

## Question 1: MCP Server Configuration
**Вопрос**: Какие три обязательных поля требуются для настройки MCP сервера?

**Ожидаемый ответ**:
- name (человекочитаемый идентификатор сервера)
- url (полный URL к MCP endpoint)
- transportType (HTTP или STDIO)

**Ожидаемые источники**:
- 02-mcp-setup-guide.md (раздел MCP Server Configuration)

**Сложность**: easy

---

## Question 2: RAG Chunking Strategies
**Вопрос**: Какие две стратегии чанкинга документов поддерживает RAG система и в чём их разница?

**Ожидаемый ответ**:
- SEMANTIC: разбивка по семантическим границам (абзацы, заголовки), сохраняет контекстную когерентность
- FIXED_SIZE: разбивка на фиксированные чанки по 512 токенов с перекрытием 50 токенов

**Ожидаемые источники**:
- 06-rag-architecture.md (раздел Chunking Strategies)
- 03-api-reference.md (RAG Endpoints)

**Сложность**: medium

---

## Question 3: Docker Port Mapping
**Вопрос**: Какие порты используются в стандартной конфигурации docker-compose.yml для backend и frontend?

**Ожидаемый ответ**:
- Backend: порт 8082 (контейнер) → 8082 (хост)
- Frontend: порт 80 (контейнер) → 5173 (хост)
- Network: ai-chat-network

**Ожидаемые источники**:
- 05-docker-deployment.md (раздел Default Deployment)
- docker-compose.yml

**Сложность**: easy

---

## Question 4: Required Environment Variables
**Вопрос**: Какие три переменные окружения являются обязательными для запуска приложения?

**Ожидаемый ответ**:
- AI_API_KEY (required) - API ключ для аутентификации
- AI_API_URL (required) - базовый URL ИИ API
- AI_MODEL (required) - идентификатор модели

**Ожидаемые источники**:
- 04-environment-variables.md (раздел Required Variables)

**Сложность**: easy

---

## Question 5: Context Management Strategies
**Вопрос**: Какие три стратегии управления контекстом реализованы в AI Chat?

**Ожидаемый ответ**:
- Sliding Window: только последние N сообщений (default: 20 сообщений, 4000 токенов)
- Sticky Facts: важные факты как system message (предпочтения пользователя, ключевые решения)
- Summary: конденсация старых сообщений в краткое резюме через AI

**Ожидаемые источники**:
- 07-context-strategies.md (разделы Sliding Window, Sticky Facts, Summary Strategy)

**Сложность**: medium

---

## Question 6: MCP Connection Troubleshooting
**Вопрос**: Что делать если MCP сервер не подключается из Docker контейнера?

**Ожидаемый ответ**:
- Использовать host.docker.internal вместо localhost в URL
- Для Docker на Linux добавить extra_hosts: host.docker.internal:host-gateway
- Проверить доступность: docker exec curl http://host.docker.internal:8080/mcp
- Проверить логи: docker logs ai-chat-backend | grep MCP

**Ожидаемые источники**:
- 08-troubleshooting.md (раздел MCP Connection Timeout)
- 02-mcp-setup-guide.md (Troubleshooting Tips)

**Сложность**: medium

---

## Question 7: Model Temperature Settings
**Вопрос**: Как влияет параметр temperature на генерацию и какие значения рекомендуются для code generation?

**Ожидаемый ответ**:
- Temperature контролирует случайность выбора токенов (0.0-2.0)
- Низкие значения (0.2-0.4): детерминированные, точные ответы
- Для code generation рекомендуется: 0.2-0.4 (синтаксически корректный код)
- Default: 0.7

**Ожидаемые источники**:
- 09-model-settings.md (раздел Temperature, Recommended Configurations)

**Сложность**: medium

---

## Question 8: API Key Security
**Вопрос**: Как обеспечивается безопасность API ключей в приложении?

**Ожидаемый ответ**:
- API ключи хранятся в .env файле (добавлен в .gitignore)
- Передаются через Docker Compose environment variables
- Backend использует Bearer authentication в заголовках
- .env файл должен иметь права chmod 600
- Ключи не должны коммититься в git

**Ожидаемые источники**:
- 10-security-guide.md (раздел API Key Management)
- 04-environment-variables.md

**Сложность**: medium

---

## Question 9: Chat API Endpoints
**Вопрос**: Какие endpoints доступны для работы с чатом и какие HTTP методы используются?

**Ожидаемый ответ**:
- POST /api/chat - отправить сообщение, получить ответ (поддерживает streaming)
- GET /api/chat/health - health check endpoint
- Query параметр stream=true/false для включения streaming

**Ожидаемые источники**:
- 03-api-reference.md (раздел Chat Endpoints)

**Сложность**: easy

---

## Question 10: Vector Storage Architecture
**Вопрос**: Как работает векторное хранилище в RAG системе и где хранятся данные?

**Ожидаемый ответ**:
- In-memory векторный индекс с HNSW-inspired организацией
- Cosine similarity для поиска релевантных чанков
- Persistence в /data/rag-index/vectors.dat (бинарная сериализация)
- Автоматическое сохранение после каждой индексации
- Загрузка при старте приложения если файл существует

**Ожидаемые источники**:
- 06-rag-architecture.md (разделы VectorStorageService, Similarity Search, Persistence)

**Сложность**: hard

---
