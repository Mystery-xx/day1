import { describe, it, expect, beforeAll } from 'vitest';
import { gitStatus, gitDiff, gitLog, gitBranch } from './git.js';

const TEST_PROJECT_ID = 'test-day1';

describe('Git Tools', () => {
  // Verify we're in a git repo before running tests
  beforeAll(async () => {
    // Quick sanity check - gitBranch should work if we're in a repo
    const branchInfo = await gitBranch({ projectId: TEST_PROJECT_ID });
    expect(branchInfo.current).toBeDefined();
    expect(Array.isArray(branchInfo.branches)).toBe(true);
  });

  describe('gitStatus', () => {
    it('should return status with staged, unstaged, and untracked arrays', async () => {
      const status = await gitStatus({ projectId: TEST_PROJECT_ID });

      expect(status).toHaveProperty('staged');
      expect(status).toHaveProperty('unstaged');
      expect(status).toHaveProperty('untracked');

      expect(Array.isArray(status.staged)).toBe(true);
      expect(Array.isArray(status.unstaged)).toBe(true);
      expect(Array.isArray(status.untracked)).toBe(true);
    });

    it('should return sorted arrays', async () => {
      const status = await gitStatus({ projectId: TEST_PROJECT_ID });

      // Check if arrays are sorted
      expect(status.staged).toEqual([...status.staged].sort());
      expect(status.unstaged).toEqual([...status.unstaged].sort());
      expect(status.untracked).toEqual([...status.untracked].sort());
    });
  });

  describe('gitDiff', () => {
    it('should return diff output as string', async () => {
      const diff = await gitDiff({ projectId: TEST_PROJECT_ID });

      expect(typeof diff).toBe('string');
      // Should either show changes or indicate no changes
      expect(diff.length).toBeGreaterThan(0);
    });

    it('should handle staged option', async () => {
      const diff = await gitDiff({ projectId: TEST_PROJECT_ID, staged: false });
      expect(typeof diff).toBe('string');
    });

    it('should handle file option for valid file', async () => {
      // Test with a file that exists in the repo
      const diff = await gitDiff({ projectId: TEST_PROJECT_ID, file: 'mcp-assistant/src/tools/git.ts' });
      expect(typeof diff).toBe('string');
    });

    it('should reject path traversal attempts', async () => {
      await expect(gitDiff({ projectId: TEST_PROJECT_ID, file: '../../../etc/passwd' })).rejects.toThrow('Access denied');
    });

    it('should reject paths outside repo sandbox', async () => {
      await expect(gitDiff({ projectId: TEST_PROJECT_ID, file: '/etc/passwd' })).rejects.toThrow('Access denied');
    });
  });

  describe('gitLog', () => {
    it('should return array of commits with required fields', async () => {
      const commits = await gitLog({ projectId: TEST_PROJECT_ID });

      expect(Array.isArray(commits)).toBe(true);
      expect(commits.length).toBeGreaterThan(0);

      const firstCommit = commits[0];
      expect(firstCommit).toHaveProperty('hash');
      expect(firstCommit).toHaveProperty('author');
      expect(firstCommit).toHaveProperty('date');
      expect(firstCommit).toHaveProperty('message');
    });

    it('should respect limit parameter', async () => {
      const commits5 = await gitLog({ projectId: TEST_PROJECT_ID, limit: 5 });
      const commits10 = await gitLog({ projectId: TEST_PROJECT_ID, limit: 10 });

      expect(commits5.length).toBeLessThanOrEqual(5);
      expect(commits10.length).toBeLessThanOrEqual(10);
      expect(commits5.length).toBeLessThanOrEqual(commits10.length);
    });

    it('should enforce limit bounds (1-20)', async () => {
      // Test minimum bound
      const commits1 = await gitLog({ projectId: TEST_PROJECT_ID, limit: 1 });
      expect(commits1.length).toBeLessThanOrEqual(1);

      // Test maximum bound - should not exceed 20
      const commits20 = await gitLog({ projectId: TEST_PROJECT_ID, limit: 20 });
      expect(commits20.length).toBeLessThanOrEqual(20);
    });

    it('should handle file parameter', async () => {
      const commits = await gitLog({ projectId: TEST_PROJECT_ID, file: 'mcp-assistant/src/tools/git.ts', limit: 5 });
      expect(Array.isArray(commits)).toBe(true);
      // File-specific log may be empty if file is new
    });

    it('should reject path traversal attempts', async () => {
      await expect(gitLog({ projectId: TEST_PROJECT_ID, file: '../../../etc/passwd' })).rejects.toThrow('Access denied');
    });
  });

  describe('gitBranch', () => {
    it('should return current branch and all branches', async () => {
      const branchInfo = await gitBranch({ projectId: TEST_PROJECT_ID });

      expect(branchInfo).toHaveProperty('current');
      expect(branchInfo).toHaveProperty('branches');

      expect(typeof branchInfo.current).toBe('string');
      expect(branchInfo.current.length).toBeGreaterThan(0);
      expect(Array.isArray(branchInfo.branches)).toBe(true);
      expect(branchInfo.branches.length).toBeGreaterThan(0);
    });

    it('should return sorted branches array', async () => {
      const branchInfo = await gitBranch({ projectId: TEST_PROJECT_ID });
      expect(branchInfo.branches).toEqual([...branchInfo.branches].sort());
    });

    it('should include current branch in branches list', async () => {
      const branchInfo = await gitBranch({ projectId: TEST_PROJECT_ID });
      expect(branchInfo.branches).toContain(branchInfo.current);
    });
  });

  describe('Security - Path Sandboxing', () => {
    it('should reject absolute paths outside repo', async () => {
      await expect(gitDiff({ projectId: TEST_PROJECT_ID, file: '/home/other/repo/file.txt' })).rejects.toThrow('Access denied');
    });

    it('should reject relative path traversal', async () => {
      await expect(gitDiff({ projectId: TEST_PROJECT_ID, file: '../../other-repo/file.txt' })).rejects.toThrow('Access denied');
    });

    it('should reject path traversal with encoded characters', async () => {
      await expect(gitDiff({ projectId: TEST_PROJECT_ID, file: '..%2F..%2Fetc%2Fpasswd' })).rejects.toThrow('Access denied');
    });
  });
});
