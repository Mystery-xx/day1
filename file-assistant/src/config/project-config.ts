import { promises as fs } from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Directory where project registry data is stored.
 * Uses the same .index directory as mcp-assistant for format compatibility.
 * Override via PROJECT_INDEX_DIR env var for Docker deployments.
 */
const INDEX_DIR = process.env.PROJECT_INDEX_DIR || path.join(process.cwd(), '..', '.index');
const PROJECTS_FILE = path.join(INDEX_DIR, 'projects.json');

// ============================================================================
// Types
// ============================================================================

/**
 * Project configuration matching mcp-assistant ProjectConfig format.
 * Compatible with the project registry used across the AI Chat project.
 */
export interface ProjectConfig {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  lastIndexed: string | null;
}

interface ProjectRegistryData {
  projects: Record<string, ProjectConfig>;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that a path exists and is a directory.
 * Resolves relative paths before checking.
 */
async function validatePath(rootPath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const resolvedPath = path.resolve(rootPath);
    const stats = await fs.stat(resolvedPath);

    if (!stats.isDirectory()) {
      return {
        valid: false,
        error: `Path '${rootPath}' exists but is not a directory`,
      };
    }

    return { valid: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        valid: false,
        error: `Path '${rootPath}' does not exist`,
      };
    }

    return {
      valid: false,
      error: `Failed to validate path '${rootPath}': ${(error as Error).message}`,
    };
  }
}

/**
 * Ensure the index directory exists.
 */
async function ensureIndexDir(): Promise<void> {
  try {
    await fs.mkdir(INDEX_DIR, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create index directory: ${(error as Error).message}`);
  }
}

// ============================================================================
// ProjectConfigLoader
// ============================================================================

/**
 * Loads and manages project configurations.
 *
 * Compatible with the mcp-assistant ProjectRegistry format — reads/writes
 * the same `.index/projects.json` file so both tools share the same registry.
 *
 * Methods:
 * - load(): Load projects from disk
 * - save(): Persist projects to disk
 * - getProject(projectId): Get a single project config or null
 */
export class ProjectConfigLoader {
  private projects: Map<string, ProjectConfig>;
  private isLoaded: boolean;
  private readonly projectsFilePath: string;

  /**
   * @param projectsFilePath - Optional custom path to the projects JSON file.
   *                           Defaults to `<cwd>/../.index/projects.json`.
   *                           Override in tests with a tmpdir path.
   */
  constructor(projectsFilePath?: string) {
    this.projects = new Map();
    this.isLoaded = false;
    this.projectsFilePath = projectsFilePath ?? PROJECTS_FILE;
  }

  /**
   * Load projects from the shared `.index/projects.json` file.
   * If the file doesn't exist, starts with an empty registry.
   */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.projectsFilePath, 'utf-8');
      const parsed: ProjectRegistryData = JSON.parse(data);

      this.projects.clear();

      for (const project of Object.values(parsed.projects)) {
        this.projects.set(project.id, project);
      }

      this.isLoaded = true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      if (err.code === 'ENOENT') {
        // File doesn't exist — start empty
        this.projects.clear();
        this.isLoaded = true;
        return;
      }

      throw new Error(`Failed to load projects file: ${err.message}`);
    }
  }

  /**
   * Save projects to the shared `.index/projects.json` file.
   */
  async save(): Promise<void> {
    await ensureIndexDir();

    const data: ProjectRegistryData = {
      projects: Object.fromEntries(this.projects),
    };

    try {
      await fs.writeFile(this.projectsFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save projects file: ${(error as Error).message}`);
    }
  }

  /**
   * Get a single project configuration by ID.
   * @param projectId - The project ID to look up
   * @returns The ProjectConfig if found, or null when:
   *          - No project with that ID exists
   *          - No registry file exists on disk (returns empty state)
   */
  getProject(projectId: string): ProjectConfig | null {
    return this.projects.get(projectId) ?? null;
  }

  /**
   * Get all registered projects.
   */
  list(): ProjectConfig[] {
    return Array.from(this.projects.values());
  }

  /**
   * Check if a project exists by ID.
   */
  exists(projectId: string): boolean {
    return this.projects.has(projectId);
  }

  /**
   * Get count of loaded projects.
   */
  count(): number {
    return this.projects.size;
  }

  /**
   * Check if the loader has been initialized with load().
   */
  isReady(): boolean {
    return this.isLoaded;
  }
}

// ============================================================================
// Singleton export
// ============================================================================

/** Default singleton instance of ProjectConfigLoader. */
export const projectConfigLoader = new ProjectConfigLoader();
