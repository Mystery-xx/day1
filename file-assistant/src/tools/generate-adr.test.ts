import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ProjectConfigLoader, type ProjectConfig } from '../config/project-config.js';
import {
  generateADRHandler,
  type GenerateADRInput,
  type GenerateADRDeps,
} from './generate-adr.js';

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

async function writeProjectRegistry(
  projects: Record<string, ProjectConfig>,
  filePath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ projects }, null, 2), 'utf-8');
}

/**
 * Helper to read an ADR file from the docs/adr directory.
 */
async function readADRFile(
  testRoot: string,
  number: number,
): Promise<string> {
  const adrPath = path.join(testRoot, 'docs', 'adr', `ADR-${number}.md`);
  return fs.readFile(adrPath, 'utf-8');
}

// ============================================================================
// generateADRHandler Tests
// ============================================================================

describe('generateADRHandler', () => {
  let loader: ProjectConfigLoader;
  let deps: GenerateADRDeps;

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `generate-adr-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    projectsFile = path.join(testDir, 'projects.json');
    await fs.mkdir(testDir, { recursive: true });

    // Create project registry
    const projectConfig = createMockProject(TEST_PROJECT_ID, testDir);
    await writeProjectRegistry({ [TEST_PROJECT_ID]: projectConfig }, projectsFile);

    // Setup loader
    loader = new ProjectConfigLoader(projectsFile);
    await loader.load();

    deps = {
      projectConfigLoader: loader,
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // --------------------------------------------------------------------------
  // Happy Path: Generate ADR with all required sections
  // --------------------------------------------------------------------------

  describe('happy path — generate ADR', () => {
    it('should generate the first ADR with number 1', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'Use PostgreSQL for Primary Database',
          context: 'We need a reliable relational database for storing user data and transactions.',
          decision: 'We will use PostgreSQL as our primary database due to its reliability, ACID compliance, and strong ecosystem.',
        },
        deps,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.number).toBe(1);
      expect(parsed.path).toBe('docs/adr/ADR-1.md');
      expect(parsed.title).toBe('Use PostgreSQL for Primary Database');
      expect(parsed.status).toBe('Draft');
      expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify file was created
      const adrFilePath = path.join(testDir, 'docs', 'adr', 'ADR-1.md');
      const content = await fs.readFile(adrFilePath, 'utf-8');
      expect(content).toContain('# ADR-1: Use PostgreSQL for Primary Database');
      expect(content).toContain('**Status:** Draft');
      expect(content).toContain('**Date:**');
      expect(content).toContain('## Context');
      expect(content).toContain('reliable relational database');
      expect(content).toContain('## Decision');
      expect(content).toContain('PostgreSQL as our primary database');
      expect(content).toContain('## Consequences');
      expect(content).toContain('### Positive');
      expect(content).toContain('### Negative');
      expect(content).toContain('### Neutral');
    });

    it('should generate sequential ADR numbers', async () => {
      // Create first ADR
      await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'First ADR',
          context: 'Context for first ADR.',
          decision: 'Decision for first ADR.',
        },
        deps,
      );

      // Create second ADR
      const result2 = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'Second ADR',
          context: 'Context for second ADR.',
          decision: 'Decision for second ADR.',
        },
        deps,
      );

      expect(result2.isError).toBeFalsy();
      const parsed2 = JSON.parse(result2.content[0].text);
      expect(parsed2.number).toBe(2);
      expect(parsed2.path).toBe('docs/adr/ADR-2.md');

      // Verify both files exist
      await expect(
        fs.readFile(path.join(testDir, 'docs', 'adr', 'ADR-1.md'), 'utf-8'),
      ).resolves.toContain('# ADR-1: First ADR');
      await expect(
        fs.readFile(path.join(testDir, 'docs', 'adr', 'ADR-2.md'), 'utf-8'),
      ).resolves.toContain('# ADR-2: Second ADR');
    });

    it('should handle existing ADR files with gaps in numbering', async () => {
      // Pre-create ADR-3 and ADR-5 manually
      const adrDir = path.join(testDir, 'docs', 'adr');
      await fs.mkdir(adrDir, { recursive: true });
      await fs.writeFile(path.join(adrDir, 'ADR-3.md'), '# ADR-3: Existing', 'utf-8');
      await fs.writeFile(path.join(adrDir, 'ADR-5.md'), '# ADR-5: Existing', 'utf-8');

      // Next should be ADR-6
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'After Gap',
          context: 'Context after gap.',
          decision: 'Decision after gap.',
        },
        deps,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.number).toBe(6);
    });

    it('should accept custom status and date', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'Accepted ADR',
          context: 'Context for accepted ADR.',
          decision: 'Decision for accepted ADR.',
          status: 'Accepted',
          date: '2024-06-15',
        },
        deps,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.number).toBe(1);
      expect(parsed.status).toBe('Accepted');
      expect(parsed.date).toBe('2024-06-15');

      // Verify in file
      const content = await readADRFile(testDir, 1);
      expect(content).toContain('**Status:** Accepted');
      expect(content).toContain('**Date:** 2024-06-15');
    });

    it('should accept Proposed status', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'Proposed ADR',
          context: 'Context for proposed ADR.',
          decision: 'Decision for proposed ADR.',
          status: 'Proposed',
        },
        deps,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('Proposed');

      const content = await readADRFile(testDir, 1);
      expect(content).toContain('**Status:** Proposed');
    });
  });

  // --------------------------------------------------------------------------
  // Validation: Missing or Empty Context/Decision
  // --------------------------------------------------------------------------

  describe('validation — missing context/decision', () => {
    it('should reject empty context', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'ADR without Context',
          context: '',
          decision: 'Some decision.',
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('context is required');
    });

    it('should reject whitespace-only context', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'ADR with Spaces',
          context: '   ',
          decision: 'Some decision.',
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('context is required');
    });

    it('should reject empty decision', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'ADR without Decision',
          context: 'Some context.',
          decision: '',
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('decision is required');
    });

    it('should reject whitespace-only decision', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'ADR with Spaces',
          context: 'Some context.',
          decision: '   ',
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('decision is required');
    });

    it('should reject empty title', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: '',
          context: 'Some context.',
          decision: 'Some decision.',
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('title is required');
    });
  });

  // --------------------------------------------------------------------------
  // Validation: Invalid Date
  // --------------------------------------------------------------------------

  describe('validation — invalid date', () => {
    it('should reject badly formatted date', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'ADR',
          context: 'Context.',
          decision: 'Decision.',
          date: 'not-a-date',
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid date');
      expect(result.content[0].text).toContain('YYYY-MM-DD');
    });

    it('should reject date with invalid month', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'ADR',
          context: 'Context.',
          decision: 'Decision.',
          date: '2024-13-01',
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid date');
    });

    it('should reject date with invalid day', async () => {
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'ADR',
          context: 'Context.',
          decision: 'Decision.',
          date: '2024-02-30',
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid date');
    });
  });

  // --------------------------------------------------------------------------
  // Validation: Invalid Status
  // --------------------------------------------------------------------------

  describe('validation — invalid status', () => {
    it('should reject invalid status values', async () => {
      // Test validation by passing a malformed status string
      // The handler validates status against allowed values: Draft, Proposed, Accepted, Deprecated
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'ADR',
          context: 'Context.',
          decision: 'Decision.',
          status: 'InvalidStatus' as any, // Invalid status value - test validation
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid status');
      expect(result.content[0].text).toContain('Draft');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle project not found', async () => {
      const result = await generateADRHandler(
        {
          projectId: 'non-existent',
          title: 'ADR',
          context: 'Context.',
          decision: 'Decision.',
        },
        deps,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should create ADR directory if it does not exist', async () => {
      // Verify directory doesn't exist yet
      const adrDir = path.join(testDir, 'docs', 'adr');
      await expect(fs.readdir(adrDir)).rejects.toThrow();

      // Generate ADR — should create directory
      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'New Directory ADR',
          context: 'Context for new directory.',
          decision: 'Decision for new directory.',
        },
        deps,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.number).toBe(1);

      // Directory should now exist
      const dirContents = await fs.readdir(adrDir);
      expect(dirContents).toContain('ADR-1.md');
    });

    it('should work with custom path sandbox factory', async () => {
      const localDeps: GenerateADRDeps = {
        ...deps,
        pathSandboxFactory: (rootPath: string) => new PathSandbox(rootPath),
      };

      const result = await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'Sandbox Factory ADR',
          context: 'Context with sandbox factory.',
          decision: 'Decision with sandbox factory.',
        },
        localDeps,
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.number).toBe(1);

      // Verify file was written
      const content = await readADRFile(testDir, 1);
      expect(content).toContain('# ADR-1: Sandbox Factory ADR');
    });
  });

  // --------------------------------------------------------------------------
  // Content Verification
  // --------------------------------------------------------------------------

  describe('content verification', () => {
    it('should include all template sections in correct order', async () => {
      await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'Template Verification',
          context: 'Testing template completeness.',
          decision: 'Verify all sections exist.',
        },
        deps,
      );

      const content = await readADRFile(testDir, 1);

      // Check section order by finding line positions
      const lines = content.split('\n');
      const adrTitleLine = lines.findIndex((l) => l.startsWith('# ADR-1: '));
      const statusLine = lines.findIndex((l) => l.startsWith('**Status:**'));
      const dateLine = lines.findIndex((l) => l.startsWith('**Date:**'));
      const contextSection = lines.findIndex((l) => l.trim() === '## Context');
      const decisionSection = lines.findIndex((l) => l.trim() === '## Decision');
      const consequencesSection = lines.findIndex((l) => l.trim() === '## Consequences');
      const positiveSection = lines.findIndex((l) => l.trim() === '### Positive');
      const negativeSection = lines.findIndex((l) => l.trim() === '### Negative');
      const neutralSection = lines.findIndex((l) => l.trim() === '### Neutral');

      expect(adrTitleLine).not.toBe(-1);
      expect(statusLine).not.toBe(-1);
      expect(dateLine).not.toBe(-1);
      expect(contextSection).not.toBe(-1);
      expect(decisionSection).not.toBe(-1);
      expect(consequencesSection).not.toBe(-1);
      expect(positiveSection).not.toBe(-1);
      expect(negativeSection).not.toBe(-1);
      expect(neutralSection).not.toBe(-1);

      // Verify order
      expect(adrTitleLine).toBeLessThan(statusLine);
      expect(statusLine).toBeLessThan(dateLine);
      expect(dateLine).toBeLessThan(contextSection);
      expect(contextSection).toBeLessThan(decisionSection);
      expect(decisionSection).toBeLessThan(consequencesSection);
      expect(consequencesSection).toBeLessThan(positiveSection);
      expect(positiveSection).toBeLessThan(negativeSection);
      expect(negativeSection).toBeLessThan(neutralSection);
    });

    it('should include user-provided context and decision in the file', async () => {
      await generateADRHandler(
        {
          projectId: TEST_PROJECT_ID,
          title: 'Content Check',
          context: 'We are building a microservices architecture and need an API gateway.',
          decision: 'Use Kong as the API gateway due to its plugin ecosystem.',
        },
        deps,
      );

      const content = await readADRFile(testDir, 1);
      expect(content).toContain('We are building a microservices architecture and need an API gateway.');
      expect(content).toContain('Use Kong as the API gateway due to its plugin ecosystem.');
    });
  });
});
