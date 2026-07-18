# Migration Guide: mcp-assistant HTTP + Multi-Project

This guide covers migrating from the legacy stdio-based single-project mcp-assistant to the new HTTP-based multi-project version.

---

## Overview of Changes

### Before (v1.x)
- **Transport**: stdio (stdin/stdout)
- **Project Model**: Single hardcoded project (`/mnt/f/git/day1`)
- **Index Storage**: Global `.index/fuse-index.json` with 12 hardcoded documents
- **Tool Scope**: All tools operated on the same hardcoded repo
- **No Persistence**: No concept of registered projects across sessions

### After (v2.0)
- **Transport**: HTTP (port 3000) via `NodeStreamableHTTPServerTransport`
- **Project Model**: Multiple independent projects with isolated indexes
- **Index Storage**: Per-project `.index/{projectId}/fuse-index.json`
- **Tool Scope**: All tools now accept `projectId` parameter for context
- **Persistence**: Project registry stored in `.index/projects.json`

### Architecture

```
                    HTTP Client
                         │
                    ┌────▼────┐
                    │ /mcp    │  (MCP protocol over HTTP)
                    │ /health │  (Health check)
                    └────┬────┘
                         │
              ┌──────────▼──────────┐
              │  MCP Server v2.0    │
              │  multi-project-     │
              │  assistant          │
              └──────────┬──────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐     ┌─────▼─────┐    ┌─────▼─────┐
   │ Project │     │   Index   │    │   Tools   │
   │Registry │     │  Manager  │    │  (12 tools)│
   └────┬────┘     └─────┬─────┘    └───────────┘
        │                │
   .index/projects.json  │  .index/{projectId}/
                         │  ├── fuse-index.json
                         │  └── index-metadata.json
```

---

## Breaking Changes

### 1. Transport Protocol Change (Breaking)
**stdio clients will no longer work.**

The server no longer accepts stdio connections. All clients must use HTTP.

**Before:**
```json
{ "transport": "stdio", "command": "node dist/index.js" }
```

**After:**
```json
{ "transport": "http", "url": "http://localhost:3000/mcp" }
```

### 2. Tool Signature Changes (Breaking)
All tools now **require** a `projectId` parameter (except `list_projects` which takes no arguments).

| Tool | Change |
|------|--------|
| `search` | Added required `projectId` |
| `get_docs` | Added required `projectId` |
| `project_structure` | Added required `projectId` |
| `find_files` | Added required `projectId` |
| `git_status` | Added required `projectId` |
| `git_diff` | Added required `projectId` |
| `git_log` | Added required `projectId` |
| `git_branch` | Added required `projectId` |
| `get_project_state` | No args (uses default project) |
| `index` | Added required `projectId` |
| `register_project` | Renamed from implicit registration |
| `unregister_project` | New tool |
| `get_project_info` | New tool |
| `list_projects` | New tool (replaces implicit list) |

### 3. Index Path Changes (Breaking)
Old path: `.index/fuse-index.json` (global, single project)

New path: `.index/{projectId}/fuse-index.json` (per-project isolation)

---

## Migration Steps

### Step 1: Update Your MCP Client

#### Node.js Client Example
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { HttpClientTransport } from '@modelcontextprotocol/sdk/client/http.js';

const transport = new HttpClientTransport('http://localhost:3000/mcp');

const client = new Client({
  name: 'my-mcp-client',
  version: '1.0.0'
});

await client.connect(transport);

// Verify connection
const tools = await client.listTools();
console.log('Connected! Available tools:', tools.length);
```

#### Python Client Example
```python
from mcp.client import MCPClient
import httpx

# Use HTTP transport
async with httpx.Client() as http_client:
    client = MCPClient(transport="http", url="http://localhost:3000/mcp")
    await client.connect()
    
    tools = await client.list_tools()
    print(f"Connected! Available tools: {len(tools)}")
```

### Step 2: Register Your First Project

Projects must be registered before indexing or using tools.

```bash
# Register a project
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "register_project",
      "arguments": {
        "name": "my-project",
        "rootPath": "/path/to/my/project"
      }
    }
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"projectId\": \"my-project-mrmmeerz\",\n  \"status\": \"registered\"\n}"
      }
    ]
  }
}
```

Save the returned `projectId` - you'll use it for all subsequent operations.

### Step 3: Index Documentation

Once registered, index the project's markdown documentation:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "index",
      "arguments": {
        "projectId": "my-project-mrmmeerz",
        "folderPath": "/path/to/my/project/docs",
        "chunkingStrategy": "SEMANTIC"
      }
    }
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Successfully indexed 12 files into 48 chunks for project my-project-mrmmeerz."
      }
    ]
  }
}
```

### Step 4: Use Tools with projectId

All tool calls now require `projectId`:

