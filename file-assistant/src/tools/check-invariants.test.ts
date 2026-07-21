import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { ProjectConfigLoader } from '../config/project-config.js';
import {
  handleCheckInvariants,
  type CheckInvariantsInput,
  type CheckInvariantsResult,
  type Violation,
} from './check-invariants.js';

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
    `check-invariants-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(testDir, { recursive: true });

  const srcDir = path.join(testDir, 'src');
  const componentsDir = path.join(srcDir, 'components');
  const servicesDir = path.join(srcDir, 'services');
  const controllersDir = path.join(srcDir, 'controllers');
  const testsDir = path.join(srcDir, 'tests');
  const utilsDir = path.join(srcDir, 'utils');

  await fs.mkdir(componentsDir, { recursive: true });
  await fs.mkdir(servicesDir, { recursive: true });
  await fs.mkdir(controllersDir, { recursive: true });
  await fs.mkdir(testsDir, { recursive: true });
  await fs.mkdir(utilsDir, { recursive: true });

  await fs.writeFile(
    path.join(srcDir, 'index.ts'),
    `export { App } from './components/App';\nexport { UserService } from './services/user.service';\n`,
    'utf-8',
  );
  await fs.writeFile(
    path.join(componentsDir, 'App.tsx'),
    `export function App() { return <div>Hello</div>; }\n`,
    'utf-8',
  );
  await fs.writeFile(
    path.join(servicesDir, 'user.service.ts'),
    `export class UserService {}\n`,
    'utf-8',
  );
  await fs.writeFile(
    path.join(controllersDir, 'user.controller.ts'),
    `export class UserController {}\n`,
    'utf-8',
  );
  await fs.writeFile(
    path.join(testsDir, 'user.test.ts'),
    `import { describe, it, expect } from 'vitest';\ndescribe('User', () => { it('works', () => { expect(1).toBe(1); }); });\n`,
    'utf-8',
  );
  await fs.writeFile(
    path.join(utilsDir, 'helpers.ts'),
    `export function formatDate(d: Date) { return d.toISOString(); }\n`,
    'utf-8',
  );
  await fs.writeFile(
    path.join(testDir, 'README.md'),
    `# Test Project\n`,
    'utf-8',
  );

  projectsFile = path.join(testDir, 'projects.json');
  loader = new ProjectConfigLoader(projectsFile);
  await fs.writeFile(
    projectsFile,
    JSON.stringify({ projects: { [PROJECT_ID]: { id: PROJECT_ID, name: 'Test Project', rootPath: testDir, createdAt: new Date().toISOString(), lastIndexed: null } } }),
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

describe('checkInvariants MCP Tool', () => {
  beforeEach(async () => {
    await setupProject();
  });

  afterEach(async () => {
    await teardownProject();
  });

  describe('happy path — clean project passes all invariants', () => {
    it('returns passed=true with no violations for a well-structured project', async () => {
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      expect(response.isError).toBeFalsy();
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      if (result.violations.length > 0) {
        console.log('DEBUG violations:', JSON.stringify(result.violations, null, 2));
        console.log('DEBUG summary:', JSON.stringify(result.summary, null, 2));
      }
      expect(result.passed).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('returns properly structured result with summary', async () => {
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      expect(response.isError).toBeFalsy();
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('totalFiles');
      expect(result.summary).toHaveProperty('totalDirs');
      expect(result.summary).toHaveProperty('violationsByRule');
    });
  });

  describe('file naming convention checks', () => {
    it('detects service file in wrong directory', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'bad-location.service.ts'), `export class BadService {}\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.file.includes('bad-location.service.ts'))).toBe(true);
    });

    it('detects test file in wrong directory', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'components', 'button.test.ts'), `import { describe, it, expect } from 'vitest';\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.file.includes('button.test.ts'))).toBe(true);
    });

    it('detects controller file in wrong directory', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'utils', 'api.controller.ts'), `export class ApiController {}\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.file.includes('api.controller.ts'))).toBe(true);
    });
  });

  describe('directory structure checks', () => {
    it('detects missing index.ts in src/', async () => {
      await fs.unlink(path.join(testDir, 'src', 'index.ts'));
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.rule === 'structure-missing-index')).toBe(true);
    });

    it('detects missing components/ directory', async () => {
      await fs.rm(path.join(testDir, 'src', 'components'), { recursive: true });
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.rule === 'structure-missing-components')).toBe(true);
    });

    it('detects empty directories', async () => {
      await fs.mkdir(path.join(testDir, 'src', 'empty-dir'), { recursive: true });
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.rule === 'structure-empty-directory')).toBe(true);
    });
  });

  describe('required exports checks', () => {
    it('detects index.ts with no exports', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'index.ts'), `import { App } from './components/App';\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.rule === 'exports-missing')).toBe(true);
    });

    it('accepts index.ts with export default', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'index.ts'), `import App from './components/App';\nexport default App;\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      if (result.violations.length > 0) {
        console.log('DEBUG export-default violations:', JSON.stringify(result.violations, null, 2));
      }
      expect(result.passed).toBe(true);
    });
  });

  describe('file extension checks', () => {
    it('detects temporary .log files in source directories', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'server.log'), `error\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.rule === 'extension-temp-file')).toBe(true);
    });

    it('detects .tmp files in source directories', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'scratch.tmp'), `tmp\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.rule === 'extension-temp-file')).toBe(true);
    });

    it('detects unusual file extensions in source tree', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'data.csv'), `a,b\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.rule === 'extension-unusual')).toBe(true);
    });
  });

  describe('scoped check with sub-path', () => {
    it('scopes the invariant check to a sub-path', async () => {
      // Add a violation outside the scoped path
      await fs.writeFile(path.join(testDir, 'src', 'components', 'server.log'), `log data\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID, path: 'src/services' };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.violations.some(v => v.file.includes('server.log'))).toBe(false);
    });
  });

  describe('failure cases', () => {
    it('returns error for non-existent project', async () => {
      const args: CheckInvariantsInput = { projectId: 'non-existent-project' };
      const response = await handleCheckInvariants(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });

    it('returns error for path outside sandbox', async () => {
      const args: CheckInvariantsInput = { projectId: PROJECT_ID, path: '../../etc/passwd' };
      const response = await handleCheckInvariants(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Access denied');
    });

    it('returns error for sandbox-escaped path', async () => {
      const args: CheckInvariantsInput = { projectId: PROJECT_ID, path: 'src/../../../etc/shadow' };
      const response = await handleCheckInvariants(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Access denied');
    });

    it('returns error for non-existent sub-path', async () => {
      const args: CheckInvariantsInput = { projectId: PROJECT_ID, path: 'nonexistent' };
      const response = await handleCheckInvariants(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });
  });

  describe('multiple violations', () => {
    it('reports all violations together (does not stop at first)', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'bad.service.ts'), `export class BadService {}\n`, 'utf-8');
      await fs.writeFile(path.join(testDir, 'src', 'debug.log'), `debug info\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(result.summary.violationsByRule).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('violation format', () => {
    it('each violation has file, rule, and message fields', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'debug.log'), `debug\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      for (const v of result.violations) {
        expect(v).toHaveProperty('file');
        expect(v).toHaveProperty('rule');
        expect(v).toHaveProperty('message');
        expect(typeof v.file).toBe('string');
        expect(typeof v.rule).toBe('string');
        expect(typeof v.message).toBe('string');
      }
    });
  });

  describe('no auto-fix behavior', () => {
    it('reports violations but does not modify files', async () => {
      await fs.writeFile(path.join(testDir, 'src', 'data.csv'), `a,b\n1,2\n`, 'utf-8');
      const args: CheckInvariantsInput = { projectId: PROJECT_ID };
      const response = await handleCheckInvariants(args, loader);
      const result: CheckInvariantsResult = JSON.parse(response.content[0].text);
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      const stillExists = await fs.stat(path.join(testDir, 'src', 'data.csv')).then(() => true).catch(() => false);
      expect(stillExists).toBe(true);
    });
  });
});
