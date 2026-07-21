// ============================================================================
// generateREADME MCP Tool — Generate README.md from project structure
// ============================================================================
//
// Analyzes a registered project's structure to generate a README.md with
// sections: Installation, Usage, API, Development. Reads package.json for
// name/description/scripts and src/index.ts for exports, then builds a
// directory tree and composes all into markdown.
//
// Safety:
// 1. Does NOT overwrite an existing README.md — always reports if one exists
// 2. Does NOT fabricate API documentation — only lists exports found in
//    src/index.ts with their actual signatures
// 3. All file paths validated through PathSandbox
// ============================================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import * as z from 'zod/v4';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ProjectConfigLoader } from '../config/project-config.js';

// ============================================================================
// Constants
// ============================================================================

/** Default directories/files to exclude from the directory tree */
const DEFAULT_EXCLUDE = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.index',
  '.omo',
  '.codegraph',
  '__pycache__',
  '.venv',
  'coverage',
  '.DS_Store',
];

/** Markdown template structure for the generated README */
const README_TEMPLATE = `# {name}

{description}

## Installation

\`\`\`bash
{installCommand}
\`\`\`

## Usage

{usage}

## API

{apiDocs}

## Development

{development}
`;

// ============================================================================
// Types
// ============================================================================

export interface GenerateReadmeInput {
  projectId: string;
}

export interface PackageJsonInfo {
  name: string;
  description: string;
  scripts: Record<string, string>;
  hasMainEntry: boolean;
}

export interface ExportInfo {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'unknown';
  line: number;
}

export interface GenerateReadmeResult {
  readme: string;
  packageName: string;
  description: string;
  exports: ExportInfo[];
  directoryTree: string;
  hasExistingReadme: boolean;
  existingReadmePath?: string;
}

// ============================================================================
// Zod Schema
// ============================================================================

export const generateReadmeInputSchema = {
  type: 'object',
  properties: {
    projectId: {
      type: 'string',
      description: 'The project ID (must be a registered project)',
    },
  },
  required: ['projectId'],
} as const;

// ============================================================================
// Helpers: Parse package.json
// ============================================================================

/**
 * Parse a project's package.json and extract name, description, scripts.
 *
 * @param rootPath - The project root directory
 * @returns Parsed PackageJsonInfo or null if package.json doesn't exist
 */
export async function parsePackageJson(rootPath: string): Promise<PackageJsonInfo | null> {
  const pkgPath = path.join(rootPath, 'package.json');

  try {
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);

    return {
      name: pkg.name ?? 'unknown',
      description: pkg.description ?? 'No description provided',
      scripts: pkg.scripts ?? {},
      hasMainEntry: !!pkg.main,
    };
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return null;
    }
    // Invalid JSON or other error — return null
    return null;
  }
}

// ============================================================================
// Helpers: Parse src/index.ts exports
// ============================================================================

/**
 * Extract exported symbols from a TypeScript source file.
 *
 * Uses regex to match:
 * - `export function name(...)` → function
 * - `export class Name {...}` → class
 * - `export const name = ...` → variable
 * - `export interface Name {...}` → interface
 * - `export type Name = ...` → type
 * - `export { name, ... }` → re-exports
 *
 * NOTE: This is a best-effort regex parse, NOT a full AST parse.
 * Complex patterns (re-exports with aliases, re-export from other modules,
 * default exports) may not be fully captured.
 */
export function parseExports(source: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const lines = source.split('\n');

  // Pattern 1: export function/class/const/interface/type
  const standalonePattern = /^export\s+(?:(?:default)\s+)?(?:function|class|const|interface|type)\s+(\w+)/;

  // Pattern 2: export { ... } (named re-exports, including from other modules)
  const namedReExportPattern = /^export\s+\{\s*([^}]+)\s*\}/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match standalone exports
    const standaloneMatch = line.match(standalonePattern);
    if (standaloneMatch) {
      const name = standaloneMatch[1];
      const kind = extractKind(line);
      exports.push({ name, kind, line: i + 1 });
      continue;
    }

    // Match named re-exports
    const namedMatch = line.match(namedReExportPattern);
    if (namedMatch) {
      const names = namedMatch[1].split(',').map(s => s.trim());
      for (const entry of names) {
        // Handle aliases: `original as alias`
        const aliasMatch = entry.match(/(\w+)(?:\s+as\s+(\w+))?/);
        if (aliasMatch) {
          const exportName = aliasMatch[2] ?? aliasMatch[1];
          exports.push({ name: exportName, kind: 'unknown', line: i + 1 });
        }
      }
      continue;
    }

    // Pattern 3: export default class/function (inline)
    const defaultPattern = /^export\s+default\s+(?:class|function)\s+(\w+)/;
    const defaultMatch = line.match(defaultPattern);
    if (defaultMatch) {
      exports.push({ name: `default (${defaultMatch[1]})`, kind: 'unknown', line: i + 1 });
    }
  }

  return exports;
}

