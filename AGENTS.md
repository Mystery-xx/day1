# AGENTS.md - AI Chat Repository

## Project Overview

AI Chat web application with Spring Boot backend + React/Vite frontend, connecting to OpenAI-compatible AI API.

## Quick Start (Docker Only)

**IMPORTANT**: This application is designed to run in Docker containers. Local development is not recommended due to network configuration complexity.

### Default Deployment (Port 8082)

```bash
# 1. Copy environment configuration
cp .env.example .env

# 2. Edit .env and set your API key
# AI_API_KEY=your-api-key-here

# 3. Build and start containers
docker-compose up --build

# 4. Open http://localhost:5173 in your browser
```

### Alternative Deployment (Port 8081)

```bash
# 1. Copy environment configuration for port 8081
cp .env-8081 .env

# 2. Edit .env and configure API settings

# 3. Build and start containers
docker-compose -f docker-compose-8081.yml up --build

# 4. Open http://localhost:8086 in your browser
#    Backend API: http://localhost:8081
```

To stop:
```bash
docker-compose down
# or for port 8081:
docker-compose -f docker-compose-8081.yml down
```

## Architecture

```
Browser (:5173 or :8086) → React → Vite proxy /api → Spring Boot (:8082 or :8081) → AI API
```

- **Backend**: Spring Boot 3.2, Java 17, WebClient (reactive)
- **Frontend**: React 18, Vite 5, no specialized AI libraries
- **AI Integration**: OpenAI-compatible REST API via `/api/chat`

## Key Files

| Path | Purpose |
|------|---------|
| `ai-chat-backend/src/main/java/com/aichat/` | Backend source |
| `ai-chat-frontend/src/` | Frontend source |
| `ai-chat-backend/src/main/resources/application.yml` | Backend config |
| `ai-chat-frontend/vite.config.js` | Vite proxy config |
| `docker-compose.yml` | Docker orchestration (port 8082) |
| `docker-compose-8081.yml` | Docker orchestration (port 8081) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_API_KEY` | (required) | API key for AI endpoint |
| `AI_API_URL` | (required) | AI API base URL |
| `AI_MODEL` | (required) | Model name |
| `AI_PROVIDER` | `gpustack` | AI provider (gpustack, huggingface, etc.) |
| `SERVER_PORT` | `8082` | Backend server port |
| `GPUSTACK_API_URL` | (optional) | GPUStack-specific API URL |
| `HUGGINGFACE_API_URL` | (optional) | HuggingFace API URL |
| `HUGGINGFACE_TOKEN` | (optional) | HuggingFace token |

## API Endpoints

### Chat API
- `POST /api/chat` - Send message, receive AI response
- `GET /api/chat/health` - Health check

### MCP API (Model Context Protocol)
- `GET /api/mcp/servers` - List configured MCP servers
- `POST /api/mcp/servers` - Add new MCP server
- `PUT /api/mcp/servers/{id}` - Update MCP server
- `DELETE /api/mcp/servers/{id}` - Delete MCP server
- `POST /api/mcp/servers/{id}/connect` - Connect to MCP server
- `POST /api/mcp/servers/{id}/disconnect` - Disconnect from MCP server
- `GET /api/mcp/servers/{id}/tools` - List available tools from connected server

## MCP Integration

The application supports MCP (Model Context Protocol) for tool calling:

### Features
- **Backend proxy pattern** - Frontend never connects directly to MCP servers
- **Single active server** (v1) - Simplifies state management
- **H2 persistence** - Server configs stored in database
- **Streamable HTTP transport** - Spring AI MCP SDK
- **Full tool calling cycle** - AI receives tools → calls tool → backend executes via MCP → returns result → AI gives final answer

### MCP Server Configuration
```json
{
  "name": "weather-server",
  "url": "http://host.docker.internal:8080/mcp",
  "transportType": "HTTP"
}
```

### Tool Calling Flow
1. User asks question (e.g., "What's the weather in Moscow?")
2. Backend sends tool definitions to AI along with the query
3. AI decides to call a tool and returns tool_call request
4. Backend executes tool via MCP client
5. Tool result is sent back to AI
6. AI provides final answer using tool result

### Logging
MCP operations are logged with detailed request/response information:
```
>>> MCP REQUEST [initialize] to server 5 at http://...
<<< MCP RESPONSE [initialize] from server 5 - SUCCESS
>>> MCP TOOL CALL [get_current_weather] on server local-mcp (id=5)
>>> MCP REQUEST [callTool] to server 5...
<<< MCP RESPONSE [callTool]... success=true
<<< MCP TOOL RESULT [get_current_weather] - success=true
```

## Build Notes

- Backend: Multi-stage Docker (Maven build → JRE runtime)
- Frontend: Multi-stage Docker (Node build → Nginx serving static files)
- Model: Configured via `AI_MODEL` environment variable

## Docker Compose Files

### docker-compose.yml (Default - Port 8082)
- Backend: Port 8082
- Frontend: Port 5173
- Network: ai-chat-network
- Volume: h2-data

### docker-compose-8081.yml (Alternative - Port 8081)
- Backend: Port 8081
- Frontend: Port 8086
- Network: ai-chat-network-8081
- Volume: h2-data-8081

## Gotchas

1. **CORS**: Backend allows all origins (`@CrossOrigin("*")`) for dev
2. **Proxy**: Vite proxies `/api` to `localhost:8082` in dev mode
3. **Docker networking**: Frontend uses nginx to proxy `/api` to backend service
4. **No tests**: Project has no test suite configured
5. **In-memory only**: No database, chat history stored in browser session
6. **Port conflicts**: Use different docker-compose files for different ports
7. **MCP server access**: From Docker, use `host.docker.internal` to access host machine

## AI Agent Instructions

**MANDATORY: After ANY code change, rebuild and redeploy Docker containers:**

```bash
docker-compose up --build
# or for port 8081:
docker-compose -f docker-compose-8081.yml up --build
```

This is required because:
- The application runs exclusively in Docker containers
- Local file changes are NOT hot-reloaded into running containers
- Both frontend and backend must be rebuilt to pick up changes

**DO NOT** consider a task complete without rebuilding containers.
**DO NOT** expect changes to work without `docker-compose up --build`.

If only one service was modified, you can rebuild selectively:
```bash
# Frontend only
docker-compose build frontend && docker-compose up frontend

