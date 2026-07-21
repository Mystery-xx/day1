import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { ProjectConfigLoader } from '../config/project-config.js';
import {
  generateReadmeHandler,
  parsePackageJson,
  parseExports,
  buildDirectoryTree,
  type GenerateReadmeInput,
} from './generate-readme.js';

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;
let projectsFile: string;

const TEST_PROJECT_ID = 'test-readme-project';

function createMockProject(id: string, rootPath: string) {
  return {
    id,
    name: `Test ${id}`,
    rootPath,
    createdAt: new Date().toISOString(),
    lastIndexed: null,
  };
}

async function writeProjectRegistry(projects: Record<string, unknown>, filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ projects }, null, 2), 'utf-8');
}

/**
 * Create a minimal test project with package.json and src/index.ts
 */
async function createTestProject(
  rootDir: string,
  options: {
    packageJson?: Record<string, unknown>;
    indexSource?: string;
    extraFiles?: Array<{ relPath: string; content: string }>;
    createReadme?: boolean;
  } = {},
): Promise<void> {
  // Package.json
  const pkg = options.packageJson ?? {
    name: 'test-package',
    version: '1.0.0',
    description: 'A test package for README generation',
    main: 'dist/index.js',
    scripts: {
      build: 'tsc',
      test: 'vitest run',
      dev: 'tsc --watch',
    },
  };
  await fs.writeFile(path.join(rootDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

  // src/index.ts
  const indexSource = options.indexSource ?? [
    'export function greet(name: string): string {',
    '  return `Hello, ${name}!`;',
    '}',
    '',
    'export class Calculator {',
    '  add(a: number, b: number): number { return a + b; }',
    '}',
    '',
    'export const VERSION = "1.0.0";',
    '',
    'export interface Config {',
    '  debug: boolean;',
    '}',
    '',
    'export type Callback = (err: Error | null) => void;',
    '',
  ].join('\n');
  await fs.mkdir(path.join(rootDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'src', 'index.ts'), indexSource, 'utf-8');

  // Extra files
  if (options.extraFiles) {
    for (const { relPath, content } of options.extraFiles) {
      const fullPath = path.join(rootDir, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  }

  // Optionally create README.md
  if (options.createReadme) {
    await fs.writeFile(path.join(rootDir, 'README.md'), '# Existing README\n', 'utf-8');
  }
}

// ============================================================================
// parsePackageJson Tests
// ============================================================================

describe('parsePackageJson', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'parse-pkg-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should parse a valid package.json', async () => {
    const pkgData = {
      name: 'my-lib',
      description: 'My awesome library',
      scripts: { build: 'tsc', test: 'jest' },
      main: 'dist/index.js',
    };
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(pkgData), 'utf-8');

    const result = await parsePackageJson(tempDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-lib');
    expect(result!.description).toBe('My awesome library');
    expect(result!.scripts.build).toBe('tsc');
    expect(result!.scripts.test).toBe('jest');
    expect(result!.hasMainEntry).toBe(true);
  });

  it('should handle missing description', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'minimal' }), 'utf-8');

    const result = await parsePackageJson(tempDir);
    expect(result).not.toBeNull();
    expect(result!.description).toBe('No description provided');
  });

  it('should return null for missing package.json', async () => {
    const result = await parsePackageJson(tempDir);
    expect(result).toBeNull();
  });

  it('should return null for invalid JSON', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), 'not valid json', 'utf-8');
    const result = await parsePackageJson(tempDir);
    expect(result).toBeNull();
  });
});

// ============================================================================
// parseExports Tests
// ============================================================================

