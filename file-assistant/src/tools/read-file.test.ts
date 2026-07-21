import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ProjectConfigLoader, type ProjectConfig } from '../config/project-config.js';
import { readFileHandler, detectEncoding, type ReadFileInput } from './read-file.js';

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;
let projectsFile: string;
let testFilePath: string;
let binaryFilePath: string;
let largeFilePath: string;

const TEST_PROJECT_ID = 'test-project';
const TEST_FILE_CONTENT = 'Hello, World!\nThis is a test file.\n';

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

async function createTestFiles(): Promise<void> {
  // Create a test text file
  testFilePath = path.join(testDir, 'hello.txt');
  await fs.writeFile(testFilePath, TEST_FILE_CONTENT, 'utf-8');

  // Create a binary file (with null bytes)
  binaryFilePath = path.join(testDir, 'binary.bin');
  const binaryContent = Buffer.alloc(100);
  // Fill with some text
  for (let i = 0; i < 80; i++) {
    binaryContent[i] = 0x41 + (i % 26); // 'A'-'Z' pattern
  }
  // Add null bytes
  binaryContent[85] = 0x00;
  binaryContent[90] = 0x00;
  await fs.writeFile(binaryFilePath, binaryContent);

  // Create a large file (>10MB for warning test)
  largeFilePath = path.join(testDir, 'large.bin');
  // Create ~11MB file with binary content
  const largeContent = Buffer.alloc(11 * 1024 * 1024);
  largeContent.fill(0x41); // Fill base with 'A'
  for (let i = 0; i < largeContent.length; i += 50) {
    largeContent.writeUInt8(0x00, i); // null bytes every 50 positions → binary
  }
  await fs.writeFile(largeFilePath, largeContent);
}

// ============================================================================
// detectEncoding Tests
// ============================================================================

describe('detectEncoding', () => {
  it('should detect UTF-8 text correctly', () => {
    const buf = Buffer.from('Hello, World! This is UTF-8 text with some Unicode: こんにちは', 'utf-8');
    expect(detectEncoding(buf)).toBe('utf-8');
  });

  it('should detect binary with null bytes', () => {
    const buf = Buffer.alloc(100);
    buf.write('Hello', 0, 'utf-8');
    buf[50] = 0x00; // null byte
    expect(detectEncoding(buf)).toBe('binary');
  });

  it('should detect binary with many non-text bytes', () => {
    const buf = Buffer.alloc(100);
    // Fill with control characters (0x01-0x08)
    for (let i = 0; i < 30; i++) {
      buf[i] = 0x01 + (i % 8);
    }
    expect(detectEncoding(buf)).toBe('binary');
  });

  it('should detect UTF-8 with multi-byte sequences', () => {
    const buf = Buffer.from('🚀🌍🎉 日本語 English', 'utf-8');
    expect(detectEncoding(buf)).toBe('utf-8');
  });

  it('should handle empty buffer as UTF-8', () => {
    const buf = Buffer.alloc(0);
    expect(detectEncoding(buf)).toBe('utf-8');
  });

  it('should handle buffer with only whitespace and ASCII', () => {
    const buf = Buffer.from('  \n\t  hello  \n  ', 'utf-8');
    expect(detectEncoding(buf)).toBe('utf-8');
  });

  it('should detect binary in a mixed but mostly binary buffer', () => {
    const buf = Buffer.alloc(100);
    // 90 bytes of non-text (control chars + high bytes outside UTF-8 patterns)
    for (let i = 0; i < 90; i++) {
      buf[i] = 0x01;
    }
    // 10 bytes of text at the beginning
    buf.write('Hello', 90, 'utf-8');
    expect(detectEncoding(buf)).toBe('binary');
  });
});

// ============================================================================
// readFileHandler Tests
// ============================================================================

describe('readFileHandler', () => {
  let loader: ProjectConfigLoader;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `read-file-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    projectsFile = path.join(testDir, 'projects.json');
    await fs.mkdir(testDir, { recursive: true });

    // Create project registry
    const projectConfig = createMockProject(TEST_PROJECT_ID, testDir);
    await writeProjectRegistry({ [TEST_PROJECT_ID]: projectConfig }, projectsFile);

    // Create test files
    await createTestFiles();

    // Setup loader
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
  // Happy Path
  // --------------------------------------------------------------------------

  describe('happy path', () => {
    it('should read a text file and return content, size, lastModified, encoding', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'hello.txt' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.content).toBe(TEST_FILE_CONTENT);
      expect(parsed.size).toBe(TEST_FILE_CONTENT.length);
      expect(parsed.lastModified).toBeDefined();
      expect(typeof parsed.lastModified).toBe('string');
      expect(parsed.encoding).toBe('utf-8');
    });

    it('should read a file with an absolute path within sandbox', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: testFilePath },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content).toBe(TEST_FILE_CONTENT);
      expect(parsed.encoding).toBe('utf-8');
    });

    it('should detect binary files', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'binary.bin' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.encoding).toBe('binary');
      expect(typeof parsed.content).toBe('string');
      expect(parsed.content.length).toBeGreaterThan(0);
      // Binary content should be base64 encoded
      expect(() => Buffer.from(parsed.content, 'base64')).not.toThrow();
    });

    it('should include file size and lastModified in result', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'hello.txt' },
        { projectConfigLoader: loader },
      );

      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.size).toBeGreaterThan(0);
      expect(parsed.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO date
    });

    it('should return a warning for files >10MB', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'large.bin' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.warning).toBeDefined();
      expect(parsed.warning).toContain('Warning');
      expect(parsed.warning).toContain('MB');
      expect(parsed.size).toBeGreaterThan(10 * 1024 * 1024);
      expect(parsed.encoding).toBe('binary');
    });
  });

  // --------------------------------------------------------------------------
  // Failure Cases
  // --------------------------------------------------------------------------

  describe('failure cases', () => {
    it('should return error for non-existent project', async () => {
      const result = await readFileHandler(
        { projectId: 'non-existent', filePath: 'hello.txt' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should return error for non-existent file', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'nonexistent.txt' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('File not found');
    });

    it('should return error for a directory path', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '.' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not a file');
    });
  });

  // --------------------------------------------------------------------------
  // Security: Path Traversal Prevention
  // --------------------------------------------------------------------------

  describe('security — path traversal prevention', () => {
    it('should block path traversal (../)', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '../../../etc/passwd' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should block absolute paths outside sandbox', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '/etc/passwd' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should block paths to root', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '/' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should block path traversal via encoded characters', async () => {
      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: '..%2F..%2Fetc%2Fpasswd' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle files with special characters in name', async () => {
      const specialFile = path.join(testDir, 'file with spaces and (parens).txt');
      await fs.writeFile(specialFile, 'special content', 'utf-8');

      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'file with spaces and (parens).txt' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content).toBe('special content');
    });

    it('should handle empty files', async () => {
      const emptyFile = path.join(testDir, 'empty.txt');
      await fs.writeFile(emptyFile, '', 'utf-8');

      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'empty.txt' },
        { projectConfigLoader: loader },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content).toBe('');
      expect(parsed.size).toBe(0);
      expect(parsed.encoding).toBe('utf-8');
    });

    it('should work with custom path sandbox factory', async () => {
      const sandboxFactory = (rootPath: string) => new PathSandbox(rootPath);

      const result = await readFileHandler(
        { projectId: TEST_PROJECT_ID, filePath: 'hello.txt' },
        {
          projectConfigLoader: loader,
          pathSandboxFactory: sandboxFactory,
        },
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content).toBe(TEST_FILE_CONTENT);
    });
  });
});
