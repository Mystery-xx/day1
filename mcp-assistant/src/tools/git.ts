import { simpleGit, SimpleGit, StatusResult, DefaultLogFields, ListLogLine } from 'simple-git';
import * as z from 'zod/v4';
import path from 'path';
import { projectRegistry } from '../config/project-registry.js';

// ============================================================================
// Configuration
// ============================================================================

const GIT_TIMEOUT_MS = 30000; // 30 second timeout

// ============================================================================
// Path Sandboxing for Git Operations
// ============================================================================

export class GitSandbox {
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = path.normalize(path.resolve(repoRoot));
  }

  /**
   * Validate that a path is within the repo sandbox
   */
  validatePath(requestedPath: string): { valid: boolean; resolvedPath?: string; error?: string } {
    try {
      // Decode URL-encoded characters first (security: prevent %2F traversal)
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(requestedPath);
      } catch {
        return {
          valid: false,
          error: `Access denied: Invalid path encoding in '${requestedPath}'.`,
        };
      }

      // Normalize the requested path
      const normalizedRequested = path.normalize(decodedPath);

      // Check for path traversal attempts before resolving
      if (normalizedRequested.includes('..')) {
        // Additional check: ensure it doesn't escape root after normalization
        const resolvedPath = path.resolve(this.repoRoot, normalizedRequested);
        if (!resolvedPath.startsWith(this.repoRoot + path.sep) && resolvedPath !== this.repoRoot) {
          return {
            valid: false,
            error: `Access denied: Path '${requestedPath}' attempts to escape repository sandbox.`,
          };
        }
      }

      // Resolve to absolute path
      const resolvedPath = path.resolve(this.repoRoot, normalizedRequested);

      if (!resolvedPath.startsWith(this.repoRoot)) {
        return {
          valid: false,
          error: `Access denied: Path '${requestedPath}' is outside the repository sandbox.`,
        };
      }

      return { valid: true, resolvedPath };
    } catch (err) {
      return {
        valid: false,
        error: `Access denied: Invalid path format - ${(err as Error).message}`,
      };
    }
  }

  /**
   * Get a simple-git instance configured for the sandboxed repo
   */
  getGitInstance(): SimpleGit {
    return simpleGit(this.repoRoot).env({
      GIT_TIMEOUT: GIT_TIMEOUT_MS.toString(),
    });
  }
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const gitStatusSchema = z.object({
  projectId: z.string().min(1).describe('Project ID to get git status for'),
});

export const gitDiffSchema = z.object({
  projectId: z.string().min(1).describe('Project ID to get git diff for'),
  staged: z.boolean().optional().default(false).describe('Show staged changes only'),
  file: z.string().optional().describe('Optional file path to diff'),
});

export const gitLogSchema = z.object({
  projectId: z.string().min(1).describe('Project ID to get git log for'),
  limit: z.number().min(1).max(20).default(10).describe('Number of commits to return (1-20, default: 10)'),
  file: z.string().optional().describe('Optional file path to get log for'),
});

export const gitBranchSchema = z.object({
  projectId: z.string().min(1).describe('Project ID to get git branch for'),
});

// ============================================================================
// Git Status Tool
// ============================================================================

export async function gitStatus(args: { projectId: string }): Promise<{
  staged: string[];
  unstaged: string[];
  untracked: string[];
}> {
  // Load registry and get project
  await projectRegistry.load();
  const project = projectRegistry.get(args.projectId);
  
  if (!project) {
    throw new Error(`Project with ID '${args.projectId}' not found in registry`);
  }

  const gitSandbox = new GitSandbox(project.rootPath);
  const git = gitSandbox.getGitInstance();

  try {
    const status: StatusResult = await git.status();

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [...status.not_added];

    // Process all files from status
    for (const file of status.files) {
      const { path: filePath, index, working_dir } = file;

      // Index status: 'A'=added, 'M'=modified, 'D'=deleted, 'R'=renamed
      if (index !== ' ' && index !== '?') {
        staged.push(filePath);
      }

      // Working directory status
      if (working_dir !== ' ' && working_dir !== '?') {
        unstaged.push(filePath);
      }

      // Untracked files
      if (index === '?' || working_dir === '?') {
        untracked.push(filePath);
      }
    }

    // Remove duplicates from untracked (not_added may overlap with files)
    const uniqueUntracked = [...new Set(untracked)];

    return {
      staged: staged.sort(),
      unstaged: unstaged.sort(),
      untracked: uniqueUntracked.sort(),
    };
  } catch (error) {
    throw new Error(`Git status failed: ${(error as Error).message}`);
  }
}

