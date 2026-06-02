# AGENTS.md - AI Chat Repository

## Project Overview

AI Chat web application with Spring Boot backend + React/Vite frontend, connecting to OpenAI-compatible AI API.

## Quick Start (Docker Only)

**IMPORTANT**: This application is designed to run in Docker containers. Local development is not recommended due to network configuration complexity.

```bash
# 1. Copy environment configuration
cp .env.example .env

# 2. Edit .env and set your API key
# AI_API_KEY=your-api-key-here

# 3. Build and start containers
docker-compose up --build

# 4. Open http://localhost:5173 in your browser
```

To stop:
```bash
docker-compose down
```

## Architecture

```
Browser (:5173) → React → Vite proxy /api → Spring Boot (:8080) → AI API
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
| `docker-compose.yml` | Docker orchestration |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_API_KEY` | (required) | API key for AI endpoint |
| `AI_API_URL` | (required) | AI API base URL |
| `AI_MODEL` | (required) | Model name |

## API Endpoints

- `POST /api/chat` - Send message, receive AI response
- `GET /api/chat/health` - Health check

## Gotchas

1. **CORS**: Backend allows all origins (`@CrossOrigin("*")`) for dev
2. **Proxy**: Vite proxies `/api` to `localhost:8080` in dev mode
3. **Docker networking**: Frontend uses nginx to proxy `/api` to backend service
4. **No tests**: Project has no test suite configured
5. **In-memory only**: No database, chat history stored in browser session

## Build Notes

- Backend: Multi-stage Docker (Maven build → JRE runtime)
- Frontend: Multi-stage Docker (Node build → Nginx serving static files)
- Model: Configured via `AI_MODEL` environment variable
