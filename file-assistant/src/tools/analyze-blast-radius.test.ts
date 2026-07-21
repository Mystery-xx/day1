import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { ProjectConfigLoader } from '../config/project-config.js';
import {
  handleAnalyzeBlastRadius,
  buildImportPatterns,
  findDependents,
  assessRiskLevel,
  findSourceFiles,
  type AnalyzeBlastRadiusArgs,
  type AnalyzeBlastRadiusResult,
  type DependentFile,
} from './analyze-blast-radius.js';

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;
let projectsFile: string;
let loader: ProjectConfigLoader;
let originalCwd: string;

const PROJECT_ID = 'test-project';

async function setupProject(): Promise<void> {
  testDir = path.join(
    tmpdir(),
    `blast-radius-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(testDir, { recursive: true });

  // Create a project structure with files that import each other
  // src/
  //   index.ts         -> imports utils/helpers.ts, services/user.ts
  //   utils/helpers.ts  -> (target file, imported by many)
  //   services/user.ts -> imports utils/helpers.ts
  //   services/order.ts -> imports utils/helpers.ts
  //   components/header.tsx -> imports ../utils/helpers.ts
  //   components/button.tsx  -> (no imports of helpers)
  //   legacy/old.js     -> require('./helpers')

  const srcDir = path.join(testDir, 'src');
  const utilsDir = path.join(srcDir, 'utils');
  const servicesDir = path.join(srcDir, 'services');
  const componentsDir = path.join(srcDir, 'components');
  const legacyDir = path.join(srcDir, 'legacy');

  await fs.mkdir(utilsDir, { recursive: true });
  await fs.mkdir(servicesDir, { recursive: true });
  await fs.mkdir(componentsDir, { recursive: true });
  await fs.mkdir(legacyDir, { recursive: true });

  // Target file: utils/helpers.ts
  await fs.writeFile(
    path.join(utilsDir, 'helpers.ts'),
    `export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseConfig(raw: string): Record<string, unknown> {
  return JSON.parse(raw);
}
`,
    'utf-8',
  );

  // index.ts - imports helpers and user service
  await fs.writeFile(
    path.join(srcDir, 'index.ts'),
    `import { formatDate } from './utils/helpers.ts';
import { createUser } from './services/user.ts';

export function main() {
  console.log(formatDate(new Date()));
  createUser('test');
}
`,
    'utf-8',
  );

  // services/user.ts - imports helpers
  await fs.writeFile(
    path.join(servicesDir, 'user.ts'),
    `import { parseConfig } from '../utils/helpers.ts';

export function createUser(name: string) {
  return { name };
}

export function loadConfig(raw: string) {
  return parseConfig(raw);
}
`,
    'utf-8',
  );

  // services/order.ts - imports helpers via require
  await fs.writeFile(
    path.join(servicesDir, 'order.ts'),
    `const helpers = require('../utils/helpers.ts');

export function processOrder(orderId: string) {
  return helpers.formatDate(new Date());
}
`,
    'utf-8',
  );

  // components/header.tsx - imports helpers with relative path
  await fs.writeFile(
    path.join(componentsDir, 'header.tsx'),
    `import { formatDate } from '../utils/helpers';

export function Header() {
  return <header>Today: {formatDate(new Date())}</header>;
}
`,
    'utf-8',
  );

  // components/button.tsx - no imports of helpers
  await fs.writeFile(
    path.join(componentsDir, 'button.tsx'),
    `export function Button({ label }: { label: string }) {
  return <button>{label}</button>;
}
`,
    'utf-8',
  );

  // legacy/old.js - uses require with extensionless path
  await fs.writeFile(
    path.join(legacyDir, 'old.js'),
    `const { formatDate } = require('../utils/helpers');

module.exports = { formatDate };
`,
    'utf-8',
  );

  // Circular dependency test files
  const circularDir = path.join(srcDir, 'circular');
  await fs.mkdir(circularDir, { recursive: true });

  await fs.writeFile(
    path.join(circularDir, 'a.ts'),
    `import { bFunc } from './b';

export function aFunc() { return bFunc(); }
`,
    'utf-8',
  );

  await fs.writeFile(
    path.join(circularDir, 'b.ts'),
    `import { aFunc } from './a';

export function bFunc() { return aFunc(); }
`,
    'utf-8',
  );

  // Symbol tests: add a file that uses parseConfig symbol
  await fs.writeFile(
    path.join(srcDir, 'symbol-user.ts'),
    `import { parseConfig } from './utils/helpers';

export function run(raw: string) {
  return parseConfig(raw);
}
`,
    'utf-8',
  );

  // Node_modules directory (should be excluded)
  const nodeModulesDir = path.join(testDir, 'node_modules');
  await fs.mkdir(nodeModulesDir, { recursive: true });
  await fs.writeFile(
    path.join(nodeModulesDir, 'fake-dep.ts'),
    `import { formatDate } from '../src/utils/helpers';
export const x = formatDate(new Date());
`,
    'utf-8',
  );

  // Dist directory (should be excluded)
  const distDir = path.join(testDir, 'dist');
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(
    path.join(distDir, 'bundle.js'),
    `const helpers = require('../src/utils/helpers');
module.exports = helpers;
`,
    'utf-8',
  );

  // Set up project registry
  projectsFile = path.join(testDir, 'projects.json');
  loader = new ProjectConfigLoader(projectsFile);

  await fs.writeFile(
    projectsFile,
    JSON.stringify(
      {
        projects: {
          [PROJECT_ID]: {
            id: PROJECT_ID,
            name: 'Test Project',
            rootPath: testDir,
            createdAt: new Date().toISOString(),
            lastIndexed: null,
          },
        },
      },
      null,
      2,
    ),
    'utf-8',
  );
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

describe('analyzeBlastRadius MCP Tool', () => {
  beforeEach(async () => {
    await setupProject();
  });

  afterEach(async () => {
    await teardownProject();
  });

  // --------------------------------------------------------------------------
  // buildImportPatterns
  // --------------------------------------------------------------------------

  describe('buildImportPatterns', () => {
    it('generates exact path import pattern for a file', () => {
      const patterns = buildImportPatterns('src/utils/helpers.ts');
      expect(patterns.length).toBeGreaterThan(0);

      // First pattern should be exact path import with 1.0 confidence
      const exactImport = patterns.find(p => p.baseConfidence === 1.0 && p.type === 'import');
      expect(exactImport).toBeDefined();
      expect(exactImport!.regex.test(`import { x } from './src/utils/helpers.ts'`)).toBe(true);
    });

    it('generates require pattern for a file', () => {
      const patterns = buildImportPatterns('utils/helpers.ts');
      const requirePattern = patterns.find(p => p.type === 'require' && p.baseConfidence === 1.0);
      expect(requirePattern).toBeDefined();
      expect(requirePattern!.regex.test(`const h = require('./utils/helpers.ts')`)).toBe(true);
    });

    it('generates extensionless import pattern', () => {
      const patterns = buildImportPatterns('src/utils/helpers.ts');
      const extless = patterns.find(p => p.baseConfidence === 0.95 && p.type === 'import');
      expect(extless).toBeDefined();
      expect(extless!.regex.test(`import { x } from './src/utils/helpers'`)).toBe(true);
    });

    it('generates symbol patterns when symbol is provided', () => {
      const patterns = buildImportPatterns('utils/helpers.ts', 'parseConfig');
      const namedImport = patterns.find(p => p.label === 'named import: parseConfig');
      expect(namedImport).toBeDefined();
      expect(namedImport!.regex.test(`import { parseConfig } from './utils/helpers'`)).toBe(true);

      const symbolCall = patterns.find(p => p.label === 'symbol call: parseConfig()');
      expect(symbolCall).toBeDefined();
      expect(symbolCall!.regex.test(`parseConfig(raw)`)).toBe(true);
    });

    it('escapes regex special characters in file paths', () => {
      const patterns = buildImportPatterns('src/utils/[special]-file.ts');
      const exactPattern = patterns.find(p => p.baseConfidence === 1.0);
      expect(exactPattern).toBeDefined();
      expect(exactPattern!.regex.test(`import { x } from './src/utils/[special]-file.ts'`)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // findDependents
  // --------------------------------------------------------------------------

  describe('findDependents', () => {
    it('returns matching dependents for a file that imports the target', async () => {
      const helpersPath = path.join(testDir, 'src', 'utils', 'helpers.ts');
      const indexFile = path.join(testDir, 'src', 'index.ts');
      const patterns = buildImportPatterns('src/utils/helpers.ts');

      const result = await findDependents(indexFile, testDir, patterns);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].file).toBe('src/index.ts');
      expect(result[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('returns empty for file that does not import the target', async () => {
      const helpersPath = path.join(testDir, 'src', 'utils', 'helpers.ts');
      const buttonFile = path.join(testDir, 'src', 'components', 'button.tsx');
      const patterns = buildImportPatterns('src/utils/helpers.ts');

      const result = await findDependents(buttonFile, testDir, patterns);
      expect(result).toEqual([]);
    });

    it('detects require() imports', async () => {
      const orderFile = path.join(testDir, 'src', 'services', 'order.ts');
      const patterns = buildImportPatterns('src/utils/helpers.ts');

      const result = await findDependents(orderFile, testDir, patterns);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('require');
    });

    it('returns empty for unreadable files', async () => {
      const nonexistent = path.join(testDir, 'nonexistent.ts');
      const patterns = buildImportPatterns('src/utils/helpers.ts');

      const result = await findDependents(nonexistent, testDir, patterns);
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // assessRiskLevel
  // --------------------------------------------------------------------------

  describe('assessRiskLevel', () => {
    it('returns low for 0 importers', () => {
      expect(assessRiskLevel(0)).toBe('low');
    });

    it('returns low for 1-2 importers', () => {
      expect(assessRiskLevel(1)).toBe('low');
      expect(assessRiskLevel(2)).toBe('low');
    });

    it('returns medium for 3-9 importers', () => {
      expect(assessRiskLevel(3)).toBe('medium');
      expect(assessRiskLevel(5)).toBe('medium');
      expect(assessRiskLevel(9)).toBe('medium');
    });

    it('returns high for 10+ importers', () => {
      expect(assessRiskLevel(10)).toBe('high');
      expect(assessRiskLevel(50)).toBe('high');
    });
  });

  // --------------------------------------------------------------------------
  // findSourceFiles
  // --------------------------------------------------------------------------

  describe('findSourceFiles', () => {
    it('finds all source files excluding node_modules and dist', async () => {
      const files = await findSourceFiles(testDir);

      // Should find our source files but NOT node_modules or dist files
      const srcFiles = files.filter(f => f.includes('src/'));
      expect(srcFiles.length).toBeGreaterThanOrEqual(8); // 8+ source files

      const nodeModulesFiles = files.filter(f => f.includes('node_modules'));
      expect(nodeModulesFiles).toEqual([]);

      const distFiles = files.filter(f => f.includes('dist'));
      expect(distFiles).toEqual([]);
    });

    it('respects maxFiles limit', async () => {
      const files = await findSourceFiles(testDir, undefined, 3);
      expect(files.length).toBeLessThanOrEqual(3);
    });
  });

  // --------------------------------------------------------------------------
  // Happy Path: find dependents of a commonly imported file
  // --------------------------------------------------------------------------

  describe('happy path - find dependents', () => {
    it('finds all files that import utils/helpers.ts', async () => {
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: 'src/utils/helpers.ts',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBeFalsy();

      const result: AnalyzeBlastRadiusResult = JSON.parse(response.content[0].text);
      expect(result.target).toBe('src/utils/helpers.ts');
      expect(result.importerCount).toBeGreaterThanOrEqual(5);

      // Should find: index.ts, user.ts, order.ts, header.tsx, old.js, symbol-user.ts
      const foundFiles = result.dependents.map(d => d.file);
      expect(foundFiles).toContain('src/index.ts');
      expect(foundFiles).toContain('src/services/user.ts');
      expect(foundFiles).toContain('src/services/order.ts');
      expect(foundFiles).toContain('src/components/header.tsx');
      expect(foundFiles).toContain('src/legacy/old.js');
      expect(foundFiles).toContain('src/symbol-user.ts');

      // Should NOT include button.tsx (no helpers import)
      expect(foundFiles).not.toContain('src/components/button.tsx');

      // Should have a medium risk level (5-6 importers)
      expect(result.riskLevel).toBe('medium');

      // All entries should have confidence scores
      for (const dep of result.dependents) {
        expect(dep.confidence).toBeGreaterThan(0);
        expect(dep.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('reports high risk for files with 10+ importers', async () => {
      // Create additional files that import helpers to push past threshold
      for (let i = 0; i < 8; i++) {
        const extraDir = path.join(testDir, 'src', `extra-${i}`);
        await fs.mkdir(extraDir, { recursive: true });
        await fs.writeFile(
          path.join(extraDir, `importer-${i}.ts`),
          `import { formatDate } from '../../utils/helpers';\nexport const x = formatDate(new Date());\n`,
          'utf-8',
        );
      }

      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: 'src/utils/helpers.ts',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBeFalsy();

      const result: AnalyzeBlastRadiusResult = JSON.parse(response.content[0].text);
      expect(result.importerCount).toBeGreaterThanOrEqual(14);
      expect(result.riskLevel).toBe('high');
    });
  });

  // --------------------------------------------------------------------------
  // Happy Path: symbol-based analysis
  // --------------------------------------------------------------------------

  describe('symbol-based analysis', () => {
    it('finds dependents with symbol filter', async () => {
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: 'src/utils/helpers.ts',
        symbol: 'parseConfig',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBeFalsy();

      const result: AnalyzeBlastRadiusResult = JSON.parse(response.content[0].text);
      expect(result.symbol).toBe('parseConfig');
      expect(result.target).toBe('src/utils/helpers.ts');

      // parseConfig is imported by user.ts and symbol-user.ts
      const foundFiles = result.dependents.map(d => d.file);
      expect(foundFiles).toContain('src/services/user.ts');
      expect(foundFiles).toContain('src/symbol-user.ts');
    });
  });

  // --------------------------------------------------------------------------
  // Happy Path: low-risk file
  // --------------------------------------------------------------------------

  describe('low risk assessment', () => {
    it('returns low risk for file with few or no importers', async () => {
      // button.tsx has no imports of helpers, but the analysis is about button itself
      // We need a file that has zero or few dependents
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: 'src/components/button.tsx',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBeFalsy();

      const result: AnalyzeBlastRadiusResult = JSON.parse(response.content[0].text);
      expect(result.importerCount).toBeLessThan(3);
      expect(result.riskLevel).toBe('low');
    });
  });

  // --------------------------------------------------------------------------
  // Failure Cases
  // --------------------------------------------------------------------------

  describe('failure cases', () => {
    it('returns error for non-existent project', async () => {
      const args: AnalyzeBlastRadiusArgs = {
        projectId: 'non-existent-project',
        filePath: 'src/utils/helpers.ts',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });

    it('returns error for non-existent file', async () => {
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: 'src/utils/nonexistent.ts',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('File not found');
    });

    it('returns error for path outside sandbox', async () => {
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: '../../etc/passwd',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Access denied');
    });

    it('returns error for sandbox-escaped path', async () => {
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: 'src/../../../etc/shadow',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Access denied');
    });

    it('returns error for empty filePath', async () => {
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: '',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Circular Dependencies
  // --------------------------------------------------------------------------

  describe('circular dependencies', () => {
    it('handles circular imports without infinite loop', async () => {
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: 'src/circular/a.ts',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBeFalsy();

      const result: AnalyzeBlastRadiusResult = JSON.parse(response.content[0].text);
      // Should find b.ts as a dependent (b imports a)
      const foundFiles = result.dependents.map(d => d.file);
      expect(foundFiles).toContain('src/circular/b.ts');
    });
  });

  // --------------------------------------------------------------------------
  // Results Format
  // --------------------------------------------------------------------------

  describe('result format', () => {
    it('returns properly structured result with all required fields', async () => {
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: 'src/utils/helpers.ts',
        symbol: 'formatDate',
      };

      const response = await handleAnalyzeBlastRadius(args, loader);
      expect(response.isError).toBeFalsy();

      const result = JSON.parse(response.content[0].text);

      // Top-level structure
      expect(result).toHaveProperty('target');
      expect(result).toHaveProperty('symbol');
      expect(result).toHaveProperty('dependents');
      expect(result).toHaveProperty('importerCount');
      expect(result).toHaveProperty('riskLevel');

      // Each dependent entry
      for (const dep of result.dependents) {
        expect(dep).toHaveProperty('file');
        expect(dep).toHaveProperty('type');
        expect(dep).toHaveProperty('confidence');
        expect(['import', 'require', 'from', 'symbol']).toContain(dep.type);
        expect(typeof dep.confidence).toBe('number');
        expect(dep.confidence).toBeGreaterThan(0);
        expect(dep.confidence).toBeLessThanOrEqual(1);
      }

      // symbol should be present when provided
      expect(result.symbol).toBe('formatDate');
    });
  });

  // --------------------------------------------------------------------------
  // Excluded Directories
  // --------------------------------------------------------------------------

  describe('directory exclusion', () => {
    it('does not scan node_modules or dist', async () => {
      // node_modules and dist have files importing helpers, but they should be excluded
      const args: AnalyzeBlastRadiusArgs = {
        projectId: PROJECT_ID,
        filePath: 'src/utils/helpers.ts',
      };

      // Before adding more files, verify it's medium risk (5-6 importers)
      const response = await handleAnalyzeBlastRadius(args, loader);
      const result: AnalyzeBlastRadiusResult = JSON.parse(response.content[0].text);

      // node_modules/fake-dep.ts and dist/bundle.js should NOT be in results
      const foundFiles = result.dependents.map(d => d.file);
      expect(foundFiles).not.toContain('node_modules/fake-dep.ts');
      expect(foundFiles).not.toContain('dist/bundle.js');
    });
  });
});