// ============================================================================
// Git Diff Tool
// ============================================================================

export async function gitDiff(options: { projectId: string; staged?: boolean; file?: string }): Promise<string> {
  // Load registry and get project
  await projectRegistry.load();
  const project = projectRegistry.get(options.projectId);
  
  if (!project) {
    throw new Error(`Project with ID '${options.projectId}' not found in registry`);
  }

  const gitSandbox = new GitSandbox(project.rootPath);
  const git = gitSandbox.getGitInstance();

  try {
    let diffArgs: string[] = [];

    // Handle staged vs unstaged
    if (options.staged) {
      diffArgs.push('--cached');
    }

    // Handle specific file
    if (options.file) {
      const pathCheck = gitSandbox.validatePath(options.file);
      if (!pathCheck.valid) {
        throw new Error(pathCheck.error!);
      }
      // Use relative path from repo root
      const relativePath = path.relative(project.rootPath, pathCheck.resolvedPath!);
      diffArgs.push('--', relativePath);
    }

    const diff = await git.diff(diffArgs);
    return diff || '(no changes)';
  } catch (error) {
    throw new Error(`Git diff failed: ${(error as Error).message}`);
  }
}

// ============================================================================
// Git Log Tool
// ============================================================================

export async function gitLog(options: { projectId: string; limit?: number; file?: string }): Promise<
  Array<{
    hash: string;
    author: string;
    date: string;
    message: string;
  }>
> {
  // Load registry and get project
  await projectRegistry.load();
  const project = projectRegistry.get(options.projectId);
  
  if (!project) {
    throw new Error(`Project with ID '${options.projectId}' not found in registry`);
  }

  const gitSandbox = new GitSandbox(project.rootPath);
  const git = gitSandbox.getGitInstance();
  const limit = Math.min(Math.max(options.limit || 10, 1), 20);

  try {
    const logOptions: { file?: string; maxCount?: number } = {
      maxCount: limit,
    };

    if (options.file) {
      const pathCheck = gitSandbox.validatePath(options.file);
      if (!pathCheck.valid) {
        throw new Error(pathCheck.error!);
      }
      logOptions.file = path.relative(project.rootPath, pathCheck.resolvedPath!);
    }

    const logResult = await git.log(logOptions);
    const commits = logResult.all;

    return commits.map((commit: DefaultLogFields & ListLogLine) => ({
      hash: commit.hash,
      author: commit.author_name,
      date: commit.date,
      message: commit.message,
    }));
  } catch (error) {
    throw new Error(`Git log failed: ${(error as Error).message}`);
  }
}

// ============================================================================
// Git Branch Tool
// ============================================================================

export async function gitBranch(options: { projectId: string }): Promise<{
  current: string;
  branches: string[];
}> {
  // Load registry and get project
  await projectRegistry.load();
  const project = projectRegistry.get(options.projectId);
  
  if (!project) {
    throw new Error(`Project with ID '${options.projectId}' not found in registry`);
  }

  const gitSandbox = new GitSandbox(project.rootPath);
  const git = gitSandbox.getGitInstance();

  try {
    const branchSummary = await git.branch();
    const branches = branchSummary.all.sort();
    const current = branchSummary.current || '';

    return {
      current,
      branches,
    };
  } catch (error) {
    throw new Error(`Git branch failed: ${(error as Error).message}`);
  }
}

// ============================================================================
// Factory Functions for MCP Tool Handlers
// ============================================================================

export function createGitTools() {
  return {
    gitStatus: (args: { projectId: string }) => gitStatus(args),
    gitDiff: (args: { projectId: string; staged?: boolean; file?: string }) => gitDiff(args),
    gitLog: (args: { projectId: string; limit?: number; file?: string }) => gitLog(args),
    gitBranch: (args: { projectId: string }) => gitBranch(args),
  };
}
