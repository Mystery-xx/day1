# AI Chat Application

AI-powered chat application with Spring Boot backend and React frontend, featuring task orchestration, working memory, multi-provider AI support (GPUStack/HuggingFace), and developer profiles.

## ⚠️ Docker-Only Deployment

**This application is designed to run EXCLUSIVELY in Docker containers.**

Local development (npm/mvn) is **NOT recommended** due to:
- Complex proxying requirements between frontend and backend
- CORS configuration complexity across environments
- API key management challenges in local environments
- Network configuration differences between Docker and localhost

**Use Docker for all development and production scenarios.**

## Quick Start

```bash
# 1. Copy environment configuration
cp .env.example .env

# 2. Edit .env and set your values
# AI_API_KEY=your-api-key-here
# AI_API_URL=https://your-ai-api.com/v1
# AI_MODEL=qwen3.5-397b-a17b

# 3. Build and start containers
docker-compose up --build

# 4. Open http://localhost:80 in your browser
```

To stop:
```bash
docker-compose down
```

To stop and remove all data:
```bash
docker-compose down -v
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Browser    │────▶│   Frontend   │────▶│   Backend    │
│             │     │   (Nginx)    │     │ (Spring Boot)│
│             │     │   :80        │     │   :8080      │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │   AI API     │
                                         │ (GPUStack/   │
                                         │  HuggingFace)│
                                         └──────────────┘
```

### Technology Stack

**Backend:**
- Spring Boot 3.2, Java 17
- WebFlux + WebClient (reactive HTTP client)
- Spring Data JPA + Hibernate
- H2 Database (embedded), PostgreSQL, SQLite (multi-datasource)
- Flyway (database migrations)
- Caffeine (caching)
- Maven (build tool)
- Spring Boot Actuator (health checks)

**Frontend:**
- React 18 + Vite 5
- Pure CSS (no frameworks)
- react-markdown (Markdown rendering)
- recharts (data visualization)
- Nginx (production server)

**Docker:**
- Multi-stage builds for both services
- Docker Compose for orchestration
- Network isolation between services

## Project Structure

```
ai-chat/
├── ai-chat-backend/           # Spring Boot backend
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/aichat/
│       │   ├── AiChatApplication.java
│       │   ├── config/
│       │   │   ├── AiChatProperties.java
│       │   │   ├── WebConfig.java
│       │   │   ├── CacheConfig.java
│       │   │   └── JacksonConfig.java
│       │   ├── controller/
│       │   │   ├── ChatController.java
│       │   │   └── UserProfileController.java
│       │   ├── service/
│       │   │   ├── AiChatService.java
│       │   │   ├── TaskOrchestrator.java
│       │   │   ├── ChatHistoryService.java
│       │   │   ├── StickyFactService.java
│       │   │   ├── FactExtractionService.java
│       │   │   ├── UserProfileService.java
│       │   │   └── MemoryService.java
│       │   ├── agent/
│       │   │   ├── TaskAgent.java
│       │   │   ├── AbstractAgent.java
│       │   │   ├── AgentFactory.java
│       │   │   ├── PlanningAgent.java
│       │   │   ├── ExecutionAgent.java
│       │   │   ├── ValidationAgent.java
│       │   │   └── DoneAgent.java
│       │   ├── context/
│       │   │   ├── ContextStrategy.java
│       │   │   ├── ContextStrategyFactory.java
│       │   │   ├── SummaryContextStrategy.java
│       │   │   ├── StickyFactsContextStrategy.java
│       │   │   └── SlidingWindowContextStrategy.java
│       │   ├── strategy/
│       │   │   ├── TransitionStrategy.java
│       │   │   └── AiTransitionStrategy.java
│       │   ├── entity/
│       │   │   ├── ChatSession.java
│       │   │   ├── ChatMessage.java
│       │   │   ├── StickyFact.java
│       │   │   ├── TaskContextEntity.java
│       │   │   ├── UserProfile.java
│       │   │   ├── User.java
│       │   │   ├── ArchitecturalDecision.java
│       │   │   ├── DomainKnowledge.java
│       │   │   └── ProjectConstraint.java
│       │   ├── repository/
│       │   │   └── (9 Spring Data JPA repositories)
│       │   ├── dto/
│       │   │   └── (20+ DTO classes)
│       │   ├── enums/
│       │   │   └── TaskState.java
│       │   ├── builder/
│       │   │   └── PromptBuilder.java
│       │   └── listener/
│       │       └── TaskStateEventListener.java
│       └── resources/
│           ├── application.yml
│           └── db/migration/
│               ├── V1__initial_schema.sql
│               └── V2__update_task_context.sql
│
├── ai-chat-frontend/          # React frontend
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── components/
│       │   ├── Message.jsx
│       │   ├── SessionList.jsx
│       │   ├── DebugPanel.jsx
│       │   ├── StatePanel.jsx
│       │   └── SettingsPanel.jsx
│       └── hooks/
│           ├── useSession.js
│           ├── useChatHistory.js
│           └── useSessionList.js
│
├── e2e/                       # Playwright E2E tests
│   └── user-profile-qa.spec.ts
├── docker-compose.yml
├── .env.example
├── README.md
├── README.Docker.md
└── AGENTS.md
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_API_KEY` | (required) | API key for AI endpoint |
| `AI_API_URL` | (required) | AI API base URL |
| `AI_MODEL` | (required) | Model name |
| `AI_PROVIDER` | `gpustack` | Provider: `gpustack` or `huggingface` |
| `GPUSTACK_API_URL` | - | GPUStack API URL (optional) |
| `HUGGINGFACE_API_URL` | `https://router.huggingface.co/v1` | HuggingFace API URL |
| `HUGGINGFACE_TOKEN` | (required for HF) | HuggingFace token |
| `AI_TEMPERATURE` | `0.7` | Generation temperature |
| `AI_MAX_TOKENS` | `1024` | Maximum tokens in response |
| `AI_TOP_P` | `1.0` | Top P sampling |
| `AI_FREQUENCY_PENALTY` | `0.0` | Frequency penalty |
| `AI_PRESENCE_PENALTY` | `0.0` | Presence penalty |
| `AI_STOP` | - | Stop sequences (comma-separated) |
| `AI_HISTORY_LIMIT` | `10` | Number of messages in sliding window |
| `DOCKER_FRONTEND_PORT` | `5173` | Frontend dev port (optional) |
| `DOCKER_BACKEND_PORT` | `8080` | Backend port (optional) |

