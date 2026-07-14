import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = '/mnt/f/git/day1';
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per tool

// ============================================================================
// Rate Limiter
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();

  checkLimit(toolName: string): { allowed: boolean; message?: string } {
    const now = Date.now();
    const entry = this.limits.get(toolName);

    if (!entry) {
      this.limits.set(toolName, { count: 1, windowStart: now });
      return { allowed: true };
    }

    // Reset window if expired
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      this.limits.set(toolName, { count: 1, windowStart: now });
      return { allowed: true };
    }

    // Check if limit exceeded
    if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
      return {
        allowed: false,
        message: `Rate limit exceeded for tool '${toolName}'. Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per ${RATE_LIMIT_WINDOW_MS / 1000} seconds.`,
      };
    }

    // Increment counter
    entry.count++;
    return { allowed: true };
  }

  logViolation(toolName: string): void {
    console.error(`[RATE_LIMIT] Violation: Tool '${toolName}' exceeded ${RATE_LIMIT_MAX_REQUESTS} req/min`);
  }
}

const rateLimiter = new RateLimiter();

// ============================================================================
// Path Sandboxing
// ============================================================================

class PathSandbox {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = path.normalize(path.resolve(rootPath));
  }

  async validatePath(requestedPath: string): Promise<{ valid: boolean; resolvedPath?: string; error?: string }> {
    try {
      // Normalize the requested path first
      const normalizedRequested = path.normalize(requestedPath);

      // Resolve to absolute path
      const resolvedPath = path.resolve(this.rootPath, normalizedRequested);

      // Check if path starts with root (basic check before realpath)
      if (!resolvedPath.startsWith(this.rootPath)) {
        return {
          valid: false,
          error: `Access denied: Path '${requestedPath}' is outside the sandbox directory.`,
        };
      }

      // Verify the path exists and get real path (resolves symlinks)
      try {
        const realPath = await fs.realpath(resolvedPath);

        // Final check: ensure real path is still within sandbox
        if (!realPath.startsWith(this.rootPath)) {
          return {
            valid: false,
            error: `Access denied: Path '${requestedPath}' resolves outside the sandbox directory via symlink.`,
          };
        }

        return { valid: true, resolvedPath: realPath };
      } catch (err) {
        // Path doesn't exist - for file creation operations, check parent directory
        const parentDir = path.dirname(resolvedPath);
        try {
          const realParentPath = await fs.realpath(parentDir);
          if (!realParentPath.startsWith(this.rootPath)) {
            return {
              valid: false,
              error: `Access denied: Parent directory of '${requestedPath}' is outside the sandbox.`,
            };
          }
          return { valid: true, resolvedPath: resolvedPath };
        } catch {
          return {
            valid: false,
            error: `Access denied: Path '${requestedPath}' does not exist and parent directory cannot be verified.`,
          };
        }
      }
    } catch (err) {
      return {
        valid: false,
        error: `Access denied: Invalid path format - ${(err as Error).message}`,
      };
    }
  }
}

const pathSandbox = new PathSandbox(REPO_ROOT);

// ============================================================================
// Error Handling Wrapper
// ============================================================================

function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  toolName: string,
  fn: T
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`[TOOL_ERROR] ${toolName}: ${errorMessage}`);

      // Return actionable error message
      return {
        content: [{ type: 'text' as const, text: `Error in ${toolName}: ${errorMessage}` }],
        isError: true,
      };
    }
  }) as T;
}

// ============================================================================
// Tool Implementations (Stubs)
// ============================================================================

// Tool 1: search
const searchTool = withErrorHandling('search', async (args: { query: string; path?: string }) => {
  const rateCheck = rateLimiter.checkLimit('search');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation('search');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  // Path validation if provided
  if (args.path) {
    const pathCheck = await pathSandbox.validatePath(args.path);
    if (!pathCheck.valid) {
      return { content: [{ type: 'text' as const, text: pathCheck.error! }], isError: true };
    }
  }

  return {
    content: [{ type: 'text' as const, text: `Search tool called with query: "${args.query}"` }],
  };
});

// Tool 2: project_structure
const projectStructureTool = withErrorHandling('project_structure', async () => {
  const rateCheck = rateLimiter.checkLimit('project_structure');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation('project_structure');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  return {
    content: [{ type: 'text' as const, text: 'Project structure tool called' }],
  };
});

// Tool 3: find_files
const findFilesTool = withErrorHandling('find_files', async (args: { pattern: string; path?: string }) => {
  const rateCheck = rateLimiter.checkLimit('find_files');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation('find_files');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  if (args.path) {
    const pathCheck = await pathSandbox.validatePath(args.path);
    if (!pathCheck.valid) {
      return { content: [{ type: 'text' as const, text: pathCheck.error! }], isError: true };
    }
  }

  return {
    content: [{ type: 'text' as const, text: `Find files tool called with pattern: "${args.pattern}"` }],
  };
});

