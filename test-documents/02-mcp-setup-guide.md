# MCP Setup Guide

## What is MCP?

MCP (Model Context Protocol) is a standardized protocol that enables AI models to interact with external tools and services. It provides a uniform interface for tool discovery, invocation, and result handling, allowing AI systems to extend their capabilities beyond their training data.

In the AI Chat application, MCP serves as the bridge between the AI model and external data sources or services. When a user asks a question that requires real-time information or external computation, the AI can invoke MCP tools to gather the necessary data before formulating a response.

## MCP Server Configuration

MCP servers are configured through a JSON structure that defines the server's identity, connection details, and transport mechanism. The configuration is stored in the backend's H2 database and can be managed through REST API endpoints.

### Configuration Format

```json
{
  "name": "weather-server",
  "url": "http://host.docker.internal:8080/mcp",
  "transportType": "HTTP"
}
```

### Fields Description

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable server identifier |
| `url` | string | Yes | Full URL to the MCP endpoint |
| `transportType` | string | Yes | Connection type: `HTTP` or `STDIO` |

## Transport Types

### HTTP Transport

HTTP transport uses the Streamable HTTP protocol for MCP communication. This is the recommended transport type for networked MCP servers.

**Characteristics:**
- Stateful connections with session management
- Support for bidirectional streaming
- Standard HTTP status codes for error handling
- Suitable for remote servers

**Example Configuration:**
```json
{
  "name": "remote-mcp",
  "url": "http://192.168.1.100:3000/mcp",
  "transportType": "HTTP"
}
```

### STDIO Transport

STDIO transport communicates with MCP servers through standard input/output streams. This is typically used for local process-based MCP servers.

**Characteristics:**
- Direct process spawning
- No network overhead
- Limited to local execution
- Requires executable path configuration

**Example Configuration:**
```json
{
  "name": "local-tool",
  "command": "/usr/local/bin/mcp-server",
  "args": ["--config", "/etc/mcp/config.json"],
  "transportType": "STDIO"
}
```

## Backend Proxy Architecture

The AI Chat application implements a backend proxy pattern for MCP connections. This architecture ensures that:

1. **Frontend Isolation**: The React frontend never connects directly to MCP servers
2. **Centralized Management**: All MCP operations flow through the Spring Boot backend
3. **Security Control**: API keys and credentials remain on the backend
4. **Connection Pooling**: Efficient resource utilization for multiple MCP calls

### Connection Flow

```
User → Frontend → Backend API → MCP Client → MCP Server
                                      ↓
                              Tool Execution
                                      ↓
User ← Frontend ← Backend API ← MCP Response
```

## Example: Weather Server MCP

Here's a complete example of setting up a weather MCP server:

### Step 1: Define the MCP Server

```json
{
  "name": "weather-server",
  "url": "http://host.docker.internal:8080/mcp",
  "transportType": "HTTP"
}
```

### Step 2: Register via API

```bash
curl -X POST http://localhost:8082/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "weather-server",
    "url": "http://host.docker.internal:8080/mcp",
    "transportType": "HTTP"
  }'
```

### Step 3: Connect to Server

```bash
curl -X POST http://localhost:8082/api/mcp/servers/1/connect
```

### Step 4: List Available Tools

```bash
curl http://localhost:8082/api/mcp/servers/1/tools
```

### Expected Tool Response

```json
{
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

## Tool Calling Cycle

The complete tool calling cycle involves these steps:

1. **User Query**: User asks a question requiring external data
2. **Tool Selection**: AI analyzes the query and selects appropriate tools
3. **Tool Call Request**: AI returns a tool_call structure with parameters
4. **Backend Execution**: Backend invokes the MCP tool with provided arguments
5. **Result Return**: MCP server returns the tool execution result
6. **AI Processing**: Backend sends the result back to the AI
7. **Final Response**: AI generates a natural language response using the tool data

## Troubleshooting Tips

- **Connection Timeout**: Use `host.docker.internal` instead of `localhost` when running in Docker
- **Tool Not Found**: Ensure the MCP server is connected before calling tools
- **Transport Error**: Verify the transportType matches the server's actual protocol
- **Authentication Failure**: Include necessary credentials in the MCP server configuration


## Test Addition
This is a test addition for incremental update testing.
