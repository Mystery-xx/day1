import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ProjectConfigLoader, type ProjectConfig } from '../config/project-config.js';
import { findUsagesHandler, type FindUsagesInput, type FindUsagesResult } from './find-usages.js';

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;
let projectsFile: string;
let loader: ProjectConfigLoader;

const TEST_PROJECT_ID = 'test-project';

function createMockProject(id: string, rootPath: string): ProjectConfig {
  return {
    id,
    name: `Test ${id}`,
    rootPath,
    createdAt: new Date().toISOString(),
    lastIndexed: null,
  };
}

async function writeProjectRegistry(
  projects: Record<string, ProjectConfig>,
  filePath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ projects }, null, 2), 'utf-8');
}

async function setupProject(): Promise<void> {
  testDir = path.join(
    tmpdir(),
    `find-usages-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(testDir, { recursive: true });

  // Create test source files with known usages

  // ── src/index.ts ──
  await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(testDir, 'src', 'index.ts'),
    [
      '// App entry point',
      'import { greet, type User } from "./user";',
      'import { calculateTotal, formatCurrency } from "./utils";',
      'import { Database } from "./db";',
      '',
      'const user: User = { name: "Alice", age: 30 };',
      'console.log(greet(user));',
      'const total = calculateTotal(100, 50);',
      'console.log(formatCurrency(total));',
      'const db = new Database("primary");',
      'db.connect();',
      '',
    ].join('\n'),
    'utf-8',
  );

  // ── src/user.ts ──
  await fs.writeFile(
    path.join(testDir, 'src', 'user.ts'),
    [
      '// User module',
      'export interface User {',
      '  name: string;',
      '  age: number;',
      '}',
      '',
      'export function greet(user: User): string {',
      '  return `Hello, ${user.name}!`;',
      '}',
      '',
      'export function createDefaultUser(): User {',
      '  return { name: "Guest", age: 0 };',
      '}',
      '',
      '// Internal usage within the same file',
      'const defaultUser = createDefaultUser();',
      'console.log(greet(defaultUser));',
      '',
    ].join('\n'),
    'utf-8',
  );

  // ── src/utils.ts ──
  await fs.writeFile(
    path.join(testDir, 'src', 'utils.ts'),
    [
      '// Utility functions',
      'export function calculateTotal(price: number, tax: number): number {',
      '  return price + tax;',
      '}',
      '',
      'export function formatCurrency(amount: number): string {',
      '  return `$${amount.toFixed(2)}`;',
      '}',
      '',
    ].join('\n'),
    'utf-8',
  );

  // ── src/db.ts ──
  await fs.writeFile(
    path.join(testDir, 'src', 'db.ts'),
    [
      '// Database class',
      'export class Database {',
      '  constructor(private name: string) {}',
      '  connect(): void {',
      '    console.log(`Connected to ${this.name}`);',
      '  }',
      '}',
      '',
      '// Extended Database',
      'export class ReplicaDatabase extends Database {',
      '  constructor(name: string) {',
      '    super(name);',
      '  }',
      '}',
      '',
    ].join('\n'),
    'utf-8',
  );

  // ── src/__tests__/app.test.ts (in a directory that should be searched) ──
  await fs.mkdir(path.join(testDir, 'src', '__tests__'), { recursive: true });
  await fs.writeFile(
    path.join(testDir, 'src', '__tests__', 'app.test.ts'),
    [
      '// Tests',
      'import { greet } from "../user";',
      'import { calculateTotal } from "../utils";',
      'import { Database } from "../db";',
      '',
      'describe("app", () => {',
      '  it("should greet", () => {',
      '    const result = greet({ name: "Test", age: 25 });',
      '    expect(result).toBe("Hello, Test!");',
      '  });',
      '',
      '  it("should calculate total", () => {',
      '    const result = calculateTotal(10, 5);',
      '    expect(result).toBe(15);',
      '  });',
      '',
      '  it("should create Database", () => {',
      '    const db = new Database("test");',
      '    expect(db).toBeDefined();',
      '  });',
      '});',
      '',
    ].join('\n'),
    'utf-8',
  );

  // ── node_modules/ ── should be excluded from search
  await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
  await fs.writeFile(
    path.join(testDir, 'node_modules', 'should-be-excluded.ts'),
    'import { greet } from "fake";\ngreet("test");\n',
    'utf-8',
  );

  // ── .git/ ── should be excluded from search
  await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
  await fs.writeFile(
    path.join(testDir, '.git', 'config'),
    '[core]\n\trepositoryformatversion = 0\n',
    'utf-8',
  );

  // Set up project registry
  projectsFile = path.join(testDir, 'projects.json');
  const projectConfig = createMockProject(TEST_PROJECT_ID, testDir);
  await writeProjectRegistry({ [TEST_PROJECT_ID]: projectConfig }, projectsFile);

  // Setup loader
  loader = new ProjectConfigLoader(projectsFile);
  await loader.load();
}

async function teardownProject(): Promise<void> {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('findUsages MCP Tool', () => {
  beforeEach(async () => {
    await setupProject();
  });

  afterEach(async () => {
    await teardownProject();
  });

  // --------------------------------------------------------------------------
  // Happy Path: Import type
  // --------------------------------------------------------------------------

  describe('happy path — import type', () => {
    it('finds all import usages of a function symbol', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'greet',
        type: 'import',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBeFalsy();

      const result: FindUsagesResult = JSON.parse(response.content[0].text);

      // Should find import statements for 'greet':
      //   - src/index.ts  (import { greet ...)
      //   - src/__tests__/app.test.ts  (import { greet ...)
      // Should NOT find internal usages (same-file def)
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.usages.every((u) => u.context.includes('import'))).toBe(true);
    });

    it('finds all import usages of a class symbol', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'Database',
        type: 'import',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBeFalsy();

      const result: FindUsagesResult = JSON.parse(response.content[0].text);

      // Should find import statements for 'Database':
      //   - src/index.ts
      //   - src/__tests__/app.test.ts
      expect(result.total).toBeGreaterThanOrEqual(2);
    });

    it('excludes node_modules imports', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'greet',
        type: 'import',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBeFalsy();

      const result: FindUsagesResult = JSON.parse(response.content[0].text);

      // None of the results should be from node_modules/
      const nodeModulesResults = result.usages.filter((u) => u.file.includes('node_modules'));
      expect(nodeModulesResults).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Happy Path: Call type
  // --------------------------------------------------------------------------

  describe('happy path — call type', () => {
    it('finds function call usages', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'calculateTotal',
        type: 'call',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBeFalsy();

      const result: FindUsagesResult = JSON.parse(response.content[0].text);

      // Should find calls to calculateTotal:
      //   - src/index.ts:  calculateTotal(100, 50)
      //   - src/__tests__/app.test.ts:  calculateTotal(10, 5)
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.usages.every((u) => u.context.includes('calculateTotal('))).toBe(true);
    });

    it('finds constructor calls', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'Database',
        type: 'call',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBeFalsy();

      const result: FindUsagesResult = JSON.parse(response.content[0].text);

      // Should find calls to Database:
      //   - src/index.ts:  new Database("primary")
      //   - src/__tests__/app.test.ts:  new Database("test")
      // (Note: classRefPattern captures "new Database", callPattern captures "Database(")
      expect(result.total).toBeGreaterThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // Happy Path: Reference type
  // --------------------------------------------------------------------------

  describe('happy path — reference type', () => {
    it('finds class reference usages (extends, new, implements)', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'Database',
        type: 'reference',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBeFalsy();

      const result: FindUsagesResult = JSON.parse(response.content[0].text);

      // Should find:
      //   - src/db.ts:  extends Database (for ReplicaDatabase)
      //   - src/index.ts: new Database
      //   - src/__tests__/app.test.ts: new Database
      expect(result.total).toBeGreaterThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // Happy Path: All type (default)
  // --------------------------------------------------------------------------

  describe('happy path — all type (default)', () => {
    it('finds all usages of an exported function', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'greet',
        type: 'all',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBeFalsy();

      const result: FindUsagesResult = JSON.parse(response.content[0].text);

      // Should find usages of 'greet':
      //   - Imports: src/index.ts, src/__tests__/app.test.ts
      //   - Calls: src/index.ts (greet(user)), src/user.ts (greet(defaultUser)), src/__tests__/app.test.ts
      //   - General refs: at least the above
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.usages.every((u) => !u.file.includes('node_modules'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Result format
  // --------------------------------------------------------------------------

  describe('result format', () => {
    it('returns correct structure with file, line, column, context', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'greet',
        type: 'all',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      const result: FindUsagesResult = JSON.parse(response.content[0].text);

      expect(result.usages.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThanOrEqual(result.usages.length);

      for (const usage of result.usages) {
        expect(usage).toHaveProperty('file');
        expect(usage).toHaveProperty('line');
        expect(usage).toHaveProperty('column');
        expect(usage).toHaveProperty('context');
        expect(typeof usage.file).toBe('string');
        expect(typeof usage.line).toBe('number');
        expect(typeof usage.column).toBe('number');
        expect(typeof usage.context).toBe('string');
        expect(usage.line).toBeGreaterThanOrEqual(1);
        expect(usage.column).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Failure Cases
  // --------------------------------------------------------------------------

  describe('failure cases', () => {
    it('returns error for non-existent project', async () => {
      const args: FindUsagesInput = {
        projectId: 'non-existent-project',
        symbol: 'greet',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });

    it('returns error for empty symbol', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: '',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('non-empty');
    });

    it('returns error for whitespace-only symbol', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: '   ',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('non-empty');
    });
  });

  // --------------------------------------------------------------------------
  // Security: Path Traversal Prevention
  // --------------------------------------------------------------------------

  describe('security — path traversal prevention', () => {
    it('rejects project with root outside sandbox', async () => {
      // Manually create a project that points outside the sandbox
      const evilProjectId = 'evil-project';
      const evilConfig = createMockProject(evilProjectId, '/etc');
      await writeProjectRegistry({ [evilProjectId]: evilConfig }, projectsFile);
      await loader.load();

      const args: FindUsagesInput = {
        projectId: evilProjectId,
        symbol: 'test',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBe(true);
      // On Linux, sandbox rejects root paths; if that passes (e.g., /etc is valid path),
      // the OS may reject reading files inside /etc with EACCES
      const text = response.content[0].text;
      const ok = text.includes('Access denied') || text.toLowerCase().includes('eacces') || text.includes('permission denied');
      expect(ok).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns empty results for symbol with no matches', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'NonExistentSymbolXYZ',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBeFalsy();

      const result: FindUsagesResult = JSON.parse(response.content[0].text);
      expect(result.usages).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('handles special characters in symbol name gracefully', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'greet.user',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      expect(response.isError).toBeFalsy();

      const result: FindUsagesResult = JSON.parse(response.content[0].text);
      expect(result.total).toBe(0); // no matches, but no crash
    });

    it('returns results sorted by file path', async () => {
      const args: FindUsagesInput = {
        projectId: TEST_PROJECT_ID,
        symbol: 'greet',
      };

      const response = await findUsagesHandler(args, { projectConfigLoader: loader });
      const result: FindUsagesResult = JSON.parse(response.content[0].text);

      const files = result.usages.map((u) => u.file);
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });
  });
});
