import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { ProjectConfigLoader } from '../config/project-config.js';
import {
  handleValidateRules,
  type ValidateRulesInput,
  type ValidateRulesResult,
  type Violation,
} from './validate-rules.js';

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;
let projectsFile: string;
let loader: ProjectConfigLoader;

const PROJECT_ID = 'test-project';

async function setupProject(): Promise<void> {
  testDir = path.join(
    tmpdir(),
    `validate-rules-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(testDir, { recursive: true });

  const srcDir = path.join(testDir, 'src');
  await fs.mkdir(srcDir, { recursive: true });

  // File with copyright header (clean)
  await fs.writeFile(
    path.join(srcDir, 'app.ts'),
    `// @license MIT\n// Copyright 2024 Test Corp\n\nimport { promises as fs } from 'fs';\nimport * as path from 'path';\nimport { z } from 'zod';\nimport { MyLocalModule } from './local-module';\n\nexport function greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n`,
    'utf-8',
  );

  // File with no copyright (violation)
  await fs.writeFile(
    path.join(srcDir, 'no-copyright.ts'),
    `import { z } from 'zod';\n\nexport const x = 1;\n`,
    'utf-8',
  );

  // File with console.log (violation)
  await fs.writeFile(
    path.join(srcDir, 'logger.ts'),
    `import { z } from 'zod';\n\nexport function debug() {\n  console.log('debug message');\n  return true;\n}\n`,
    'utf-8',
  );

  // Test file with console.log (should NOT be flagged)
  await fs.writeFile(
    path.join(srcDir, 'utils.test.ts'),
    `import { describe, it, expect } from 'vitest';\n\ndescribe('test', () => {\n  it('works', () => {\n    console.log('test debug');\n    expect(1).toBe(1);\n  });\n});\n`,
    'utf-8',
  );

  // File with long lines (violation)
  await fs.writeFile(
    path.join(srcDir, 'long-lines.ts'),
    `// Short line\nconst shortLine = 'hello';\nconst longLine = 'this is a very long line that exceeds the maximum allowed line length of one hundred and twenty characters by quite a bit';\n`,
    'utf-8',
  );

  // File with import order violation (npm before stdlib without blank line)
  await fs.writeFile(
    path.join(srcDir, 'bad-imports.ts'),
    `import { z } from 'zod';\nimport { promises as fs } from 'fs';\n\nexport const y = 2;\n`,
    'utf-8',
  );

  // File with clean import order
  await fs.writeFile(
    path.join(srcDir, 'clean-imports.ts'),
    `import { promises as fs } from 'fs';\nimport { z } from 'zod';\nimport { Something } from './something';\n\nexport const zz = 3;\n`,
    'utf-8',
  );

  // File with console.warn (should be flagged)
  await fs.writeFile(
    path.join(srcDir, 'warn-helper.ts'),
    `export function doSomething(value: number): void {\n  if (value < 0) {\n    console.warn('negative value detected');\n  }\n}\n`,
    'utf-8',
  );

  // File with console.error (should be flagged)
  await fs.writeFile(
    path.join(srcDir, 'error-handler.ts'),
    `export function handleError(err: Error): void {\n  console.error('Failed:', err.message);\n}\n`,
    'utf-8',
  );

  // Spec test file with console.log (should NOT be flagged)
  await fs.writeFile(
    path.join(srcDir, 'utils.spec.ts'),
    `import { describe, it } from 'vitest';\n\ndescribe('util', () => {\n  it('runs', () => {\n    console.log('running');\n  });\n});\n`,
    'utf-8',
  );

  // File with copyright in different format
  await fs.writeFile(
    path.join(srcDir, 'copyright-alternate.ts'),
    `/**\n * LICENSE: MIT\n *\n * Some utility functions\n */\nimport { z } from 'zod';\n`,
    'utf-8',
  );

  // File with mixed import groups separated by blank line (should be OK)
  await fs.writeFile(
    path.join(srcDir, 'grouped-imports.ts'),
    `import { promises as fs } from 'fs';\nimport * as path from 'path';\n\nimport { z } from 'zod';\nimport { v4 } from 'uuid';\n\nimport { LocalUtil } from './local-util';\n\nexport function helper(): void {}\n`,
    'utf-8',
  );

  // File with local import before npm import (violation — but no blank line between)
  await fs.writeFile(
    path.join(srcDir, 'wrong-order-local.ts'),
    `import { LocalHelper } from './local-helper';\nimport { z } from 'zod';\n\nexport const val = 42;\n`,
    'utf-8',
  );

  projectsFile = path.join(testDir, 'projects.json');
  loader = new ProjectConfigLoader(projectsFile);
  await fs.writeFile(
    projectsFile,
    JSON.stringify({
      projects: {
        [PROJECT_ID]: {
          id: PROJECT_ID,
          name: 'Test Project',
          rootPath: testDir,
          createdAt: new Date().toISOString(),
          lastIndexed: null,
        },
      },
    }),
    'utf-8',
  );
}

