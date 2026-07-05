# Troubleshooting Guide

## Common Issues and Solutions

This guide addresses frequently encountered problems during development and deployment of the AI Chat application.

---

## Backend Won't Start

### Symptom

Backend container fails to start or exits immediately after startup.

### Possible Causes

**1. Port Already in Use**

```
Error: Port 8082 is already in use
```

**Solution:**
```bash
# Check what's using the port
lsof -i :8082

# Kill the process (if safe to do so)
kill -9 <PID>

# Or use alternative port configuration
cp .env-8081 .env
docker-compose -f docker-compose-8081.yml up --build
```

**2. Missing Environment Variables**

```
Error: AI_API_KEY is required but not set
```

**Solution:**
```bash
# Verify .env file exists and has required variables
cat .env | grep AI_

# Copy from example if missing
cp .env.example .env

# Edit and set required values
nano .env
```

**3. Database Lock**

```
Error: Database lock file exists - another instance running
```

**Solution:**
```bash
# Stop all containers
docker-compose down

# Remove volume (WARNING: deletes MCP server configs)
docker-compose down -v

# Restart
docker-compose up --build
```

**4. Java Heap Space**

```
Error: java.lang.OutOfMemoryError: Java heap space
```

**Solution:**
```bash
# Increase heap size in docker-compose.yml
environment:
  - JAVA_OPTS=-Xmx512m -Xms256m
```

---

## MCP Connection Timeout

### Symptom

MCP server connection fails with timeout error.

```
Error: Connection timeout to MCP server at http://localhost:8080/mcp
```

### Root Cause

From inside Docker containers, `localhost` refers to the container itself, not the host machine. MCP servers running on the host are not accessible via `localhost`.

### Solution

**Use `host.docker.internal` instead of `localhost`:**

```json
{
  "name": "weather-server",
  "url": "http://host.docker.internal:8080/mcp",
  "transportType": "HTTP"
}
```

**For Docker on Linux, add extra_hosts to docker-compose.yml:**

```yaml
backend:
  extra_hosts:
    - "host.docker.internal:host-gateway"
```

**Verification:**
```bash
# Test connectivity from inside container
docker exec -it ai-chat-backend-1 ping host.docker.internal

# Test MCP endpoint
docker exec -it ai-chat-backend-1 curl http://host.docker.internal:8080/mcp
```

---

## Tool Calling Not Working

### Symptom

AI receives tool definitions but never calls them, or enters an infinite loop.

### Possible Causes

**1. Model Does Not Support Tool Calling**

Not all AI models support the tool calling format. Some models may ignore tool definitions or respond incorrectly.

**Solution:**
- Use a model known to support tool calling (e.g., `qwen3.6-27b`)
- Check model documentation for tool calling capabilities
- Verify the AI API returns tool_call in the expected format

**2. Incorrect Tool Schema**

```json
{
  "name": "get_weather",
  // Missing required fields
}
```

**Solution:**
Ensure tool definitions include all required fields:
```json
{
  "name": "get_current_weather",
  "description": "Get current weather for a city",
  "inputSchema": {
    "type": "object",
    "properties": {
      "city": {
        "type": "string",
        "description": "City name"
      }
    },
    "required": ["city"]
  }
}
```

**3. MCP Server Not Connected**

Tools are unavailable if the MCP server is not in "connected" state.

**Solution:**
```bash
# Check server status
curl http://localhost:8082/api/mcp/servers

# Connect if disconnected
curl -X POST http://localhost:8082/api/mcp/servers/1/connect

# Verify tools are available
curl http://localhost:8082/api/mcp/servers/1/tools
```

**4. AI Model Loops on Tool Calls**

Some models may repeatedly call the same tool without producing a final answer.

**Solution:**
- Implement tool call limiting (max 3 calls per conversation turn)
- Add explicit instruction: "After receiving tool results, provide a final answer"
- Adjust temperature to reduce randomness (try 0.3-0.5)

---

## Frontend Can't Connect to Backend

### Symptom

Frontend shows "Connection error" or API requests fail.

### Possible Causes

**1. Nginx Proxy Misconfiguration**

The frontend uses Nginx to proxy `/api` requests to the backend service.

