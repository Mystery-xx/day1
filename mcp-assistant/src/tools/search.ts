import Fuse from 'fuse.js';
import * as z from 'zod/v4';
import * as fs from 'fs';
import path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = '/mnt/f/git/day1/mcp-assistant';
const BASE_INDEX_DIR = path.join(REPO_ROOT, '.index');
const PROJECTS_FILE = path.join(BASE_INDEX_DIR, 'projects.json');

// Sensitive paths to exclude from search results
const SENSITIVE_PATTERNS = [
  /^node_modules\//,
  /^\.git\//,
  /^\.env/,
  /\/node_modules\//,
  /\/\.git\//,
  /\/\.env/,
];

// ============================================================================
// Types
// ============================================================================

interface FuseIndexRecord {
  i: number;
  $: {
    [key: string]: {
      v: string;
      n: number;
    };
  };
}

interface FuseIndexData {
  keys: Array<{
    path: string[];
    id: string;
    weight: number;
    src: string;
  }>;
  records: FuseIndexRecord[];
}

interface SearchChunk {
  path: string;
  section: string;
  content: string;
}

interface SearchResult {
  path: string;
  section: string;
  content: string;
  score: number;
  projectId: string;
  projectName?: string;
}

interface ProjectConfig {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  lastIndexed?: string;
}

interface ProjectRegistry {
  projects: Record<string, ProjectConfig>;
}

// ============================================================================
// Zod Schema
// ============================================================================

export const searchInputSchema = z.object({
  projectId: z.string().min(1, { error: 'projectId is required' }).describe('Project ID to search in'),
  query: z
    .string()
    .refine((val) => val.trim().length >= 3, { error: 'query must be at least 3 characters' })
    .refine((val) => val.length <= 200, { error: 'query must be at most 200 characters' })
    .describe('Search query string'),
  limit: z
    .number()
    .min(1, { error: 'limit must be at least 1' })
    .max(50, { error: 'limit must be at most 50' })
    .default(10)
    .describe('Maximum number of results to return'),
  filters: z
    .object({
      source: z.string().optional().describe('Filter by source file path'),
    })
    .optional()
    .describe('Optional search filters'),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

// ============================================================================
// Project Registry
// ============================================================================

function loadProjectRegistry(): ProjectRegistry {
  try {
    const content = fs.readFileSync(PROJECTS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { projects: {} };
  }
}

function getProjectConfig(projectId: string): ProjectConfig | null {
  const registry = loadProjectRegistry();
  return registry.projects[projectId] || null;
}

function getProjectIndexFile(projectId: string): string {
  return path.join(BASE_INDEX_DIR, projectId, 'fuse-index.json');
}

// ============================================================================
// Path Filtering
// ============================================================================

function isSensitivePath(filePath: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(filePath));
}

// ============================================================================
// Index Loading
// ============================================================================

const fuseCache = new Map<string, { fuse: Fuse<SearchChunk>; chunks: SearchChunk[] }>();

async function loadIndex(projectId: string): Promise<Fuse<SearchChunk>> {
  // Check cache first
  const cached = fuseCache.get(projectId);
  if (cached) {
    return cached.fuse;
  }

  // Validate project exists
  const projectConfig = await getProjectConfig(projectId);
  if (!projectConfig) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const indexFile = getProjectIndexFile(projectId);

  try {
    const indexData = fs.readFileSync(indexFile, 'utf-8');
    const parsed: FuseIndexData = JSON.parse(indexData);

    // Convert Fuse index records to searchable chunks
    const chunks: SearchChunk[] = parsed.records.map((record) => {
      const title = record.$['0']?.v || '';
      const content = record.$['1']?.v || '';
      const filePath = record.$['2']?.v || '';

      return {
        path: filePath,
        section: title,
        content: content,
      };
    });

    // Create Fuse instance with custom options
    const fuse = new Fuse(chunks, {
      keys: [
        { name: 'title', weight: 0.5 },
        { name: 'section', weight: 0.3 },
        { name: 'content', weight: 0.2 },
        { name: 'path', weight: 0.1 },
      ],
      threshold: 0.6,
      includeScore: true,
      minMatchCharLength: 3,
      shouldSort: true,
    });

    // Cache the result
    fuseCache.set(projectId, { fuse, chunks });

    return fuse;
  } catch (error) {
    throw new Error(
      `Failed to load Fuse index for project ${projectId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Search Function
// ============================================================================

export async function search(args: SearchInput): Promise<{
  results: SearchResult[];
  total: number;
}> {
  const { projectId, query, limit, filters } = args;

  // Load project-specific index
  const fuse = await loadIndex(projectId);
  
  // Get cached chunks for this project
  const cached = fuseCache.get(projectId);
  if (!cached) {
    throw new Error('Chunks cache not loaded');
  }
  const chunksCache = cached.chunks;

  // Perform search
  const rawResults = fuse.search(query, { limit: 100 });

  // Filter results
  const filteredResults = rawResults.filter((result) => {
    // Exclude sensitive paths
    if (isSensitivePath(result.item.path)) {
      return false;
    }

    // Apply source filter if provided
    if (filters?.source && !result.item.path.includes(filters.source)) {
      return false;
    }

    return true;
  });

  // Get project name for results
  const projectConfig = await getProjectConfig(projectId);
  const projectName = projectConfig?.name;

  // Format results
  const results: SearchResult[] = filteredResults.slice(0, limit).map((result) => ({
    path: result.item.path,
    section: result.item.section,
    content: result.item.content.substring(0, 500) + (result.item.content.length > 500 ? '...' : ''),
    score: result.score || 0,
    projectId,
    projectName,
  }));

  return {
    results,
    total: filteredResults.length,
  };
}

// ============================================================================
// MCP Tool Handler
// ============================================================================

export async function createSearchToolHandler(rateLimiter: {
  checkLimit: (toolName: string) => { allowed: boolean; message?: string };
  logViolation: (toolName: string) => void;
}) {
  return async (args: SearchInput) => {
    // Rate limiting
    const rateCheck = rateLimiter.checkLimit('search');
    if (!rateCheck.allowed) {
      rateLimiter.logViolation('search');
      return {
        content: [{ type: 'text' as const, text: rateCheck.message! }],
        isError: true,
      };
    }

    try {
      const result = await search(args);

      // Format output
      const projectNameStr = result.results[0]?.projectName ? ` in ${result.results[0].projectName}` : '';
      const output = result.results
        .map(
          (r, i) =>
            `### Result ${i + 1} (score: ${r.score.toFixed(3)})\n**Path:** ${r.path}\n**Section:** ${r.section}\n**Project:** ${r.projectName || r.projectId}\n\n${r.content}`
        )
        .join('\n\n---\n\n');

      const summary = `Found ${result.total} results for "${args.query}"${projectNameStr} (showing ${result.results.length})\n\n`;

      return {
        content: [{ type: 'text' as const, text: summary + output }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `Search error: ${errorMessage}` }],
        isError: true,
      };
    }
  };
}
