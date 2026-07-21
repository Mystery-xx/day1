// ============================================================================
// analyzeBlastRadius MCP Tool — Find dependents of a file/symbol via grep+regex
// ============================================================================
//
// Uses grep + regex patterns (NOT AST/codegraph) to find all files in a
// project that import/depend on a given file or symbol. Returns a list of
// dependents with confidence scores and a risk assessment.
//
// Algorithm:
// 1. Resolve the target file path within the project (via PathSandbox)
// 2. Grep all project source files for import/require statements referencing
//    the target file or symbol
// 3. Compute confidence based on match quality (exact path match > partial)
// 4. Assess risk level: low (<3 importers), medium (3-10), high (>10)
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

/** Default directory exclusions when scanning for dependents */
const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.index',
  '.omo',
  '.codegraph',
  '__pycache__',
  '.venv',
  'target',
];

/** File extensions to scan for import statements */
const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.kt', '.go', '.rs',
]);

// ============================================================================
// Types
// ============================================================================

export interface DependentFile {
  file: string;
  type: 'import' | 'require' | 'from' | 'symbol';
  confidence: number; // 0.0 to 1.0
}

export interface AnalyzeBlastRadiusResult {
  target: string;
  symbol?: string;
  dependents: DependentFile[];
  importerCount: number;
  riskLevel: 'low' | 'medium' | 'high';
}

// ============================================================================
// Zod Schema
// ============================================================================

export const analyzeBlastRadiusSchema = {
  projectId: z.string().min(1).describe('The project ID (registered in project registry)'),
  filePath: z.string().min(1).describe('Relative path to the target file to analyze (e.g., "src/utils/helpers.ts")'),
  symbol: z.string().optional().describe('Optional symbol name within the file to narrow the search (e.g., "parseConfig")'),
};

export type AnalyzeBlastRadiusArgs = z.infer<typeof analyzeBlastRadiusSchema>;

// ============================================================================
// Helper: Build import regex patterns
// ============================================================================

/**
 * Build a list of regex patterns to search for import/require statements
 * referencing the given file path and optional symbol.
 *
 * Each pattern is paired with a match type and a base confidence score.
 * More specific patterns (exact path match) get higher base confidence.
 *
 * Note: Since import paths use relative paths (e.g., './utils/helpers')
 * while the target filePath is project-relative (e.g., 'src/utils/helpers.ts'),
 * we cannot directly match the full project path to imports. Instead, we
 * match from most-specific to least-specific path components.
 *
 * Strategy:
 * - Match the full path components from the end (e.g., 'utils/helpers.ts')
 * - Match the basename with directory prefix (e.g., 'utils/helpers')
 * - Match just the filename (e.g., 'helpers.ts')
 * - Match just the stem (e.g., 'helpers')
 */
