import * as z from 'zod/v4';
import { projectRegistry, type ProjectConfig, translatePath } from '../config/project-registry.js';

// ============================================================================
// Zod Schemas
// ============================================================================

export const registerProjectSchema = z.object({
  name: z.string().min(1).describe('Project name'),
  rootPath: z.string().min(1).describe('Absolute or relative path to project root directory'),
});

export type RegisterProjectArgs = z.infer<typeof registerProjectSchema>;

export const unregisterProjectSchema = z.object({
  projectId: z.string().min(1).describe('Project ID to remove'),
});

export type UnregisterProjectArgs = z.infer<typeof unregisterProjectSchema>;

export const getProjectInfoSchema = z.object({
  projectId: z.string().min(1).describe('Project ID to retrieve'),
});

export type GetProjectInfoArgs = z.infer<typeof getProjectInfoSchema>;

export const listProjectsSchema = z.object({});

export type ListProjectsArgs = z.infer<typeof listProjectsSchema>;

// ============================================================================
// Tool Return Types
// ============================================================================

export interface ProjectInfo {
  id: string;
  name: string;
  rootPath: string;
  lastIndexed: string | null;
}

export interface RegisterProjectResult {
  projectId: string;
  status: 'registered';
}

export interface UnregisterProjectResult {
  status: 'removed';
}

export interface GetProjectInfoResult extends ProjectConfig {
  status: 'found';
}

export interface ListProjectsResult {
  projects: ProjectInfo[];
  count: number;
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * List all registered projects
 */
export async function listProjects(): Promise<ListProjectsResult> {
  await projectRegistry.load();
  
  const projects = projectRegistry.list();
  
  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      rootPath: p.rootPath,
      lastIndexed: p.lastIndexed,
    })),
    count: projects.length,
  };
}

/**
 * Register a new project
 */
export async function registerProject(
  args: RegisterProjectArgs
): Promise<RegisterProjectResult> {
  await projectRegistry.load();
  
  // Translate host path to container path if needed
  const containerRootPath = translatePath(args.rootPath);
  
  const project = await projectRegistry.register({
    name: args.name,
    rootPath: containerRootPath,
    lastIndexed: null,
    chunkingStrategy: 'SEMANTIC',
    createdAt: new Date().toISOString(),
  });
  
  await projectRegistry.save();
  
  return {
    projectId: project.id,
    status: 'registered',
  };
}

/**
 * Unregister (remove) a project
 */
export async function unregisterProject(
  args: UnregisterProjectArgs
): Promise<UnregisterProjectResult> {
  await projectRegistry.load();
  
  const removed = projectRegistry.unregister(args.projectId);
  
  if (!removed) {
    throw new Error(`Project with ID '${args.projectId}' not found in registry`);
  }
  
  await projectRegistry.save();
  
  return {
    status: 'removed',
  };
}

/**
 * Get detailed information about a project
 */
export async function getProjectInfo(
  args: GetProjectInfoArgs
): Promise<GetProjectInfoResult> {
  await projectRegistry.load();
  
  const project = projectRegistry.get(args.projectId);
  
  if (!project) {
    throw new Error(`Project with ID '${args.projectId}' not found in registry`);
  }
  
  return {
    ...project,
    status: 'found',
  };
}

// ============================================================================
// MCP Tool Handler Factory
// ============================================================================

export function createProjectTools() {
  return {
    listProjects: async () => {
      const result = await listProjects();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
    
    registerProject: async (args: RegisterProjectArgs) => {
      try {
        const result = await registerProject(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
    
    unregisterProject: async (args: UnregisterProjectArgs) => {
      try {
        const result = await unregisterProject(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
    
    getProjectInfo: async (args: GetProjectInfoArgs) => {
      try {
        const result = await getProjectInfo(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  };
}
