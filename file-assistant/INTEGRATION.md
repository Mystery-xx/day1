# file-assistant Integration Guide

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Start all services including file-assistant
docker-compose up --build

# file-assistant will be available at:
# - Host: http://localhost:3000/mcp
# - From backend container: http://file-assistant:3000/mcp
```

### Option 2: Local Development

```bash
cd file-assistant

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start HTTP server
npm run start:http

# Server runs on http://localhost:3000/mcp
```

## Register in ai-chat

### Via API (Backend Running)

```bash
curl -X POST http://localhost:8082/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "file-assistant",
    "transportType": "HTTP",
    "url": "http://host.docker.internal:3000/mcp"
  }'
```

### Via UI

1. Open http://localhost:5173
2. Navigate to "MCP Servers" section
3. Click "Add Server"
4. Fill in:
   - **Name**: `file-assistant`
   - **Transport Type**: `HTTP`
   - **URL**: `http://host.docker.internal:3000/mcp`
5. Click "Save"
6. Click "Connect" to establish connection

## Available Tools

Once connected, file-assistant provides 15 MCP tools:

### File Operations
- `readFile` - Read file content with metadata
- `writeFile` - Write file (requires approval)
- `editFile` - Edit file with string replacement or unified diff
- `diffFiles` - Compare two files, generate unified diff

### Workspace Analysis
- `findUsages` - Find symbol usages (imports, calls, references)
- `analyzeBlastRadius` - Analyze import dependencies and risk level

### Documentation Generation
- `generateREADME` - Generate README.md from project structure
- `generateADR` - Generate Architecture Decision Record
- `generateChangelog` - Generate CHANGELOG.md from git history

### Rule Checking
- `checkInvariants` - Check structural rules (naming, directory structure)
- `validateRules` - Check stylistic rules (copyright, import order, console.log)

### Utilities
- `approve_operation` - Approve pending dangerous operations
- `help` - List all available tools
- `echo` - Echo test

## Testing

### Health Check
```bash
curl http://:3000/health
# Response: {"status":"ok","transport":"streamable-http"}
```

### List Tools
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Call Tool Example
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"readFile",
      "arguments":{"projectId":"file-assistant","filePath":"src/index.ts"}
    }
  }'
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Browser     │────▶│ Spring Boot  │────▶│ file-assistant  │
│ (ai-chat UI)│     │ (:8082)      │     │ (:000         │
│     │              │     │                 │
│             │     │ MCP HTTP     │     │ 15 MCP Tools    │
│             │     │ Client       │     │ + PathSandbox   │
└─────────────┘     └──────────────┘     └─────────────────┘
```

### Network Flow

1. User clicks "Connect" in ai-chat UI
2. Backend calls `McpClientService.connectToServer()`
3. `McpHttpService` initializes HTTP connection to `http://file-assistant:3000/mcp`
4. Backend fetches tools list via `POST /mcp` with `tools/list`
5. Tools registered in AI context for tool calling

### Security

- **PathSandbox**: All file operations validated against project root
- **ApprovalGate**: `writeFile` requires explicit approval via `approve_operation` tool
- **CORS**: Enabled for frontend access
- **No Network/DB**: file-assistant has no network or database access

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `MCP_PATH` | `/mcp` | MCP endpoint path |

##bleshooting

### Connection Refused

```bash
# Check if server is running
curl http://localhost:3000/health

# Check logs
docker logs file-assistant
# or
npm run start:http  # for local dev
```

### Tools Not Showing

```bash
# Verify tools list
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Should return 15 tools
```

### Docker Networking

From backend container, use service name:
```
http://file-assistant:3000/mcp
```

From host machine:
```
http://localhost:3000/mcp
```

## Next Steps

1. ✅ Build file-assistant: `npm run build`
2. ✅ Start HTTP server: `npm run start:http`
3. ⏳ Register in ai-chat: `POST /api/mcp/servers`
4. ⏳ Connect via UI
5. ⏳ Test tools with real queries

## Evidence

- Build logs: `.omo/evidence/file-assistant-build.log`
- Test results: `.omo/evidence/file-assistant-tests.log`
- HTTP server verification: `.omo/evidence/file-assistant-http-verify.log`