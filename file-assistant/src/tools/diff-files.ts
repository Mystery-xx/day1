// ============================================================================
// diffFiles MCP Tool — Unified diff between two files
// ============================================================================
//
// Compares two files within the same project and returns a unified diff
// string plus statistics (added, deleted, unchanged lines). Supports
// comparing the same file across different revisions by providing a
// git revision suffix (e.g., "HEAD", "main", commit hash).
//
// Security: All file paths are validated through PathSandbox to ensure
// they stay within the project root. Path traversal and symlink-based
// escapes are rejected.
//
// Truncation: Diffs exceeding 10000 lines are truncated with a warning.
// This prevents context-window overflow in the MCP response.
// ============================================================================

import { promises as fs } from 'fs';
import { execSync } from 'child_process';
import { createTwoFilesPatch } from 'diff';
import path from 'path';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ProjectConfigLoader } from '../config/project-config.js';
import * as z from 'zod/v4';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of diff lines before truncation */
const MAX_DIFF_LINES = 10_000;

// ============================================================================
// Zod Schema (v4)
// ============================================================================

/**
 * Input schema for the diffFiles MCP tool.
 *
 * Either:
 * - projectId + filePath1 + filePath2 — compare two files in the same project
 * - projectId + filePath + revision1 + revision2 — compare same file across revisions
 */
export const diffFilesSchema = {
  projectId: z.string().describe('The project ID (registered in project registry)'),
  filePath1: z.string().optional().describe('Path to the first file (relative to project root)'),
  filePath2: z.string().optional().describe('Path to the second file (relative to project root)'),
  revision1: z.string().optional().describe('Git revision/tree-ish for filePath1 (e.g., HEAD, main, commit-sha). Requires filePath1 to be set.'),
  revision2: z.string().optional().describe('Git revision/tree-ish for filePath2 (e.g., HEAD, main, commit-sha). Requires filePath2 to be set.'),
};

export interface DiffFilesArgs {
  projectId: string;
  filePath1?: string;
  filePath2?: string;
  revision1?: string;
  revision2?: string;
}

// ============================================================================
// Result Types
// ============================================================================

export interface DiffStats {
  added: number;
  deleted: number;
  unchanged: number;
}

export interface DiffFilesResult {
  diff: string;
  stats: DiffStats;
  truncated: boolean;
  warning?: string;
}

// ============================================================================
// Diff Implementation
// ============================================================================

/**
 * Read a file's content, either from disk or from a git revision.
 *
 * When a revision is specified, uses `git show <revision>:<filePath>` to
 * retrieve the file content from that git tree-ish. The revision must be
 * a valid git ref, commit SHA, or tree-ish.
 *
 * When no revision is specified, reads the current file from disk (with
 * PathSandbox validation).
 */
async function readFileContent(
  sandbox: PathSandbox,
  projectRoot: string,
  filePath: string,
  revision?: string,
): Promise<{ content: string; error?: string }> {
  if (revision) {
    // Git revision mode: read from git history
    try {
      const content = execSync(
        `GIT_MASTER=1 git show "${revision}:${filePath}"`,
        { cwd: projectRoot, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
      );
      return { content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: '',
        error: `Failed to read '${filePath}' at revision '${revision}': ${message}`,
      };
    }
  }

  // Disk read mode: use PathSandbox
  const resolved = await sandbox.resolvePath(filePath).catch((err: Error) => err.message);
  if (typeof resolved === 'string' && !resolved.startsWith('/')) {
    return { content: '', error: resolved };
  }

  try {
    const content = await fs.readFile(resolved as string, 'utf-8');
    return { content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: '', error: `Failed to read '${filePath}': ${message}` };
  }
}

/**
 * Count stats from a unified diff string.
 *
 * Parses unified diff lines to count added (+), deleted (-), and
 * unchanged (context) lines. Diff headers, hunk headers, and
 * trailing minus-sign lines from the ---/+++ lines are excluded.
 */
export function computeDiffStats(diff: string): DiffStats {
  const lines = diff.split('\n');
  let added = 0;
  let deleted = 0;
  let unchanged = 0;

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deleted++;
    } else if (line.startsWith(' ')) {
      unchanged++;
    }
    // Header lines (---/+++/@@ ...) and empty lines are skipped
  }

  return { added, deleted, unchanged };
}

/**
 * Truncate a diff string to at most `maxLines` lines.
 *
 * Preserves the diff header (first 4 lines: diff --git, index, ---, +++)
 * and the first N hunk lines. Appends a truncation warning at the end.
 */
