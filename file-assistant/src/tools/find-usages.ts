// ============================================================================
// findUsages MCP Tool — Grep + regex usage search (NOT AST/codegraph)
// ============================================================================
//
// Finds all usages of a symbol in the project using grep + regex patterns:
//   (1) import statements: `import.*\b{symbol}\b`
//   (2) function calls:    `\b{symbol}\s*\(`
//   (3) class references:  `new\s+{symbol}\b`, `extends\s+{symbol}\b`
//   (4) variable assignments: `\b{symbol}\b`
//
// Excludes node_modules/, .git/ from search.
// Returns structured results with file, line, column, context line.
//
// Security: All paths are validated through PathSandbox. Outside-root
// and traversal paths are rejected.
// ============================================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import * as z from 'zod/v4';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ProjectConfigLoader } from '../config/project-config.js';

// ============================================================================
// Constants
// ============================================================================

/** Directories to exclude from search (always applied). */
const EXCLUDED_DIRS = new Set(['node_modules', '.git']);

/** Maximum number of results to return (safety limit). */
const MAX_RESULTS = 500;

/** Maximum length of context line text returned. */
const MAX_CONTEXT_LENGTH = 200;

// ============================================================================
// Types
// ============================================================================

export interface UsageEntry {
  file: string;
  line: number;
  column: number;
  context: string;
}

export interface FindUsagesResult {
  usages: UsageEntry[];
  total: number;
}

export interface FindUsagesInput {
  projectId: string;
  symbol: string;
  type?: 'import' | 'call' | 'reference' | 'all';
}

// ============================================================================
// Helper: Extract column from line content and symbol
// ============================================================================

/**
 * Find the 0-based column index of the first occurrence of `symbol`
 * in `lineText`. Uses word-boundary-aware matching when possible.
 */
function findColumn(lineText: string, symbol: string): number {
  // Try word-boundary match first: look for the symbol as a whole word
  let idx = -1;
  const wordRegex = new RegExp(`\\b${escapeRegex(symbol)}\\b`);
  const match = lineText.match(wordRegex);
  if (match && match.index !== undefined) {
    return match.index;
  }

  // Fallback: just find the first occurrence
  idx = lineText.indexOf(symbol);
  if (idx >= 0) return idx;

  return 0; // fallback to column 0
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Helper: Recursive directory walk with exclusion
// ============================================================================

/**
 * Walk a directory tree recursively, yielding file paths.
 * Skips excluded directories (node_modules, .git).
 */
async function* walkDir(dirPath: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    // Skip hidden files/directories except `.env`-like configs
    if (entry.name.startsWith('.') && entry.name !== '.env' &&
        entry.name !== '.env.example' && entry.name !== '.env-8081') continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else if (entry.isFile()) {
      // Skip binary extensions
      const ext = path.extname(entry.name).toLowerCase();
      const binaryExts = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
        '.woff', '.woff2', '.ttf', '.eot', '.otf',
        '.zip', '.gz', '.tar', '.rar', '.7z',
        '.mp3', '.mp4', '.avi', '.mov', '.mkv',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx',
        '.ttf', '.eot',
        '.ico',
      ]);
      if (binaryExts.has(ext)) continue;
      yield fullPath;
    }
  }
}

// ============================================================================
// Regex Generators
// ============================================================================

/**
 * Generate a regex pattern for import statements referencing the symbol.
 * Matches: `import { symbol } from ...`, `import symbol from ...`
 */
function importPattern(symbol: string): RegExp {
  return new RegExp(
    `import\\s+(?:\\{[^}]*\\b${escapeRegex(symbol)}\\b[^}]*\\}|\\b${escapeRegex(symbol)}\\b)`,
    'g',
  );
}

/**
 * Generate a regex pattern for function calls on the symbol.
 * Matches: `symbol(`, `symbol (`
 */
function callPattern(symbol: string): RegExp {
  return new RegExp(
    `\\b${escapeRegex(symbol)}\\s*\\(`,
    'g',
  );
}

/**
 * Generate a regex pattern for class reference usage.
 * Matches: `new Symbol(`, `extends Symbol`, `implements Symbol`
 */
function classRefPattern(symbol: string): RegExp {
  return new RegExp(
    `(?:new\\s+${escapeRegex(symbol)}\\b|extends\\s+${escapeRegex(symbol)}\\b|implements\\s+${escapeRegex(symbol)}\\b)`,
    'g',
  );
}

/**
 * Generate a very broad regex pattern for variable/assignment usage.
 * Matches the symbol as a whole word.
 * Note: This is intentionally broad (80% accuracy), developer verifies results.
 */
function assignmentPattern(symbol: string): RegExp {
  return new RegExp(
    `\\b${escapeRegex(symbol)}\\b`,
    'g',
  );
}

// ============================================================================
// Core search function
// ============================================================================

/**
 * Search a single file line-by-line and collect matches matching the given
 * regex patterns.
 *
 * @param filePath - Absolute path to the file to search
 * @param relativePath - Relative path for result output
 * @param patterns - Array of regex patterns to match
 * @param maxResults - Maximum number of results to collect
 * @returns Array of usage entries
 */
