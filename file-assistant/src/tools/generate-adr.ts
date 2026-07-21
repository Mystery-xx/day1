// ============================================================================
// generateADR - MCP tool for creating Architecture Decision Records
// ============================================================================
//
// Creates ADR-{N}.md files in the docs/adr/ directory of a registered
// project, using a standard template from the Momus review format.
//
// Template:
//   # ADR-{N}: {Title}
//
//   **Status:** {Draft|Proposed|Accepted}
//   **Date:** {YYYY-MM-DD}
//
//   ## Context
//
//   {context}
//
//   ## Decision
//
//   {decision}
//
//   ## Consequences
//
//   ### Positive
//
//   ### Negative
//
//   ### Neutral
//
// Security:
//   - Uses PathSandbox to validate all file paths
//   - Only allows writes within the project root
//   - Sequential numbering prevents overwriting existing ADRs
// ============================================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import { PathSandbox } from '../utils/path-sandbox.js';
import { ProjectConfigLoader } from '../config/project-config.js';
import * as z from 'zod/v4';

// ============================================================================
// Constants
// ============================================================================

/** Default ADR directory relative to project root */
const ADR_DIR = 'docs/adr';

/** ADR file prefix */
const ADR_FILE_PREFIX = 'ADR-';

/** ADR file extension */
const ADR_FILE_EXT = '.md';

/** The ADR markdown template with {placeholders} */
const ADR_TEMPLATE = `# ADR-{N}: {Title}

**Status:** {Status}
**Date:** {Date}

## Context

{Context}

## Decision

{Decision}

## Consequences

### Positive

### Negative

### Neutral
`;

// ============================================================================
// Types
// ============================================================================

export interface GenerateADRInput {
  projectId: string;
  title: string;
  context: string;
  decision: string;
  status?: 'Draft' | 'Proposed' | 'Accepted';
  date?: string;
}

export interface GenerateADRResult {
  number: number;
  path: string;
  title: string;
  status: string;
  date: string;
}

// ============================================================================
// Zod Schema (v4)
// ============================================================================

export const generateADRInputSchema = {
  type: 'object',
  properties: {
    projectId: {
      type: 'string',
      description: 'The project ID to create the ADR in (must be a registered project)',
    },
    title: {
      type: 'string',
      description: 'Title of the Architecture Decision Record',
    },
    context: {
      type: 'string',
      description: 'The context and motivation behind the architecture decision',
    },
    decision: {
      type: 'string',
      description: 'The architecture decision that was made',
    },
    status: {
      type: 'string',
      enum: ['Draft', 'Proposed', 'Accepted'],
      description: 'Status of the ADR (default: Draft)',
    },
    date: {
      type: 'string',
      description: 'Date of the ADR in YYYY-MM-DD format (default: today)',
    },
  },
  required: ['projectId', 'title', 'context', 'decision'],
} as const;

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that the ADR input has all required fields with non-empty values.
 */
function validateADRInput(args: GenerateADRInput): string | null {
  if (!args.title || args.title.trim().length === 0) {
    return 'Error: title is required and must not be empty';
  }

  if (!args.context || args.context.trim().length === 0) {
    return 'Error: context is required and must not be empty';
  }

  if (!args.decision || args.decision.trim().length === 0) {
    return 'Error: decision is required and must not be empty';
  }

  return null;
}

/**
 * Validate date string is in YYYY-MM-DD format.
 */
function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) {
    return false;
  }

  const date = new Date(dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) {
    return false;
  }

  // Verify the parts match (catches months like "13" or days like "32")
  const [year, month, day] = dateStr.split('-').map(Number);
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

// ============================================================================
// ADR Number Resolution
// ============================================================================

/**
 * Get today's date in YYYY-MM-DD format.
 */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Find the next ADR number by scanning the docs/adr/ directory.
 *
 * Scans for files matching ADR-{N}.md and returns max(N) + 1.
 * If the directory doesn't exist or no ADR files exist, returns 1.
 */
