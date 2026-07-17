import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { projectRegistry } from '../config/project-registry.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_EXCLUDE = ['node_modules', '.git', '.env', '.env.*'];
const MAX_DEPTH = 5;
const MIN_DEPTH = 1;
const DEFAULT_MAX_RESULTS = 50;
const TIMEOUT_MS = 5000;

// ============================================================================
// Types
// ============================================================================

export interface ProjectStructureResult {
  tree: string;
  directories: string[];
  files: string[];
}

export interface FindFilesResult {
  files: string[];
  count: number;
  truncated: boolean;
}

export interface StructureToolArgs {
  projectId: string;
  depth?: number;
  exclude?: string[];
}

export interface FindFilesToolArgs {
  projectId: string;
  pattern: string;
  maxResults?: number;
  path?: string;
}

// ============================================================================
// Path Sandboxing
// ============================================================================

export class PathSandbox {
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
          error: `Access denied: path must be within repo root`,
        };
      }

      // Verify the path exists and get real path (resolves symlinks)
      try {
        const realPath = await fs.realpath(resolvedPath);

        // Final check: ensure real path is still within sandbox
        if (!realPath.startsWith(this.rootPath)) {
          return {
            valid: false,
            error: `Access denied: path must be within repo root`,
          };
        }

        return { valid: true, resolvedPath: realPath };
      } catch {
        // Path doesn't exist - for file creation operations, check parent directory
        const parentDir = path.dirname(resolvedPath);
        try {
          const realParentPath = await fs.realpath(parentDir);
          if (!realParentPath.startsWith(this.rootPath)) {
            return {
              valid: false,
              error: `Access denied: path must be within repo root`,
            };
          }
          return { valid: true, resolvedPath: resolvedPath };
        } catch {
          return {
            valid: false,
            error: `Access denied: path must be within repo root`,
          };
        }
      }
    } catch {
      return {
        valid: false,
        error: `Access denied: path must be within repo root`,
      };
    }
  }
}

// ============================================================================
// Helper: Check if path should be excluded
// ============================================================================

function isExcluded(entryName: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    // Exact match
    if (entryName === pattern) {
      return true;
    }
    // Wildcard match for .env.*
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
      if (regex.test(entryName)) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================================
// Tool: project_structure
// ============================================================================

async function buildDirectoryTree(
  dirPath: string,
  depth: number,
  maxDepth: number,
  excludePatterns: string[],
  rootPath: string
): Promise<{ tree: string; directories: string[]; files: string[] }> {
  const lines: string[] = [];
  const directories: string[] = [];
  const files: string[] = [];

  async function scan(currentPath: string, currentDepth: number, prefix: string): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      // Sort: directories first, then files
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        // Skip excluded entries
        if (isExcluded(entry.name, excludePatterns)) {
          continue;
        }

        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = prefix + (isLast ? '    ' : '│   ');

        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);

        if (entry.isDirectory()) {
          directories.push(relativePath);
          lines.push(`${prefix}${connector}${entry.name}/`);
          await scan(fullPath, currentDepth + 1, childPrefix);
        } else {
          files.push(relativePath);
          lines.push(`${prefix}${connector}${entry.name}`);
        }
      }
    } catch {
      // Skip directories we can't read (permission errors, etc.)
      console.warn(`[project_structure] Cannot read directory: ${currentPath}`);
    }
  }

  const rootName = path.basename(dirPath);
  lines.push(`${rootName}/`);
  await scan(dirPath, 1, '');

  return {
    tree: lines.join('\n'),
    directories,
    files,
  };
}

export async function projectStructure(
  args: StructureToolArgs,
): Promise<ProjectStructureResult> {
  // Load registry and get project
  await projectRegistry.load();
  const project = projectRegistry.get(args.projectId);
  
  if (!project) {
    throw new Error(`Project with ID '${args.projectId}' not found in registry`);
  }

  // Validate depth
  const depth = args.depth ?? 2;
  if (depth < MIN_DEPTH || depth > MAX_DEPTH) {
    throw new Error(`Depth must be between ${MIN_DEPTH} and ${MAX_DEPTH}, got ${depth}`);
  }

  // Build exclude list
  const excludePatterns = [...DEFAULT_EXCLUDE, ...(args.exclude || [])];

  // Create per-project sandbox
  const sandbox = new PathSandbox(project.rootPath);

  // Validate path
  const pathCheck = await sandbox.validatePath(project.rootPath);
  if (!pathCheck.valid) {
    throw new Error(pathCheck.error || 'Invalid path');
  }

  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout: operation exceeded ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });

  // Execute with timeout
  const resultPromise = buildDirectoryTree(project.rootPath, 1, depth, excludePatterns, project.rootPath);

  return Promise.race([resultPromise, timeoutPromise]) as Promise<ProjectStructureResult>;
}

// ============================================================================
// Tool: find_files
// ============================================================================

export async function findFiles(
  args: FindFilesToolArgs,
): Promise<FindFilesResult> {
  // Load registry and get project
  await projectRegistry.load();
  const project = projectRegistry.get(args.projectId);
  
  if (!project) {
    throw new Error(`Project with ID '${args.projectId}' not found in registry`);
  }

  // Validate pattern
  if (!args.pattern || args.pattern.trim() === '') {
    throw new Error('Pattern must be a non-empty string');
  }

  const maxResults = args.maxResults ?? DEFAULT_MAX_RESULTS;
  const searchPath = args.path ?? project.rootPath;

  // Create per-project sandbox
  const sandbox = new PathSandbox(project.rootPath);

  // Validate path
  const pathCheck = await sandbox.validatePath(searchPath);
  if (!pathCheck.valid) {
    throw new Error(pathCheck.error || 'Invalid path');
  }

  // Build ignore patterns
  const ignorePatterns = DEFAULT_EXCLUDE.map((p) => {
    if (p.includes('*')) {
      return `**/${p}`;
    }
    return `**/${p}/**`;
  });

  // Create timeout/abort controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Execute glob search with timeout
    const globPromise = glob(args.pattern, {
      cwd: pathCheck.resolvedPath!,
      ignore: ignorePatterns,
      nodir: false,
      absolute: false,
      signal: controller.signal,
      maxDepth: 10, // Limit depth for safety
    });

    const allMatches = await globPromise;

    // Limit results
    const truncated = allMatches.length > maxResults;
    const limitedMatches = allMatches.slice(0, maxResults);

    return {
      files: limitedMatches,
      count: limitedMatches.length,
      truncated,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Timeout: operation exceeded ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Exports for MCP integration
// ============================================================================

export function createStructureTools() {
  return {
    projectStructure: (args: StructureToolArgs) =>
      projectStructure(args),
    findFiles: (args: FindFilesToolArgs) =>
      findFiles(args),
  };
}
