# AI Chat Project Overview

## Introduction

AI Chat is a modern web application that provides an intelligent conversational interface powered by large language models. The project combines a Spring Boot backend with a React frontend, delivering a seamless user experience for interacting with AI models through a clean, responsive interface.

## Architecture

The application follows a client-server architecture with clear separation of concerns:

### Backend (Spring Boot 3.2, Java 17)

The backend is built using Spring Boot 3.2 with Java 17, providing a robust foundation for handling AI API interactions, MCP server management, and RAG (Retrieval Augmented Generation) functionality. Key components include:

- **REST Controllers**: Handle HTTP requests for chat, MCP management, and RAG operations
- **Services**: Business logic for AI communication, vector indexing, and tool execution
- **Entities**: JPA entities for persisting MCP server configurations in H2 database
- **WebClient**: Reactive HTTP client for non-blocking AI API calls

### Frontend (React 18, Vite 5)

The frontend is a single-page application built with React 18 and Vite 5, offering:

- Real-time chat interface with streaming responses
- MCP server configuration UI
- Document upload and RAG search capabilities
- Session-based chat history management

### AI Integration

The application connects to OpenAI-compatible AI APIs, supporting multiple providers:

- **GPUStack**: Local GPU-accelerated model hosting
- **HuggingFace**: Cloud-based model inference
- **Ollama**: Local model running with embedding support

## Key Features

### Chat Interface

Users can engage in natural conversations with AI models. The backend manages conversation context, sending message history along with each request to maintain coherent multi-turn dialogues.

### MCP (Model Context Protocol)

The application supports MCP for tool calling, enabling AI models to execute external functions. This allows the AI to fetch real-time data, perform calculations, or interact with external systems through standardized tool interfaces.

### RAG (Retrieval Augmented Generation)

The RAG system enhances AI responses with domain-specific knowledge:

1. **Document Upload**: Users upload markdown or text documents
2. **Chunking**: Documents are split into semantic chunks
3. **Embedding**: Each chunk is converted to a vector using Ollama's nomic-embed-text model
4. **Vector Storage**: Embeddings are stored in an HNSW-inspired index
5. **Semantic Search**: Queries retrieve relevant chunks using cosine similarity
6. **Context Injection**: Retrieved chunks are injected into AI prompts

## Deployment

The application is designed for Docker deployment with two pre-configured setups:

- **Default (Port 8082)**: Backend on 8082, Frontend on 5173
- **Alternative (Port 8081)**: Backend on 8081, Frontend on 8086

Both configurations use Docker Compose for orchestration, with persistent H2 database volumes and isolated networks.

## Project Structure

```
day1/
├── ai-chat-backend/          # Spring Boot application
├── ai-chat-frontend/         # React application
├── docker-compose.yml        # Default deployment
├── docker-compose-8081.yml   # Alternative deployment
└── test-documents/           # RAG test documentation
```

## Technology Stack Summary

| Component | Technology |
|-----------|------------|
| Backend Framework | Spring Boot 3.2 |
| Backend Language | Java 17 |
| Frontend Framework | React 18 |
| Build Tool (Frontend) | Vite 5 |
| Database | H2 (embedded) |
| Container Orchestration | Docker Compose |
| AI API | OpenAI-compatible REST |
| Embedding Model | nomic-embed-text (Ollama) |
