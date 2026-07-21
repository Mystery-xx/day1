import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { editFile, editFileInputSchema } from './edit-file.js';
import { ProjectConfigLoader } from '../config/project-config.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_PROJECT_ID = 'test-edit-file-project';
let tmpDir: string;
let testFilePath: string;
let testConfigLoader: ProjectConfigLoader;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-file-test-'));

  // Create a project config file in the temp dir so editFile can load() it
  const projectsFile = path.join(tmpDir, 'projects.json');
  await fs.writeFile(
    projectsFile,
    JSON.stringify({
      projects: {
        [TEST_PROJECT_ID]: {
          id: TEST_PROJECT_ID,
          name: 'test-edit-file-project',
          rootPath: tmpDir,
          createdAt: new Date().toISOString(),
          lastIndexed: null,
        },
      },
    }),
    'utf-8'
  );

  testConfigLoader = new ProjectConfigLoader(projectsFile);

  testFilePath = 'test.txt';
  await fs.writeFile(
    path.join(tmpDir, testFilePath),
    'Hello, World!\nThis is a test file.\nGoodbye!\n',
    'utf-8'
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// Zod Schema Validation
// ============================================================================

describe('editFileInputSchema', () => {
  it('should accept valid string-replacement input', () => {
    const result = editFileInputSchema.parse({
      projectId: 'test',
      filePath: 'foo.txt',
      oldString: 'old',
      newString: 'new',
    });
    expect(result.projectId).toBe('test');
    expect(result.oldString).toBe('old');
    expect(result.newString).toBe('new');
  });

  it('should accept valid patch input', () => {
    const result = editFileInputSchema.parse({
      projectId: 'test',
      filePath: 'foo.txt',
      patch: '--- a/foo.txt\n+++ b/foo.txt\n@@ -1 +1 @@\n-old\n+new\n',
    });
    expect(result.patch).toBeDefined();
    expect(result.oldString).toBeUndefined();
  });

  it('should accept input with only projectId and filePath (runtime validation catches missing edit)', () => {
    // Schema accepts it (all fields optional at parse level),
    // runtime detectEditMode will reject it
    const result = editFileInputSchema.parse({
      projectId: 'test',
      filePath: 'foo.txt',
    });
    expect(result.projectId).toBe('test');
    expect(result.oldString).toBeUndefined();
    expect(result.patch).toBeUndefined();
  });
});

// ============================================================================
// editFile — String Replacement
// ============================================================================

describe('editFile (string replacement)', () => {
  it('should replace a string and return success with diff', async () => {
    const result = await editFile({
      projectId: TEST_PROJECT_ID,
      filePath: testFilePath,
      oldString: 'Hello, World!',
      newString: 'Hi there!',
    }, testConfigLoader);

    expect(result.success).toBe(true);
    expect(result.diff).toContain('@@');
    expect(result.diff).toContain('-Hello, World!');
    expect(result.diff).toContain('+Hi there!');
    expect(result.oldSize).toBeGreaterThan(0);
    expect(result.newSize).toBeGreaterThan(0);

    const content = await fs.readFile(path.join(tmpDir, testFilePath), 'utf-8');
    expect(content).toContain('Hi there!');
    expect(content).not.toContain('Hello, World!');
  });

  it('should reflect content changes in sizes', async () => {
    const result = await editFile({
      projectId: TEST_PROJECT_ID,
      filePath: testFilePath,
      oldString: 'Hello, World!',
      newString: 'Hi!',
    }, testConfigLoader);

    expect(result.oldSize).toBeGreaterThan(0);
    expect(result.newSize).toBeGreaterThan(0);
    expect(result.newSize).toBeLessThan(result.oldSize);
  });

  it('should generate diff with @@ headers referencing the file path', async () => {
    const result = await editFile({
      projectId: TEST_PROJECT_ID,
      filePath: testFilePath,
      oldString: 'Hello, World!',
      newString: 'Hi there!',
    }, testConfigLoader);

    expect(result.diff).toMatch(/^@@\s/m);
    expect(result.diff).toContain(`a/${testFilePath}`);
    expect(result.diff).toContain(`b/${testFilePath}`);
    expect(result.diff).toContain('-Hello, World!');
    expect(result.diff).toContain('+Hi there!');
  });

  it('should replace all occurrences of oldString', async () => {
    await fs.writeFile(path.join(tmpDir, 'multi.txt'), 'foo foo foo\n', 'utf-8');

    const result = await editFile({
      projectId: TEST_PROJECT_ID,
      filePath: 'multi.txt',
      oldString: 'foo',
      newString: 'bar',
    }, testConfigLoader);

    const content = await fs.readFile(path.join(tmpDir, 'multi.txt'), 'utf-8');
    expect(content).toBe('bar bar bar\n');
    expect(result.diff).toContain('-foo foo foo');
    expect(result.diff).toContain('+bar bar bar');
  });
});

// ============================================================================
// editFile — Patch Strategy
// ============================================================================

describe('editFile (patch strategy)', () => {
  it('should apply a valid unified diff patch', async () => {
    const patch = [
      `--- a/${testFilePath}`,
      `+++ b/${testFilePath}`,
      '@@ -1,3 +1,3 @@',
      '-Hello, World!',
      '+Hi there!',
      ' This is a test file.',
      ' Goodbye!',
      '',
    ].join('\n');

    const result = await editFile({
      projectId: TEST_PROJECT_ID,
      filePath: testFilePath,
      patch,
    }, testConfigLoader);

    expect(result.success).toBe(true);
    expect(result.diff).toContain('@@');

    const content = await fs.readFile(path.join(tmpDir, testFilePath), 'utf-8');
    expect(content).toContain('Hi there!');
  });

  it('should fail on malformed patch', async () => {
    await expect(
      editFile({
        projectId: TEST_PROJECT_ID,
        filePath: testFilePath,
        patch: 'this is not a valid patch',
      }, testConfigLoader)
    ).rejects.toThrow(/patch/i);
  });
});

// ============================================================================
// editFile — Failure Cases
// ============================================================================

describe('editFile — failure cases', () => {
  it('should fail when project does not exist', async () => {
    await expect(
      editFile({
        projectId: 'nonexistent-project',
        filePath: testFilePath,
        oldString: 'Hello',
        newString: 'Hi',
      }, testConfigLoader)
    ).rejects.toThrow(/not found in registry/);
  });

  it('should fail when file does not exist', async () => {
    await expect(
      editFile({
        projectId: TEST_PROJECT_ID,
        filePath: 'nonexistent.txt',
        oldString: 'Hello',
        newString: 'Hi',
      }, testConfigLoader)
    ).rejects.toThrow(/File not found/);
  });

  it('should fail with path traversal attempt', async () => {
    await expect(
      editFile({
        projectId: TEST_PROJECT_ID,
        filePath: '../../../etc/passwd',
        oldString: 'root',
        newString: 'user',
      }, testConfigLoader)
    ).rejects.toThrow(/Access denied/);
  });

  it('should fail when oldString is not found in file', async () => {
    await expect(
      editFile({
        projectId: TEST_PROJECT_ID,
        filePath: testFilePath,
        oldString: 'This string does not exist in the file at all',
        newString: 'replacement',
      }, testConfigLoader)
    ).rejects.toThrow(/oldString not found/);
  });
});

// ============================================================================
// editFile — Verification
// ============================================================================

describe('editFile — verification', () => {
  it('should produce a diff with @@ headers', async () => {
    const result = await editFile({
      projectId: TEST_PROJECT_ID,
      filePath: testFilePath,
      oldString: 'Goodbye!',
      newString: 'See you!',
    }, testConfigLoader);

    expect(result.diff).toContain(`a/${testFilePath}`);
    expect(result.diff).toContain(`b/${testFilePath}`);
    expect(result.diff).toMatch(/@@[^@]+@@/);
  });

  it('should handle files with no trailing newline', async () => {
    const noNewlinePath = 'nonl.txt';
    await fs.writeFile(path.join(tmpDir, noNewlinePath), 'No newline at end', 'utf-8');

    const result = await editFile({
      projectId: TEST_PROJECT_ID,
      filePath: noNewlinePath,
      oldString: 'No newline',
      newString: 'Has newline',
    }, testConfigLoader);

    expect(result.success).toBe(true);
    const content = await fs.readFile(path.join(tmpDir, noNewlinePath), 'utf-8');
    expect(content).toContain('Has newline at end');
  });
});
