// ============================================================================
// validateRules MCP Tool — Stylistic rule validation (grep+regex)
// ============================================================================
//
// Checks stylistic rules of a project:
//   1. Copyright headers: Files must have a LICENSE, @license, or copyright
//      comment at the top
//   2. Import order: stdlib (path, fs) → npm (zod, glob) → local (./...)
//   3. No console.log: console.log/warn/error in non-test files
//   4. Max line length: No lines exceeding 120 characters
//
// Uses grep+regex patterns (NOT AST/codegraph) for stylistic validation.
// Reports violations only — does NOT auto-fix.
//
// Security: All file paths validated through PathSandbox to prevent
// path traversal and symlink-based escapes.
// ============================================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ProjectConfigLoader } from '../config/project-config.js';
import * as z from 'zod/v4';

// ============================================================================
// Constants
// ============================================================================

/** Directories to exclude from scanning. */
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.index', '.omo',
  '.codegraph', '__pycache__', '.venv', 'target', 'coverage',
  '.next', '.nuxt',
]);

/** Default directories to scan for rules. */
const SCAN_DIRS = ['src', 'lib', 'packages'];

/** Maximum allowed line length. */
const MAX_LINE_LENGTH = 120;

/** File extensions to check for stylistic rules. */
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// ============================================================================
// Types
// ============================================================================

export interface Violation {
  /** Relative file path where the violation was found. */
  file: string;
  /** Short rule identifier (kebab-case). */
  rule: string;
  /** Line number where the violation was found (1-based). */
  line: number;
  /** Human-readable description of the violation. */
  message: string;
}

export interface ValidateRulesResult {
  /** Array of violations found. Empty array when everything passes. */
  violations: Violation[];
  /** True when NO violations were found. False when violations exist. */
  passed: boolean;
  /** Summary counts. */
  summary: {
    totalFiles: number;
    violationsByRule: Record<string, number>;
  };
}

export interface ValidateRulesInput {
  /** Project ID from the project registry. */
  projectId: string;
  /** Optional sub-path within the project to scope the check. */
  path?: string;
  /** Optional list of extra directories to scan (e.g., ["src", "lib"]). */
  scanDirs?: string[];
}

// ============================================================================
// Zod Schema
// ============================================================================

export const validateRulesSchema = {
  projectId: z.string().min(1).describe('The project ID (registered in project registry)'),
  path: z.string().optional().describe('Optional sub-path within the project to scope the check (e.g., "src")'),
  scanDirs: z.array(z.string()).optional().describe('Optional list of directories to scan (default: ["src", "lib", "packages"])'),
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Walk a directory tree recursively, yielding source file entries.
 * Skips excluded directories (node_modules, .git, etc.).
 * Computes relativePath relative to rootPath so callers get
 * project-relative paths (e.g., "src/services/user.service.ts").
 */
async function* walkDir(
  dirPath: string,
  rootPath: string,
): AsyncGenerator<{ filePath: string; name: string; relativePath: string }> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    // Skip hidden files/directories
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    if (entry.isDirectory()) {
      yield* walkDir(fullPath, rootPath);
    } else if (entry.isFile()) {
      yield { filePath: fullPath, name: entry.name, relativePath: relativePath };
    }
  }
}

/**
 * Check if a file has a source extension worth validating.
 */
function isSourceFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return SOURCE_EXTS.has(ext);
}

/**
 * Check if a file is a test file (should be excluded from console.log check).
 */
function isTestFile(fileName: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/i.test(fileName);
}

/**
 * Read file content, returning lines array.
 */
async function readFileLines(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content.split('\n');
}

// ============================================================================
// Rule 1: Copyright Header Check
// ============================================================================

/**
 * Check that source files have a copyright header (LICENSE, @license,
 * or copyright comment) within the first 5 lines.
 */
async function checkCopyrightHeaders(
  rootPath: string,
  violations: Violation[],
): Promise<void> {
  try {
    for await (const { filePath: absPath, name, relativePath } of walkDir(rootPath, rootPath)) {
      if (!isSourceFile(name)) continue;

      const lines = await readFileLines(absPath);

      // Only check the first 5 lines for copyright
      const linesToCheck = Math.min(5, lines.length);
      let hasCopyright = false;

      for (let i = 0; i < linesToCheck; i++) {
        const line = lines[i];
        if (
          /@license\b/i.test(line) ||
          /\bcopyright\b/i.test(line) ||
          /\blicense\b/i.test(line)
        ) {
          hasCopyright = true;
          break;
        }
      }

      if (!hasCopyright) {
        violations.push({
          file: relativePath,
          rule: 'missing-copyright-header',
          line: 1,
          message: `File '${name}' is missing a copyright header (expected LICENSE, @license, or copyright comment within first 5 lines)`,
        });
      }
    }
  } catch {
    // If the directory doesn't exist, no files to check — that's fine
  }
}

// ============================================================================
// Rule 2: Import Order Check
// ============================================================================