#### Search
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {
        "projectId": "my-project-mrmmeerz",
        "query": "authentication",
        "limit": 5
      }
    }
  }'
```

#### Get Documentation
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "get_docs",
      "arguments": {
        "projectId": "my-project-mrmmeerz",
        "topic": "API reference"
      }
    }
  }'
```

#### Project Structure
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "project_structure",
      "arguments": {
        "projectId": "my-project-mrmmeerz",
        "depth": 3
      }
    }
  }'
```

#### Git Operations
```bash
# Git status
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "git_status",
      "arguments": {
        "projectId": "my-project-mrmmeerz"
      }
    }
  }'

# Git log
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 7,
    "method": "tools/call",
    "params": {
      "name": "git_log",
      "arguments": {
        "projectId": "my-project-mrmmeerz",
        "limit": 10
      }
    }
  }'

# Git diff
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 8,
    "method": "tools/call",
    "params": {
      "name": "git_diff",
      "arguments": {
        "projectId": "my-project-mrmmeerz",
        "staged": false
      }
    }
  }'

# Git branch
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 9,
    "method": "tools/call",
    "params": {
      "name": "git_branch",
      "arguments": {
        "projectId": "my-project-mrmmeerz"
      }
    }
  }'
```

---

## New Features

### Multi-Project Support
Register and manage multiple independent projects:

```bash
# List all projects
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 10,
    "method": "tools/call",
    "params": {
      "name": "list_projects",
      "arguments": {}
    }
  }'

# Get project info
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 11,
    "method": "tools/call",
    "params": {
      "name": "get_project_info",
      "arguments": {
        "projectId": "my-project-mrmmeerz"
      }
    }
  }'
```

### Per-Project Isolated Indexes
Each project has its own Fuse.js index at `.index/{projectId}/fuse-index.json`. Indexes are:
- **Isolated**: No cross-project data leakage
- **Lazy-loaded**: Indexes load on-demand (with in-memory cache)
- **Persistent**: Survives server restarts

### Path Sandboxing
All file operations are sandboxed to the project's `rootPath`:
- Prevents directory traversal attacks
- Validates paths with `realpath()` resolution
- Works for both Unix and Windows paths

### Per-Project Rate Limiting
Each project has independent rate limits:
- 10 requests per tool per minute per project
- Prevents one project from monopolizing resources

---

## Available Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `list_projects` | (none) | List all registered projects |
| `register_project` | `name`, `rootPath` | Register a new project |
| `unregister_project` | `projectId` | Remove a project |
| `get_project_info` | `projectId` | Get project configuration |
| `index` | `projectId`, `folderPath`, `chunkingStrategy?` | Index markdown files |
| `search` | `projectId`, `query`, `limit?`, `filters?` | Fuzzy search across docs |
| `get_docs` | `projectId`, `topic?` | RAG documentation lookup |
| `project_structure` | `projectId`, `depth?`, `exclude?` | Directory tree view |
| `find_files` | `projectId`, `pattern`, `maxResults?`, `path?` | Glob file search |
| `git_status` | `projectId` | Repository status |
| `git_diff` | `projectId`, `staged?`, `file?` | Show changes |
| `git_log` | `projectId`, `limit?`, `file?` | Commit history |
| `git_branch` | `projectId` | Branch information |
| `get_project_state` | (none) | Git state + index stats |

### Tool Parameter Details

#### search
```typescript
{
  projectId: string;      // Required - Project ID from registry
  query: string;          // Required - Search query (3-200 chars)
  limit?: number;         // Optional - Max results (1-50, default: 10)
  filters?: {             // Optional
    source?: string;      // Filter by source file path
  };
}
```

#### index
```typescript
{
  projectId: string;      // Required - Project ID from registry
  folderPath: string;     // Required - Path to folder with .md files
  chunkingStrategy?: 'SEMANTIC' | 'FIXED_SIZE'; // Default: SEMANTIC
}
```

#### project_structure
```typescript
{
  projectId: string;      // Required - Project ID from registry
  depth?: number;         // Optional - 1-5, default: 2
  exclude?: string[];     // Optional - Additional exclude patterns
}
```

#### find_files
```typescript
{
  projectId: string;      // Required - Project ID from registry
  pattern: string;        // Required - Glob pattern (e.g., "**/*.ts")
  maxResults?: number;    // Optional - Max results (default: 50)
  path?: string;          // Optional - Base search path
}
```

---

## Docker Deployment

### Quick Start

```bash
# Build and start
docker-compose -f docker-compose.mcp-assistant.yml up --build

