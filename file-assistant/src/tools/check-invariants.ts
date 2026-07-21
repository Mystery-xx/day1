// ============================================================================
// checkInvariants MCP Tool — Structural invariant checking (grep+regex)
// ============================================================================
//
// Checks structural invariants of a project:
//   1. File naming conventions: *.test.ts for tests, *.service.ts for
//      services, *.controller.ts for controllers, *.spec.ts for specs
//   2. Directory structure: src/ must have index.ts, components/ dir exists
//   3. Required exports: index.ts must export at least one symbol
//   4. File extensions: .ts/.tsx for source, .md for docs
//
// Uses grep+regex patterns (NOT AST/codegraph) for structural validation.
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
]);

/** Default directories to scan for structure checks. */
const SCAN_DIRS = ['src', 'lib', 'packages'];

/** Naming convention rule patterns: pattern -> category description. */
const NAMING_RULES: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\.service\.(ts|js)$/i,
    message: 'Service files should follow *.service.ts naming convention',
  },
  {
    pattern: /\.controller\.(ts|js)$/i,
    message: 'Controller files should follow *.controller.ts naming convention',
  },
  {
    pattern: /\.test\.(ts|js|tsx|jsx)$/i,
    message: 'Test files should follow *.test.ts naming convention',
  },
  {
    pattern: /\.spec\.(ts|js|tsx|jsx)$/i,
    message: 'Spec files should follow *.spec.ts naming convention',
  },
  {
    pattern: /\.repository\.(ts|js)$/i,
    message: 'Repository files should follow *.repository.ts naming convention',
  },
];

/** Allowed source file extensions. */
const ALLOWED_SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Allowed documentation extensions. */
const ALLOWED_DOC_EXTS = new Set(['.md', '.mdx']);

/** Allowed config/other extensions. */
const ALLOWED_CONFIG_EXTS = new Set([
  '.json', '.yaml', '.yml', '.toml', '.env', '.env.example',
  '.gitignore', '.dockerignore', '.npmrc', '.nvmrc',
  '.eslintrc', '.prettierrc', '.babelrc',
  '.config.js', '.config.ts',
]);

// ============================================================================
// Types
// ============================================================================

export interface Violation {
  /** Relative file path where the violation was found (or directory path). */
  file: string;
  /** Short rule identifier (kebab-case). */
  rule: string;
  /** Human-readable description of the violation. */
  message: string;
}

export interface CheckInvariantsResult {
  /** Array of violations found. Empty array when everything passes. */
  violations: Violation[];
  /** True when NO violations were found. False when violations exist. */
  passed: boolean;
  /** Summary counts. */
  summary: {
    totalFiles: number;
    totalDirs: number;
    violationsByRule: Record<string, number>;
  };
}

export interface CheckInvariantsInput {
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

export const checkInvariantsSchema = {
  projectId: z.string().min(1).describe('The project ID (registered in project registry)'),
  path: z.string().optional().describe('Optional sub-path within the project to scope the check (e.g., "src")'),
  scanDirs: z.array(z.string()).optional().describe('Optional list of directories to scan (default: ["src", "lib", "packages"])'),
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Walk a directory tree recursively, yielding file entries.
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
 * Check if a file has a valid source extension.
 */
function hasValidSourceExt(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_SOURCE_EXTS.has(ext);
}

/**
 * Check if a file is a documentation file (allowed .md extension).
 */
function isDocFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_DOC_EXTS.has(ext);
}

/**
 * Check if a file is a recognized config file.
 */
function isConfigFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  if (ALLOWED_CONFIG_EXTS.has(ext)) return true;

  // Check for .config.js / .config.ts patterns
  const baseName = path.basename(fileName).toLowerCase();
  const configPatterns = [
    'eslintrc', 'prettierrc', 'babelrc',
    'dockerfile', 'makefile',
  ];
  if (configPatterns.some(p => baseName === p || baseName.startsWith(p + '.'))) return true;

  return false;
}

// ============================================================================
// Rule 1: File Naming Convention Check
// ============================================================================

