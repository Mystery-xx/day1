# API Reference

## Overview

The AI Chat application exposes a comprehensive REST API for chat interactions, RAG operations, and MCP server management. All endpoints are prefixed with `/api` and are proxied through the frontend during development.

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Development (default) | http://localhost:5173/api |
| Production (default) | http://localhost:8082/api |
| Alternative deployment | http://localhost:8086/api |

## Chat Endpoints

### POST /api/chat

Send a message to the AI and receive a response. Supports streaming for real-time token delivery.

**Request Body:**
```json
{
  "message": "What is the capital of France?",
  "conversationId": "optional-session-id",
  "temperature": 0.7,
  "maxTokens": 1000
}
```

**Response (Streaming):**
```
data: {"token": "The"}
data: {"token": " capital"}
data: {"token": " of"}
data: {"token": " France"}
data: {"token": " is"}
data: {"token": " Paris"}
data: [DONE]
```

**Response (Non-streaming):**
```json
{
  "response": "The capital of France is Paris.",
  "conversationId": "session-123",
  "tokensUsed": 45
}
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `stream` | boolean | true | Enable streaming response |

### GET /api/chat/health

Health check endpoint for monitoring backend availability.

**Response:**
```json
{
  "status": "UP",
  "timestamp": "2026-07-06T10:30:00Z",
  "aiApiAvailable": true
}
```

## RAG Endpoints

### POST /api/rag/upload

Upload a document for RAG indexing. Accepts markdown and plain text files.

**Request Body (multipart/form-data):**
```
file: (binary file content)
chunkingStrategy: SEMANTIC
```

**Response:**
```json
{
  "documentId": "doc-456",
  "filename": "project-overview.md",
  "chunksCreated": 12,
  "status": "indexed"
}
```

**Chunking Strategies:**
| Strategy | Description |
|----------|-------------|
| `SEMANTIC` | Split by semantic boundaries (paragraphs, sections) |
| `FIXED_SIZE` | Split by fixed token count (default: 512 tokens) |

### GET /api/rag/search

Search the RAG index for relevant document chunks.

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query text |
| `topK` | integer | No | 5 | Number of results to return |
| `threshold` | float | No | 0.5 | Minimum similarity score (0.0-1.0) |

**Example Request:**
```
GET /api/rag/search?query=Docker%20deployment&topK=3&threshold=0.6
```

**Response:**
```json
{
  "results": [
    {
      "chunkId": "chunk-789",
      "documentId": "doc-456",
      "content": "The application is deployed using Docker Compose...",
      "similarityScore": 0.87,
      "metadata": {
        "filename": "docker-deployment.md",
        "section": "Quick Start"
      }
    }
  ],
  "query": "Docker deployment",
  "searchTimeMs": 23
}
```

### DELETE /api/rag/documents/{documentId}

Remove a document from the RAG index.

**Response:**
```json
{
  "documentId": "doc-456",
  "chunksDeleted": 12,
  "status": "deleted"
}
```

## MCP Endpoints

### GET /api/mcp/servers

List all configured MCP servers.

**Response:**
```json
{
  "servers": [
    {
      "id": 1,
      "name": "weather-server",
      "url": "http://host.docker.internal:8080/mcp",
      "transportType": "HTTP",
      "status": "connected",
      "createdAt": "2026-07-06T09:00:00Z"
    }
  ]
}
```

### POST /api/mcp/servers

Add a new MCP server configuration.

**Request Body:**
```json
{
  "name": "weather-server",
  "url": "http://host.docker.internal:8080/mcp",
  "transportType": "HTTP"
}
```

**Response:**
```json
{
  "id": 1,
  "name": "weather-server",
  "url": "http://host.docker.internal:8080/mcp",
  "transportType": "HTTP",
  "status": "disconnected",
  "createdAt": "2026-07-06T09:00:00Z"
}
```

### PUT /api/mcp/servers/{id}

Update an existing MCP server configuration.

**Request Body:**
```json
{
  "name": "weather-server-updated",
  "url": "http://host.docker.internal:8081/mcp",
  "transportType": "HTTP"
}
```

### DELETE /api/mcp/servers/{id}

Remove an MCP server configuration. Disconnects the server first if currently connected.

**Response:**
```json
{
  "id": 1,
  "status": "deleted"
}
```

### POST /api/mcp/servers/{id}/connect

Establish connection to an MCP server.

**Response:**
```json
{
  "serverId": 1,
  "status": "connected",
  "toolsAvailable": 3,
  "connectedAt": "2026-07-06T10:35:00Z"
}
```

### POST /api/mcp/servers/{id}/disconnect

Terminate connection to an MCP server.

**Response:**
```json
{
  "serverId": 1,
  "status": "disconnected",
  "disconnectedAt": "2026-07-06T10:40:00Z"
}
```

### GET /api/mcp/servers/{id}/tools

List available tools from a connected MCP server.

**Response:**
```json
{
  "serverId": 1,
  "serverName": "weather-server",
  "tools": [
    {
      "name": "get_current_weather",
      "description": "Get current weather conditions for a city",
      "inputSchema": {
        "type": "object",
        "properties": {
          "city": {
            "type": "string",
            "description": "City name in English"
          }
        },
        "required": ["city"]
      }
    }
  ]
}
```

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "timestamp": "2026-07-06T10:30:00Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Invalid request body",
  "path": "/api/chat"
}
```

**Common Status Codes:**
| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 404 | Not Found |
| 500 | Internal Server Error |
| 503 | Service Unavailable (AI API down) |
