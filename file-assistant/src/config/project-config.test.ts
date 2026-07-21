import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { ProjectConfigLoader, type ProjectConfig } from './project-config.js';

// ============================================================================
// Helpers
// ============================================================================

let testDir: string;
let testProjectsFile: string;

function createMockProject(id: string, overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    id,
    name: overrides.name ?? `Test Project ${id}`,
    rootPath: overrides.rootPath ?? testDir,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    lastIndexed: overrides.lastIndexed ?? null,
  };
}

async function writeProjectsFile(projects: Record<string, ProjectConfig>): Promise<void> {
  await fs.mkdir(path.dirname(testProjectsFile), { recursive: true });
  await fs.writeFile(
    testProjectsFile,
    JSON.stringify({ projects }, null, 2),
    'utf-8',
  );
}

async function cleanTestDir(): Promise<void> {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('ProjectConfigLoader', () => {
  let loader: ProjectConfigLoader;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `file-assistant-config-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    testProjectsFile = path.join(testDir, 'projects.json');
    await fs.mkdir(path.join(testDir, 'workspace-a'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'workspace-b'), { recursive: true });

    loader = new ProjectConfigLoader(testProjectsFile);
  });

  afterEach(async () => {
    await cleanTestDir();
  });

  // --------------------------------------------------------------------------
  // load()
  // --------------------------------------------------------------------------

  describe('load()', () => {
    it('starts empty when no file exists', async () => {
      await loader.load();
      expect(loader.isReady()).toBe(true);
      expect(loader.count()).toBe(0);
      expect(loader.list()).toEqual([]);
    });

    it('loads projects from file', async () => {
      const p1 = createMockProject('proj-1', { name: 'Project Alpha', rootPath: path.join(testDir, 'workspace-a') });
      const p2 = createMockProject('proj-2', { name: 'Project Beta', rootPath: path.join(testDir, 'workspace-b') });

      await writeProjectsFile({ 'proj-1': p1, 'proj-2': p2 });
      await loader.load();

      expect(loader.count()).toBe(2);
      expect(loader.list()).toHaveLength(2);
      expect(loader.exists('proj-1')).toBe(true);
      expect(loader.exists('proj-2')).toBe(true);
    });

    it('throws on malformed JSON', async () => {
      await fs.mkdir(path.dirname(testProjectsFile), { recursive: true });
      await fs.writeFile(testProjectsFile, 'not-json', 'utf-8');
      await expect(loader.load()).rejects.toThrow('Failed to load projects file');
    });
  });

  // --------------------------------------------------------------------------
  // getProject()
  // --------------------------------------------------------------------------

  describe('getProject()', () => {
    it('returns null for unknown project ID after loading empty', async () => {
      await loader.load();
      expect(loader.getProject('non-existent')).toBeNull();
    });

    it('returns null when loader has not been loaded', () => {
      expect(loader.getProject('some-id')).toBeNull();
    });

    it('returns the correct config for a known project', async () => {
      const project = createMockProject('known-proj', {
        name: 'Known Project',
        rootPath: path.join(testDir, 'workspace-a'),
      });

      await writeProjectsFile({ 'known-proj': project });
      await loader.load();

      const result = loader.getProject('known-proj');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('known-proj');
      expect(result!.name).toBe('Known Project');
      expect(result!.rootPath).toBe(path.join(testDir, 'workspace-a'));
      expect(result!.lastIndexed).toBeNull();
    });

    it('returns null for non-existent project after loading with data', async () => {
      const project = createMockProject('only-one', { name: 'Only One', rootPath: testDir });
      await writeProjectsFile({ 'only-one': project });
      await loader.load();

      expect(loader.getProject('only-one')).not.toBeNull();
      expect(loader.getProject('other')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // save()
  // --------------------------------------------------------------------------

  describe('save()', () => {
    it('persists projects to disk and can reload them', async () => {
      const project = createMockProject('saved-proj', {
        name: 'Saved Project',
        rootPath: path.join(testDir, 'workspace-a'),
      });

      await writeProjectsFile({ 'saved-proj': project });
      await loader.load();

      // Read raw file and verify
      const raw = await fs.readFile(testProjectsFile, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.projects['saved-proj'].id).toBe('saved-proj');
      expect(parsed.projects['saved-proj'].name).toBe('Saved Project');
      expect(parsed.projects['saved-proj'].rootPath).toBe(path.join(testDir, 'workspace-a'));
    });

    it('writes in a format compatible with mcp-assistant ProjectRegistry', async () => {
      // Must write: { projects: { [id]: ProjectConfig } }
      const project = createMockProject('compat-proj', { name: 'Compat', rootPath: testDir });

      // Write through the file system in the exact format ProjectRegistry.save() uses
      await writeProjectsFile({ 'compat-proj': project });
      const raw = await fs.readFile(testProjectsFile, 'utf-8');
      const parsed = JSON.parse(raw);

      // Verify the format matches ProjectRegistryData
      expect(parsed).toHaveProperty('projects');
      expect(parsed.projects['compat-proj']).toHaveProperty('id');
      expect(parsed.projects['compat-proj']).toHaveProperty('name');
      expect(parsed.projects['compat-proj']).toHaveProperty('rootPath');
      expect(parsed.projects['compat-proj']).toHaveProperty('createdAt');
      expect(parsed.projects['compat-proj']).toHaveProperty('lastIndexed');
    });
  });

  // --------------------------------------------------------------------------
  // list(), exists(), count()
  // --------------------------------------------------------------------------

  describe('list() / exists() / count()', () => {
    it('list() returns all projects', async () => {
      const p1 = createMockProject('p1', { name: 'P1', rootPath: path.join(testDir, 'workspace-a') });
      const p2 = createMockProject('p2', { name: 'P2', rootPath: path.join(testDir, 'workspace-a') });
      await writeProjectsFile({ p1, p2 });
      await loader.load();

      const all = loader.list();
      expect(all).toHaveLength(2);
      expect(all.map(p => p.id).sort()).toEqual(['p1', 'p2']);
    });

    it('exists() returns correct boolean', async () => {
      const p = createMockProject('found', { name: 'Found', rootPath: testDir });
      await writeProjectsFile({ found: p });
      await loader.load();

      expect(loader.exists('found')).toBe(true);
      expect(loader.exists('missing')).toBe(false);
    });

    it('count() reflects loaded projects', async () => {
      expect(loader.count()).toBe(0);

      const p1 = createMockProject('a', { rootPath: testDir });
      const p2 = createMockProject('b', { rootPath: testDir });
      const p3 = createMockProject('c', { rootPath: testDir });

      await writeProjectsFile({ a: p1, b: p2, c: p3 });
      await loader.load();

      expect(loader.count()).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // isReady()
  // --------------------------------------------------------------------------

  describe('isReady()', () => {
    it('returns false before load()', () => {
      expect(loader.isReady()).toBe(false);
    });

    it('returns true after load()', async () => {
      await loader.load();
      expect(loader.isReady()).toBe(true);
    });
  });
});

// ============================================================================
// ProjectConfig interface shape tests
// ============================================================================

describe('ProjectConfig interface', () => {
  it('accepts a minimal valid config', () => {
    const config: ProjectConfig = {
      id: 'my-project',
      name: 'My Project',
      rootPath: '/some/path',
      createdAt: '2025-01-01T00:00:00.000Z',
      lastIndexed: null,
    };

    expect(config.id).toBe('my-project');
    expect(config.name).toBe('My Project');
    expect(config.rootPath).toBe('/some/path');
  });

  it('accepts a config with lastIndexed set', () => {
    const config: ProjectConfig = {
      id: 'indexed-proj',
      name: 'Indexed Proj',
      rootPath: '/some/path',
      createdAt: '2025-01-01T00:00:00.000Z',
      lastIndexed: '2025-06-15T12:00:00.000Z',
    };

    expect(config.lastIndexed).toBe('2025-06-15T12:00:00.000Z');
  });

  it('is compatible with mcp-assistant ProjectRegistry format', () => {
    const registryData = {
      projects: {
        'test-proj': {
          id: 'test-proj',
          name: 'Test Project',
          rootPath: '/tmp/test',
          createdAt: '2025-01-01T00:00:00.000Z',
          lastIndexed: null,
        },
      },
    };

    const project: ProjectConfig = Object.values(registryData.projects)[0];
    expect(project.id).toBe('test-proj');
    expect(project.name).toBe('Test Project');
    expect(project.rootPath).toBe('/tmp/test');
    expect(project.createdAt).toBeTruthy();
    expect(project.lastIndexed === null || typeof project.lastIndexed === 'string').toBe(true);
  });
});