/**
 * Check file naming conventions.
 *
 * Verifies that files matching known naming patterns (service, controller,
 * test, spec, repository) follow the correct naming convention.
 * For example, a file ending in `.service.ts` is checked to match the
 * `*.service.ts` pattern.
 *
 * Returns violations for naming mismatches.
 */
async function checkFileNaming(
  rootPath: string,
  violations: Violation[],
): Promise<void> {
  try {
    for await (const { filePath: absPath, name, relativePath } of walkDir(rootPath, rootPath)) {
      if (!hasValidSourceExt(name) && !isDocFile(name) && !isConfigFile(name)) {
        continue; // Skip non-source files
      }

      for (const rule of NAMING_RULES) {
        // Check if the filename matches any naming rule pattern
        if (rule.pattern.test(name)) {
          // Verify the file is in a "logical" location for its type
          // e.g., .service.ts should be in a services/ or service/ directory
          const dirName = path.dirname(relativePath);
          const serviceDirs = ['services', 'service', 'providers', 'integrations'];
          const controllerDirs = ['controllers', 'controller', 'routes'];
          const testDirs = ['tests', 'test', '__tests__', 'spec', 'specs'];

          const isInServiceDir = serviceDirs.some(d => dirName.includes(d));
          const isInControllerDir = controllerDirs.some(d => dirName.includes(d));
          const isInTestDir = testDirs.some(d => dirName.includes(d));

          if (name.includes('.service.') && !isInServiceDir) {
            violations.push({
              file: relativePath,
              rule: 'naming-service-location',
              message: `Service file '${name}' should be in a service/ directory (found in: ${dirName})`,
            });
          }

          if (name.includes('.controller.') && !isInControllerDir) {
            violations.push({
              file: relativePath,
              rule: 'naming-controller-location',
              message: `Controller file '${name}' should be in a controller/ directory (found in: ${dirName})`,
            });
          }

          if ((name.includes('.test.') || name.includes('.spec.')) && !isInTestDir) {
            violations.push({
              file: relativePath,
              rule: 'naming-test-location',
              message: `Test file '${name}' should be in a test/ directory (found in: ${dirName})`,
            });
          }

          break; // Only match the first naming rule
        }
      }
    }
  } catch {
    // If the directory doesn't exist, no files to check — that's fine
  }
}

// ============================================================================
// Rule 2: Directory Structure Check
// ============================================================================

/**
 * Check that required directories and files exist in the project.
 *
 * Verifies:
 * - src/ directory has an index.ts entry point
 * - src/components/ directory exists (if src/ exists)
 * - No empty directories
 */
async function checkDirectoryStructure(
  rootPath: string,
  violations: Violation[],
): Promise<void> {
  try {
    // Check if src/ exists
    const srcPath = path.join(rootPath, 'src');
    let srcExists = false;

    try {
      const srcStat = await fs.stat(srcPath);
      srcExists = srcStat.isDirectory();
    } catch {
      // src/ doesn't exist — not necessarily a violation, depends on project
    }

    if (srcExists) {
      // Check src/index.ts exists
      const indexTsPath = path.join(srcPath, 'index.ts');
      const indexTsxPath = path.join(srcPath, 'index.tsx');
      let hasIndex = false;

      try {
        await fs.access(indexTsPath);
        hasIndex = true;
      } catch {
        try {
          await fs.access(indexTsxPath);
          hasIndex = true;
        } catch {
          // No index file
        }
      }

      if (!hasIndex) {
        violations.push({
          file: 'src/',
          rule: 'structure-missing-index',
          message: 'src/ directory is missing an index.ts (or index.tsx) entry point file',
        });
      }

      // Check src/components/ directory exists
      const componentsPath = path.join(srcPath, 'components');
      let hasComponents = false;
      try {
        const compStat = await fs.stat(componentsPath);
        hasComponents = compStat.isDirectory();
      } catch {
        // No components directory
      }

      if (!hasComponents) {
        violations.push({
          file: 'src/',
          rule: 'structure-missing-components',
          message: 'src/ directory is missing a components/ subdirectory for UI components',
        });
      }

      // Check for empty top-level src/ directories
      const srcEntries = await fs.readdir(srcPath, { withFileTypes: true });
      for (const entry of srcEntries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subDirPath = path.join(srcPath, entry.name);
          try {
            const subEntries = await fs.readdir(subDirPath);
            if (subEntries.length === 0) {
              violations.push({
                file: `src/${entry.name}/`,
                rule: 'structure-empty-directory',
                message: `Directory 'src/${entry.name}/' is empty`,
              });
            }
          } catch {
            // Skip unreadable directories
          }
        }
      }
    }

    // Check for common project root missing files
    const rootFiles = await fs.readdir(rootPath);
    const hasPackageJson = rootFiles.includes('package.json');
    const hasReadme = rootFiles.some(f => f.toLowerCase() === 'readme.md');

    if (!hasPackageJson) {
      // Only report this for non-root check (when a sub-path is given)
      // Package.json is only mandatory for JS/TS projects
    }

    if (!hasReadme && (rootFiles.includes('src') || rootFiles.includes('package.json'))) {
      violations.push({
        file: '.',
        rule: 'structure-missing-readme',
        message: 'Project root is missing a README.md documentation file',
      });
    }
  } catch {
    // Skip unreadable directories
  }
}

