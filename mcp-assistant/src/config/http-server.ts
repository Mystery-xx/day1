import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { McpServer } from '@modelcontextprotocol/server';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { server as mcpServer } from '../index.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';

// ============================================================================
// Types
// ============================================================================

interface HttpServerConfig {
  port: number;
  host: string;
  serverName: string;
  serverVersion: string;
}

interface HttpServer {
  server: Server;
  transport: NodeStreamableHTTPServerTransport;
  mcpServer: McpServer;
  shutdown: () => Promise<void>;
}

// ============================================================================
// CORS Headers
// ============================================================================

function addCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, mcp-protocol-version');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
}

function handleCorsPreflight(res: ServerResponse): void {
  addCorsHeaders(res);
  res.writeHead(204, 'No Content');
  res.end();
}

// ============================================================================
// Health Endpoint
// ============================================================================

function handleHealthCheck(res: ServerResponse): void {
  addCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(200);
  res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
}

// ============================================================================
// HTTP Server Setup
// ============================================================================

async function createHttpMcpServer(config: HttpServerConfig): Promise<HttpServer> {
  // Use pre-configured MCP server from index.ts (with all tools registered)
  console.log(`[http-server] Using MCP server '${config.serverName}' v${config.serverVersion} with tools registered`);

  // Create HTTP transport (stateless mode for v1)
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
  });

  // Connect MCP server to transport
  await mcpServer.connect(transport);

  // Create HTTP server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'OPTIONS') {
      handleCorsPreflight(res);
      return;
    }

    if (url.pathname === '/health') {
      handleHealthCheck(res);
      return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      try {
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('[http-server] Error handling MCP request:', error);
        addCorsHeaders(res);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return;
    }

    // 404 for unknown paths
    addCorsHeaders(res);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return {
    server,
    transport,
    mcpServer,
    shutdown: async () => {
      console.log('[http-server] Shutting down...');
      
      // Close MCP server
      await mcpServer.close();
      console.log('[http-server] MCP server closed');

      // Close HTTP server
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('[http-server] HTTP server closed');
          resolve();
        });
      });
    },
  };
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

function setupGracefulShutdown(httpServer: HttpServer): void {
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[http-server] Received ${signal}, shutting down gracefully...`);
    try {
      await httpServer.shutdown();
      console.log('[http-server] Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('[http-server] Shutdown error:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ============================================================================
// Export Factory Function
// ============================================================================

export async function startHttpServer(
  serverName: string = 'multi-project-assistant',
  serverVersion: string = '2.0.0',
): Promise<HttpServer> {
  const config: HttpServerConfig = {
    port: PORT,
    host: HOST,
    serverName,
    serverVersion,
  };

  console.log(`[http-server] Starting MCP HTTP server...`);
  console.log(`[http-server] Configuration:`, {
    port: config.port,
    host: config.host,
    serverName: config.serverName,
    serverVersion: config.serverVersion,
    mode: 'stateless',
  });

  const httpServer = await createHttpMcpServer(config);

  // Setup graceful shutdown
  setupGracefulShutdown(httpServer);

  // Start listening
  await new Promise<void>((resolve, reject) => {
    httpServer.server.listen({
      port: config.port,
      host: config.host,
    }, () => {
      resolve();
    });
    httpServer.server.on('error', (err) => {
      reject(err);
    });
  });

  console.log(`[http-server] Server listening on http://${config.host}:${config.port}`);
  console.log(`[http-server] MCP endpoint: http://${config.host}:${config.port}/mcp`);
  console.log(`[http-server] Health check: http://${config.host}:${config.port}/health`);

  return httpServer;
}

// ============================================================================
// Default Export (for standalone usage)
// ============================================================================

export default startHttpServer;