/**
 * Categorize an import source path.
 * - 'stdlib': Node.js built-in modules (path, fs, os, etc.)
 * - 'npm': Third-party npm packages (zod, glob, etc.)
 * - 'local': Relative imports starting with ./ or ../
 * - 'other': Other imports
 */
function categorizeImport(source: string): 'stdlib' | 'npm' | 'local' | 'other' {
  const trimmed = source.trim();

  // Local relative imports
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return 'local';
  }

  // Node.js built-in modules
  const stdlibModules = new Set([
    'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
    'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
    'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
    'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
    'string_decoder', 'timers', 'tls', 'trace_events', 'tty', 'url',
    'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  ]);

  // Take the first path segment (before any /)
  const firstSegment = trimmed.split('/')[0];

  if (firstSegment && stdlibModules.has(firstSegment)) {
    return 'stdlib';
  }

  // Anything else with a / or a bare package name — assume npm
  // Special cases: @scoped packages
  if (trimmed.startsWith('@')) {
    return 'npm';
  }

  // If it contains no slash and isn't stdlib, it's npm
  return 'npm';
}

/**
 * Get the category priority for sorting: stdlib(0) < npm(1) < local(2) < other(3).
 */
function categoryPriority(cat: 'stdlib' | 'npm' | 'local' | 'other'): number {
  switch (cat) {
    case 'stdlib': return 0;
    case 'npm': return 1;
    case 'local': return 2;
    case 'other': return 3;
  }
}

/**
 * Check import ordering in source files.
 *
 * Expected order: stdlib (path, fs) → npm (zod, glob) → local (./...)
 * Blank lines between groups are allowed.
 * Violations reported when a higher-priority import follows a lower-priority one
 * without a blank line separator between groups.
 */
async function checkImportOrder(
  rootPath: string,
  violations: Violation[],
): Promise<void> {
  try {
    for await (const { filePath: absPath, name, relativePath } of walkDir(rootPath, rootPath)) {
      if (!isSourceFile(name)) continue;

      const lines = await readFileLines(absPath);

      // Collect import lines with their categories and line numbers
      const imports: Array<{ lineNumber: number; source: string; category: ReturnType<typeof categorizeImport> }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match import statements: import ... from '...' or import '...'
        const importMatch = line.match(/^\s*import\s+(?:type\s+)?(?:\{[^}]*\}\s+from\s+)?['"]([^'"]+)['"]/);
        if (importMatch) {
          const source = importMatch[1];
          imports.push({
            lineNumber: i + 1, // 1-based
            source,
            category: categorizeImport(source),
          });
        }
      }

      if (imports.length <= 1) continue; // Nothing to reorder

      // Check that categories don't go backwards (higher priority after lower priority)
      // Allow blank lines between groups
      let lastCategory: ReturnType<typeof categorizeImport> | null = null;
      let lastLineNumber = 0;

      for (const imp of imports) {
        if (lastCategory !== null) {
          const lastPri = categoryPriority(lastCategory);
          const curPri = categoryPriority(imp.category);

          // Check if there was a blank line between this import and the previous one
          // (blank lines between groups are OK)
          const interveningLines = lines.slice(lastLineNumber, imp.lineNumber - 1);
          const hasBlankLine = interveningLines.some(l => l.trim() === '');

          if (curPri < lastPri && !hasBlankLine) {
            // Higher priority import follows lower priority without blank line gap
            violations.push({
              file: relativePath,
              rule: 'import-order',
              line: imp.lineNumber,
              message: `Import order violation: '${imp.source}' (${imp.category}) follows '${imports[imports.indexOf(imp) - 1]?.source}' (${lastCategory}) — expected order: stdlib → npm → local`,
            });
          }
        }

        lastCategory = imp.category;
        lastLineNumber = imp.lineNumber;
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

// ============================================================================
// Rule 3: No console.log Check
// ============================================================================

/**
 * Check for console.log/warn/error in non-test files.
 * Test files (*.test.ts, *.spec.ts, etc.) are excluded from this check.
 */
async function checkNoConsoleLog(
  rootPath: string,
  violations: Violation[],
): Promise<void> {
  try {
    for await (const { filePath: absPath, name, relativePath } of walkDir(rootPath, rootPath)) {
      if (!isSourceFile(name)) continue;
      // Skip test files — console.log is acceptable there
      if (isTestFile(name)) continue;

      const lines = await readFileLines(absPath);

      for (let i = 0; i < lines.length; i++) {
        // Match console.log(...), console.warn(...), console.error(...)
        // But not console.log.bind, console.warn.bind, etc.
        const match = lines[i].match(
          /(?<!\/\/\s*)\bconsole\.(log|warn|error)\s*\(/,
        );
        if (match) {
          violations.push({
            file: relativePath,
            rule: 'no-console-log',
            line: i + 1,
            message: `console.${match[1]}() call found — use a proper logging framework instead`,
          });
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

// ============================================================================
// Rule 4: Max Line Length Check
// ============================================================================

/**
 * Check for lines exceeding the maximum allowed line length (120 chars).
 * Skips long URLs and comment blocks.
 */
async function checkMaxLineLength(
  rootPath: string,
  violations: Violation[],
): Promise<void> {
  try {
    for await (const { filePath: absPath, name, relativePath } of walkDir(rootPath, rootPath)) {
      if (!isSourceFile(name)) continue;

      const lines = await readFileLines(absPath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip empty lines
        if (line.length === 0) continue;

        // Skip lines that are just URLs (long URLs are acceptable)
        if (/^\s*\/\/\s*https?:\/\//.test(line)) continue;

        // Skip lines that are import statements (can be long)
        if (/^\s*import\s/.test(line)) continue;

        if (line.length > MAX_LINE_LENGTH) {
          violations.push({
            file: relativePath,
            rule: 'max-line-length',
            line: i + 1,
            message: `Line exceeds ${MAX_LINE_LENGTH} characters (${line.length} chars)`,
          });
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Validate stylistic rules of a registered project's workspace.
 *
 * Uses grep+regex patterns (NOT AST/codegraph) for stylistic validation:
 *   1. Copyright headers
 *   2. Import order
 *   3. No console.log
 *   4. Max line length
 *
 * Returns violations array and pass/fail status.
 * Does NOT auto-fix violations — only reports.
 *
 * Security:
 * - Uses PathSandbox.validatePath() to prevent directory traversal
 * - Rejects paths outside project root
 * - Excludes node_modules/, .git/, and similar directories
 */
export async function handleValidateRules(
  args: ValidateRulesInput,
  loader: ProjectConfigLoader,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { projectId, path: subPath, scanDirs } = args;

  try {
    // 1. Validate project exists
    if (!loader.isReady()) {
      await loader.load();
    }

    const project = loader.getProject(projectId);
    if (!project) {
      return {
        content: [{ type: 'text', text: `Error: Project '${projectId}' not found in registry.` }],
        isError: true,
      };
    }

    const projectRoot = path.resolve(project.rootPath);

    // 2. Determine scan root (project root or sub-path)
    const scanRoot = subPath
      ? path.join(projectRoot, subPath)
      : projectRoot;

    // 3. Validate scan root via PathSandbox (security boundary)
    const sandbox = new PathSandbox(projectRoot);
    const pathValidation = await sandbox.validatePath(scanRoot);

    if (!pathValidation.valid || !pathValidation.resolvedPath) {
      return {
        content: [{
          type: 'text',
          text: `Access denied: ${pathValidation.error ?? 'Path is outside project root'}`,
        }],
        isError: true,
      };
    }

    // 4. Verify scan root exists
    try {
      await fs.access(pathValidation.resolvedPath);
    } catch {
      return {
        content: [{ type: 'text', text: `Error: Path not found: ${scanRoot}` }],
        isError: true,
      };
    }

    const resolvedRoot = pathValidation.resolvedPath;

    // 5. Run all stylistic rule checks
    const violations: Violation[] = [];

    // Copyright header check
    await checkCopyrightHeaders(resolvedRoot, violations);

    // Import order check
    await checkImportOrder(resolvedRoot, violations);

    // No console.log check
    await checkNoConsoleLog(resolvedRoot, violations);

    // Max line length check
    await checkMaxLineLength(resolvedRoot, violations);

    // 6. Count total files scanned
    let totalFiles = 0;
    try {
      for await (const _ of walkDir(resolvedRoot, resolvedRoot)) {
        totalFiles++;
      }
    } catch {
      // Approximate
    }

    // 7. Build violation summary by rule
    const violationsByRule: Record<string, number> = {};
    for (const v of violations) {
      violationsByRule[v.rule] = (violationsByRule[v.rule] ?? 0) + 1;
    }

    // 8. Build result
    const result: ValidateRulesResult = {
      violations,
      passed: violations.length === 0,
      summary: {
        totalFiles,
        violationsByRule,
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
 * Create the MCP tool definition for validateRules.
 *
 * Returns the tool name, description, schema, and handler closure.
 * The handler is pre-bound with the ProjectConfigLoader singleton.
 */
export function createValidateRulesTool(loader: ProjectConfigLoader) {
  return {
    name: 'validateRules',
    description:
      'Validate stylistic rules of a project: copyright headers present ' +
      '(LICENSE, @license, or copyright comment), import order ' +
      '(stdlib → npm → local), no console.log in production code, ' +
      'and max line length (120 chars). ' +
      'Uses grep+regex patterns (NOT AST/codegraph). ' +
      'Reports violations only — does NOT auto-fix. ' +
      'Returns {violations: [{file, rule, line, message}], passed: boolean, summary}.',
    schema: validateRulesSchema,
    handler: (args: ValidateRulesInput) => handleValidateRules(args, loader),
  };
}
