import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { ProjectConfigLoader } from '../config/project-config.js';
import {
  handleDiffFiles,
  computeDiffStats,
  truncateDiff,
  type DiffFilesArgs,
  type DiffFilesResult,
  type DiffStats,
} from '../tools/diff-files.js';

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
    `diff-files-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(testDir, { recursive: true });

  // Create project files for diff testing
  await fs.writeFile(
    path.join(testDir, 'file-a.txt'),
    'line 1\nline 2\nline 3\n',
    'utf-8',
  );

  await fs.writeFile(
    path.join(testDir, 'file-b.txt'),
    'line 1\nline 2 modified\nline 3\nline 4\n',
    'utf-8',
  );

  await fs.writeFile(
    path.join(testDir, 'identical-a.txt'),
    'same content\nsecond line\n',
    'utf-8',
  );

  await fs.writeFile(
    path.join(testDir, 'identical-b.txt'),
    'same content\nsecond line\n',
    'utf-8',
  );

  // Initialize git repo for revision-based tests
  try {
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.email test@test.com', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.name Test', { cwd: testDir, stdio: 'pipe' });
    execSync('git add .', { cwd: testDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: testDir, stdio: 'pipe' });

    // Modify file-a and commit again for revision diff
    await fs.writeFile(
      path.join(testDir, 'file-a.txt'),
      'line 1\nline 2\nline 3 modified\nline 4\n',
      'utf-8',
    );
    execSync('git add .', { cwd: testDir, stdio: 'pipe' });
    execSync('git commit -m "modify file-a"', { cwd: testDir, stdio: 'pipe' });
  } catch {
    // git may not be available in all test environments; skip revision tests
  }

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

describe('diffFiles MCP Tool', () => {
  beforeEach(async () => {
    await setupProject();
  });

  afterEach(async () => {
    await teardownProject();
  });

  // --------------------------------------------------------------------------
  // computeDiffStats
  // --------------------------------------------------------------------------

  describe('computeDiffStats', () => {
    it('counts added, deleted, and unchanged lines', () => {
      const diff = [
        '--- a/file-a.txt',
        '+++ b/file-b.txt',
        '@@ -1,3 +1,4 @@',
        ' line 1',
        '-line 2',
        '+line 2 modified',
        ' line 3',
        '+line 4',
      ].join('\n');

      const stats = computeDiffStats(diff);
      expect(stats.added).toBe(2);    // +line 2 modified, +line 4
      expect(stats.deleted).toBe(1);   // -line 2
      expect(stats.unchanged).toBe(2); // line 1, line 3
    });

    it('returns zeros for empty diff', () => {
      const stats = computeDiffStats('');
      expect(stats.added).toBe(0);
      expect(stats.deleted).toBe(0);
      expect(stats.unchanged).toBe(0);
    });

    it('only counts content lines, not headers', () => {
      const diff = [
        '--- a/x',
        '+++ b/x',
        '@@ -1 +1 @@',
        '-old',
        '+new',
      ].join('\n');

      const stats = computeDiffStats(diff);
      expect(stats.added).toBe(1);
      expect(stats.deleted).toBe(1);
      expect(stats.unchanged).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // truncateDiff
  // --------------------------------------------------------------------------

  describe('truncateDiff', () => {
    it('does not truncate when within limit', () => {
      const diff = 'line 1\nline 2\nline 3\n';
      const result = truncateDiff(diff, 10);
      expect(result.truncated).toBe(false);
      expect(result.diff).toBe(diff);
    });

    it('truncates when exceeding limit', () => {
      const lines: string[] = [];
      for (let i = 0; i < 15; i++) {
        lines.push(`line ${i + 1}`);
      }
      const diff = lines.join('\n');

      const result = truncateDiff(diff, 10);
      expect(result.truncated).toBe(true);
      expect(result.diff).toContain('Diff truncated');
      expect(result.diff.split('\n').length).toBeLessThanOrEqual(12); // 10 + warning lines
    });
  });

  // --------------------------------------------------------------------------
  // Happy Path: Two different files
  // --------------------------------------------------------------------------

  describe('happy path - two different files', () => {
    it('generates unified diff between two files', async () => {
      const args: DiffFilesArgs = {
        projectId: PROJECT_ID,
        filePath1: 'file-a.txt',
        filePath2: 'file-b.txt',
      };

      const response = await handleDiffFiles(args, loader);
      expect(response.isError).toBeFalsy();

      const result: DiffFilesResult = JSON.parse(response.content[0].text);
      expect(result.diff).toBeTruthy();
      expect(result.diff).toContain('file-a.txt');
      expect(result.diff).toContain('file-b.txt');
      expect(result.stats.added).toBeGreaterThan(0);
      expect(result.stats.deleted).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    });

    it('returns stats with correct counts', async () => {
      const args: DiffFilesArgs = {
        projectId: PROJECT_ID,
        filePath1: 'file-a.txt',
        filePath2: 'file-b.txt',
      };

      const response = await handleDiffFiles(args, loader);
      const result: DiffFilesResult = JSON.parse(response.content[0].text);

      // Note: file-a.txt was modified by git revision setup in beforeEach
      // file-a.txt: line 1, line 2, line 3 modified, line 4
      // file-b.txt: line 1, line 2 modified, line 3, line 4
      // Diff: -line 2, -line 3 modified, +line 2 modified, +line 3, unchanged: line 1, line 4
      expect(result.stats.deleted).toBe(2);
      expect(result.stats.added).toBe(2);
      expect(result.stats.unchanged).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Happy Path: Identical files
  // --------------------------------------------------------------------------

  describe('identical files', () => {
    it('returns empty diff with no changes', async () => {
      const args: DiffFilesArgs = {
        projectId: PROJECT_ID,
        filePath1: 'identical-a.txt',
        filePath2: 'identical-b.txt',
      };

      const response = await handleDiffFiles(args, loader);
      expect(response.isError).toBeFalsy();

      const result: DiffFilesResult = JSON.parse(response.content[0].text);
      // Identical files produce a diff with header lines but no +/- content changes
      expect(result.stats.added).toBe(0);
      expect(result.stats.deleted).toBe(0);
      expect(result.truncated).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Failure Cases
  // --------------------------------------------------------------------------

  describe('failure cases', () => {
    it('returns error for non-existent project', async () => {
      const args: DiffFilesArgs = {
        projectId: 'non-existent-project',
        filePath1: 'file-a.txt',
        filePath2: 'file-b.txt',
      };

      const response = await handleDiffFiles(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });

    it('returns error for non-existent file', async () => {
      const args: DiffFilesArgs = {
        projectId: PROJECT_ID,
        filePath1: 'nonexistent.txt',
        filePath2: 'file-b.txt',
      };

      const response = await handleDiffFiles(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to read');
    });

    it('returns error for path outside sandbox', async () => {
      const args: DiffFilesArgs = {
        projectId: PROJECT_ID,
        filePath1: '../../etc/passwd',
        filePath2: 'file-a.txt',
      };

      const response = await handleDiffFiles(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Access denied');
    });

    it('returns error when both files are missing', async () => {
      const args: DiffFilesArgs = {
        projectId: PROJECT_ID,
        filePath1: 'no-such-file-1.txt',
        filePath2: 'no-such-file-2.txt',
      };

      const response = await handleDiffFiles(args, loader);
      expect(response.isError).toBe(true);
    });

    it('returns error when filePath1 is missing', async () => {
      const args: DiffFilesArgs = {
        projectId: PROJECT_ID,
      };

      const response = await handleDiffFiles(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('filePath1 is required');
    });
  });

  // --------------------------------------------------------------------------
  // Revision-based diff (same file, different revisions)
  // --------------------------------------------------------------------------

  describe('revision-based diff', () => {
    it('diffs same file across two git revisions', async () => {
      // Skip if git wasn't available during setup
      const gitDir = path.join(testDir, '.git');
      let hasGit = false;
      try {
        await fs.access(gitDir);
        hasGit = true;
      } catch {
        // no git
      }

      if (!hasGit) {
        return; // skip
      }

      const args: DiffFilesArgs = {
        projectId: PROJECT_ID,
        filePath1: 'file-a.txt',
        revision1: 'HEAD~1',
        revision2: 'HEAD',
      };

      const response = await handleDiffFiles(args, loader);
      expect(response.isError).toBeFalsy();

      const result: DiffFilesResult = JSON.parse(response.content[0].text);
      expect(result.diff).toBeTruthy();
      expect(result.diff).toContain('file-a.txt');
      expect(result.stats.added).toBeGreaterThanOrEqual(0);
      expect(result.stats.deleted).toBeGreaterThanOrEqual(0);
    });

    it('returns error for non-existent revision', async () => {
      const gitDir = path.join(testDir, '.git');
      let hasGit = false;
      try {
        await fs.access(gitDir);
        hasGit = true;
      } catch {
        // no git
      }

      if (!hasGit) {
        return; // skip
      }

      const args: DiffFilesArgs = {
        projectId: PROJECT_ID,
        filePath1: 'file-a.txt',
        revision1: 'NONEXISTENT_REF_12345',
        revision2: 'HEAD',
      };

      const response = await handleDiffFiles(args, loader);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Failed to read');
    });
  });
});
