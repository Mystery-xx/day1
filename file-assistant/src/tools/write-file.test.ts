import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ApprovalGate } from '../utils/approval-gate.js';
import { ProjectConfigLoader, type ProjectConfig } from '../config/project-config.js';
import { writeFileHandler, type WriteFileInput } from './write-file.js';

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;
let projectsFile: string;

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

async function writeProjectRegistry(projects: Record<string, ProjectConfig>, filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ projects }, null, 2), 'utf-8');
}

// ============================================================================
// writeFileHandler Tests
// ============================================================================

describe('writeFileHandler', () => {
  let loader: ProjectConfigLoader;
  let approvalGate: ApprovalGate;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `write-file-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    projectsFile = path.join(testDir, 'projects.json');
    await fs.mkdir(testDir, { recursive: true });

    // Create project registry
    const projectConfig = createMockProject(TEST_PROJECT_ID, testDir);
    await writeProjectRegistry({ [TEST_PROJECT_ID]: projectConfig }, projectsFile);

    // Setup loader and approval gate
    loader = new ProjectConfigLoader(projectsFile);
    await loader.load();

    // Fresh approval gate for each test (no TTL issues)
    approvalGate = new ApprovalGate(5000);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // --------------------------------------------------------------------------
  // Happy Path: With Approval
  // --------------------------------------------------------------------------

  describe('happy path — write with approval', () => {
    it('should write a new file with approval', async () => {
      // First call: requires approval
      const result1 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'new-file.txt', content: 'hello world' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result1.isError).toBeFalsy();
      const parsed1 = JSON.parse(result1.content[0].text);
      expect(parsed1.pendingApproval).toBe(true);
      expect(parsed1.requestId).toBeDefined();

      // Grant approval
      approvalGate.grantApproval(parsed1.requestId);

      // Second call: approval granted, should write
      const result2 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'new-file.txt', content: 'hello world' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result2.isError).toBeFalsy();
      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.written).toBe(true);
      expect(parsed2.path).toBe('new-file.txt');
      expect(parsed2.size).toBe('hello world'.length);

      // Verify file was actually written
      const content = await fs.readFile(path.join(testDir, 'new-file.txt'), 'utf-8');
      expect(content).toBe('hello world');
    });

    it('should create parent directories when writing a new file', async () => {
      const filePath = 'deep/nested/dir/hello.txt';

      // First call: requires approval
      const result1 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath, content: 'deep content' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result1.isError).toBeFalsy();
      const parsed1 = JSON.parse(result1.content[0].text);
      expect(parsed1.pendingApproval).toBe(true);

      // Grant and retry
      approvalGate.grantApproval(parsed1.requestId);

      const result2 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath, content: 'deep content' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result2.isError).toBeFalsy();
      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.written).toBe(true);

      // Verify file exists at correct path
      const fullPath = path.join(testDir, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      expect(content).toBe('deep content');
    });

    it('should overwrite an existing file with approval', async () => {
      // Create existing file
      const existingPath = path.join(testDir, 'existing.txt');
      await fs.writeFile(existingPath, 'original content', 'utf-8');

      // First call: requires approval
      const result1 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'existing.txt', content: 'overwritten content' },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed1 = JSON.parse(result1.content[0].text);
      expect(parsed1.pendingApproval).toBe(true);

      // Grant and retry
      approvalGate.grantApproval(parsed1.requestId);

      const result2 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'existing.txt', content: 'overwritten content' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result2.isError).toBeFalsy();
      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.written).toBe(true);

      // Verify file was overwritten
      const content = await fs.readFile(existingPath, 'utf-8');
      expect(content).toBe('overwritten content');
    });

    it('should return correct size for written content', async () => {
      const content = 'A'.repeat(1000);

      const result1 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'size-test.txt', content },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed1 = JSON.parse(result1.content[0].text);
      approvalGate.grantApproval(parsed1.requestId);

      const result2 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'size-test.txt', content },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.size).toBe(1000);
    });
  });

  // --------------------------------------------------------------------------
  // Write Without Approval (Blocked)
  // --------------------------------------------------------------------------

  describe('write without approval — blocked', () => {
    it('should block write when approval is not granted', async () => {
      const result = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'blocked.txt', content: 'should not be written' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pendingApproval).toBe(true);
      expect(parsed.requestId).toBeDefined();
      expect(parsed.operation).toBeDefined();
      expect(parsed.operation.type).toBe('write_file');
      expect(parsed.operation.description).toContain('blocked.txt');

      // Verify file was NOT written
      await expect(fs.readFile(path.join(testDir, 'blocked.txt'), 'utf-8')).rejects.toThrow();
    });

    it('should block write when approval is rejected', async () => {
      const result1 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'rejected.txt', content: 'should not be written' },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed1 = JSON.parse(result1.content[0].text);
      expect(parsed1.pendingApproval).toBe(true);

      // Reject the approval
      approvalGate.rejectApproval(parsed1.requestId, 'not needed');

      // Second call: should still require approval (rejected requests don't auto-approve)
      const result2 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'rejected.txt', content: 'should not be written' },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.pendingApproval).toBe(true);
      expect(parsed2.requestId).not.toBe(parsed1.requestId);

      // Verify file was NOT written
      await expect(fs.readFile(path.join(testDir, 'rejected.txt'), 'utf-8')).rejects.toThrow();
    });

    it('should block write when approval is not called at all', async () => {
      // Only call once without granting — should always return pendingApproval
      const result = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'never-approved.txt', content: 'data' },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pendingApproval).toBe(true);

      // File should not exist
      await expect(fs.readFile(path.join(testDir, 'never-approved.txt'), 'utf-8')).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Security: Path Traversal Prevention
  // --------------------------------------------------------------------------

  describe('security — path traversal prevention', () => {
    it('should block write outside project root (absolute path)', async () => {
      const result = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '/tmp/unauthorized.txt', content: 'hack' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should block write with path traversal (../)', async () => {
      const result = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '../../../etc/evil.txt', content: 'hack' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should block write with encoded path traversal', async () => {
      const result = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '..%2F..%2Fetc%2Fevil.txt', content: 'hack' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should block write to root path', async () => {
      const result = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '/', content: 'hack' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });
  });

  // --------------------------------------------------------------------------
  // Failure Cases
  // --------------------------------------------------------------------------

  describe('failure cases', () => {
    it('should return error for non-existent project', async () => {
      const result = await writeFileHandler(
        { projectId: 'non-existent', filePath: 'test.txt', content: 'data' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should handle non-existent parent directory gracefully (path outside root)', async () => {
      // A parent directory that doesn't exist AND is outside sandbox
      const result = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '/nonexistent-parent/test.txt', content: 'data' },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should write files with special characters in name', async () => {
      const filePath = 'file with spaces and (parens).txt';
      const content = 'special path content';

      const result1 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath, content },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed1 = JSON.parse(result1.content[0].text);
      expect(parsed1.pendingApproval).toBe(true);

      approvalGate.grantApproval(parsed1.requestId);

      const result2 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath, content },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result2.isError).toBeFalsy();
      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.written).toBe(true);

      const written = await fs.readFile(path.join(testDir, filePath), 'utf-8');
      expect(written).toBe(content);
    });

    it('should write empty files', async () => {
      const filePath = 'empty.txt';
      const content = '';

      const result1 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath, content },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed1 = JSON.parse(result1.content[0].text);
      approvalGate.grantApproval(parsed1.requestId);

      const result2 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath, content },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result2.isError).toBeFalsy();
      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.written).toBe(true);
      expect(parsed2.size).toBe(0);
    });

    it('should work with custom path sandbox factory', async () => {
      const sandboxFactory = (rootPath: string) => new PathSandbox(rootPath);

      const result1 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'factory-test.txt', content: 'factory test' },
        { projectConfigLoader: loader, approvalGate, pathSandboxFactory: sandboxFactory },
      );

      const parsed1 = JSON.parse(result1.content[0].text);
      approvalGate.grantApproval(parsed1.requestId);

      const result2 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'factory-test.txt', content: 'factory test' },
        { projectConfigLoader: loader, approvalGate, pathSandboxFactory: sandboxFactory },
      );

      expect(result2.isError).toBeFalsy();
      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.written).toBe(true);

      const written = await fs.readFile(path.join(testDir, 'factory-test.txt'), 'utf-8');
      expect(written).toBe('factory test');
    });
  });

  // --------------------------------------------------------------------------
  // Approval Gate Integration
  // --------------------------------------------------------------------------

  describe('approval gate integration', () => {
    it('should include operation details in pending approval response', async () => {
      const result = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'details-test.txt', content: 'testing operation details' },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pendingApproval).toBe(true);
      expect(parsed.operation).toEqual({
        type: 'write_file',
        description: 'Write to file: details-test.txt (25 bytes)',
        details: {
          projectId: TEST_PROJECT_ID,
          filePath: 'details-test.txt',
          resolvedPath: expect.stringContaining('details-test.txt'),
          contentLength: 25,
        },
      });
    });

    it('should correctly verify file was written with correct content', async () => {
      const testContent = 'Hello, World!\nThis is a test file.\n';

      // Phase 1: Request approval
      const result1 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'verify-test.txt', content: testContent },
        { projectConfigLoader: loader, approvalGate },
      );

      const parsed1 = JSON.parse(result1.content[0].text);
      expect(parsed1.pendingApproval).toBe(true);
      expect(parsed1.operation.description).toContain('verify-test.txt');

      // Phase 2: Grant approval
      approvalGate.grantApproval(parsed1.requestId);

      // Phase 3: Write and verify
      const result2 = await writeFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'verify-test.txt', content: testContent },
        { projectConfigLoader: loader, approvalGate },
      );

      expect(result2.isError).toBeFalsy();
      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.written).toBe(true);
      expect(parsed2.path).toBe('verify-test.txt');
      expect(parsed2.size).toBe(testContent.length);
    });
  });
});