# Verify health
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"2026-07-16T..."}
```

### Docker Compose Configuration

```yaml
services:
  mcp-assistant:
    build:
      context: ./mcp-assistant
      dockerfile: Dockerfile
    container_name: mcp-assistant
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - HOST=0.0.0.0
      - INDEX_ROOT=/app/.index
      - REPO_ROOT=/app/repo
    volumes:
      # Persist .index directory
      - mcp-index:/app/.index
      # Mount repository (read-only)
      - ./:/app/repo:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  mcp-index:
    driver: local
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `HOST` | `127.0.0.1` | Bind address (use `0.0.0.0` for Docker) |
| `INDEX_ROOT` | `/app/.index` | Project index storage |
| `REPO_ROOT` | `/app/repo` | Default repo root (not used directly) |

### Local Development

```bash
cd mcp-assistant

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start HTTP server
npm run start:http
# Server listens on http://localhost:3000
```

---

## Troubleshooting

### Connection Refused

**Error:** `ECONNREFUSED` when connecting to `http://localhost:3000`

**Solutions:**
1. Check server is running:
   ```bash
   curl http://localhost:3000/health
   ```

2. Check Docker container status:
   ```bash
   docker ps | grep mcp-assistant
   docker logs mcp-assistant
   ```

3. Verify port mapping:
   ```bash
   docker port mcp-assistant
   ```

### Project Not Found

**Error:** `Project with ID 'xyz' not found in registry`

**Solutions:**
1. List registered projects:
   ```bash
   curl -X POST http://localhost:3000/mcp ... -d '{"name":"list_projects","arguments":{}}'
   ```

2. Register the project:
   ```bash
   curl -X POST http://localhost:3000/mcp ... -d '{
     "name":"register_project",
     "arguments":{"name":"my-project","rootPath":"/path/to/project"}
   }'
   ```

### Index Not Found

**Error:** `Failed to load Fuse index for project xyz`

**Solutions:**
1. Verify index exists:
   ```bash
   ls -la .index/{projectId}/
   ```

2. Re-index the project:
   ```bash
   curl -X POST http://localhost:3000/mcp ... -d '{
     "name":"index",
     "arguments":{"projectId":"xyz","folderPath":"/path/to/docs"}
   }'
   ```

### Path Validation Failed

**Error:** `Access denied: path must be within repo root`

**Solutions:**
1. Verify `rootPath` in project registration
2. Ensure the path exists and is readable:
   ```bash
   ls -la /path/to/project
   ```

### Rate Limit Exceeded

**Error:** `Rate limit exceeded for tool 'search' in project 'xyz'`

**Solutions:**
1. Wait 60 seconds (rate limit window)
2. Check you're not making concurrent requests
3. Implement request batching if needed

### HTTP 404 on /mcp

**Error:** `{"error":"Not found"}`

**Solutions:**
1. Ensure you're hitting `/mcp` endpoint, not `/` or `/health`
2. Check CORS headers if using browser client:
   ```bash
   curl -X POST http://localhost:3000/mcp -H "Content-Type: application/json" ...
   ```

### Docker Volume Permissions

**Error:** `EACCES: permission denied` on `.index` directory

**Solutions:**
1. Fix volume ownership:
   ```bash
   docker compose down
   sudo chown -R $(id -u):$(id -g) .index/
   docker compose up
   ```

2. Or use named volume (already configured):
   ```yaml
   volumes:
     - mcp-index:/app/.index
   ```

---

## MCP Protocol Examples

### JSON-RPC Request Format

All tool calls use JSON-RPC 2.0:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": {
      "param1": "value1",
      "param2": "value2"
    }
  }
}
```

### JSON-RPC Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Tool response content..."
      }
    ]
  }
}
```

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: Something went wrong"
      }
    ],
    "isError": true
  }
}
```

---

## Project Registry Format

Projects are stored in `.index/projects.json`:

```json
{
  "projects": {
    "my-project-mrmmeerz": {
      "id": "my-project-mrmmeerz",
      "name": "my-project",
      "rootPath": "/path/to/project",
      "createdAt": "2026-07-15T10:00:00.000Z",
      "lastIndexed": "2026-07-15T12:30:00.000Z",
      "chunkingStrategy": "SEMANTIC"
    }
  }
}
```

---

## Index Storage Format

Per-project indexes stored at `.index/{projectId}/`:

```
.index/
├── projects.json           # Project registry
├── my-project-abc123/
│   ├── fuse-index.json     # Fuse.js search index
│   └── index-metadata.json # Index statistics
└── other-project-xyz789/
    ├── fuse-index.json
    └── index-metadata.json
```

---

## Migration Checklist

- [ ] Update MCP client to use HTTP transport
- [ ] Update tool call signatures to include `projectId`
- [ ] Register existing projects with `register_project`
- [ ] Re-index all projects with `index` tool
- [ ] Update any hardcoded paths to use `rootPath` from registry
- [ ] Test all tools with new `projectId` parameter
- [ ] Update monitoring to track per-project metrics
- [ ] Review rate limits (10 req/min per tool per project)
- [ ] Update Docker configuration if deploying