import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { ProjectConfigLoader, type ProjectConfig } from '../config/project-config.js';
import {
  generateChangelogHandler,
  createGenerateChangelogTool,
  parseConventionalCommit,
  groupCommitsByType,
  generateChangelogMarkdown,
  GitSandbox,
  type ParsedCommit,
  type GenerateChangelogArgs,
} from './generate-changelog.js';

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;
let projectsFile: string;
let loader: ProjectConfigLoader;

const TEST_PROJECT_ID = 'test-changelog';

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

/**
 * Initialize a git repo in testDir with some test commits.
 * Returns the list of commit hashes created.
 */
function initGitRepo(
  repoDir: string,
  commits: string[],
): string[] {
  // Initialize git
  execSync('git init', { cwd: repoDir, stdio: 'pipe' });

  // Set author config for deterministic commits
  execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: repoDir, stdio: 'pipe' });

  const hashes: string[] = [];

  for (let i = 0; i < commits.length; i++) {
    const msg = commits[i];
    // Write a unique file so each commit has changes
    const fileName = `file-${i}.txt`;
    execSync(`echo "content ${i}" > "${fileName}"`, { cwd: repoDir, stdio: 'pipe' });
    execSync(`GIT_MASTER=1 git add "${fileName}"`, { cwd: repoDir, stdio: 'pipe' });
    execSync(`GIT_MASTER=1 git commit -m "${msg}"`, { cwd: repoDir, stdio: 'pipe' });

    // Get the hash
    const hash = execSync('GIT_MASTER=1 git rev-parse HEAD', {
      cwd: repoDir,
      encoding: 'utf-8',
    }).trim();
    hashes.push(hash);
  }

  return hashes;
}

function initGitRepoWithTag(repoDir: string, commitMsg: string, tag: string): string {
  execSync('git init', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: repoDir, stdio: 'pipe' });
  execSync(`echo "content" > file.txt`, { cwd: repoDir, stdio: 'pipe' });
  execSync(`GIT_MASTER=1 git add file.txt`, { cwd: repoDir, stdio: 'pipe' });
  execSync(`GIT_MASTER=1 git commit -m "${commitMsg}"`, { cwd: repoDir, stdio: 'pipe' });
  execSync(`GIT_MASTER=1 git tag "${tag}"`, { cwd: repoDir, stdio: 'pipe' });
  const hash = execSync('GIT_MASTER=1 git rev-parse HEAD', {
    cwd: repoDir,
    encoding: 'utf-8',
  }).trim();
  return hash;
}

// ============================================================================
// parseConventionalCommit Tests
// ============================================================================