// ============================================================================
// Rule 3: Required Exports Check
// ============================================================================

/**
 * Check that index.ts files export at least one symbol.
 *
 * Scans for `export` keyword in index.ts/index.tsx files.
 */
async function checkRequiredExports(
  rootPath: string,
  violations: Violation[],
): Promise<void> {
  // Check index.ts files recursively
  async function checkIndexFile(dirPath: string): Promise<void> {
    const indexFiles = ['index.ts', 'index.tsx'];
    for (const indexFile of indexFiles) {
      const indexPath = path.join(dirPath, indexFile);
      try {
        const content = await fs.readFile(indexPath, 'utf-8');
        const relativePath = path.relative(rootPath, indexPath);

        // Check for any export statements (export, export default, export {, export type, export interface)
        const exportRegex = /\bexport\s+(?:default\s+|type\s+|interface\s+|function\s+|const\s+|let\s+|var\s+|class\s+|enum\s+|abstract\s+|async\s+)?/;
        if (!exportRegex.test(content)) {
          violations.push({
            file: relativePath,
            rule: 'exports-missing',
            message: `'${relativePath}' does not export any symbols — it should export at least one symbol`,
          });
        }
        return; // Found an index file, stop checking other variants
      } catch {
        // File doesn't exist, try next variant
      }
    }
  }

  try {
    // Check root
    await checkIndexFile(rootPath);

    // Check all subdirectories for index files
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        await checkIndexFile(path.join(rootPath, entry.name));
      }
    }

    // Also check src/ subdirectories
    const srcPath = path.join(rootPath, 'src');
    try {
      const srcStat = await fs.stat(srcPath);
      if (srcStat.isDirectory()) {
        // Check src/ itself
        await checkIndexFile(srcPath);

        // Check src/ subdirectories (one level deep)
        const srcEntries = await fs.readdir(srcPath, { withFileTypes: true });
        for (const entry of srcEntries) {
          if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            await checkIndexFile(path.join(srcPath, entry.name));
          }
        }
      }
    } catch {
      // src/ doesn't exist
    }
  } catch {
    // Skip unreadable directories
  }
}

// ============================================================================
// Rule 4: File Extension Check
// ============================================================================

/**
 * Check that source files use correct extensions (.ts/.tsx for source,
 * .md for docs) and warn about unusual extensions.
 */