## Key Features

### 🎯 AI Chat

- **SSE Streaming** - Real-time response streaming
- **Markdown Rendering** - Formatted responses via react-markdown
- **Dialog History** - Context preservation within sessions
- **Branching** - Create new session from existing one up to specified message
- **Session Duplication** - Copy entire sessions (up to 3 copies)

### 🧠 Memory Management

**Three memory levels:**

1. **Long-term Memory**
   - Developer profiles with communication style settings
   - Prompt templates for different roles
   - Persisted across sessions

2. **Working Memory**
   - Sticky Facts - key facts from dialog
   - Automatic extraction after N messages
   - Manual fact addition/removal
   - Throttling to prevent excessive extraction

3. **Short-term Memory**
   - Last 10 dialog messages
   - Used for context during response generation

### 📊 Context Management Strategies

Three strategies for different scenarios:

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| **Summary** | Automatic summarization of old messages | Long dialogs, token savings |
| **Sticky Facts** | Context based on key facts | When specific details matter |
| **Sliding Window** | Fixed window of recent messages | Short dialogs, simple mode |

### 🤖 State Machine (Task Orchestration)

Automated task orchestration via state machine:

**4 states:**
- 🟡 **PLANNING** - Task planning
- 🔵 **EXECUTION** - Plan execution
- 🟠 **VALIDATION** - Result validation
- 🟢 **DONE** - Task completed

**Agents:**
- **PlanningAgent** - Generates plan, awaits confirmation
- **ExecutionAgent** - Implements approved plan
- **ValidationAgent** - Validates result, identifies issues
- **DoneAgent** - Handles completed tasks

**Transitions:**
- PLANNING → EXECUTION (after plan approval)
- EXECUTION → VALIDATION (after implementation)
- VALIDATION → EXECUTION (rework) | DONE (success) | PLANNING (new requirements)
- DONE → PLANNING (new iteration)

### ⚙️ Model Settings

- **Multi-provider**: GPUStack (default), HuggingFace
- **Model Selection**: Automatic loading of available models
- **Model Categorization**:
  - **super**: 300B+ parameters (qwen3.5-397b, qwen3-235b)
  - **strong**: 70B-100B (qwen2.5-72b, llama-3-70b)
  - **medium**: 13B-32B
  - **weak**: <8B (qwen2.5-0.5b, phi-2)
- **Generation Parameters**:
  - Temperature
  - Max tokens
  - Top P
  - Frequency penalty
  - Presence penalty
  - Stop sequences

### 🐛 Debug Panel

- View all 3 memory levels
- Raw JSON API requests/responses
- Summarization debugging
- Token usage information

## API Endpoints

### Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/stream` | POST | AI response streaming (SSE) |
| `/api/chat` | POST | Send message, get AI response |
| `/api/chat/health` | GET | Health check |
| `/api/chat/models` | GET | List available models |

### Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/sessions` | GET | List all sessions (with pagination) |
| `/api/chat/sessions` | DELETE | Delete all sessions |
| `/api/chat/history/session` | POST | Create new session |
| `/api/chat/sessions/{sessionId}` | DELETE | Delete specific session |
| `/api/chat/sessions/{sessionId}/duplicate` | POST | Duplicate session (param: `count`) |
| `/api/chat/sessions/{sessionId}/branch` | POST | Create session branch up to message (param: `messageIndex`) |
| `/api/chat/sessions/{sessionId}/summary` | DELETE | Delete session summarization |

### Message History

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/history/{sessionId}` | GET | Get session message history |
| `/api/chat/history/{sessionId}` | DELETE | Delete session message history |

### Sticky Facts (Working Memory)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/sessions/{sessionId}/sticky-facts` | GET | Get session facts list |
| `/api/chat/sessions/{sessionId}/sticky-facts` | POST | Add new fact (body: `{factKey, factValue}`) |
| `/api/chat/sessions/{sessionId}/sticky-facts/{factKey}` | DELETE | Delete specific fact |
| `/api/chat/sessions/{sessionId}/sticky-facts` | DELETE | Delete all session facts |
| `/api/chat/sessions/{sessionId}/extract-facts` | POST | Manual fact extraction (body: `{model, provider}` - optional) |

### State Machine

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/sessions/{sessionId}/state` | GET | Get current task state |

### Developer Profiles

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/profiles` | GET | List all profiles |
| `/api/chat/profiles/{id}` | GET | Get profile by ID |
| `/api/chat/profiles/{id}/activate` | POST | Activate profile |
| `/api/chat/profiles/active` | GET | Get active profile |

## Database

### Tables

| Table | Description |
|-------|-------------|
| `chat_session` | Chat sessions with state machine state |
| `chat_message` | Message history with metadata |
| `sticky_fact` | Working memory (session facts) |
| `task_context` | State machine context (plan, execution, validation) |
| `user_profile` | Developer profiles (long-term memory) |
| `user` | User entities |
| `architectural_decision` | Architectural decisions |
| `domain_knowledge` | Domain knowledge |
| `project_constraint` | Project constraints |

### Supported Databases

- **H2** (default) - embedded, file `/data/chatdb`
- **PostgreSQL** - for long-term memory
- **SQLite** - for working memory

Migrations handled via Flyway.

## Troubleshooting

### View Logs

```bash
# All logs
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend
```

### 500 Internal Server Error

**Cause**: CORS configuration error or AI API issues.

**Solution**:
1. Check backend logs: `docker logs ai-chat-backend`
2. Verify API key is correct in `.env`
3. Check AI API availability: `curl $AI_API_URL/models`

### 503 Service Unavailable

**Cause**: Backend unavailable or AI API request timeout.

**Solution**:
1. Verify backend is running: `docker ps | grep backend`
2. Check logs for timeouts
3. Increase timeout in `application.yml` if AI API responds slowly

### Cannot Connect to Backend

**Cause**: Frontend in Docker cannot reach backend.

**Solution**:
1. Verify both containers are on same network: `docker network inspect demo_ai-chat-network`
2. Check backend is listening on `0.0.0.0:8080`
3. Restart containers: `docker-compose restart`

### Port Issues

**Frontend unavailable on port 80**:
- Check if port 80 is busy: `docker ps | grep :80`
- Change port in `docker-compose.yml`: `ports: - "8080:80"`

**Backend unavailable on port 8081**:
- Check logs: `docker logs ai-chat-backend`
- Verify `application.yml` is configured for port 8080

## Development

### Making Code Changes

**IMPORTANT**: After ANY code change, rebuild containers:

```bash
docker-compose up --build
```

Reasons:
- Application runs EXCLUSIVELY in Docker containers
- Local file changes are NOT hot-reloaded
- Both services must be rebuilt to apply changes

### Selective Rebuild

If only one service is modified:

```bash
# Frontend only
docker-compose build ai-chat-frontend && docker-compose up ai-chat-frontend

# Backend only
docker-compose build ai-chat-backend && docker-compose up ai-chat-backend
```

But full rebuild (`docker-compose up --build`) is recommended for consistency.

### E2E Tests

Project uses Playwright for E2E testing:

```bash
# Run tests
npx playwright test

# Run with UI
npx playwright test --ui

# Show report
npx playwright show-report
```

## License

ISC
