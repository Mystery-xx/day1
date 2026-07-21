import { promises as fs } from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const INDEX_DIR = process.env.INDEX_ROOT || path.join(process.cwd(), '.index');
const PROJECTS_FILE = path.join(INDEX_DIR, 'projects.json');

// Path translation for Docker environments
// Converts host paths (e.g., /mnt/f/git/day1) to container paths (e.g., /app/repo/day1)
const HOST_ROOT = process.env.HOST_ROOT || '';
const CONTAINER_ROOT = process.env.CONTAINER_ROOT || '';

// ============================================================================
// Types
// ============================================================================

export type ChunkingStrategy = 'SEMANTIC' | 'FIXED_SIZE';

export interface ProjectConfig {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  lastIndexed: string | null;
  chunkingStrategy: ChunkingStrategy;
}

interface ProjectRegistryData {
  projects: Record<string, ProjectConfig>;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a slugified project ID from a name
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate a unique project ID (slugified name + timestamp)
 */
function generateProjectId(name: string, existingIds: string[]): string {
  const baseSlug = slugify(name);
  const timestamp = Date.now().toString(36);
  let id = `${baseSlug}-${timestamp}`;

  // Ensure uniqueness
  let counter = 0;
  while (existingIds.includes(id)) {
    counter++;
    id = `${baseSlug}-${timestamp}-${counter}`;
  }

  return id;
}

/**
 * Translate a path from host format to container format.
 * If HOST_ROOT and CONTAINER_ROOT are set, converts host paths to container paths.
 * Example: HOST_ROOT=/mnt/f/git/day1, CONTAINER_ROOT=/app/repo/day1
 *          "/mnt/f/git/day1" → "/app/repo/day1"
 */
export function translatePath(inputPath: string): string {
  if (!HOST_ROOT || !CONTAINER_ROOT) {
    return inputPath;
  }
  
  // Normalize paths for comparison
  const normalizedHostRoot = HOST_ROOT.replace(/\/$/, '');
  const normalizedInput = inputPath.replace(/\/$/, '');
  
  // If input starts with HOST_ROOT, replace it with CONTAINER_ROOT
  if (normalizedInput === normalizedHostRoot) {
    return CONTAINER_ROOT;
  }
  
  if (normalizedInput.startsWith(normalizedHostRoot + '/')) {
    return normalizedInput.replace(normalizedHostRoot, CONTAINER_ROOT);
  }
  
  return inputPath;
}

/**
 * Validate that a path exists and is a directory
 */
async function validatePath(rootPath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Translate host path to container path if needed
    const containerPath = translatePath(rootPath);
    const resolvedPath = path.resolve(containerPath);
    const stats = await fs.stat(resolvedPath);

    if (!stats.isDirectory()) {
      return {
        valid: false,
        error: `Path '${rootPath}' (resolved to '${containerPath}') exists but is not a directory`,
      };
    }

    return { valid: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        valid: false,
        error: `Path '${rootPath}' (resolved to '${translatePath(rootPath)}') does not exist`,
      };
    }

    return {
      valid: false,
      error: `Failed to validate path '${rootPath}': ${(error as Error).message}`,
    };
  }
}

/**
 * Ensure index directory exists
 */
async function ensureIndexDir(): Promise<void> {
  try {
    await fs.mkdir(INDEX_DIR, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create index directory: ${(error as Error).message}`);
  }
}

// ============================================================================
// ProjectRegistry Class
// ============================================================================

export class ProjectRegistry {
  private projects: Map<string, ProjectConfig>;
  private isLoaded: boolean;

  constructor() {
    this.projects = new Map();
    this.isLoaded = false;
  }

  /**
   * Load projects from .index/projects.json
   */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(PROJECTS_FILE, 'utf-8');
      const parsed: ProjectRegistryData = JSON.parse(data);

      this.projects.clear();
      Object.values(parsed.projects).forEach((project) => {
        this.projects.set(project.id, project);
      });

      this.isLoaded = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet - start with empty registry
        this.projects.clear();
        this.isLoaded = true;
        return;
      }

      throw new Error(`Failed to load projects file: ${(error as Error).message}`);
    }
  }

  /**
   * Save projects to .index/projects.json
   */
  async save(): Promise<void> {
    await ensureIndexDir();

    const data: ProjectRegistryData = {
      projects: Object.fromEntries(this.projects),
    };

    try {
      await fs.writeFile(PROJECTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save projects file: ${(error as Error).message}`);
    }
  }

  /**
   * Register a new project
   * @param project - Project configuration (without id, or with id for updates)
   * @returns The registered project with generated ID
   */
  async register(project: Omit<ProjectConfig, 'id'>): Promise<ProjectConfig> {
    // Validate rootPath
    const validation = await validatePath(project.rootPath);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate unique ID
    const existingIds = Array.from(this.projects.keys());
    const id = generateProjectId(project.name, existingIds);

    const newProject: ProjectConfig = {
      ...project,
      id,
    };

    this.projects.set(id, newProject);
    return newProject;
  }

  /**
   * Unregister (remove) a project by ID
   * @param projectId - The project ID to remove
   * @returns true if project was removed, false if not found
   */
  unregister(projectId: string): boolean {
    return this.projects.delete(projectId);
  }

  /**
   * Get a single project by ID
   * @param projectId - The project ID to retrieve
   * @returns The project config or null if not found
   */
  get(projectId: string): ProjectConfig | null {
    return this.projects.get(projectId) || null;
  }

  /**
   * Get all registered projects
   * @returns Array of all project configurations
   */
  list(): ProjectConfig[] {
    return Array.from(this.projects.values());
  }

  /**
   * Check if a project exists by ID
   * @param projectId - The project ID to check
   * @returns true if project exists
   */
  exists(projectId: string): boolean {
    return this.projects.has(projectId);
  }

  /**
   * Update the lastIndexed timestamp for a project
   * @param projectId - The project ID to update
   * @returns true if project was updated, false if not found
   */
  updateLastIndexed(projectId: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) {
      return false;
    }

    project.lastIndexed = new Date().toISOString();
    this.projects.set(projectId, project);
    return true;
  }

  /**
   * Check if registry has been loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Get the count of registered projects
   */
  count(): number {
    return this.projects.size;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const projectRegistry = new ProjectRegistry();