# Backend only
docker-compose build backend && docker-compose up backend
```

But full rebuild (`docker-compose up --build`) is recommended to ensure consistency.

## Project Structure

```
day1/
├── ai-chat-backend/          # Spring Boot backend
│   ├── src/main/java/com/aichat/
│   │   ├── controller/       # REST controllers
│   │   ├── service/          # Business logic (8 sub-packages)
│   │   ├── entity/           # JPA entities
│   │   └── config/           # Configuration
│   ├── pom.xml               # Maven dependencies
│   └── Dockerfile
├── ai-chat-frontend/         # React frontend
│   ├── src/
│   │   ├── components/       # React components (includes rag/)
│   │   ├── hooks/            # Custom hooks
│   │   └── App.jsx           # Main application
│   ├── package.json          # NPM dependencies
│   └── Dockerfile
├── mcp-assistant/            # MCP SDK assistant (stdio transport)
│   └── src/                  # TypeScript, strict mode
├── docker-compose.yml        # Default deployment (8082)
├── docker-compose-8081.yml   # Alternative deployment (8081)
├── docker-compose-8085.yml   # Minimal deployment (8085)
├── .env.example              # Environment template
├── .env                      # Environment config (gitignored)
└── AGENTS.md                 # This file (root)

## Hierarchical AGENTS.md Files

This project uses hierarchical AGENTS.md files for domain-specific guidance:

| Location | Scope |
|----------|-------|
| `./AGENTS.md` | Root - Docker orchestration, multi-module overview |
| `ai-chat-backend/src/main/java/com/aichat/AGENTS.md` | Backend - Spring Boot patterns, package structure |
| `ai-chat-backend/src/main/java/com/aichat/service/AGENTS.md` | Service layer - 8 sub-packages, strategy patterns |
| `ai-chat-frontend/src/AGENTS.md` | Frontend - React 18, Vite, RAG components |
| `mcp-assistant/src/AGENTS.md` | MCP Assistant - MCP SDK, stdio transport |
```

## Branches

- `day16` - MCP integration with full tool calling support
- `day19` - Detailed MCP request/response logging

## Troubleshooting

### Backend won't start on port 8081
Check if SERVER_PORT environment variable is set:
```bash
docker-compose -f docker-compose-8081.yml config | grep SERVER_PORT
```

### MCP connection timeout
From Docker containers, use `host.docker.internal` instead of `localhost` or `127.0.0.1`.

### Tool calling not working
1. Ensure MCP server is connected: `GET /api/mcp/servers/{id}/tools`
2. Check backend logs: `docker logs ai-chat-backend-8081 | grep "MCP"`
3. Verify AI model supports tool calling (qwen3.6-27b works, qwen3.5-397b-a17b may loop)

### Frontend can't connect to backend
Verify nginx proxy configuration in `ai-chat-frontend/nginx.conf` points to correct backend URL.
