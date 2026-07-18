import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { startHttpServer } from './config/http-server.js';
import { ProjectRegistry } from './config/project-registry.js';
import { createSearchToolHandler, searchInputSchema } from './tools/search.js';
import { createStructureTools } from './tools/structure.js';
import {
  createGitTools,
  gitStatusSchema,
  gitDiffSchema,
  gitLogSchema,
  gitBranchSchema,
} from './tools/git.js';
import {
  getDocsSchema,
  getDocsTool,
  getProjectStateSchema,
  getProjectStateTool,
} from './tools/help.js';
import {
  createIndexToolHandler,
  indexInputSchema,
} from './tools/index.js';
import {
  createProjectTools,
  registerProjectSchema,
  unregisterProjectSchema,
  getProjectInfoSchema,
  listProjectsSchema,
} from './tools/projects.js';

// ============================================================================
// Configuration
// ============================================================================

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per tool per project

// ============================================================================
// Per-Project Rate Limiter
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

class PerProjectRateLimiter {
  private limits: Map<string, Map<string, RateLimitEntry>> = new Map();

  checkLimit(projectId: string, toolName: string): { allowed: boolean; message?: string } {
    const now = Date.now();
    
    let projectLimits = this.limits.get(projectId);
    if (!projectLimits) {
      projectLimits = new Map();
      this.limits.set(projectId, projectLimits);
    }

    const entry = projectLimits.get(toolName);

    if (!entry) {
      projectLimits.set(toolName, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      projectLimits.set(toolName, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
      return {
        allowed: false,
        message: `Rate limit exceeded for tool '${toolName}' in project '${projectId}'. Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per ${RATE_LIMIT_WINDOW_MS / 1000} seconds.`,
      };
    }

    entry.count++;
    return { allowed: true };
  }

  logViolation(projectId: string, toolName: string): void {
    console.error(`[RATE_LIMIT] Violation: Tool '${toolName}' in project '${projectId}' exceeded ${RATE_LIMIT_MAX_REQUESTS} req/min`);
  }
}

const rateLimiter = new PerProjectRateLimiter();

// Initialize project registry
const projectRegistry = new ProjectRegistry();

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

      return {
        content: [{ type: 'text' as const, text: `Error in ${toolName}: ${errorMessage}` }],
        isError: true,
      };
    }
  }) as T;
}

// ============================================================================
// Server Setup
// ============================================================================

export const server = new McpServer({
  name: 'multi-project-assistant',
  version: '2.0.0',
});

// Project management tools
const projectTools = createProjectTools();

server.registerTool(
  'list_projects',
  {
    title: 'List Projects',
    description: 'Returns all registered projects with id, name, rootPath, and lastIndexed timestamp',
    inputSchema: listProjectsSchema,
  },
  projectTools.listProjects
);

server.registerTool(
  'register_project',
  {
    title: 'Register Project',
    description: 'Register a new project for indexing. Validates that rootPath exists and is a directory',
    inputSchema: registerProjectSchema,
  },
  projectTools.registerProject
);

server.registerTool(
  'unregister_project',
  {
    title: 'Unregister Project',
    description: 'Remove a project from the registry by ID. Fails if project does not exist',
    inputSchema: unregisterProjectSchema,
  },
  projectTools.unregisterProject
);

server.registerTool(
  'get_project_info',
  {
    title: 'Get Project Info',
    description: 'Get full project configuration by ID. Fails if project does not exist',
    inputSchema: getProjectInfoSchema,
  },
  projectTools.getProjectInfo
);

// Index tool
let indexToolHandler: Awaited<ReturnType<typeof createIndexToolHandler>> | null = null;

const getIndexTool = async () => {
  if (!indexToolHandler) {
    indexToolHandler = await createIndexToolHandler();
  }
  return indexToolHandler;
};

const indexTool = withErrorHandling('index', async (args: any) => {
  const handler = await getIndexTool();
  return handler(args);
});

server.registerTool(
  'index',
  {
    title: 'Index',
    description: 'Index markdown files for a project. Validates projectId, scans folder for .md files, chunks content, and builds Fuse.js index.',
    inputSchema: indexInputSchema,
  },
  indexTool
);

// Get docs tool (no projectId needed - uses index)
server.registerTool(
  'get_docs',
  {
    title: 'Get Documentation',
    description: 'Retrieve documentation for a topic via RAG lookup. Without topic, returns project overview.',
    inputSchema: getDocsSchema,
  },
  withErrorHandling('get_docs', getDocsTool)
);

// Get project state tool (no args needed - uses current git context)
server.registerTool(
  'get_project_state',
  {
    title: 'Get Project State',
    description: 'Get current project state: branch, last commit, commit count, indexed docs',
    inputSchema: getProjectStateSchema,
  },
  withErrorHandling('get_project_state', getProjectStateTool)
);

// Git tools
const gitTools = createGitTools();

