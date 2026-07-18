# Environment Variables Guide

## Overview

The AI Chat application uses environment variables for configuration, allowing flexible deployment across different environments without code changes. All variables are defined in the `.env` file, which is loaded by Docker Compose during container startup.

## Required Variables

These variables must be set for the application to function correctly.

### AI_API_KEY

**Type:** string  
**Required:** Yes  
**Example:** `sk-abc123xyz789`

The API key for authenticating with the AI provider. This key is sent in the `Authorization` header of all AI API requests. Never commit this value to version control.

**Security Note:** The `.env` file is listed in `.gitignore` to prevent accidental exposure of API keys.

### AI_API_URL

**Type:** string (URL)  
**Required:** Yes  
**Example:** `http://host.docker.internal:11434/v1`

The base URL of the OpenAI-compatible AI API endpoint. This URL is used for all chat completion requests. For local Ollama installations, use the host.docker.internal hostname to access the host machine from within Docker containers.

**Common Values:**
| Provider | URL |
|----------|-----|
| Ollama (local) | `http://host.docker.internal:11434/v1` |
| GPUStack | `http://gpustack-server:8000/v1` |
| HuggingFace | `https://api-inference.huggingface.co/v1` |

### AI_MODEL

**Type:** string  
**Required:** Yes  
**Example:** `qwen3.5-397b-a17b`

The model identifier to use for chat completions. This value is sent in the `model` field of chat requests. The model must be available on the configured AI_API_URL endpoint.

**Recommended Models:**
- `qwen3.5-397b-a17b` - High-quality general purpose model
- `qwen3.6-27b` - Faster inference with good tool calling support
- `llama3.1-8b` - Lightweight model for simple queries

## Optional Variables

These variables provide additional configuration options.

### AI_PROVIDER

**Type:** string  
**Required:** No  
**Default:** `gpustack`  
**Valid Values:** `gpustack`, `huggingface`, `ollama`, `openai`

Identifies the AI provider for provider-specific behavior and logging. This value is used internally for feature detection and error handling.

### SERVER_PORT

**Type:** integer  
**Required:** No  
**Default:** `8082`  
**Valid Range:** 1024-65535

The port on which the Spring Boot backend server listens for HTTP requests. Must match the port exposed in the Docker Compose configuration.

**Common Configurations:**
| Deployment | SERVER_PORT | Frontend Port |
|------------|-------------|---------------|
| Default | 8082 | 5173 |
| Alternative | 8081 | 8086 |

### GPUSTACK_API_URL

**Type:** string (URL)  
**Required:** No  
**Example:** `http://gpustack.local:8000`

GPUStack-specific API URL for model management operations. Used when AI_PROVIDER is set to `gpustack`. This endpoint provides additional capabilities like model listing and status monitoring.

### HUGGINGFACE_API_URL

**Type:** string (URL)  
**Required:** No  
**Default:** `https://api-inference.huggingface.co/v1`  
**Example:** `https://api-inference.huggingface.co/v1`

HuggingFace Inference API base URL. Used when AI_PROVIDER is set to `huggingface`. This URL is used for model inference requests.

### HUGGINGFACE_TOKEN

**Type:** string  
**Required:** No  
**Example:** `hf_abc123xyz789`

HuggingFace authentication token for accessing gated models or higher rate limits. Required for certain models that require authentication.

**Security Note:** Like AI_API_KEY, this token should never be committed to version control.

## Embedding Variables

These variables configure the RAG embedding functionality.

### OLLAMA_EMBEDDING_MODEL

**Type:** string  
**Required:** No  
**Default:** `nomic-embed-text`  
**Example:** `nomic-embed-text`

The Ollama model used for generating document embeddings in the RAG system. This model must support the embedding API endpoint and should be optimized for semantic similarity tasks.

### EMBEDDING_DIMENSION

**Type:** integer  
**Required:** No  
**Default:** `768`  
**Example:** `768`

The dimension of the embedding vectors produced by the embedding model. Must match the actual output dimension of the configured OLLAMA_EMBEDDING_MODEL.

## RAG Configuration Variables

### RAG_INDEX_PATH

**Type:** string (file path)  
**Required:** No  
**Default:** `/data/rag-index/vectors.dat`  
**Example:** `/data/rag-index/vectors.dat`

Filesystem path for persisting the RAG vector index. This path is inside the backend container. For persistence across container restarts, ensure this path is mapped to a Docker volume.

### RAG_CHUNK_SIZE

**Type:** integer  
**Required:** No  
**Default:** `512`  
**Valid Range:** 128-4096

The target token count for RAG document chunks when using FIXED_SIZE chunking strategy. Larger chunks provide more context but may reduce retrieval precision.

### RAG_CHUNK_OVERLAP

**Type:** integer  
**Required:** No  
**Default:** `50`  
**Valid Range:** 0-512

Number of overlapping tokens between consecutive chunks. Overlap helps maintain context across chunk boundaries and improves retrieval quality for queries that span multiple chunks.

## Environment File Example

Here's a complete `.env` file example:

```bash
# Required AI Configuration
AI_API_KEY=sk-abc123xyz789
AI_API_URL=http://host.docker.internal:11434/v1
AI_MODEL=qwen3.5-397b-a17b

# Optional AI Configuration
AI_PROVIDER=ollama
SERVER_PORT=8082

# GPUStack (optional)
# GPUSTACK_API_URL=http://gpustack.local:8000

# HuggingFace (optional)
# HUGGINGFACE_API_URL=https://api-inference.huggingface.co/v1
# HUGGINGFACE_TOKEN=hf_abc123xyz789

# Embedding Configuration
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSION=768

# RAG Configuration
RAG_INDEX_PATH=/data/rag-index/vectors.dat
RAG_CHUNK_SIZE=512
RAG_CHUNK_OVERLAP=50
```

## Loading Environment Variables

Docker Compose automatically loads variables from the `.env` file in the project root directory. Variables are passed to containers through the `env_file` directive in the compose configuration.

**Verification:**
```bash
# Check loaded environment
docker-compose config | grep -A 5 environment

# View running container environment
docker exec ai-chat-backend-8082 env | grep AI_
```

## Troubleshooting

**Variable Not Found:**
- Ensure `.env` file is in the same directory as `docker-compose.yml`
- Check for typos in variable names (case-sensitive)
- Verify no BOM or encoding issues in the `.env` file

**Wrong Value Applied:**
- Default values in `application.yml` may override missing env vars
- Check Docker Compose file for hardcoded environment values
- Restart containers after changing `.env` file
