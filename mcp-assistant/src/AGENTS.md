# AGENTS.md - MCP Assistant

## Overview

MCP Assistant is a standalone TypeScript application using MCP SDK with stdio transport. It serves as a reference implementation for MCP client integration.

## Tech Stack

- **TypeScript**: Strict mode enabled
- **MCP SDK**: Official Model Context Protocol SDK
- **Transport**: stdio (stdin/stdout)
- **Entry Point**: `src/index.ts`

## Project Structure

```
src/
├── index.ts            # Entry point
├── (sub-packages)      # MCP implementation modules
└── AGENTS.md           # This file
```

## MCP SDK Patterns

### Client Initialization
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'mcp-server',
  args: ['--option', 'value']
});

const client = new Client({
  name: 'mcp-assistant',
  version: '1.0.0'
});

await client.connect(transport);
```

### Tool Calling
```typescript
// List available tools
const tools = await client.listTools();

// Execute tool
const result = await client.callTool({
  name: 'get_weather',
  arguments: { location: 'Moscow' }
});
```

### Resource Access
```typescript
// List resources
const resources = await client.listResources();

// Read resource
const content = await client.readResource({
  uri: 'file:///path/to/file.txt'
});
```

## Conventions

### TypeScript Style
- **Strict mode**: Full strict typing enabled
- **ES Modules**: Use `import`/`export` syntax
- **Async/Await**: Promises with async/await (no .then chains)
- **Error Handling**: Try/catch with specific error types

### MCP Patterns
- **Connection Lifecycle**: Connect → Use → Disconnect (graceful shutdown)
- **Error Recovery**: Reconnect on transport failure
- **Logging**: Detailed request/response logging

## Transport: stdio

This implementation uses stdio transport (stdin/stdout) for MCP communication:
- **Pros**: Simple, no network overhead, easy debugging
- **Cons**: Requires local process execution
- **Use Case**: Local MCP server integration

## Docker Integration

When running in Docker:
- **Host Access**: Use `host.docker.internal` to access host MCP servers
- **Process Execution**: Ensure MCP server binary is available in container
- **Permissions**: Non-root user may need elevated permissions for process execution

## Anti-Patterns

### None Found
MCP Assistant code is clean with no identified anti-patterns.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point, MCP client initialization |
| `src/**/*.ts` | MCP implementation modules |

## Build & Run

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
npm start
```

## Testing

No test suite configured. When adding tests:
- Use Jest or Vitest
- Mock MCP SDK client
- Test tool calling, resource access, error handling

## Gotchas

1. **Strict Mode**: All TypeScript strict rules enforced - no `any` types
2. **Stdio Transport**: Only stdio supported (no HTTP/SSE transport)
3. **Process Lifecycle**: MCP server process must be managed (spawn, monitor, kill)
4. **Error Propagation**: MCP errors should propagate to caller with context

## MCP Integration with Backend

The backend (`ai-chat-backend/`) has its own MCP integration using Spring AI MCP SDK with HTTP transport. Key differences:

| Aspect | MCP Assistant | Backend |
|--------|---------------|---------|
| Language | TypeScript | Java |
| SDK | @modelcontextprotocol/sdk | Spring AI MCP |
| Transport | stdio | HTTP (Streamable) |
| Purpose | Reference implementation | Production proxy |

See backend AGENTS.md for server-side MCP patterns.
