import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { PathSandbox, projectStructure, findFiles } from './structure.js';
import { projectRegistry } from '../config/project-registry.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_ROOT = '/mnt/f/git/day1';
const TEST_PROJECT_ID = 'test-day1';
const testSandbox = new PathSandbox(TEST_ROOT);



// ============================================================================
// PathSandbox Tests
// ============================================================================

describe('PathSandbox', () => {

  it('should validate path within sandbox', async () => {
    const result = await testSandbox.validatePath('src');
    expect(result.valid).toBe(true);
    expect(result.resolvedPath).toBeDefined();
    expect(result.resolvedPath?.startsWith(TEST_ROOT)).toBe(true);
  });

  it('should reject path traversal attempts', async () => {
    const result = await testSandbox.validatePath('../../../etc');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Access denied');
  });

  it('should reject paths outside sandbox', async () => {
    const result = await testSandbox.validatePath('/etc/passwd');
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// projectStructure Tests
// ============================================================================

describe('projectStructure', () => {

  it('should return directory tree structure', async () => {
    const result = await projectStructure({ projectId: TEST_PROJECT_ID, depth: 2 });

    expect(result.tree).toBeDefined();
    expect(Array.isArray(result.directories)).toBe(true);
    expect(Array.isArray(result.files)).toBe(true);

    // Check tree format - should have day1/ as root
    expect(result.tree).toContain('day1/');
    expect(result.tree).toContain('ai-chat-backend/');
    expect(result.tree).toContain('ai-chat-frontend/');
    expect(result.tree).toContain('mcp-assistant/');

    // Check exclusions (node_modules, .git, .env should be excluded)
    expect(result.tree).not.toContain('node_modules/');
    expect(result.tree).not.toContain('.git/');
  });

  it('should respect depth limit', async () => {
    const shallowResult = await projectStructure({ projectId: TEST_PROJECT_ID, depth: 1 });
    const deepResult = await projectStructure({ projectId: TEST_PROJECT_ID, depth: 3 });

    // Shallow should have fewer entries
    expect(shallowResult.tree.split('\n').length).toBeLessThanOrEqual(
      deepResult.tree.split('\n').length
    );
  });

  it('should reject invalid depth values', async () => {
    await expect(projectStructure({ projectId: TEST_PROJECT_ID, depth: 0 })).rejects.toThrow(
      /Depth must be between/
    );

    await expect(projectStructure({ projectId: TEST_PROJECT_ID, depth: 10 })).rejects.toThrow(
      /Depth must be between/
    );
  });

  it('should exclude sensitive directories by default', async () => {
    const result = await projectStructure({ projectId: TEST_PROJECT_ID, depth: 3 });

    expect(result.directories).not.toContain('node_modules');
    expect(result.directories).not.toContain('.git');
    expect(result.files).not.toContain('.env');
  });

  it('should support custom exclude patterns', async () => {
    const result = await projectStructure(
      { projectId: TEST_PROJECT_ID, depth: 3, exclude: ['tests'] }
    );

    expect(result.tree).not.toContain('tests/');
  });
});

// ============================================================================
// findFiles Tests
// ============================================================================

describe('findFiles', () => {

  it('should find files matching pattern', async () => {
    const result = await findFiles({ projectId: TEST_PROJECT_ID, pattern: '**/*.ts' });

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.endsWith('.ts'))).toBe(true);
  });

  it('should respect maxResults limit', async () => {
    const result = await findFiles({ projectId: TEST_PROJECT_ID, pattern: '**/*', maxResults: 2 });

    expect(result.count).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('should reject empty pattern', async () => {
    await expect(findFiles({ projectId: TEST_PROJECT_ID, pattern: '' })).rejects.toThrow(
      /Pattern must be a non-empty string/
    );
  });

  it('should exclude sensitive directories', async () => {
    const result = await findFiles({ projectId: TEST_PROJECT_ID, pattern: '**/*' });

    // Should not include files from node_modules or .git
    expect(result.files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(result.files.some((f) => f.includes('.git'))).toBe(false);
  });

  it('should handle path traversal attempts', async () => {
    await expect(
      findFiles({ projectId: TEST_PROJECT_ID, pattern: '**/*.ts', path: '../../../etc' })
    ).rejects.toThrow(/Access denied/);
  });
});