async function findNextADRNumber(adrDir: string): Promise<number> {
  try {
    const entries = await fs.readdir(adrDir);

    let maxNumber = 0;
    for (const entry of entries) {
      const match = entry.match(/^ADR-(\d+)\.md$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    return maxNumber + 1;
  } catch {
    // Directory doesn't exist or can't be read — start from 1
    return 1;
  }
}

/**
 * Generate the ADR markdown content from the template.
 */
function generateADRContent(args: GenerateADRInput, number: number, date: string): string {
  const status = args.status ?? 'Draft';

  return ADR_TEMPLATE
    .replace(/\{N\}/g, String(number))
    .replace(/\{Title\}/g, args.title.trim())
    .replace(/\{Status\}/g, status)
    .replace(/\{Date\}/g, date)
    .replace(/\{Context\}/g, args.context.trim())
    .replace(/\{Decision\}/g, args.decision.trim());
}

// ============================================================================
// Tool Handler
// ============================================================================

export interface GenerateADRDeps {
  projectConfigLoader: ProjectConfigLoader;
  pathSandboxFactory?: (rootPath: string) => PathSandbox;
}

/**
 * Generate an Architecture Decision Record (ADR) file.
 *
 * MCP tool handler for creating ADR-{N}.md files in the docs/adr/ directory
 * of a registered project. Uses sequential numbering so existing ADRs are
 * never overwritten.
 *
 * @param args - The tool arguments (projectId, title, context, decision, status, date)
 * @param deps - Dependencies (projectConfigLoader, pathSandboxFactory)
 * @returns MCP-compatible response content
 */
export async function generateADRHandler(
  args: GenerateADRInput,
  deps: GenerateADRDeps,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    // 1. Validate input
    const validationError = validateADRInput(args);
    if (validationError) {
      return {
        content: [{ type: 'text', text: validationError }],
        isError: true,
      };
    }

    // 2. Validate project exists
    const projectConfig = deps.projectConfigLoader.getProject(args.projectId);
    if (!projectConfig) {
      return {
        content: [{ type: 'text', text: `Error: Project '${args.projectId}' not found. Ensure the project is registered.` }],
        isError: true,
      };
    }

    // 3. Parse / validate date
    const date = args.date ?? getTodayDate();
    if (!isValidDate(date)) {
      return {
        content: [{ type: 'text', text: `Error: Invalid date '${date}'. Date must be in YYYY-MM-DD format and represent a real date.` }],
        isError: true,
      };
    }

    // 4. Verify status is valid (enum constraint)
    const validStatuses = ['Draft', 'Proposed', 'Accepted'];
    const status = args.status ?? 'Draft';
    if (!validStatuses.includes(status)) {
      return {
        content: [{ type: 'text', text: `Error: Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}.` }],
        isError: true,
      };
    }

    // 5. Resolve ADR directory path via PathSandbox
    const sandbox = deps.pathSandboxFactory
      ? deps.pathSandboxFactory(projectConfig.rootPath)
      : new PathSandbox(projectConfig.rootPath);

    const adrDir = path.join(projectConfig.rootPath, ADR_DIR);
    const validatedAdrDir = await sandbox.resolvePath(adrDir).catch(() => {
      // ADR directory doesn't exist yet — that's OK, we'll create it
      // Validate the parent directory is within sandbox
      return null;
    });

    if (!validatedAdrDir) {
      // Check that the parent (project root) is valid
      const rootValidation = await sandbox.resolvePath(projectConfig.rootPath).catch(() => null);
      if (!rootValidation) {
        return {
          content: [{ type: 'text', text: `Error: Access denied — project root is outside sandbox` }],
          isError: true,
        };
      }
    }

    const resolvedAdrDir = validatedAdrDir ?? adrDir;

    // 6. Find next ADR number
    const number = await findNextADRNumber(resolvedAdrDir);

    // 7. Generate ADR content
    const content = generateADRContent(args, number, date);
    const fileName = `${ADR_FILE_PREFIX}${number}${ADR_FILE_EXT}`;
    const relativePath = path.join(ADR_DIR, fileName).replace(/\\/g, '/');

    // 8. Create ADR directory if needed
    await fs.mkdir(resolvedAdrDir, { recursive: true });

    // 9. Write the ADR file (with PathSandbox validation for the specific file)
    const resolvedFilePath = path.join(resolvedAdrDir, fileName);
    const fileValidation = await sandbox.resolvePath(resolvedFilePath).catch(() => null);
    if (!fileValidation) {
      return {
        content: [{ type: 'text', text: `Error: Access denied — path is outside project root` }],
        isError: true,
      };
    }

    await fs.writeFile(resolvedFilePath, content, 'utf-8');

    // 10. Return result
    const result: GenerateADRResult = {
      number,
      path: relativePath,
      title: args.title.trim(),
      status,
      date,
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
 * Register the generateADR tool on an MCP server.
 *
 * @param server - The McpServer instance
 * @param deps - Dependencies (projectConfigLoader, pathSandboxFactory)
 */
export function registerGenerateADRTool(
  server: { tool: (name: string, description: string, schema: Record<string, unknown>, handler: (args: GenerateADRInput) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>) => void },
  deps: GenerateADRDeps,
): void {
  server.tool(
    'generateADR',
    'Generate an Architecture Decision Record (ADR) as docs/adr/ADR-{N}.md. Creates the file with Title, Status, Date, Context, Decision, and Consequences sections using the standard Momus template. Finds the next sequential ADR number automatically.',
    {
      projectId: z.string().describe('The project ID to create the ADR in'),
      title: z.string().describe('Title of the Architecture Decision Record'),
      context: z.string().describe('The context and motivation behind the architecture decision. Must not be empty.'),
      decision: z.string().describe('The architecture decision that was made. Must not be empty.'),
      status: z.enum(['Draft', 'Proposed', 'Accepted']).optional().describe('Status of the ADR (default: Draft)'),
      date: z.string().optional().describe('Date of the ADR in YYYY-MM-DD format (default: today)'),
    },
    async (args: GenerateADRInput) => generateADRHandler(args, deps),
  );
}