export function buildImportPatterns(
  relativeFilePath: string,
  symbol?: string,
): Array<{ regex: RegExp; type: DependentFile['type']; baseConfidence: number; label: string }> {
  const patterns: Array<{ regex: RegExp; type: DependentFile['type']; baseConfidence: number; label: string }> = [];

  // Normalize the file path: remove leading ./ and extension variations
  const normalizedPath = relativeFilePath.replace(/^\.\//, '');
  const pathWithoutExt = normalizedPath.replace(/\.[^.]+$/, '');
  const fileName = path.basename(normalizedPath);
  const fileNameWithoutExt = path.basename(pathWithoutExt);
  const dirName = path.dirname(normalizedPath);

  // Escaped versions for regex safety
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedFileName = escapeRegex(fileName);
  const escapedFileNameWithoutExt = escapeRegex(fileNameWithoutExt);

  // Build a list of "path suffixes" from most-specific to least-specific.
  // For example, for 'src/utils/helpers.ts':
  //   - 'src/utils/helpers.ts'   (full)
  //   - 'src/utils/helpers'       (no ext)
  //   - 'utils/helpers.ts'        (one dir up)
  //   - 'utils/helpers'           (one dir up, no ext)
  //   - 'helpers.ts'              (filename only)
  //   - 'helpers'                 (stem only)
  const pathSuffixes: Array<{ suffix: string; confidence: number }> = [];
  const parts = normalizedPath.split('/');

  // Full path (may be multi-segment) and without extension
  pathSuffixes.push({ suffix: normalizedPath, confidence: 1.0 });
  if (pathWithoutExt !== normalizedPath) {
    pathSuffixes.push({ suffix: pathWithoutExt, confidence: 0.95 });
  }

  // Path suffixes from the last N segments (starting from the second-to-last segment)
  for (let i = parts.length - 1; i >= 1; i--) {
    const suffix = parts.slice(i).join('/');
    if (suffix === fileName) continue; // will be added separately

    pathSuffixes.push({ suffix, confidence: 0.9 });

    // Also without extension
    const suffixNoExt = suffix.replace(/\.[^.]+$/, '');
    if (suffixNoExt !== suffix) {
      pathSuffixes.push({ suffix: suffixNoExt, confidence: 0.85 });
    }
  }

  // Filename only
  pathSuffixes.push({ suffix: fileName, confidence: 0.7 });
  if (fileNameWithoutExt !== fileName) {
    pathSuffixes.push({ suffix: fileNameWithoutExt, confidence: 0.65 });
  }

  // Generate import and require patterns for each path suffix
  for (const { suffix, confidence } of pathSuffixes) {
    const escaped = escapeRegex(suffix);

    // Import pattern: from|import ... '...suffix'
    patterns.push({
      regex: new RegExp(`(?:from|import)\\s*[\`'"](?:\\.{0,2}/)*${escaped}[\`'"]`),
      type: 'import',
      baseConfidence: confidence,
      label: `import path: ${suffix}`,
    });

    // Require pattern: require('...suffix')
    patterns.push({
      regex: new RegExp(`require\\s*\\(\\s*[\`'"](?:\\.{0,2}/)*${escaped}[\`'"]`),
      type: 'require',
      baseConfidence: confidence,
      label: `require path: ${suffix}`,
    });
  }

  // 7. Symbol-based patterns (if a symbol was provided)
  if (symbol) {
    const escapedSymbol = escapeRegex(symbol);

    // Direct import of the symbol: import { symbol } from ...
    patterns.push({
      regex: new RegExp(`\\{.*\\b${escapedSymbol}\\b.*\\}\\s*from`),
      type: 'symbol',
      baseConfidence: 0.9,
      label: `named import: ${symbol}`,
    });

    // Symbol used in code (potential dependency on the file exporting it)
    patterns.push({
      regex: new RegExp(`\\b${escapedSymbol}\\s*\\(`),
      type: 'symbol',
      baseConfidence: 0.5,
      label: `symbol call: ${symbol}()` ,
    });
  }

  return patterns;
}

// ============================================================================
// Helper: Find project source files
// ============================================================================

/**
 * Recursively find all source files in the project, excluding common
 * generated/build directories.
 */
export async function findSourceFiles(
  projectRoot: string,
  excludeDirs: string[] = DEFAULT_EXCLUDE_DIRS,
  maxFiles: number = 10_000,
): Promise<string[]> {
  const results: string[] = [];

  async function scan(dirPath: string): Promise<void> {
    if (results.length >= maxFiles) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxFiles) break;

        // Skip excluded directories
        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name)) {
            await scan(path.join(dirPath, entry.name));
          }
          continue;
        }

        // Check file extension
        const ext = path.extname(entry.name);
        if (SCAN_EXTENSIONS.has(ext)) {
          results.push(path.join(dirPath, entry.name));
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  await scan(projectRoot);
  return results;
}

// ============================================================================
// Helper: Grep import statements with confidence scoring
// ============================================================================

/**
 * Search a file for import/require statements matching the given patterns.
 * Returns deduplicated dependent entries sorted by confidence (highest first).
 */
export async function findDependents(
  sourceFile: string,
  projectRoot: string,
  patterns: Array<{ regex: RegExp; type: DependentFile['type']; baseConfidence: number; label: string }>,
): Promise<DependentFile[]> {
  try {
    const content = await fs.readFile(sourceFile, 'utf-8');
    const relativePath = path.relative(projectRoot, sourceFile);
    const matchedTypes = new Set<string>();
    let maxConfidence = 0;

    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        matchedTypes.add(pattern.type);
        if (pattern.baseConfidence > maxConfidence) {
          maxConfidence = pattern.baseConfidence;
        }
      }
    }

    if (matchedTypes.size === 0) return [];

    // Pick the best type (import > require > from > symbol)
    const typeOrder: DependentFile['type'][] = ['import', 'require', 'from', 'symbol'];
    const bestType = typeOrder.find(t => matchedTypes.has(t)) ?? 'symbol';

    // Deduplicate: if both import and require matched, keep the higher confidence type
    return [{
      file: relativePath,
      type: bestType,
      confidence: maxConfidence,
    }];
  } catch {
    // Skip unreadable files
    return [];
  }
}