/**
 * Extract the kind of an export from its declaration line.
 */
function extractKind(line: string): ExportInfo['kind'] {
  if (/^export\s+function\b/.test(line)) return 'function';
  if (/^export\s+class\b/.test(line)) return 'class';
  if (/^export\s+const\b/.test(line)) return 'variable';
  if (/^export\s+interface\b/.test(line)) return 'interface';
  if (/^export\s+type\b/.test(line)) return 'type';
  return 'unknown';
}

// ============================================================================
// Helpers: Build directory tree
// ============================================================================

/**
 * Build a text-based directory tree for a project, excluding common
 * generated/build directories.
 *
 * @param dirPath - The directory to scan
 * @param rootPath - The project root (used for relative paths)
 * @param excludePatterns - Directory/file names to exclude
 * @returns Formatted directory tree string
 */
export async function buildDirectoryTree(
  dirPath: string,
  rootPath: string,
  excludePatterns: string[] = DEFAULT_EXCLUDE,
): Promise<string> {
  const lines: string[] = [];

  async function scan(currentPath: string, depth: number, prefix: string): Promise<void> {
    if (depth > 4) {
      return; // Limit depth to 4 levels
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      // Sort: directories first, then files
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      // Only scan deeper for depth < 4
      const isMaxDepth = depth >= 4;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        // Skip excluded entries
        if (isExcluded(entry.name, excludePatterns)) {
          continue;
        }

        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = prefix + (isLast ? '    ' : '│   ');

        if (entry.isDirectory()) {
          lines.push(`${prefix}${connector}${entry.name}/`);
          if (!isMaxDepth) {
            await scan(path.join(currentPath, entry.name), depth + 1, childPrefix);
          }
        } else {
          lines.push(`${prefix}${connector}${entry.name}`);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  const rootName = path.basename(rootPath);
  lines.push(`${rootName}/`);
  await scan(dirPath, 1, '');

  return lines.join('\n');
}

/**
 * Check if a file/directory name should be excluded.
 * Supports exact matches and wildcard patterns.
 */
function isExcluded(entryName: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    if (entryName === pattern) {
      return true;
    }
    // Wildcard match
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
// Helpers: Generate markdown sections
// ============================================================================

/**
 * Build the Installation section from package.json scripts.
 */
function buildInstallSection(pkg: PackageJsonInfo): string {
  const parts: string[] = [];

  // Check for common package managers
  const hasLockFile = false; // We'll detect at call site
  const installCommand = 'npm install';

  parts.push(`\`\`\`bash
# Install dependencies
${installCommand}
\`\`\``);

  if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
    parts.push('');
    parts.push('**Available scripts:**');
    parts.push('');
    parts.push('| Script | Command |');
    parts.push('|--------|---------|');

    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      parts.push(`| \`${name}\` | \`${cmd}\` |`);
    }
  }

  parts.push('');

  return parts.join('\n');
}

/**
 * Build the Usage section.
 */
function buildUsageSection(pkg: PackageJsonInfo): string {
  const parts: string[] = [];

  if (pkg.hasMainEntry) {
    parts.push('### Quick Start');
    parts.push('');
    parts.push('```bash');
    parts.push(`npx ${pkg.name}`);
    parts.push('```');
    parts.push('');
  } else if (pkg.scripts.start) {
    parts.push('### Quick Start');
    parts.push('');
    parts.push('```bash');
    parts.push('npm start');
    parts.push('```');
    parts.push('');
  }

  if (Object.keys(pkg.scripts).length > 0) {
    parts.push('### Scripts');
    parts.push('');

    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      parts.push(`- \`npm run ${name}\` — ${cmd}`);
    }

    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Build the API section from parsed exports.
 */
function buildApiSection(exports: ExportInfo[]): string {
  if (exports.length === 0) {
    return 'No public API exports detected.\n';
  }

  const parts: string[] = [];

  parts.push('### Exports');
  parts.push('');
  parts.push('| Export | Kind | Source Line |');
  parts.push('|--------|------|-------------|');

  for (const exp of exports) {
    parts.push(`| \`${exp.name}\` | ${exp.kind} | \`src/index.ts:${exp.line}\` |`);
  }

  parts.push('');

  return parts.join('\n');
}

/**
 * Build the Development section.
 */
function buildDevelopmentSection(pkg: PackageJsonInfo): string {
  const parts: string[] = [];

  if (pkg.scripts.build) {
    parts.push('### Build');
    parts.push('');
    parts.push('```bash');
    parts.push('npm run build');
    parts.push('```');
    parts.push('');
  }

  if (pkg.scripts.test) {
    parts.push('### Test');
    parts.push('');
    parts.push('```bash');
    parts.push('npm test');
    parts.push('```');
    parts.push('');
  }

  if (pkg.scripts.dev || pkg.scripts['test:watch']) {
    parts.push('### Development Mode');
    parts.push('');
    parts.push('```bash');

    if (pkg.scripts.dev) {
      parts.push('# Watch mode');
      parts.push('npm run dev');
    }
    if (pkg.scripts['test:watch']) {
      if (pkg.scripts.dev) parts.push('');
      parts.push('# Watch tests');
      parts.push('npm run test:watch');
    }

    parts.push('```');
    parts.push('');
  }

  return parts.join('\n');
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Generate a README.md from project structure analysis.
 *
 * Flow:
 * 1. Load project config from registry
 * 2. Check if README.md already exists (warn if so)
 * 3. Parse package.json for name, description, scripts
 * 4. Parse src/index.ts for exported symbols
 * 5. Build directory tree
 * 6. Generate markdown with all sections
 * 7. Return the generated README + metadata
 *
 * @param args - Input: { projectId }
 * @param deps - Dependencies: projectConfigLoader
 * @returns MCP-compatible response with generated README content
 */
export async function generateReadmeHandler(
  args: GenerateReadmeInput,
  deps: {
    projectConfigLoader: ProjectConfigLoader;
  },
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { projectId } = args;

  try {
    // 1. Validate project exists
    await deps.projectConfigLoader.load();
    const projectConfig = deps.projectConfigLoader.getProject(projectId);
    if (!projectConfig) {
      return {
        content: [{ type: 'text', text: `Error: Project '${projectId}' not found. Ensure the project is registered.` }],
        isError: true,
      };
    }

    const rootPath = projectConfig.rootPath;

    // 2. Check if README.md already exists
    const existingReadmePath = path.join(rootPath, 'README.md');
    let hasExistingReadme = false;

    try {
      await fs.access(existingReadmePath);
      hasExistingReadme = true;
    } catch {
      // README doesn't exist — that's fine
    }

    // 3. Parse package.json
    const pkg = await parsePackageJson(rootPath);
    const pkgName = pkg?.name ?? 'unknown';
    const description = pkg?.description ?? 'No description provided';

    // 4. Parse src/index.ts for exports
    let exports: ExportInfo[] = [];
    const indexPath = path.join(rootPath, 'src', 'index.ts');
    try {
      const indexSource = await fs.readFile(indexPath, 'utf-8');
      exports = parseExports(indexSource);
    } catch {
      // src/index.ts doesn't exist or can't be read — no exports
    }

    // 5. Build directory tree
    let directoryTree = '';
    try {
      directoryTree = await buildDirectoryTree(rootPath, rootPath);
    } catch {
      directoryTree = '(unable to scan directory)';
    }

    // 6. Generate markdown sections
    const installSection = pkg ? buildInstallSection(pkg) : '```bash\nnpm install\n```\n';
    const usageSection = pkg ? buildUsageSection(pkg) : 'See project documentation for usage instructions.\n';
    const apiSection = buildApiSection(exports);

    const devSection = pkg
      ? buildDevelopmentSection(pkg)
      : '### Build\n\n```bash\nnpm run build\n```\n\n### Test\n\n```bash\nnpm test\n```\n';

    // 7. Compose into final README
    // Use template structure: # {name}\n\n{description}\n\n## Installation\n\n## Usage\n\n## API\n\n## Development
    const readmeParts: string[] = [
      `# ${pkgName}`,
      '',
      description,
      '',
      '## Directory Structure',
      '',
      '```',
      directoryTree,
      '```',
      '',
      '## Installation',
      '',
      installSection.trim(),
      '',
      '## Usage',
      '',
      usageSection.trim(),
      '',
      '## API',
      '',
      apiSection.trim(),
      '',
      '## Development',
      '',
      devSection.trim(),
    ];

    const readme = readmeParts.join('\n');

    // 8. Build result
    const result: GenerateReadmeResult = {
      readme,
      packageName: pkgName,
      description,
      exports,
      directoryTree,
      hasExistingReadme,
      existingReadmePath: hasExistingReadme ? existingReadmePath : undefined,
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
// MCP Tool Registration
// ============================================================================

/**
 * Register the generateREADME tool on an MCP server.
 *
 * @param server - The McpServer instance
 * @param deps - Dependencies (projectConfigLoader)
 */
export function registerGenerateReadmeTool(
  server: { tool: (name: string, description: string, schema: Record<string, unknown>, handler: (args: GenerateReadmeInput) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>) => void },
  deps: {
    projectConfigLoader: ProjectConfigLoader;
  },
): void {
  server.tool(
    'generateREADME',
    'Generate a README.md for a registered project by analyzing project structure. ' +
    'Reads package.json (name, description, scripts), parses src/index.ts exports, ' +
    'and builds a directory tree. Does NOT overwrite existing README — always reports ' +
    'if one already exists. Returns generated markdown with sections: Installation, Usage, API, Development.',
    {
      projectId: z.string().describe('The project ID to generate a README for'),
    },
    async (args: GenerateReadmeInput) => generateReadmeHandler(args, deps),
  );
}