describe('parseConventionalCommit', () => {
  it('should parse feat: commit', () => {
    const result = parseConventionalCommit(
      'feat: add login feature',
      'abc123',
      'Test User',
      '2024-01-01',
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('feat');
    expect(result!.scope).toBeNull();
    expect(result!.description).toBe('add login feature');
    expect(result!.breaking).toBe(false);
    expect(result!.hash).toBe('abc123');
  });

  it('should parse fix(scope): commit', () => {
    const result = parseConventionalCommit(
      'fix(auth): handle token expiry',
      'def456',
      'Test User',
      '2024-01-02',
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('fix');
    expect(result!.scope).toBe('auth');
    expect(result!.description).toBe('handle token expiry');
    expect(result!.breaking).toBe(false);
  });

  it('should parse breaking change with !', () => {
    const result = parseConventionalCommit(
      'feat!: redesign API',
      'ghi789',
      'Test User',
      '2024-01-03',
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('feat');
    expect(result!.breaking).toBe(true);
    expect(result!.description).toBe('redesign API');
  });

  it('should return null for non-conventional commits', () => {
    const result = parseConventionalCommit(
      'just an ordinary commit message without a type prefix',
      'abc123',
      'Test User',
      '2024-01-01',
    );
    expect(result).toBeNull();
  });

  it('should return null for empty messages', () => {
    const result = parseConventionalCommit('', 'abc123', 'Test User', '2024-01-01');
    expect(result).toBeNull();
  });

  it('should parse various conventional commit types', () => {
    const types = ['chore', 'docs', 'refactor', 'style', 'test', 'perf', 'ci', 'build', 'revert'];
    for (const t of types) {
      const result = parseConventionalCommit(
        `${t}: some ${t} change`,
        'hash',
        'Author',
        '2024-01-01',
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe(t);
    }
  });

  it('should handle scope with breaking change', () => {
    const result = parseConventionalCommit(
      'refactor(core)!: restructure module',
      'jkl012',
      'Test User',
      '2024-01-04',
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('refactor');
    expect(result!.scope).toBe('core');
    expect(result!.breaking).toBe(true);
    expect(result!.description).toBe('restructure module');
  });
});

// ============================================================================
// groupCommitsByType Tests
// ============================================================================

describe('groupCommitsByType', () => {
  it('should group commits by type section in order', () => {
    const commits: ParsedCommit[] = [
      {
        raw: 'feat: feature 1',
        type: 'feat',
        scope: null,
        description: 'feature 1',
        breaking: false,
        hash: 'a',
        author: 'T',
        date: '2024-01-01',
      },
      {
        raw: 'fix: fix 1',
        type: 'fix',
        scope: null,
        description: 'fix 1',
        breaking: false,
        hash: 'b',
        author: 'T',
        date: '2024-01-01',
      },
      {
        raw: 'chore: chore 1',
        type: 'chore',
        scope: null,
        description: 'chore 1',
        breaking: false,
        hash: 'c',
        author: 'T',
        date: '2024-01-01',
      },
    ];

    const groups = groupCommitsByType(commits);
    expect(groups).toHaveLength(3);
    expect(groups[0].section).toBe('Features');
    expect(groups[1].section).toBe('Bug Fixes');
    expect(groups[2].section).toBe('Chores');
  });

  it('should handle unknown types under Other', () => {
    const commits: ParsedCommit[] = [
      {
        raw: 'custom: unknown type',
        type: 'custom',
        scope: null,
        description: 'unknown type',
        breaking: false,
        hash: 'a',
        author: 'T',
        date: '2024-01-01',
      },
    ];

    const groups = groupCommitsByType(commits);
    expect(groups).toHaveLength(1);
    expect(groups[0].section).toBe('Other');
  });

  it('should return empty array for empty input', () => {
    const groups = groupCommitsByType([]);
    expect(groups).toHaveLength(0);
  });
});

// ============================================================================
// generateChangelogMarkdown Tests
// ============================================================================

describe('generateChangelogMarkdown', () => {
  it('should generate markdown with version header', () => {
    const commits: ParsedCommit[] = [
      {
        raw: 'feat: add login',
        type: 'feat',
        scope: null,
        description: 'add login',
        breaking: false,
        hash: 'abc123',
        author: 'T',
        date: '2024-01-01',
      },
    ];

    const md = generateChangelogMarkdown(commits, 'v1.0.0');
    expect(md).toContain('## [v1.0.0]');
    expect(md).toContain('### Features');
    expect(md).toContain('- add login (abc123');
    expect(md).toContain('Generated:');
  });

  it('should include scope in formatted output', () => {
    const commits: ParsedCommit[] = [
      {
        raw: 'fix(auth): handle token expiry',
        type: 'fix',
        scope: 'auth',
        description: 'handle token expiry',
        breaking: false,
        hash: 'def456',
        author: 'T',
        date: '2024-01-01',
      },
    ];

    const md = generateChangelogMarkdown(commits, 'v1.0.1');
    expect(md).toContain('**auth:** handle token expiry');
  });

  it('should indicate breaking changes', () => {
    const commits: ParsedCommit[] = [
      {
        raw: 'feat!: redesign API',
        type: 'feat',
        scope: null,
        description: 'redesign API',
        breaking: true,
        hash: 'ghi789',
        author: 'T',
        date: '2024-01-01',
      },
    ];

    const md = generateChangelogMarkdown(commits, 'v2.0.0');
    expect(md).toContain('💥');
    expect(md).toContain('redesign API');
  });

  it('should handle empty commit list', () => {
    const md = generateChangelogMarkdown([], 'v0.0.1');
    expect(md).toContain('_No changes in this version._');
  });
});

// ============================================================================
// GitSandbox Tests
// ============================================================================

describe('GitSandbox', () => {
  it('should normalize repo root path', () => {
    const sandbox = new GitSandbox('/tmp/../tmp/test');
    expect(sandbox.root).toBe('/tmp/test');
  });

  it('should create a simple-git instance', () => {
    const sandbox = new GitSandbox('/tmp');
    const git = sandbox.getGitInstance();
    expect(git).toBeDefined();
  });
});

// ============================================================================
// generateChangelogHandler Integration Tests
// ============================================================================

describe('generateChangelogHandler', () => {
  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `generate-changelog-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    await fs.mkdir(testDir, { recursive: true });

    projectsFile = path.join(testDir, 'projects.json');

    // Setup project registry
    const projectConfig = createMockProject(TEST_PROJECT_ID, testDir);
    await writeProjectRegistry({ [TEST_PROJECT_ID]: projectConfig }, projectsFile);

    loader = new ProjectConfigLoader(projectsFile);
    await loader.load();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // --------------------------------------------------------------------------
  // Happy Path — Git repo with conventional commits
  // --------------------------------------------------------------------------

  describe('happy path', () => {
    it('should return changelog for conventional commits in a git repo', async () => {
      // Create a git repo with conventional commits
      initGitRepo(testDir, [
        'feat: add login feature',
        'fix: fix session timeout',
        'chore: update dependencies',
        'feat: add dashboard',
        'docs: update README',
        'fix(auth): handle token expiry',
      ]);

      const result = await generateChangelogHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const md = result.content[0].text;
      expect(md).toContain('# Changelog');
      expect(md).toContain('### Features');
      expect(md).toContain('- add login feature');
      expect(md).toContain('- add dashboard');
      expect(md).toContain('### Bug Fixes');
      expect(md).toContain('- fix session timeout');
      expect(md).toContain('**auth:** handle token expiry');
      expect(md).toContain('### Chores');
      expect(md).toContain('- update dependencies');
      expect(md).toContain('### Documentation');
      expect(md).toContain('- update README');
    });

    it('should group commits by type with proper section ordering', async () => {
      initGitRepo(testDir, [
        'chore: bump version',
        'feat: new feature',
        'fix: bugfix',
        'test: add tests',
        'perf: optimize query',
      ]);

      const result = await generateChangelogHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const md = result.content[0].text;

      // Check order: Features, Bug Fixes, Performance, ..., Tests, Chores
      const featuresIdx = md.indexOf('### Features');
      const bugfixesIdx = md.indexOf('### Bug Fixes');
      const perfIdx = md.indexOf('### Performance');
      const testsIdx = md.indexOf('### Tests');
      const choresIdx = md.indexOf('### Chores');

      expect(featuresIdx).toBeLessThan(bugfixesIdx);
      expect(bugfixesIdx).toBeLessThan(perfIdx);
      expect(perfIdx).toBeLessThan(testsIdx);
      expect(testsIdx).toBeLessThan(choresIdx);
    });

    it('should handle non-conventional commits under "Other" section', async () => {
      initGitRepo(testDir, [
        'feat: add feature',
        'not a conventional commit at all - just text',
        'WIP working on stuff without colon',
      ]);

      const result = await generateChangelogHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const md = result.content[0].text;
      expect(md).toContain('### Features');
      expect(md).toContain('### Other');
      expect(md).toContain('not a conventional commit at all - just text');
      expect(md).toContain('WIP working on stuff without colon');
    });

    it('should accept custom gitSandboxFactory', async () => {
      initGitRepo(testDir, [
        'feat: feature 1',
        'fix: fix 1',
      ]);

      const sandboxFactory = (rootPath: string) => new GitSandbox(rootPath);

      const result = await generateChangelogHandler(
        { projectId: TEST_PROJECT_ID },
        {
          projectConfigLoader: loader,
          gitSandboxFactory: sandboxFactory,
        },
      );

      expect(result.isError).toBeFalsy();
      const md = result.content[0].text;
      expect(md).toContain('feature 1');
      expect(md).toContain('fix 1');
    });
  });

  // --------------------------------------------------------------------------
  // Failure Cases
  // --------------------------------------------------------------------------

  describe('failure cases', () => {
    it('should return error for non-existent project', async () => {
      const result = await generateChangelogHandler(
        { projectId: 'non-existent' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should return error for non-git directory', async () => {
      // testDir is NOT a git repo — initGitRepo not called
      const result = await generateChangelogHandler(
        { projectId: TEST_PROJECT_ID },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not a git repository');
    });
  });

  // --------------------------------------------------------------------------
  // Tag-based Queries
  // --------------------------------------------------------------------------

  describe('tag-based queries', () => {
    it('should generate changelog for a tag range', async () => {
      // Create initial commits
      initGitRepo(testDir, [
        'feat: initial commit',
        'fix: first fix',
      ]);

      // Tag v1.0.0
      execSync('GIT_MASTER=1 git tag v1.0.0', { cwd: testDir, stdio: 'pipe' });

      // More commits
      execSync('echo "more" > more.txt', { cwd: testDir, stdio: 'pipe' });
      execSync('GIT_MASTER=1 git add more.txt', { cwd: testDir, stdio: 'pipe' });
      execSync('GIT_MASTER=1 git commit -m "feat: second feature"', { cwd: testDir, stdio: 'pipe' });
      execSync('echo "bug" > bug.txt', { cwd: testDir, stdio: 'pipe' });
      execSync('GIT_MASTER=1 git add bug.txt', { cwd: testDir, stdio: 'pipe' });
      execSync('GIT_MASTER=1 git commit -m "fix: second fix"', { cwd: testDir, stdio: 'pipe' });

      // Tag v2.0.0
      execSync('GIT_MASTER=1 git tag v2.0.0', { cwd: testDir, stdio: 'pipe' });

      // Generate changelog for v1.0.0..v2.0.0 range
      const result = await generateChangelogHandler(
        { projectId: TEST_PROJECT_ID, fromTag: 'v1.0.0', toTag: 'v2.0.0' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const md = result.content[0].text;
      expect(md).toContain('[v2.0.0]');
      expect(md).toContain('second feature');
      expect(md).toContain('second fix');
      // Should NOT contain the initial commits
      expect(md).not.toContain('initial commit');
      expect(md).not.toContain('first fix');
    });
  });

  // --------------------------------------------------------------------------
  // createGenerateChangelogTool Factory
  // --------------------------------------------------------------------------

  describe('createGenerateChangelogTool', () => {
    it('should return a valid tool definition', () => {
      const tool = createGenerateChangelogTool(loader);
      expect(tool).toHaveProperty('name', 'generateChangelog');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('schema');
      expect(tool).toHaveProperty('handler');
      expect(typeof tool.handler).toBe('function');
    });

    it('should have projectId in schema', () => {
      const tool = createGenerateChangelogTool(loader);
      expect(tool.schema.projectId).toBeDefined();
    });
  });
});