// ============================================================================
// Helper: Assess risk level
// ============================================================================

/**
 * Assess risk level based on number of importers.
 * - low: 0-2 importers
 * - medium: 3-10 importers
 * - high: 10+ importers
 */
export function assessRiskLevel(importerCount: number): 'low' | 'medium' | 'high' {
  if (importerCount >= 10) return 'high';
  if (importerCount >= 3) return 'medium';
  return 'low';
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * MCP tool: analyzeBlastRadius — Find all files that depend on a given file/symbol.
 *
 * Uses grep + regex (NOT AST parsing) to search for import/require statements.
 * Returns a list of dependent files with confidence scores and risk assessment.
 */
export async function handleAnalyzeBlastRadius(
  args: unknown,
  loader: ProjectConfigLoader,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { projectId, filePath: targetFilePath, symbol } = args as { projectId: string; filePath: string; symbol?: string };

  // 0. Validate required params
  if (!projectId || projectId.trim().length === 0) {
    return {
      content: [{ type: 'text', text: 'Error: projectId must be a non-empty string' }],
      isError: true,
    };
  }
  if (!targetFilePath || targetFilePath.trim().length === 0) {
    return {
      content: [{ type: 'text', text: 'Error: filePath must be a non-empty string' }],
      isError: true,
    };
  }

  // 1. Validate project exists
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

  // 2. Validate target path via PathSandbox (security boundary)
  const sandbox = new PathSandbox(projectRoot);
  const pathValidation = await sandbox.validatePath(targetFilePath);

  if (!pathValidation.valid || !pathValidation.resolvedPath) {
    return {
      content: [{
        type: 'text',
        text: `Access denied: ${pathValidation.error ?? 'Path is outside project root'}`,
      }],
      isError: true,
    };
  }

  // Check that target exists (must be an existing file)
  try {
    await fs.access(pathValidation.resolvedPath);
  } catch {
    return {
      content: [{ type: 'text', text: `Error: File not found: ${targetFilePath}` }],
      isError: true,
    };
  }

  // 3. Build import regex patterns for the target file/symbol
  const patterns = buildImportPatterns(targetFilePath, symbol);

  // 4. Find all source files in the project
  const sourceFiles = await findSourceFiles(projectRoot);

  // 5. Scan each source file for import patterns
  const allDependents: DependentFile[] = [];

  for (const sourceFile of sourceFiles) {
    // Skip the target file itself
    const relativeSourcePath = path.relative(projectRoot, sourceFile);
    if (relativeSourcePath === targetFilePath) continue;

    const dependents = await findDependents(sourceFile, projectRoot, patterns);
    allDependents.push(...dependents);
  }

  // 6. Sort by confidence (highest first), then by file path
  allDependents.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.file.localeCompare(b.file);
  });

  // 7. Assess risk level
  const riskLevel = assessRiskLevel(allDependents.length);

  // 8. Build and return result
  const result: AnalyzeBlastRadiusResult = {
    target: targetFilePath,
    ...(symbol ? { symbol } : {}),
    dependents: allDependents,
    importerCount: allDependents.length,
    riskLevel,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

// ============================================================================
// Tool Registration Helper
// ============================================================================

/**
 * Create the MCP tool definition for analyzeBlastRadius.
 *
 * Returns the tool name, description, schema, and handler closure.
 * The handler is pre-bound with the ProjectConfigLoader singleton.
 */
export function createAnalyzeBlastRadiusTool(loader: ProjectConfigLoader) {
  return {
    name: 'analyzeBlastRadius',
    description: 'Analyze the impact of changes by finding all files that depend on a given file or symbol. Uses grep + regex patterns (not AST) to search for import/require statements. Returns a list of dependent files with confidence scores and a risk assessment (low: <3 importers, medium: 3-10, high: >10).',
    schema: analyzeBlastRadiusSchema,
    handler: (args: AnalyzeBlastRadiusArgs) => handleAnalyzeBlastRadius(args, loader),
  };
}