describe('parseExports', () => {
  it('should extract function exports', () => {
    const source = [
      'export function greet(name: string): string {',
      '  return `Hello, ${name}!`;',
      '}',
      'export function add(a: number, b: number): number {',
      '  return a + b;',
      '}',
    ].join('\n');

    const exports = parseExports(source);
    expect(exports).toHaveLength(2);
    expect(exports[0]).toMatchObject({ name: 'greet', kind: 'function', line: 1 });
    expect(exports[1]).toMatchObject({ name: 'add', kind: 'function', line: 4 });
  });

  it('should extract class exports', () => {
    const source = [
      'export class Calculator {',
      '  add(a: number, b: number): number { return a + b; }',
      '}',
    ].join('\n');

    const exports = parseExports(source);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ name: 'Calculator', kind: 'class', line: 1 });
  });

  it('should extract const exports', () => {
    const source = "export const VERSION = '1.0.0';\n";

    const exports = parseExports(source);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ name: 'VERSION', kind: 'variable', line: 1 });
  });

  it('should extract interface exports', () => {
    const source = [
      'export interface Config {',
      '  debug: boolean;',
      '}',
    ].join('\n');

    const exports = parseExports(source);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ name: 'Config', kind: 'interface', line: 1 });
  });

  it('should extract type exports', () => {
    const source = 'export type Callback = (err: Error | null) => void;\n';

    const exports = parseExports(source);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ name: 'Callback', kind: 'type', line: 1 });
  });

  it('should extract multiple export types from a real source file', () => {
    const source = [
      'export function greet(name: string): string {',
      '  return `Hello, ${name}!`;',
      '}',
      '',
      'export class Calculator {',
      '  add(a: number, b: number): number { return a + b; }',
      '}',
      '',
      'export const VERSION = "1.0.0";',
      '',
      'export interface Config {',
      '  debug: boolean;',
      '}',
      '',
      'export type Callback = (err: Error | null) => void;',
      '',
    ].join('\n');

    const exports = parseExports(source);
    expect(exports).toHaveLength(5);

    // Verify all 5 exports are captured
    const names = exports.map(e => e.name);
    expect(names).toContain('greet');
    expect(names).toContain('Calculator');
    expect(names).toContain('VERSION');
    expect(names).toContain('Config');
    expect(names).toContain('Callback');

    // Verify kinds
    expect(exports.find(e => e.name === 'greet')!.kind).toBe('function');
    expect(exports.find(e => e.name === 'Calculator')!.kind).toBe('class');
    expect(exports.find(e => e.name === 'VERSION')!.kind).toBe('variable');
    expect(exports.find(e => e.name === 'Config')!.kind).toBe('interface');
    expect(exports.find(e => e.name === 'Callback')!.kind).toBe('type');
  });

  it('should handle empty source', () => {
    const exports = parseExports('');
    expect(exports).toHaveLength(0);
  });

  it('should handle source with no exports', () => {
    const source = [
      'const x = 1;',
      'function foo() {}',
      '// no exports here',
    ].join('\n');

    const exports = parseExports(source);
    expect(exports).toHaveLength(0);
  });

  it('should handle named re-exports', () => {
    const source = 'export { greet, Calculator };\n';
    const exports = parseExports(source);
    expect(exports).toHaveLength(2);
    expect(exports[0]).toMatchObject({ name: 'greet', line: 1 });
    expect(exports[1]).toMatchObject({ name: 'Calculator', line: 1 });
  });
});

// ============================================================================
// buildDirectoryTree Tests
// ============================================================================

describe('buildDirectoryTree', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'tree-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should build a tree with directory structure', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}', 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), '', 'utf-8');
    await fs.mkdir(path.join(tempDir, 'dist'), { recursive: true });

    const tree = await buildDirectoryTree(tempDir, tempDir);

    expect(tree).toContain(path.basename(tempDir) + '/');
    expect(tree).toContain('src/');
    expect(tree).toContain('package.json');
    expect(tree).toContain('index.ts');
    // dist should be present (it is not in DEFAULT_EXCLUDE unless added explicitly)
    // Actually, 'dist' IS in DEFAULT_EXCLUDE — let's verify
  });

  it('should exclude known directories', async () => {
    await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'node_modules', 'dep.js'), '', 'utf-8');

    const tree = await buildDirectoryTree(tempDir, tempDir);
    expect(tree).not.toContain('node_modules');
    expect(tree).not.toContain('dep.js');
  });

  it('should handle empty directories', async () => {
    await fs.mkdir(path.join(tempDir, 'empty-dir'), { recursive: true });

    const tree = await buildDirectoryTree(tempDir, tempDir);
    expect(tree).toContain('empty-dir/');
  });

  it('should respect custom exclude patterns', async () => {
    await fs.mkdir(path.join(tempDir, 'coverage'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'coverage', 'lcov.info'), '', 'utf-8');

    const tree = await buildDirectoryTree(tempDir, tempDir, ['coverage']);
    expect(tree).not.toContain('coverage');
  });
});

// ============================================================================
// generateReadmeHandler — Integration Tests
// ============================================================================

