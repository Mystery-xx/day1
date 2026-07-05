# Docker Deployment Guide

## Overview

The AI Chat application is designed exclusively for Docker deployment. This approach ensures consistent behavior across development and production environments, simplifies dependency management, and provides network isolation for security.

Local development without Docker is not recommended due to the complexity of network configurations required for AI API access, MCP server connections, and frontend-backend communication.

## Deployment Configurations

The project includes two pre-configured Docker Compose setups for different port requirements.

### Default Deployment (Port 8082)

This is the standard configuration suitable for most development scenarios.

**Configuration Files:**
- `docker-compose.yml` - Main orchestration file
- `.env` or `.env.example` - Environment variables

**Port Mapping:**
| Service | Container Port | Host Port | Purpose |
|---------|----------------|-----------|---------|
| Backend | 8082 | 8082 | Spring Boot API |
| Frontend | 80 | 5173 | React + Nginx |

**Network:** `ai-chat-network`  
**Volume:** `h2-data` (backend database persistence)

### Alternative Deployment (Port 8081)

Use this configuration when port 8082 is already in use or when running multiple instances.

**Configuration Files:**
- `docker-compose-8081.yml` - Alternative orchestration file
- `.env-8081` or `.env` - Environment variables

**Port Mapping:**
| Service | Container Port | Host Port | Purpose |
|---------|----------------|-----------|---------|
| Backend | 8081 | 8081 | Spring Boot API |
| Frontend | 80 | 8086 | React + Nginx |

**Network:** `ai-chat-network-8081`  
**Volume:** `h2-data-8081` (backend database persistence)

## Quick Start

### Step 1: Copy Environment Configuration

```bash
# For default deployment (port 8082)
cp .env.example .env

# For alternative deployment (port 8081)
cp .env-8081 .env
```

### Step 2: Configure Environment Variables

Edit the `.env` file and set the required variables:

```bash
AI_API_KEY=your-api-key-here
AI_API_URL=http://host.docker.internal:11434/v1
AI_MODEL=qwen3.5-397b-a17b
SERVER_PORT=8082
```

### Step 3: Build and Start Containers

```bash
# Default deployment
docker-compose up --build

# Alternative deployment
docker-compose -f docker-compose-8081.yml up --build
```

The `--build` flag ensures that any code changes are incorporated into the container images.

### Step 4: Access the Application

Open your browser and navigate to:

- **Default**: http://localhost:5173
- **Alternative**: http://localhost:8086

## Docker Compose Structure

### Backend Service

```yaml
backend:
  build:
    context: ./ai-chat-backend
    dockerfile: Dockerfile
  ports:
    - "8082:8082"
  environment:
    - AI_API_KEY=${AI_API_KEY}
    - AI_API_URL=${AI_API_URL}
    - AI_MODEL=${AI_MODEL}
    - SERVER_PORT=${SERVER_PORT}
  volumes:
    - h2-data:/data
  networks:
    - ai-chat-network
  restart: unless-stopped
```

**Key Points:**
- Multi-stage Docker build (Maven build → JRE runtime)
- Environment variables passed from `.env` file
- Volume mount for H2 database persistence
- Automatic restart on failure

### Frontend Service

```yaml
frontend:
  build:
    context: ./ai-chat-frontend
    dockerfile: Dockerfile
  ports:
    - "5173:80"
  depends_on:
    - backend
  networks:
    - ai-chat-network
  restart: unless-stopped
```

**Key Points:**
- Multi-stage Docker build (Node build → Nginx static serving)
- Depends on backend service for startup ordering
- Nginx proxies `/api` requests to backend service
- Serves static React files on port 80 (mapped to 5173)

## Volume Configuration

### H2 Database Volume

The backend uses an embedded H2 database for persisting MCP server configurations. To ensure data survives container restarts:

```yaml
volumes:
  h2-data:
    driver: local
```

**Location:** `/data` inside the backend container  
**Contents:** H2 database files for MCP server storage

### RAG Index Volume (Optional)

For RAG functionality, configure persistent storage for the vector index:

```yaml
volumes:
  - rag-index:/data/rag-index
```

**Location:** `/data/rag-index/vectors.dat` inside the backend container  
**Contents:** Serialized vector embeddings and index structures

## Network Configuration

### Internal Network

Services communicate over an isolated Docker network:

```yaml
networks:
  ai-chat-network:
    driver: bridge
```

**Benefits:**
- Services can reach each other by service name
- External access only through published ports
- Automatic DNS resolution within the network

### Accessing Host Services

To access services running on the host machine (like Ollama or MCP servers), use the special DNS name `host.docker.internal`:

```bash
AI_API_URL=http://host.docker.internal:11434/v1
```

**Platform Support:**
- **Docker Desktop (Windows/Mac)**: Supported by default
- **Docker on Linux**: Requires `--add-host=host.docker.internal:host-gateway` flag

**Linux Configuration:**
```yaml
backend:
  extra_hosts:
    - "host.docker.internal:host-gateway"
```

## Build Process

### Backend Build

The backend Dockerfile uses a multi-stage build:

```dockerfile
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-17 AS build
COPY . .
RUN mvn clean package -DskipTests

# Stage 2: Runtime
FROM eclipse-temurin:17-jre-alpine
COPY --from=build /target/*.jar app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

**Advantages:**
- Small runtime image (JRE only, no Maven)
- Reproducible builds
- No build tools in production image

### Frontend Build

The frontend Dockerfile also uses multi-stage build:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm install && npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Advantages:**
- Minimal runtime image (Nginx only)
- Fast static file serving
- Configurable via nginx.conf

## Common Operations

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart backend
```

### Stop and Remove

```bash
# Stop containers (preserve volumes)
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Rebuild After Changes

```bash
# Full rebuild
docker-compose up --build

# Rebuild specific service
docker-compose build backend
docker-compose up backend
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
lsof -i :8082

# Use alternative configuration
docker-compose -f docker-compose-8081.yml up --build
```

### Container Won't Start

```bash
# Check logs for errors
docker-compose logs backend

# Verify environment variables
docker-compose config | grep -A 10 environment
```

### Network Connectivity Issues

```bash
# Test backend from frontend container
docker exec ai-chat-frontend-1 ping backend

# Test host access from backend
docker exec ai-chat-backend-1 ping host.docker.internal
```

### Database Persistence Issues

```bash
# Check volume contents
docker volume inspect day1_h2-data

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up --build
```
