#!/usr/bin/env node

// ============================================================================
// readFile - MCP tool for reading file contents with security & encoding support
// ============================================================================
//
// Features:
// 1. PathSandbox.validatePath() for security - prevents path traversal
// 2. fs.readFile for content reading
// 3. Returns {content, size, lastModified, encoding}
// 4. Encoding detection (UTF-8 vs binary)
// 5. Warning on files >10MB
// ============================================================================

import { promises as fs, type Stats } from 'fs';
import * as path from 'path';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ProjectConfigLoader } from '../config/project-config.js';
import * as z from 'zod/v4';

// ============================================================================
// Constants
// ============================================================================

/** Files larger than this (in bytes) trigger a warning */
const MAX_WARN_SIZE = 10 * 1024 * 1024; // 10 MB

/** Maximum bytes to sniff for encoding detection */
const ENCODING_SNIFF_BYTES = 8192;

/** Binary byte threshold: if more than this % of bytes in the sniff window
 *  are non-text, treat the file as binary */
const BINARY_THRESHOLD = 0.10; // 10%

// ============================================================================
// Types
// ============================================================================

export interface ReadFileResult {
  content: string;
  size: number;
  lastModified: string;
  encoding: 'utf-8' | 'binary';
  /** Warning message, if any (e.g., file exceeds size threshold) */
  warning?: string;
}

export interface ReadFileInput {
  projectId: string;
  filePath: string;
}

// ============================================================================
// Zod Schema
// ============================================================================

export const readFileInputSchema = {
  type: 'object',
  properties: {
    projectId: {
      type: 'string',
      description: 'The project ID to read from (must be a registered project)',
    },
    filePath: {
      type: 'string',
      description: 'Path to the file to read (relative to project root, or absolute within sandbox)',
    },
  },
  required: ['projectId', 'filePath'],
} as const;

// ============================================================================
// Encoding Detection
// ============================================================================

/**
 * Detect whether a buffer appears to be UTF-8 text or binary.
 *
 * Strategy: sniff the first ENCODING_SNIFF_BYTES bytes and check if any
 * null bytes or a high ratio of non-ASCII/non-printable bytes are present.
 * Returns 'utf-8' for text-like content, 'binary' for binary content.
 */
export function detectEncoding(buffer: Buffer): 'utf-8' | 'binary' {
  const len = Math.min(buffer.length, ENCODING_SNIFF_BYTES);
  let nonTextBytes = 0;
  let nullBytes = 0;

  for (let i = 0; i < len; i++) {
    const byte = buffer[i];

    // Null byte → definitely binary
    if (byte === 0x00) {
      nullBytes++;
      nonTextBytes++;
      continue;
    }

    // Common text bytes (tab, newline, carriage return)
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      continue;
    }

    // Printable ASCII range (0x20–0x7e)
    if (byte >= 0x20 && byte <= 0x7e) {
      continue;
    }

    // UTF-8 continuation bytes (0x80–0xbf) — part of multi-byte sequences
    if (byte >= 0x80 && byte <= 0xbf) {
      continue;
    }

    // UTF-8 leading bytes for multi-byte sequences (0xc0–0xfd)
    if (byte >= 0xc0 && byte <= 0xfd) {
      continue;
    }

    // Any other byte is non-text (control chars, etc.)
    nonTextBytes++;
  }

  // If any null bytes were found, it's binary
  if (nullBytes > 0) {
    return 'binary';
  }

  // If more than BINARY_THRESHOLD of non-text bytes, it's binary
  if (nonTextBytes / len > BINARY_THRESHOLD) {
    return 'binary';
  }

  return 'utf-8';
}

// ============================================================================
// Tool Handler
// ============================================================================

/**
 * Read a file from a registered project's workspace.
 *
 * Security:
 * - Uses PathSandbox.validatePath() to prevent directory traversal
 * - Only allows files within the project root
 *
 * Returns:
 * - content: The file content (as string for UTF-8, base64 for binary)
 * - size: File size in bytes
 * - lastModified: ISO timestamp of last modification
 * - encoding: 'utf-8' or 'binary'
 * - warning: Warning message for large files
 */
export async function readFileHandler(
  args: ReadFileInput,
  deps: {
    projectConfigLoader: ProjectConfigLoader;
    pathSandboxFactory?: (rootPath: string) => PathSandbox;
  },
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { projectId, filePath } = args;

  try {
    // 1. Load projects and validate project exists
    await deps.projectConfigLoader.load();
    const projectConfig = deps.projectConfigLoader.getProject(projectId);
    if (!projectConfig) {
      return {
        content: [{ type: 'text', text: `Error: Project '${projectId}' not found. Ensure the project is registered.` }],
        isError: true,
      };
    }

    // 2. Validate path via PathSandbox (security boundary)
    const sandbox = deps.pathSandboxFactory
      ? deps.pathSandboxFactory(projectConfig.rootPath)
      : new PathSandbox(projectConfig.rootPath);

    const resolvedPath = await sandbox.resolvePath(filePath);
    if (!resolvedPath) {
      return {
        content: [{ type: 'text', text: `Error: Access denied — path is outside project root` }],
        isError: true,
      };
    }

    // 3. Stat the file to check size and modification time
    let stats: Stats;
    try {
      stats = await fs.stat(resolvedPath);
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        return {
          content: [{ type: 'text', text: `Error: File not found: ${filePath}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Error: Failed to stat file: ${nodeErr.message}` }],
        isError: true,
      };
    }

    // Ensure it's a file, not a directory
    if (!stats.isFile()) {
      return {
        content: [{ type: 'text', text: `Error: Path is not a file: ${filePath}` }],
        isError: true,
      };
    }

    // 4. Check file size and warn if >10MB
    let warning: string | undefined;
    if (stats.size > MAX_WARN_SIZE) {
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
      warning = `Warning: File is ${sizeMB} MB. Large files may impact performance. Content will be returned as-is.`;
    }

    // 5. Read the file as a buffer for encoding detection
    const buffer = await fs.readFile(resolvedPath);
    const encoding = detectEncoding(buffer);

    // 6. Return the result
    const content = encoding === 'binary'
      ? buffer.toString('base64')
      : buffer.toString('utf-8');

    const result: ReadFileResult = {
      content,
      size: stats.size,
      lastModified: stats.mtime.toISOString(),
      encoding,
      warning,
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
 * Register the readFile tool on an MCP server.
 *
 * @param server - The McpServer instance
 * @param deps - Dependencies (projectConfigLoader, optional pathSandboxFactory)
 */
export function registerReadFileTool(
  server: { tool: (name: string, description: string, schema: Record<string, unknown>, handler: (args: ReadFileInput) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>) => void },
  deps: {
    projectConfigLoader: ProjectConfigLoader;
    pathSandboxFactory?: (rootPath: string) => PathSandbox;
  },
): void {
  server.tool(
    'readFile',
    'Read a file from a registered project workspace. Returns content, size, lastModified, and encoding. Warns on files >10MB.',
    {
      projectId: z.string().describe('The project ID to read from'),
      filePath: z.string().describe('Path to the file to read (relative to project root)'),
    },
    async (args: ReadFileInput) => readFileHandler(args, deps),
  );
}
