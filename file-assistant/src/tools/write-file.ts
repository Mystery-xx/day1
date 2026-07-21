#!/usr/bin/env node

// ============================================================================
// writeFile - MCP tool for creating/overwriting files (dangerous operation)
// ============================================================================
//
// DANGEROUS OPERATION - requires explicit user approval via ApprovalGate.
//
// Flow:
//   1. PathSandbox.validatePath() for security - prevents path traversal
//   2. ApprovalGate.requireApproval() - requires user confirmation
//   3. fs.mkdirSync({recursive: true}) - create parent directories if needed
//   4. fs.writeFile - write the file content
//   5. Returns {written: true, path, size}
//
// Security measures:
//   1. Must have projectId from registered project
//   2. filePath validated via PathSandbox
//   3. Approval required (writeFile is dangerous)
//   4. Cannot write outside project root
// ============================================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ApprovalGate } from '../utils/approval-gate.js';
import { ProjectConfigLoader } from '../config/project-config.js';
import * as z from 'zod/v4';

// ============================================================================
// Types
// ============================================================================

export interface WriteFileInput {
  projectId: string;
  filePath: string;
  content: string;
}

export interface WriteFileResult {
  written: boolean;
  path: string;
  size: number;
}

// ============================================================================
// Zod Schema
// ============================================================================

export const writeFileInputSchema = {
  type: 'object',
  properties: {
    projectId: {
      type: 'string',
      description: 'The project ID to write to (must be a registered project)',
    },
    filePath: {
      type: 'string',
      description: 'Path to the file to write (relative to project root, or absolute within sandbox)',
    },
    content: {
      type: 'string',
      description: 'Content to write to the file',
    },
  },
  required: ['projectId', 'filePath', 'content'],
} as const;

// ============================================================================
// Tool Handler
// ============================================================================

export interface WriteFileDeps {
  projectConfigLoader: ProjectConfigLoader;
  approvalGate: ApprovalGate;
  pathSandboxFactory?: (rootPath: string) => PathSandbox;
}

/**
 * Write a file to a registered project's workspace.
 *
 * DANGEROUS — requires explicit user approval via ApprovalGate.
 * The flow is:
 *   1. Validate project exists
 *   2. Validate path via PathSandbox (security boundary)
 *   3. Require user approval via ApprovalGate
 *   4. Create parent directories if needed
 *   5. Write the file
 *   6. Return {written, path, size}
 *
 * If approval has not yet been granted, returns a `pendingApproval` response
 * with the `requestId`. The caller must invoke `approve_operation` with that
 * ID to confirm, then re-call this handler. The second call will detect the
 * existing approval (via contextKey) and proceed automatically.
 *
 * @param args - The tool arguments (projectId, filePath, content)
 * @param deps - Dependencies (projectConfigLoader, approvalGate, pathSandboxFactory)
 * @returns MCP-compatible response content
 */
export async function writeFileHandler(
  args: WriteFileInput,
  deps: WriteFileDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { projectId, filePath, content } = args;

  try {
    // 1. Validate project exists
    const projectConfig = deps.projectConfigLoader.getProject(projectId);
    if (!projectConfig) {
      return {
        content: [{ type: 'text', text: `Error: Project '${projectId}' not found. Ensure the project is registered.` }],
        isError: true,
      };
    }

    // 1b. Security: Block encoded path traversal in filePath
    const decodedFilePath = decodeURIComponent(filePath);
    // Check all components of the path for traversal
    const pathComponents = decodedFilePath.split(/[/\\]/);
    for (const component of pathComponents) {
      if (component === '..') {
        return {
          content: [{ type: 'text', text: `Error: Access denied — path traversal detected` }],
          isError: true,
        };
      }
    }

    // 2. Validate path via PathSandbox (security boundary)
    const sandbox = deps.pathSandboxFactory
      ? deps.pathSandboxFactory(projectConfig.rootPath)
      : new PathSandbox(projectConfig.rootPath);

    const validation = await sandbox.validatePath(filePath);
    if (!validation.valid || !validation.resolvedPath) {
      // For non-existent deep paths (parent dir doesn't exist either),
      // iterate up until we find an existing parent and verify it's in sandbox
      const resolvedAbsolute = path.resolve(projectConfig.rootPath, path.normalize(filePath));
      if (!resolvedAbsolute.startsWith(projectConfig.rootPath)) {
        return {
          content: [{ type: 'text', text: `Error: Access denied — path is outside project root` }],
          isError: true,
        };
      }

      // Check that project root itself exists (sanity check)
      let checkPath = path.dirname(resolvedAbsolute);
      let foundExisting = false;
      while (checkPath.startsWith(projectConfig.rootPath)) {
        try {
          await fs.realpath(checkPath);
          foundExisting = true;
          break;
        } catch {
          // Directory doesn't exist, go up one level
          const parent = path.dirname(checkPath);
          if (parent === checkPath) break; // reached filesystem root
          checkPath = parent;
        }
      }

      if (!foundExisting) {
        return {
          content: [{ type: 'text', text: `Error: Access denied — path is outside project root` }],
          isError: true,
        };
      }

      // Verify the found existing path is within sandbox
      if (!checkPath.startsWith(projectConfig.rootPath)) {
        return {
          content: [{ type: 'text', text: `Error: Access denied — path is outside project root` }],
          isError: true,
        };
      }
    }

    const resolvedPath = validation.valid && validation.resolvedPath
      ? validation.resolvedPath
      : path.resolve(projectConfig.rootPath, path.normalize(filePath));

    // 3. Require user approval (dangerous operation)
    const approval = deps.approvalGate.requireApproval(
      {
        type: 'write_file',
        description: `Write to file: ${filePath} (${content.length} bytes)`,
        details: {
          projectId,
          filePath,
          resolvedPath,
          contentLength: content.length,
        },
      },
      `project:${projectId}`,
    );

    if (approval.pendingApproval) {
      // Return the pending-approval response — the AI must call
      // approve_operation before we proceed.
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              pendingApproval: true,
              requestId: approval.requestId,
              operation: approval.operation,
              message: approval.message,
            }),
          },
        ],
      };
    }

    // If we reach here, approval was granted (or auto-approved via contextKey)
    // 4. Create parent directories if needed
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

    // 5. Write the file
    await fs.writeFile(resolvedPath, content, 'utf-8');

    // 6. Get the file stats for size verification
    const stats = await fs.stat(resolvedPath);

    const result: WriteFileResult = {
      written: true,
      path: filePath,
      size: stats.size,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
}

// ============================================================================
// MCP Tool Registration
// ============================================================================

/**
 * Register the writeFile tool on an MCP server.
 *
 * @param server - The McpServer instance
 * @param deps - Dependencies (projectConfigLoader, approvalGate, pathSandboxFactory)
 */
export function registerWriteFileTool(
  server: { tool: (name: string, description: string, schema: Record<string, unknown>, handler: (args: WriteFileInput) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>) => void },
  deps: WriteFileDeps,
): void {
  server.tool(
    'writeFile',
    'Write a file to a registered project workspace. DANGEROUS — requires explicit approval. Creates parent directories if needed. Returns {written, path, size}.',
    {
      projectId: z.string().describe('The project ID to write to'),
      filePath: z.string().describe('Path to the file to write (relative to project root)'),
      content: z.string().describe('Content to write to the file'),
    },
    async (args: WriteFileInput) => writeFileHandler(args, deps),
  );
}
