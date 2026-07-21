#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './index.js';

const PORT = parseInt(process.env.FILE_ASSISTANT_PORT || '3000', 10);
const MCP_PATH = process.env.FILE_ASSISTANT_MCP_PATH || '/mcp';

/**
 * Shared server instance. StreamableHTTPServerTransport supports a single
 * session; the McpServer is connected once and the transport handles
 * session management (initialize creates a session, subsequent requests
 * use the mcp-session-id header).
 */
async function main() {
  const mcpServer = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  await mcpServer.connect(transport);

  const app = express();

  // CORS for frontend access
  app.use(cors());

  // JSON body parsing (pre-parsed body avoids stream re-read in handleRequest)
  app.post(MCP_PATH, express.json(), async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'streamable-http' });
  });

  app.listen(PORT, () => {
    console.error(`file-assistant MCP server running on http://localhost:${PORT}${MCP_PATH}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