export function truncateDiff(diff: string, maxLines: number): { diff: string; truncated: boolean } {
  const lines = diff.split('\n');

  if (lines.length <= maxLines) {
    return { diff, truncated: false };
  }

  // Preserve the first maxLines lines
  const truncated = lines.slice(0, maxLines);

  // Add truncation warning
  truncated.push('');
  truncated.push(`--- Diff truncated: ${lines.length} total lines, showing first ${maxLines} ---`);

  return { diff: truncated.join('\n'), truncated: true };
}

// ============================================================================
// Tool Handler
// ============================================================================

/**
 * MCP tool: diffFiles — Compare two files and return unified diff.
 *
 * Supports:
 * - Comparing two different files: { projectId, filePath1, filePath2 }
 * - Comparing same file across revisions: { projectId, filePath, revision1, revision2 }
 * - Mixed: { projectId, filePath1, revision1, filePath2 }
 *
 * Returns { diff, stats, truncated, warning } on success.
 * Returns { content: [{ type: 'text', text: error }], isError: true } on failure.
 */
export async function handleDiffFiles(
  args: DiffFilesArgs,
  loader: ProjectConfigLoader,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { projectId, filePath1, filePath2, revision1, revision2 } = args;

  // Validate project exists
  if (!loader.isReady()) {
    await loader.load();
  }

  const project = loader.getProject(projectId);
  if (!project) {
    return {
      content: [{ type: 'text', text: `Project '${projectId}' not found in registry.` }],
      isError: true,
    };
  }

  const projectRoot = path.resolve(project.rootPath);
  const sandbox = new PathSandbox(projectRoot);

  // Resolve file paths
  // - If revision1 is set, filePath1 is used without sandbox validation
  //   (read from git history, not on-disk)
  // - Same for revision2 + filePath2
  //
  // Support cases:
  // 1. filePath1 + filePath2 (different files, disk)
  // 2. filePath (set as filePath1) + revision1 + revision2 (same file, different revisions)
  // 3. filePath1 + revision1 + filePath2 (mixed: disk vs revision)
  // 4. filePath1 + filePath2 + revision1 + revision2 (both from revisions)
  //
  // When filePath2 is omitted but revision1 and revision2 are given,
  // treat filePath1 as the file path for both revisions.

  const actualFilePath1 = filePath1 ?? '';
  const actualFilePath2 = filePath2 ?? filePath1 ?? '';

  if (!actualFilePath1) {
    return {
      content: [{ type: 'text', text: 'filePath1 is required.' }],
      isError: true,
    };
  }

  if (!actualFilePath2) {
    return {
      content: [{ type: 'text', text: 'filePath2 or revision2 is required.' }],
      isError: true,
    };
  }

  // Read file 1
  const file1 = await readFileContent(sandbox, projectRoot, actualFilePath1, revision1 ?? undefined);
  if (file1.error) {
    return {
      content: [{ type: 'text', text: file1.error }],
      isError: true,
    };
  }

  // Read file 2
  const file2 = await readFileContent(sandbox, projectRoot, actualFilePath2, revision2 ?? undefined);
  if (file2.error) {
    return {
      content: [{ type: 'text', text: file2.error }],
      isError: true,
    };
  }

  // Generate unified diff header labels
  const label1 = revision1 ? `${actualFilePath1} (${revision1})` : actualFilePath1;
  const label2 = revision2 ? `${actualFilePath2} (${revision2})` : actualFilePath2;

  // Generate unified diff
  const unifiedDiff = createTwoFilesPatch(label1, label2, file1.content, file2.content);

  // Compute stats
  const stats = computeDiffStats(unifiedDiff);

  // Truncate if needed
  const { diff: finalDiff, truncated } = truncateDiff(unifiedDiff, MAX_DIFF_LINES);

  const warning = truncated
    ? `Diff was truncated at ${MAX_DIFF_LINES} lines (original had ${unifiedDiff.split('\n').length} lines).`
    : undefined;

  const result: DiffFilesResult = { diff: finalDiff, stats, truncated, ...(warning ? { warning } : {}) };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

// ============================================================================
// Tool Registration Helper
// ============================================================================

/**
 * Create the MCP tool definition for diffFiles.
 *
 * Returns the tool name, description, schema, and handler closure.
 * The handler is pre-bound with the ProjectConfigLoader singleton.
 */
export function createDiffFilesTool(loader: ProjectConfigLoader) {
  return {
    name: 'diffFiles',
    description: 'Generate a unified diff between two files in a project. Supports comparing different files, same file across git revisions, or mixed (file vs revision). Returns diff string, line statistics (added/deleted/unchanged), and a truncated flag for large diffs.',
    schema: diffFilesSchema,
    handler: (args: DiffFilesArgs) => handleDiffFiles(args, loader),
  };
}
