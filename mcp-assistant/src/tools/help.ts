import * as fs from 'fs';
import path from 'path';
import { simpleGit, type SimpleGit } from 'simple-git';
import Fuse from 'fuse.js';
import * as z from 'zod/v4';

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = '/mnt/f/git/day1/mcp-assistant';
const BASE_INDEX_DIR = path.join(REPO_ROOT, '.index');
const PROJECTS_FILE = path.join(BASE_INDEX_DIR, 'projects.json');
const GIT_TIMEOUT_MS = 10000; // 10 seconds

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
  keys: Array<{ path: string[]; id: string; weight: number; src: string }>;
  records: FuseIndexRecord[];
}

interface DocChunk {
  title: string;
  content: string;
  path: string;
  score?: number;
}

interface ProjectState {
  branch: string;
  lastCommit: string;
  commitCount: number;
  indexedDocs: number;
  lastIndexed: string | null;
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
// Project Registry
// ============================================================================

function loadProjectRegistry(): ProjectRegistry {
  if (!fs.existsSync(PROJECTS_FILE)) {
    return { projects: {} };
  }
  const content = fs.readFileSync(PROJECTS_FILE, 'utf-8');
  return JSON.parse(content);
}

function getProjectConfig(projectId: string): ProjectConfig | null {
  const registry = loadProjectRegistry();
  return registry.projects[projectId] || null;
}

function getProjectIndexFile(projectId: string): string {
  return path.join(BASE_INDEX_DIR, projectId, 'fuse-index.json');
}

// ============================================================================
// Git Sandboxing
// ============================================================================

/**
 * Creates a sandboxed git instance restricted to repo root with timeout
 */
function createSandboxedGit(): SimpleGit {
  return simpleGit({
    baseDir: REPO_ROOT,
    timeout: {
      block: GIT_TIMEOUT_MS,
    },
  });
}

/**
 * Validates that a git operation stays within sandbox bounds
 */
async function withGitTimeout<T>(
  operation: Promise<T>,
  operationName: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Git operation '${operationName}' timed out after ${GIT_TIMEOUT_MS}ms`));
    }, GIT_TIMEOUT_MS);
  });

  return Promise.race([operation, timeoutPromise]);
}

// ============================================================================
// Index Loading
// ============================================================================

/**
 * Loads the Fuse.js index from disk for a specific project
 */
function loadIndex(projectId: string): FuseIndexData | null {
  try {
    // Validate project exists
    const projectConfig = getProjectConfig(projectId);
    if (!projectConfig) {
      console.error(`[get_docs] Project not found: ${projectId}`);
      return null;
    }

    const indexFile = getProjectIndexFile(projectId);
    const indexData = fs.readFileSync(indexFile, 'utf-8');
    return JSON.parse(indexData) as FuseIndexData;
  } catch (error) {
    console.error(`[get_docs] Failed to load index for project ${projectId}: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Converts Fuse index records to searchable documents
 */
function indexToDocuments(indexData: FuseIndexData): DocChunk[] {
  return indexData.records.map((record) => {
    const title = record.$['0']?.v ?? 'Untitled';
    const content = record.$['1']?.v ?? '';
    const docPath = record.$['2']?.v ?? '';

    return {
      title,
      content,
      path: docPath,
    };
  });
}

// ============================================================================
// Tool: get_docs
// ============================================================================

/**
 * Schema for get_docs tool arguments
 */
export const getDocsSchema = z.object({
  projectId: z.string().min(1, { error: 'projectId is required' }).describe('Project ID to get docs from'),
  topic: z.string().max(100, 'Topic must be 100 characters or less').optional(),
});

export type GetDocsArgs = z.infer<typeof getDocsSchema>;

/**
 * Retrieves documentation sections via Fuse.js RAG lookup
 * - Without topic: returns project overview (README sections)
 * - With topic: returns relevant sections matching the topic
 */
export async function getDocsTool(args: GetDocsArgs): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  const { projectId, topic } = args;

  try {
    const indexData = loadIndex(projectId);

    if (!indexData) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Failed to load documentation index for project ${projectId}. Ensure .index/${projectId}/fuse-index.json exists.`,
          },
        ],
        isError: true,
      };
    }

    const documents = indexToDocuments(indexData);
    
    // Get project name for display
    const projectConfig = getProjectConfig(projectId);
    const projectName = projectConfig?.name || projectId;

    // If no topic provided, return project overview
    if (!topic || topic.trim() === '') {
      const overviewDocs = documents.filter(
        (doc) =>
          doc.path.includes('README') ||
          doc.path.includes('project-overview') ||
          doc.path.includes('01-')
      );

      if (overviewDocs.length === 0) {
        // Fallback: return first few documents
        overviewDocs.push(...documents.slice(0, 3));
      }

      return {
        content: [
          {
            type: 'text',
            text: formatDocsResult(`${projectName} - Project Overview`, overviewDocs, projectId),
          },
        ],
      };
    }

    // With topic: use Fuse.js for RAG lookup
    const fuse = new Fuse(documents, {
      keys: ['title', 'content', 'path'],
      threshold: 0.4, // Lower = more strict matching
      includeScore: true,
      minMatchCharLength: 2,
    });

    const results = fuse.search(topic).slice(0, 5); // Top 5 results

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No documentation found for topic: "${topic}" in project ${projectName}. Try a different keyword or browse the project overview.`,
          },
        ],
      };
    }

    const matchedDocs = results.map((result) => ({
      title: result.item.title,
      content: result.item.content,
      path: result.item.path,
      score: result.score,
    }));

    return {
      content: [
        {
          type: 'text',
          text: formatDocsResult(`${projectName} - Documentation for "${topic}"`, matchedDocs, projectId),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[get_docs] Error: ${errorMessage}`);

    return {
      content: [
        {
          type: 'text',
          text: `Error in get_docs: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Formats documentation results as markdown
 */
function formatDocsResult(header: string, docs: DocChunk[], projectId?: string): string {
  const lines: string[] = [`## ${header}\n`];
  
  if (projectId) {
    const projectConfig = getProjectConfig(projectId);
    const projectName = projectConfig?.name || projectId;
    lines.push(`**Project:** ${projectName}\n`);
  }

  for (const doc of docs) {
    lines.push(`### ${doc.title}`);
    lines.push(`**Source:** ${doc.path}\n`);

    // Truncate content if too long (max 500 chars per section)
    const preview =
      doc.content.length > 500 ? doc.content.substring(0, 500) + '...' : doc.content;
    lines.push(preview);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Tool: get_project_state
// ============================================================================

/**
 * Schema for get_project_state tool arguments (no args)
 */
export const getProjectStateSchema = z.object({});

export type GetProjectStateArgs = z.infer<typeof getProjectStateSchema>;

/**
 * Retrieves current project state including git info and index status
 */
export async function getProjectStateTool(): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  const git = createSandboxedGit();

  try {
    // Gather all git info in parallel
    const [branchSummary, commitLog, indexedDocs] = await Promise.all([
      withGitTimeout(git.branchLocal(), 'branchLocal'),
      withGitTimeout(git.log({ maxCount: 1 }), 'log'),
      Promise.resolve(getIndexStats()),
    ]);

    const currentBranch = branchSummary.current || 'unknown';
    const lastCommitHash = commitLog.latest?.hash?.substring(0, 7) || 'unknown';
    const commitCount = commitLog.total || 0;

    const state: ProjectState = {
      branch: currentBranch,
      lastCommit: lastCommitHash,
      commitCount,
      indexedDocs: indexedDocs.count,
      lastIndexed: indexedDocs.lastModified,
    };

    return {
      content: [
        {
          type: 'text',
          text: formatProjectState(state),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[get_project_state] Error: ${errorMessage}`);

    return {
      content: [
        {
          type: 'text',
          text: `Error in get_project_state: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Gets index file statistics for a specific project
 */
function getIndexStats(projectId?: string): { count: number; lastModified: string | null } {
  try {
    if (!projectId) {
      // Legacy behavior: use default project
      const defaultProjectId = 'default';
      const indexFile = getProjectIndexFile(defaultProjectId);
      const stats = fs.statSync(indexFile);
      const indexData = loadIndex(defaultProjectId);
      const count = indexData?.records.length || 0;
      const lastModified = stats.mtime.toISOString();
      return { count, lastModified };
    }
    
    const indexFile = getProjectIndexFile(projectId);
    const stats = fs.statSync(indexFile);
    const indexData = loadIndex(projectId);
    const count = indexData?.records.length || 0;
    const lastModified = stats.mtime.toISOString();

    return { count, lastModified };
  } catch {
    return { count: 0, lastModified: null };
  }
}

/**
 * Formats project state as markdown
 */
function formatProjectState(state: ProjectState): string {
  return `## Project State

| Property | Value |
|----------|-------|
| **Branch** | \`${state.branch}\` |
| **Last Commit** | \`${state.lastCommit}\` |
| **Commit Count** | ${state.commitCount} |
| **Indexed Docs** | ${state.indexedDocs} |
| **Last Indexed** | ${state.lastIndexed || 'Never'} |

\`\`\`json
${JSON.stringify(state, null, 2)}
\`\`\``;
}