const gitStatusTool = withErrorHandling('git_status', async (args: { projectId: string }) => {
  const rateCheck = rateLimiter.checkLimit(args.projectId, 'git_status');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation(args.projectId, 'git_status');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  const result = await gitTools.gitStatus({ projectId: args.projectId });
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool(
  'git_status',
  {
    title: 'Git Status',
    description: 'Get git repository status for a project',
    inputSchema: gitStatusSchema,
  },
  gitStatusTool
);

const gitDiffTool = withErrorHandling('git_diff', async (args: { projectId: string; staged?: boolean; file?: string }) => {
  const rateCheck = rateLimiter.checkLimit(args.projectId, 'git_diff');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation(args.projectId, 'git_diff');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  const result = await gitTools.gitDiff({
    projectId: args.projectId,
    staged: args.staged,
    file: args.file,
  });

  return {
    content: [{ type: 'text' as const, text: result }],
  };
});

server.registerTool(
  'git_diff',
  {
    title: 'Git Diff',
    description: 'Get git diff for files or refs',
    inputSchema: gitDiffSchema,
  },
  gitDiffTool
);

const gitLogTool = withErrorHandling('git_log', async (args: { projectId: string; limit?: number; file?: string }) => {
  const rateCheck = rateLimiter.checkLimit(args.projectId, 'git_log');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation(args.projectId, 'git_log');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  const result = await gitTools.gitLog({
    projectId: args.projectId,
    limit: args.limit,
    file: args.file,
  });

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool(
  'git_log',
  {
    title: 'Git Log',
    description: 'Get git commit history',
    inputSchema: gitLogSchema,
  },
  gitLogTool
);

const gitBranchTool = withErrorHandling('git_branch', async (args: { projectId: string }) => {
  const rateCheck = rateLimiter.checkLimit(args.projectId, 'git_branch');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation(args.projectId, 'git_branch');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  const result = await gitTools.gitBranch({ projectId: args.projectId });

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool(
  'git_branch',
  {
    title: 'Git Branch',
    description: 'Get git branch information',
    inputSchema: gitBranchSchema,
  },
  gitBranchTool
);

// Structure tools
const structureTools = createStructureTools();

const projectStructureTool = withErrorHandling('project_structure', async (args: { projectId: string; depth?: number; exclude?: string[] }) => {
  const rateCheck = rateLimiter.checkLimit(args.projectId, 'project_structure');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation(args.projectId, 'project_structure');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  const result = await structureTools.projectStructure({
    projectId: args.projectId,
    depth: args.depth,
    exclude: args.exclude,
  });

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool(
  'project_structure',
  {
    title: 'Project Structure',
    description: 'Get the project directory structure as a tree',
    inputSchema: z.object({
      projectId: z.string().min(1).describe('Project ID from registry'),
      depth: z.number().min(1).max(5).default(2).describe('Directory depth (1-5, default: 2)'),
      exclude: z.array(z.string()).optional().describe('Additional patterns to exclude'),
    }),
  },
  projectStructureTool
);

const findFilesTool = withErrorHandling('find_files', async (args: { projectId: string; pattern: string; maxResults?: number; path?: string }) => {
  const rateCheck = rateLimiter.checkLimit(args.projectId, 'find_files');
  if (!rateCheck.allowed) {
    rateLimiter.logViolation(args.projectId, 'find_files');
    return { content: [{ type: 'text' as const, text: rateCheck.message! }], isError: true };
  }

  const result = await structureTools.findFiles({
    projectId: args.projectId,
    pattern: args.pattern,
    maxResults: args.maxResults,
    path: args.path,
  });

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
});

server.registerTool(
  'find_files',
  {
    title: 'Find Files',
    description: 'Find files matching a glob pattern',
    inputSchema: z.object({
      projectId: z.string().min(1).describe('Project ID from registry'),
      pattern: z.string().min(1).describe('Glob pattern to match (e.g., "**/*.ts")'),
      maxResults: z.number().default(50).describe('Maximum results to return (default: 50)'),
      path: z.string().optional().describe('Optional base path for search'),
    }),
  },
  findFilesTool
);

// Search tool (global, not project-specific)
let searchToolHandler: Awaited<ReturnType<typeof createSearchToolHandler>> | null = null;

const getSearchTool = async () => {
  if (!searchToolHandler) {
    searchToolHandler = await createSearchToolHandler({
      checkLimit: (toolName: string) => rateLimiter.checkLimit('default', toolName),
      logViolation: (toolName: string) => rateLimiter.logViolation('default', toolName),
    });
  }
  return searchToolHandler;
};

const searchTool = withErrorHandling('search', async (args: any) => {
  const handler = await getSearchTool();
  return handler(args);
});

server.registerTool(
  'search',
  {
    title: 'Search',
    description: 'Search for content within the project using fuzzy matching',
    inputSchema: searchInputSchema,
  },
  searchTool
);