async function searchFile(
  filePath: string,
  relativePath: string,
  patterns: RegExp[],
  maxResults: number,
): Promise<UsageEntry[]> {
  const results: UsageEntry[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length && results.length < maxResults; lineIdx++) {
      const lineText = lines[lineIdx];

      for (const pattern of patterns) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(lineText)) !== null && results.length < maxResults) {
          const column = match.index;
          const contextLine = lineText.length > MAX_CONTEXT_LENGTH
            ? lineText.substring(0, MAX_CONTEXT_LENGTH) + '...'
            : lineText;

          // Deduplicate: skip if same (file, line, column) already found
          const isDuplicate = results.some(
            (r) => r.file === relativePath && r.line === lineIdx + 1 && r.column === column,
          );

          if (!isDuplicate) {
            results.push({
              file: relativePath,
              line: lineIdx + 1,
              column,
              context: contextLine,
            });
          }

          // Advance past this match to avoid infinite loop on zero-length matches
          if (match.index === pattern.lastIndex) {
            pattern.lastIndex++;
          }
        }
      }
    }
  } catch {
    // Skip files that can't be read (binary, permission issues, etc.)
  }

  return results;
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Find usages of a symbol in a registered project's workspace.
 *
 * Uses grep + regex patterns (NOT AST/codegraph) to find:
 * - Import statements referencing the symbol
 * - Function calls: symbolName(
 * - Class references: new SymbolName, extends SymbolName, implements SymbolName
 * - Variable assignments / general usage
 *
 * Returns array of usages with file, line, column, and context line.
 * 80% accuracy is acceptable — developer verifies results.
 *
 * Security:
 * - Uses PathSandbox.validatePath() to prevent directory traversal
 * - Rejects paths outside project root
 * - Excludes node_modules/ and .git/ automatically
 */
export async function findUsagesHandler(
  args: FindUsagesInput,
  deps: {
    projectConfigLoader: ProjectConfigLoader;
    pathSandboxFactory?: (rootPath: string) => PathSandbox;
    walkFiles?: (rootPath: string) => AsyncGenerator<string>;
  },
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { projectId, symbol, type = 'all' } = args;

  try {
    // Validate symbol is not empty
    if (!symbol || symbol.trim().length === 0) {
      return {
        content: [{ type: 'text', text: 'Error: symbol parameter must be a non-empty string' }],
        isError: true,
      };
    }

    // 1. Load projects and validate project exists
    await deps.projectConfigLoader.load();
    const projectConfig = deps.projectConfigLoader.getProject(projectId);
    if (!projectConfig) {
      return {
        content: [{ type: 'text', text: `Error: Project '${projectId}' not found. Ensure the project is registered.` }],
        isError: true,
      };
    }

    const projectRoot = path.resolve(projectConfig.rootPath);

    // 2. Validate root path via PathSandbox (security boundary)
    const sandbox = deps.pathSandboxFactory
      ? deps.pathSandboxFactory(projectRoot)
      : new PathSandbox(projectRoot);

    const rootValidation = await sandbox.validatePath('.');
    if (!rootValidation.valid || !rootValidation.resolvedPath) {
      return {
        content: [{ type: 'text', text: `Error: Access denied — project root is outside sandbox` }],
        isError: true,
      };
    }

    const resolvedRoot = rootValidation.resolvedPath;

    // 3. Build patterns based on type
    const patterns: RegExp[] = [];
    if (type === 'import' || type === 'all') {
      patterns.push(importPattern(symbol));
    }
    if (type === 'call' || type === 'all') {
      patterns.push(callPattern(symbol));
    }
    if (type === 'reference' || type === 'all') {
      patterns.push(classRefPattern(symbol));
    }

    // 4. Walk files and search
    const allUsages: UsageEntry[] = [];
    const walker = deps.walkFiles ? deps.walkFiles(resolvedRoot) : walkDir(resolvedRoot);

    for await (const fileAbsPath of walker) {
      if (allUsages.length >= MAX_RESULTS) break;

      // Verify file is within sandbox
      const fileValidation = await sandbox.validatePath(fileAbsPath);
      if (!fileValidation.valid) continue;

      const relativePath = path.relative(resolvedRoot, fileAbsPath);

      // Skip excluded directories in the relative path
      const parts = relativePath.split(path.sep);
      if (parts.some((part) => EXCLUDED_DIRS.has(part))) continue;

      // For 'all' type: on each file run a broader search too
      if (type === 'all') {
        patterns.push(assignmentPattern(symbol));
      }

      const usages = await searchFile(fileAbsPath, relativePath, patterns, MAX_RESULTS - allUsages.length);
      allUsages.push(...usages);

      // Clean up extra pattern if added
      if (type === 'all') {
        patterns.pop();
      }
    }

    // 5. Sort by file path, then line number, then column
    allUsages.sort((a, b) => {
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      if (a.line !== b.line) return a.line - b.line;
      return a.column - b.column;
    });

    const result: FindUsagesResult = {
      usages: allUsages.slice(0, MAX_RESULTS),
      total: allUsages.length,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
}

// ============================================================================
// Tool Registration Helper
// ============================================================================

/**
 * Create the MCP tool definition for findUsages.
 *
 * Returns the tool name, description, schema, and handler closure.
 * The handler is pre-bound with the ProjectConfigLoader singleton.
 */
export function createFindUsagesTool(loader: ProjectConfigLoader) {
  return {
    name: 'findUsages',
    description:
      'Find usages of a symbol across the project using grep + regex patterns. ' +
      'Searches for imports, function calls, class references (new/extends/implements), ' +
      'and variable assignments. Excludes node_modules/ and .git/. ' +
      '80% accuracy — developer should verify results. ' +
      'Returns {usages: [{file, line, column, context}], total}.',
    schema: {
      projectId: z.string().describe('The project ID (registered in project registry)'),
      symbol: z.string().describe('The symbol name to search for usages of'),
      type: z.enum(['import', 'call', 'reference', 'all']).optional().default('all')
        .describe('Type of usage to search for: import, call, reference, or all (default)'),
    },
    handler: (args: FindUsagesInput) =>
      findUsagesHandler(args, { projectConfigLoader: loader }),
  };
}