// Tool 4: get_docs
const getDocsTool = withErrorHandling('get_docs', async (args: { topic: string }) => {
  const rateCheck = rateLimiter.checkLimit('get_docs');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation('get_docs');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  return {
    content: [{ type: 'text' as const, text: `Get docs tool called for topic: "${args.topic}"` }],
  };
});

// Tool 5: get_project_state
const getProjectStateTool = withErrorHandling('get_project_state', async () => {
  const rateCheck = rateLimiter.checkLimit('get_project_state');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation('get_project_state');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  return {
    content: [{ type: 'text' as const, text: 'Get project state tool called' }],
  };
});

// Tool 6: git_status
const gitStatusTool = withErrorHandling('git_status', async () => {
  const rateCheck = rateLimiter.checkLimit('git_status');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation('git_status');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  return {
    content: [{ type: 'text' as const, text: 'Git status tool called' }],
  };
});

// Tool 7: git_diff
const gitDiffTool = withErrorHandling('git_diff', async (args: { file?: string; ref?: string }) => {
  const rateCheck = rateLimiter.checkLimit('git_diff');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation('git_diff');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  if (args.file) {
    const pathCheck = await pathSandbox.validatePath(args.file);
    if (!pathCheck.valid) {
      return { content: [{ type: 'text' as const, text: pathCheck.error! }], isError: true };
    }
  }

  return {
    content: [{ type: 'text' as const, text: `Git diff tool called${args.file ? ` for file: "${args.file}"` : ''}${args.ref ? ` at ref: "${args.ref}"` : ''}` }],
  };
});

// Tool 8: git_log
const gitLogTool = withErrorHandling('git_log', async (args: { file?: string; maxCount?: number }) => {
  const rateCheck = rateLimiter.checkLimit('git_log');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation('git_log');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  if (args.file) {
    const pathCheck = await pathSandbox.validatePath(args.file);
    if (!pathCheck.valid) {
      return { content: [{ type: 'text' as const, text: pathCheck.error! }], isError: true };
    }
  }

  return {
    content: [{ type: 'text' as const, text: `Git log tool called${args.file ? ` for file: "${args.file}"` : ''}${args.maxCount ? ` (max ${args.maxCount} entries)` : ''}` }],
  };
});

// Tool 9: git_branch
const gitBranchTool = withErrorHandling('git_branch', async () => {
  const rateCheck = rateLimiter.checkLimit('git_branch');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation('git_branch');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  return {
    content: [{ type: 'text' as const, text: 'Git branch tool called' }],
  };
});

// ============================================================================
// Server Setup
// ============================================================================

const server = new McpServer({
  name: 'day1-assistant',
  version: '1.0.0',
});

// Register all tools with Zod validation schemas
server.registerTool(
  'search',
  {
    title: 'Search',
    description: 'Search for content within the project',
    inputSchema: z.object({
      query: z.string().describe('Search query string'),
      path: z.string().optional().describe('Optional path to limit search scope'),
    }),
  },
  searchTool as any
);

server.registerTool(
  'project_structure',
  {
    title: 'Project Structure',
    description: 'Get the project directory structure',
    inputSchema: z.object({}),
  },
  projectStructureTool as any
);

server.registerTool(
  'find_files',
  {
    title: 'Find Files',
    description: 'Find files matching a pattern',
    inputSchema: z.object({
      pattern: z.string().describe('File pattern to match (glob-style)'),
      path: z.string().optional().describe('Optional base path for search'),
    }),
  },
  findFilesTool as any
);

server.registerTool(
  'get_docs',
  {
    title: 'Get Documentation',
    description: 'Retrieve documentation for a topic',
    inputSchema: z.object({
      topic: z.string().describe('Documentation topic to retrieve'),
    }),
  },
  getDocsTool as any
);

server.registerTool(
  'get_project_state',
  {
    title: 'Get Project State',
    description: 'Get current project state and context',
    inputSchema: z.object({}),
  },
  getProjectStateTool as any
);

server.registerTool(
  'git_status',
  {
    title: 'Git Status',
    description: 'Get git repository status',
    inputSchema: z.object({}),
  },
  gitStatusTool as any
);

server.registerTool(
  'git_diff',
  {
    title: 'Git Diff',
    description: 'Get git diff for files or refs',
    inputSchema: z.object({
      file: z.string().optional().describe('Optional file path to diff'),
      ref: z.string().optional().describe('Optional git ref to compare'),
    }),
  },
  gitDiffTool as any
);

server.registerTool(
  'git_log',
  {
    title: 'Git Log',
    description: 'Get git commit history',
    inputSchema: z.object({
      file: z.string().optional().describe('Optional file path to get log for'),
      maxCount: z.number().optional().describe('Maximum number of commits to return'),
    }),
  },
  gitLogTool as any
);

server.registerTool(
  'git_branch',
  {
    title: 'Git Branch',
    description: 'Get git branch information',
    inputSchema: z.object({}),
  },
  gitBranchTool as any
);

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.error('[day1-assistant] Starting MCP server...');

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[day1-assistant] Server connected and listening on stdio');
  } catch (error) {
    console.error(`[day1-assistant] Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

main();