async function checkFileExtensions(
  rootPath: string,
  violations: Violation[],
): Promise<void> {
  try {
    for await (const { filePath: absPath, name, relativePath } of walkDir(rootPath, rootPath)) {
      const ext = path.extname(name).toLowerCase();

      // Skip files with no extension (e.g., Makefile, Dockerfile)
      if (ext === '') continue;

      // Skip known-good extensions
      if (ALLOWED_SOURCE_EXTS.has(ext)) continue;
      if (ALLOWED_DOC_EXTS.has(ext)) continue;
      if (ALLOWED_CONFIG_EXTS.has(ext)) continue;

      // Check for temp/generated files
      if (ext === '.log' || ext === '.tmp' || ext === '.bak' || ext === '.swp') {
        violations.push({
          file: relativePath,
          rule: 'extension-temp-file',
          message: `Temporary/generated file '${name}' should not be in source directories`,
        });
        continue;
      }

      // Warn about unusual source extensions
      if (ext === '.css' || ext === '.scss' || ext === '.less' || ext === '.html') {
        // Style/template files are valid in src, no violation
        continue;
      }

      // Catch-all for unusual extensions in source tree
      violations.push({
        file: relativePath,
        rule: 'extension-unusual',
        message: `File '${name}' has unusual extension '${ext}' — expected .ts, .tsx, .js, .jsx, .md, or standard config files`,
      });
    }
  } catch {
    // Skip unreadable directories
  }
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Check structural invariants of a registered project's workspace.
 *
 * Uses grep+regex patterns (NOT AST/codegraph) for structural validation:
 *   1. File naming conventions
 *   2. Directory structure
 *   3. Required exports
 *   4. File extensions
 *
 * Returns violations array and pass/fail status.
 * Does NOT auto-fix violations — only reports.
 *
 * Security:
 * - Uses PathSandbox.validatePath() to prevent directory traversal
 * - Rejects paths outside project root
 * - Excludes node_modules/, .git/, and similar directories
 */
export async function handleCheckInvariants(
  args: CheckInvariantsInput,
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

    // 5. Run all invariant checks
    const violations: Violation[] = [];

    // Directory structure check first (it's cheap)
    await checkDirectoryStructure(resolvedRoot, violations);

    // File naming convention checks
    await checkFileNaming(resolvedRoot, violations);

    // Required exports check
    await checkRequiredExports(resolvedRoot, violations);

    // File extension checks
    await checkFileExtensions(resolvedRoot, violations);

    // 6. Count total files and directories scanned
    let totalFiles = 0;
    let totalDirs = 0;
    try {
      const scanEntries = await fs.readdir(resolvedRoot, { withFileTypes: true });
      for (const entry of scanEntries) {
        if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) {
          totalDirs++;
          // Count files in each directory (shallow)
          try {
            const subEntries = await fs.readdir(path.join(resolvedRoot, entry.name));
            totalFiles += subEntries.filter(e => !e.startsWith('.')).length;
          } catch {
            // Skip unreadable
          }
        } else {
          totalFiles++;
        }
      }
    } catch {
      // Use approximate count
    }

    // 7. Build violation summary by rule
    const violationsByRule: Record<string, number> = {};
    for (const v of violations) {
      violationsByRule[v.rule] = (violationsByRule[v.rule] ?? 0) + 1;
    }

    // 8. Build result
    const result: CheckInvariantsResult = {
      violations,
      passed: violations.length === 0,
      summary: {
        totalFiles,
        totalDirs,
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
 * Create the MCP tool definition for checkInvariants.
 *
 * Returns the tool name, description, schema, and handler closure.
 * The handler is pre-bound with the ProjectConfigLoader singleton.
 */
export function createCheckInvariantsTool(loader: ProjectConfigLoader) {
  return {
    name: 'checkInvariants',
    description:
      'Check structural invariants of a project: file naming conventions ' +
      '(*.test.ts for tests, *.service.ts for services, *.controller.ts for controllers), ' +
      'directory structure (src/ must have index.ts and components/), ' +
      'required exports (index.ts must export at least one symbol), ' +
      'and file extensions (.ts/.tsx for source, .md for docs). ' +
      'Uses grep+regex patterns (NOT AST/codegraph). ' +
      'Reports violations only — does NOT auto-fix. ' +
      'Returns {violations: [{file, rule, message}], passed: boolean, summary}.',
    schema: checkInvariantsSchema,
    handler: (args: CheckInvariantsInput) => handleCheckInvariants(args, loader),
  };
}
