import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { PathSandbox, PathValidationResult } from '../utils/path-sandbox.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_ROOT = process.cwd(); // file-assistant directory

// Helper to create temp dir for symlink tests
let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'path-sandbox-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ============================================================================
// PathSandbox Tests
// ============================================================================

describe('PathSandbox', () => {
  describe('basic path validation', () => {
    it('should validate path within sandbox', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('src');
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBeDefined();
      expect(result.resolvedPath?.startsWith(TEST_ROOT)).toBe(true);
    });

    it('should validate absolute path within sandbox', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath(path.join(TEST_ROOT, 'src'));
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBeDefined();
    });

    it('should validate nested path', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('src/utils/path-sandbox.ts');
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toContain('path-sandbox.ts');
    });
  });

  describe('path traversal prevention', () => {
    it('should reject path traversal attempts (../)', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('../../../etc');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should reject double traversal (../../)', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should reject deep traversal', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('../../../usr/bin');
      expect(result.valid).toBe(false);
    });

    it('should reject absolute paths outside sandbox', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('/etc/passwd');
      expect(result.valid).toBe(false);
    });

    it('should reject paths to system directories', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('/bin/sh');
      expect(result.valid).toBe(false);
    });

    it('should reject paths to root', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('/');
      expect(result.valid).toBe(false);
    });
  });

  describe('symlink resolution', () => {
    it('should resolve symlinks within sandbox', async () => {
      // Create a symlink inside test dir pointing to another file inside
      const targetDir = await fs.mkdtemp(path.join(tempDir, 'target-'));
      const linkDir = path.join(tempDir, 'link-to-target');
      await fs.symlink(targetDir, linkDir);

      const sandbox = new PathSandbox(tempDir);
      const result = await sandbox.validatePath('link-to-target');
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(targetDir); // resolved to real path
    });

    it('should reject symlink to outside sandbox', async () => {
      // Create a symlink inside sandbox pointing outside
      const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
      const linkInside = path.join(tempDir, 'escape-link');
      await fs.symlink(outsideDir, linkInside);

      const sandbox = new PathSandbox(tempDir);
      const result = await sandbox.validatePath('escape-link');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should reject symlink chain escaping sandbox', async () => {
      // Create chain: link1 -> link2 -> outside
      const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
      const intermediateLink = path.join(tempDir, 'mid-link');
      await fs.symlink(outsideDir, intermediateLink);
      const entryLink = path.join(tempDir, 'entry-link');
      await fs.symlink(intermediateLink, entryLink);

      const sandbox = new PathSandbox(tempDir);
      const result = await sandbox.validatePath('entry-link');
      expect(result.valid).toBe(false);
    });

    it('should resolve symlink to non-existent target (parent check)', async () => {
      // Symlink that exists but points nowhere - parent is sandbox still valid
      const validDir = path.join(tempDir, 'real-dir');
      await fs.mkdir(validDir, { recursive: true });
      const symlinkPath = path.join(validDir, 'nonexistent-link');
      await fs.symlink('./nowhere', symlinkPath);

      const sandbox = new PathSandbox(tempDir);
      // Path exists but parent above: real-dir/ should still exist
      const result = await sandbox.validatePath('real-dir/nonexistent-link');
      // The link doesn't target a real file; parent exists within sandbox
      // This should still work (file creation scenario)
      expect(result.valid).toBe(true);
    });
  });

  describe('non-existent paths (file creation)', () => {
    it('should allow valid non-existent path within sandbox', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('src/new-file.test.ts');
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(path.resolve(TEST_ROOT, 'src/new-file.test.ts'));
    });

    it('should reject non-existent path in non-existent parent directory', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('src/utils/new-folder/new-file.ts');
      // Parent directory 'new-folder' doesn't exist, so this is rejected
      expect(result.valid).toBe(false);
    });

    it('should reject non-existent path with traversal', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('../nonexistent-dir/file.txt');
      expect(result.valid).toBe(false);
    });

    it('should handle path with dots and special chars', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('src/my-file.test-v2.ts');
      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('');
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(TEST_ROOT);
    });

    it('should handle dot path', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath('.');
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBe(TEST_ROOT);
    });

    it('should reject overly long null-byte injection', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const result = await sandbox.validatePath(`${'\0'.repeat(10)}../../../etc`);
      expect(result.valid).toBe(false);
    });

    it('should reject absolute paths outside sandbox even if name matches', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      // "/src" resolves to filesystem root /src, not TEST_ROOT/src
      const result = await sandbox.validatePath('/src');
      expect(result.valid).toBe(false);
    });

    it('should provide root accessor', () => {
      const sandbox = new PathSandbox('/some/path');
      expect(sandbox.root).toBe(path.resolve('/some/path'));
    });
  });

  describe('resolvePath convenience method', () => {
    it('should return resolved path on success', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      const resolved = await sandbox.resolvePath('src');
      expect(resolved).toBeTruthy();
      expect(resolved.startsWith(TEST_ROOT)).toBe(true);
    });

    it('should throw on invalid path', async () => {
      const sandbox = new PathSandbox(TEST_ROOT);
      await expect(sandbox.resolvePath('/etc')).rejects.toThrow('Access denied');
    });
  });
});