describe('generateReadmeHandler', () => {
  let loader: ProjectConfigLoader;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'generate-readme-test-'));
    projectsFile = path.join(testDir, 'projects.json');

    // Create project registry
    const projectConfig = createMockProject(TEST_PROJECT_ID, testDir);
    await writeProjectRegistry({ [TEST_PROJECT_ID]: projectConfig }, projectsFile);

    // Setup loader
    loader = new ProjectConfigLoader(projectsFile);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // --------------------------------------------------------------------------
  // Happy Path
  // --------------------------------------------------------------------------

  describe('happy path', () => {
    it('should generate README for a project with 3+ exports', async () => {
      await createTestProject(testDir);

      const result = await generateReadmeHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0].text);

      // Check basic structure
      expect(parsed.packageName).toBe('test-package');
      expect(parsed.description).toBe('A test package for README generation');
      expect(parsed.hasExistingReadme).toBe(false);

      // Check exports — there should be 5 exports
      expect(parsed.exports).toBeDefined();
      const names = parsed.exports.map((e: { name: string }) => e.name);
      expect(names).toContain('greet');
      expect(names).toContain('Calculator');
      expect(names).toContain('VERSION');
      expect(names).toContain('Config');
      expect(names).toContain('Callback');

      // Check generated README content
      const readme = parsed.readme as string;

      // Template sections: # {name}\n\n{description}\n\n## Installation\n\n## Usage\n\n## API\n\n## Development
      expect(readme).toContain('# test-package');
      expect(readme).toContain('A test package for README generation');
      expect(readme).toContain('## Installation');
      expect(readme).toContain('## Usage');
      expect(readme).toContain('## API');
      expect(readme).toContain('## Development');
      expect(readme).toContain('## Directory Structure');

      // Check API section lists all 5 exports
      expect(readme).toContain('greet');
      expect(readme).toContain('Calculator');
      expect(readme).toContain('VERSION');
      expect(readme).toContain('Config');
      expect(readme).toContain('Callback');

      // Check directory tree
      expect(parsed.directoryTree).toBeDefined();
      expect(typeof parsed.directoryTree).toBe('string');
      expect(parsed.directoryTree).toContain('package.json');
    });

    it('should detect existing README and report it', async () => {
      await createTestProject(testDir, { createReadme: true });

      const result = await generateReadmeHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.hasExistingReadme).toBe(true);
      expect(parsed.existingReadmePath).toBeDefined();
      expect(parsed.existingReadmePath).toContain('README.md');
    });

    it('should include scripts table in Installation section', async () => {
      await createTestProject(testDir, {
        packageJson: {
          name: 'scripty',
          version: '1.0.0',
          description: 'Has scripts',
          scripts: {
            build: 'tsc',
            test: 'vitest',
            lint: 'eslint',
          },
        },
      });

      const result = await generateReadmeHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      const readme = parsed.readme;

      // Installation section should list scripts
      expect(readme).toContain('Available scripts');
      expect(readme).toContain('build');
      expect(readme).toContain('test');
      expect(readme).toContain('lint');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle missing package.json', async () => {
      // No package.json at all in testDir
      const result = await generateReadmeHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      // Falls back to 'unknown' name
      expect(parsed.packageName).toBe('unknown');
      expect(parsed.readme).toContain('# unknown');
    });

    it('should handle missing src/index.ts', async () => {
      // Create package.json but no src/index.ts
      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'no-exports-pkg', description: 'No exports here' }),
        'utf-8',
      );

      const result = await generateReadmeHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.exports).toHaveLength(0);
      const readme = parsed.readme;
      // API section should still be present but with no exports
      expect(readme).toContain('## API');
    });

    it('should handle empty project directory', async () => {
      // testDir exists but is completely empty
      const result = await generateReadmeHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.packageName).toBe('unknown');
      expect(parsed.exports).toHaveLength(0);
      expect(parsed.readme).toContain('## Installation');
      expect(parsed.readme).toContain('## Usage');
      expect(parsed.readme).toContain('## API');
      expect(parsed.readme).toContain('## Development');
    });
  });

  // --------------------------------------------------------------------------
  // Failure Cases
  // --------------------------------------------------------------------------

  describe('failure cases', () => {
    it('should return error for non-existent project', async () => {
      const result = await generateReadmeHandler(
        { projectId: 'non-existent-project' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toContain('not found');
    });
  });
});