**Solution:**
Check `ai-chat-frontend/nginx.conf`:
```nginx
location /api {
    proxy_pass http://backend:8082;  # Must match backend service name and port
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

**2. Backend Service Not Running**

```bash
# Check backend status
docker-compose ps

# View backend logs
docker-compose logs backend
```

**3. Network Isolation**

Frontend and backend must be on the same Docker network.

**Solution:**
```bash
# Verify network configuration
docker-compose config | grep -A 5 networks

# Restart to ensure network is created
docker-compose down
docker-compose up --build
```

**4. CORS Issues (Development Only)**

In development mode, Vite proxy handles API requests.

**Solution:**
Check `ai-chat-frontend/vite.config.js`:
```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8082',
      changeOrigin: true
    }
  }
}
```

---

## RAG Search Not Finding Documents

### Symptom

RAG search returns empty results or irrelevant chunks.

### Possible Causes

**1. Documents Not Indexed**

Documents must be uploaded and indexed before they can be searched.

**Solution:**
```bash
# Check if documents are indexed
curl http://localhost:8082/api/rag/documents

# Upload a document if empty
curl -X POST http://localhost:8082/api/rag/upload \
  -F "file=@document.md" \
  -F "chunkingStrategy=SEMANTIC"
```

**2. Embedding Model Not Available**

Ollama embedding model must be running and accessible.

**Solution:**
```bash
# Check Ollama is running
ollama list

# Pull embedding model if missing
ollama pull nomic-embed-text

# Test embedding endpoint
curl http://host.docker.internal:11434/api/embeddings \
  -d '{"model": "nomic-embed-text", "prompt": "test"}'
```

**3. Similarity Threshold Too High**

Default threshold may filter out relevant results.

**Solution:**
```bash
# Lower the threshold in search request
curl "http://localhost:8082/api/rag/search?query=docker&topK=5&threshold=0.3"
```

**4. Query-Document Mismatch**

Query terms don't match document content semantically.

**Solution:**
- Use more specific queries
- Ensure documents contain relevant terminology
- Consider query expansion techniques

---

## Ollama Embedding Errors

### Symptom

RAG indexing fails with embedding-related errors.

```
Error: model 'nomic-embed-text' not found
Error: connection refused to Ollama API
```

### Solutions

**1. Model Not Downloaded**

```bash
# Pull the embedding model
ollama pull nomic-embed-text

# Verify installation
ollama list | grep nomic
```

**2. Ollama Not Running**

```bash
# Start Ollama service
ollama serve

# Or run in background
nohup ollama serve &
```

**3. Wrong API URL**

Ensure `AI_API_URL` points to Ollama's API endpoint:

```bash
# Correct URL format
AI_API_URL=http://host.docker.internal:11434/v1

# Test connectivity
curl http://host.docker.internal:11434/api/tags
```

**4. Docker Network Isolation**

Ollama running on host is not accessible from container.

**Solution:**
- Use `host.docker.internal` in API URL
- For Linux, add `extra_hosts` to docker-compose.yml (see MCP section)

---

## Performance Issues

### Slow Response Times

**Symptom:** AI responses take >30 seconds

**Possible Causes:**
- Model is too large for available hardware
- Network latency to AI API
- RAG indexing consuming resources

**Solutions:**
```bash
# Use a smaller, faster model
AI_MODEL=llama3.1-8b

# Reduce context size
# Edit context strategy to use fewer messages

# Check system resources
docker stats
```

### High Memory Usage

**Symptom:** Container memory exceeds limits

**Solutions:**
```yaml
# Set memory limits in docker-compose.yml
backend:
  deploy:
    resources:
      limits:
        memory: 1G
```

---

## Logging and Debugging

### Enable Debug Logging

Add to `application.yml`:
```yaml
logging:
  level:
    com.aichat: DEBUG
    org.springframework.web: DEBUG
```

### View Logs

```bash
# Real-time logs
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend

# Search logs
docker-compose logs backend | grep "ERROR"
```

### MCP Debug Logging

MCP operations are logged with detailed request/response information:
```
docker-compose logs backend | grep "MCP"
```

Look for patterns:
- `>>> MCP REQUEST` - Outgoing MCP request
- `<<< MCP RESPONSE` - Incoming MCP response
- `>>> MCP TOOL CALL` - Tool execution
- `<<< MCP TOOL RESULT` - Tool result