async function teardownProject(): Promise<void> {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {}
}

// ============================================================================
// Tests
// ============================================================================

describe('validateRules MCP Tool', () => {
  beforeEach(async () => {
    await setupProject();
  });

  afterEach(async () => {
    await teardownProject();
  });

  // ==========================================================================
  // Happy path
  // ==========================================================================

  describe('happy path — project with violations detected', () => {
    it('returns structured result with violations and passed=false', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      expect(response.isError).toBeFalsy();
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('totalFiles');
      expect(result.summary).toHaveProperty('violationsByRule');
      // We have violations in the test project
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Copyright header checks
  // ==========================================================================

  describe('copyright header checks', () => {
    it('detects files missing copyright header', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const copyrightViolations = result.violations.filter(v => v.rule === 'missing-copyright-header');
      expect(copyrightViolations.length).toBeGreaterThan(0);
      const noCopyright = copyrightViolations.find(v => v.file.includes('no-copyright.ts'));
      expect(noCopyright).toBeDefined();
      expect(noCopyright!.line).toBe(1);
    });

    it('flags the correct rule name for copyright violations', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const copyrightViolations = result.violations.filter(v => v.rule === 'missing-copyright-header');
      for (const v of copyrightViolations) {
        expect(v.rule).toBe('missing-copyright-header');
        expect(v.message).toContain('copyright');
      }
    });

    it('files with @license in first 5 lines pass copyright check', async () => {
      // app.ts has @license MIT as first line
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const copyrightViolations = result.violations.filter(v => v.rule === 'missing-copyright-header');
      const appViolation = copyrightViolations.find(v => v.file.includes('app.ts'));
      expect(appViolation).toBeUndefined();
    });

    it('files with LICENSE comment pass copyright check', async () => {
      // copyright-alternate.ts has LICENSE: MIT comment
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const copyrightViolations = result.violations.filter(v => v.rule === 'missing-copyright-header');
      const altViolation = copyrightViolations.find(v => v.file.includes('copyright-alternate.ts'));
      expect(altViolation).toBeUndefined();
    });
  });

  // ==========================================================================
  // console.log checks
  // ==========================================================================

  describe('no console.log checks', () => {
    it('detects console.log() in source files', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const consoleViolations = result.violations.filter(v => v.rule === 'no-console-log');
      const loggerViolation = consoleViolations.find(v => v.file.includes('logger.ts'));
      expect(loggerViolation).toBeDefined();
      expect(loggerViolation!.line).toBe(4);
      expect(loggerViolation!.message).toContain('console.log');
    });

    it('does not flag console.log in test files (*.test.ts)', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const consoleViolations = result.violations.filter(v => v.rule === 'no-console-log');
      const testViolation = consoleViolations.find(v => v.file.includes('utils.test.ts'));
      expect(testViolation).toBeUndefined();
    });

    it('does not flag console.log in spec files (*.spec.ts)', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const consoleViolations = result.violations.filter(v => v.rule === 'no-console-log');
      const specViolation = consoleViolations.find(v => v.file.includes('utils.spec.ts'));
      expect(specViolation).toBeUndefined();
    });

    it('detects console.warn() in source files', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const consoleViolations = result.violations.filter(v => v.rule === 'no-console-log');
      const warnViolation = consoleViolations.find(v => v.file.includes('warn-helper.ts'));
      expect(warnViolation).toBeDefined();
      expect(warnViolation!.message).toContain('console.warn');
    });

    it('detects console.error() in source files', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const consoleViolations = result.violations.filter(v => v.rule === 'no-console-log');
      const errorViolation = consoleViolations.find(v => v.file.includes('error-handler.ts'));
      expect(errorViolation).toBeDefined();
      expect(errorViolation!.message).toContain('console.error');
    });
  });

  // ==========================================================================
  // Import order checks
  // ==========================================================================

  describe('import order checks', () => {
    it('detects npm import before stdlib import (wrong order)', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const orderViolations = result.violations.filter(v => v.rule === 'import-order');
      const badImports = orderViolations.find(v => v.file.includes('bad-imports.ts'));
      expect(badImports).toBeDefined();
      expect(badImports!.line).toBe(2); // fs import on line 2 follows zod on line 1
    });

    it('does not flag clean import order (stdlib → npm → local)', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const orderViolations = result.violations.filter(v => v.rule === 'import-order');
      const cleanViolation = orderViolations.find(v => v.file.includes('clean-imports.ts'));
      expect(cleanViolation).toBeUndefined();
    });

    it('allows grouped imports separated by blank lines', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const orderViolations = result.violations.filter(v => v.rule === 'import-order');
      const groupedViolation = orderViolations.find(v => v.file.includes('grouped-imports.ts'));
      expect(groupedViolation).toBeUndefined();
    });

    it('detects local import before npm import (wrong order)', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const orderViolations = result.violations.filter(v => v.rule === 'import-order');
      const wrongLocal = orderViolations.find(v => v.file.includes('wrong-order-local.ts'));
      expect(wrongLocal).toBeDefined();
    });
  });

  // ==========================================================================
  // Max line length checks
  // ==========================================================================

  describe('max line length checks', () => {
    it('detects lines exceeding 120 characters', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const lengthViolations = result.violations.filter(v => v.rule === 'max-line-length');
      const longLineViolation = lengthViolations.find(v => v.file.includes('long-lines.ts'));
      expect(longLineViolation).toBeDefined();
      expect(longLineViolation!.line).toBe(3); // The long line is on line 3
    });

    it('does not flag short lines', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const lengthViolations = result.violations.filter(v => v.rule === 'max-line-length');
      const shortLineViolation = lengthViolations.find(v => v.file.includes('app.ts'));
      // app.ts lines are all short
      expect(shortLineViolation).toBeUndefined();
    });
  });

  // ==========================================================================
  // Violation format
  // ==========================================================================

  describe('violation format', () => {
    it('each violation has file, rule, line, and message fields', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      expect(result.violations.length).toBeGreaterThan(0);
      for (const v of result.violations) {
        expect(v).toHaveProperty('file');
        expect(v).toHaveProperty('rule');
        expect(v).toHaveProperty('line');
        expect(v).toHaveProperty('message');
        expect(typeof v.file).toBe('string');
        expect(typeof v.rule).toBe('string');
        expect(typeof v.line).toBe('number');
        expect(typeof v.message).toBe('string');
      }
    });
  });

  // ==========================================================================
  // Summary
  // ==========================================================================

  describe('summary structure', () => {
    it('violationsByRule groups violations correctly', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      expect(result.summary.violationsByRule).toBeDefined();
      // Ensure total violations count matches grouped count
      const totalFromGrouped = Object.values(result.summary.violationsByRule).reduce((sum, count) => sum + count, 0);
      expect(totalFromGrouped).toBe(result.violations.length);
    });
  });

  // ==========================================================================
  // Failure cases
  // ==========================================================================

  describe('failure cases', () => {
    it('returns error for non-existent project', async () => {
      const args: ValidateRulesInput = { projectId: 'non-existent-project' };
      const response = await handleValidateRules(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });

    it('returns error for path outside sandbox', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID, path: '../../etc/passwd' };
      const response = await handleValidateRules(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Access denied');
    });

    it('returns error for sandbox-escaped path', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID, path: 'src/../../../etc/shadow' };
      const response = await handleValidateRules(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Access denied');
    });

    it('returns error for non-existent sub-path', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID, path: 'nonexistent' };
      const response = await handleValidateRules(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });
  });

  // ==========================================================================
  // Multiple violations
  // ==========================================================================

  describe('multiple violations across rules', () => {
    it('reports violations from different rules together', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      // We expect violations from at least 2 different rules
      const uniqueRules = new Set(result.violations.map(v => v.rule));
      expect(uniqueRules.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // No auto-fix behavior
  // ==========================================================================

  describe('no auto-fix behavior', () => {
    it('reports violations but does not modify files', async () => {
      const args: ValidateRulesInput = { projectId: PROJECT_ID };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      // Verify the violating file still exists with its content
      const loggerContent = await fs.readFile(
        path.join(testDir, 'src', 'logger.ts'),
        'utf-8',
      );
      expect(loggerContent).toContain("console.log('debug message')");
    });
  });

  // ==========================================================================
  // Scoped check
  // ==========================================================================

  describe('scoped check with sub-path', () => {
    it('scopes the rule check to a sub-path', async () => {
      // Create a file with console.log outside the scoped area
      await fs.mkdir(path.join(testDir, 'lib'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, 'lib', 'helper.ts'),
        `export function log() { console.log('test'); }\n`,
        'utf-8',
      );
      // Scope to src/ only — should NOT find lib/helper.ts console.log
      const args: ValidateRulesInput = { projectId: PROJECT_ID, path: 'src' };
      const response = await handleValidateRules(args, loader);
      const result: ValidateRulesResult = JSON.parse(response.content[0].text);
      const consoleViolations = result.violations.filter(v => v.rule === 'no-console-log');
      const libViolation = consoleViolations.find(v => v.file.includes('lib'));
      expect(libViolation).toBeUndefined();
    });
  });
});
