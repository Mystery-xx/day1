import { promises as fs } from 'fs';
import * as path from 'path';
import * as z from 'zod/v4';
import * as Diff from 'diff';
import { PathSandbox } from '../utils/path-sandbox.js';
import { projectConfigLoader, ProjectConfigLoader } from '../config/project-config.js';

// ============================================================================
// Constants
// ============================================================================

/** Lines of context shown around each diff hunk. */
const DIFF_CONTEXT_LINES = 3;

// ============================================================================
// Helper: Detect edit mode
// ============================================================================

type EditMode = 'string' | 'patch';

function detectEditMode(args: EditFileInputArgs): EditMode {
  const hasStringEdit = args.oldString !== undefined && args.newString !== undefined;
  const hasPatch = args.patch !== undefined;

  if (hasStringEdit && hasPatch) {
    throw new Error(
      'Ambiguous input: provide either oldString+newString (string mode) ' +
      'OR patch (patch mode), not both'
    );
  }

  if (hasStringEdit) {
    return 'string';
  }

  if (hasPatch) {
    return 'patch';
  }

  throw new Error(
    'Invalid input: provide oldString+newString for string replacement, ' +
    'or patch for unified diff patching'
  );
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Flat input schema for the editFile tool.
 *
 * In string mode: provide oldString + newString.
 * In patch mode:  provide a unified diff patch string (omit oldString/newString).
 *
 * The handler validates that exactly one mode is active.
 */
export const editFileInputSchema = z.object({
  projectId: z.string().min(1).describe('Project ID from registry'),
  filePath: z.string().min(1).describe('Relative path to the file to edit'),
  oldString: z.string().optional().describe('The exact string to replace (string mode). Omit when using patch mode.'),
  newString: z.string().optional().describe('The replacement text (string mode). Omit when using patch mode.'),
  patch: z.string().optional().describe('Unified diff patch string to apply (patch mode). Omit when using string mode.'),
});

export type EditFileInputArgs = z.infer<typeof editFileInputSchema>;

// ============================================================================
// Return Types
// ============================================================================

export interface EditFileResult {
  success: true;
  diff: string;
  oldSize: number;
  newSize: number;
}

// ============================================================================
// Helper: Generate Unified Diff
// ============================================================================

/**
 * Generate a unified diff between old and new content.
 * Uses the `diff` npm package to produce a standard unified diff
 * with @@ headers and context lines.
 */
function generateDiff(
  filePath: string,
  oldContent: string,
  newContent: string
): string {
  return Diff.createTwoFilesPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    oldContent,
    newContent,
    undefined,
    undefined,
    { context: DIFF_CONTEXT_LINES }
  );
}

// ============================================================================
// Core Edit Functions
// ============================================================================

/**
 * Apply a string-replacement edit to file content.
 * Returns the new content or throws if oldString is not found.
 */
function applyStringEdit(
  content: string,
  oldString: string,
  newString: string
): string {
  // Verify oldString exists in content
  const index = content.indexOf(oldString);
  if (index === -1) {
    throw new Error(
      `oldString not found in file content. ` +
      `Expected to find:\n"""\n${oldString}\n"""`
    );
  }

  // Replace all occurrences (not just first)
  return content.replaceAll(oldString, newString);
}

/**
 * Apply a unified diff patch to file content.
 * Uses the `diff` npm package's parsePatch + applyPatch.
 */
function applyPatchEdit(content: string, patch: string): string {
  const parsedPatches = Diff.parsePatch(patch);

  if (parsedPatches.length === 0) {
    throw new Error('Patch is empty or malformed — no hunks found');
  }

  if (parsedPatches.length > 1) {
    throw new Error(
      `Patch contains ${parsedPatches.length} files. ` +
      `editFile supports single-file patches only.`
    );
  }

  const patchObj = parsedPatches[0];

  if (!patchObj.hunks || patchObj.hunks.length === 0) {
    throw new Error(
      'Patch is malformed: parsed successfully but contains no hunks. ' +
      'A valid patch must have at least one @@ hunk.'
    );
  }

  const result = Diff.applyPatch(content, patchObj);

  if (result === false) {
    throw new Error(
      'Patch application failed. The patch may be malformed or ' +
      'the file content has diverged from the patch\'s expectations.'
    );
  }

  return result;
}

// ============================================================================
// Main Edit File Function
// ============================================================================

/**
 * Edit a file by applying either a string replacement or a unified diff patch.
 *
 * Flow:
 * 1. Resolve project directory from config
 * 2. Validate path via PathSandbox
 * 3. Read current file content
 * 4. Apply edit (string replacement or patch)
 * 5. Generate unified diff of changes
 * 6. Write new content back to file
 * 7. Return success with diff and sizes
 */
export async function editFile(
  args: EditFileInputArgs,
  configLoader?: ProjectConfigLoader
): Promise<EditFileResult> {
  const loader = configLoader ?? projectConfigLoader;

  // 1. Resolve project directory
  await loader.load();
  const project = loader.getProject(args.projectId);

  if (!project) {
    throw new Error(`Project with ID '${args.projectId}' not found in registry`);
  }

  // 2. Validate path via PathSandbox
  const sandbox = new PathSandbox(project.rootPath);
  const resolvedPath = await sandbox.resolvePath(args.filePath);

  // 3. Read current file content
  let oldContent: string;
  try {
    oldContent = await fs.readFile(resolvedPath, 'utf-8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new Error(`File not found: ${args.filePath}`);
    }
    throw new Error(`Failed to read file '${args.filePath}': ${err.message}`);
  }

  // 4. Detect edit mode and apply edit
  const mode = detectEditMode(args);

  let newContent: string;
  if (mode === 'string') {
    newContent = applyStringEdit(oldContent, args.oldString!, args.newString!);
  } else {
    newContent = applyPatchEdit(oldContent, args.patch!);
  }

  // 5. Generate unified diff
  const diff = generateDiff(args.filePath, oldContent, newContent);

  // 6. Write new content back
  try {
    await fs.writeFile(resolvedPath, newContent, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to write edited file '${args.filePath}': ${(error as Error).message}`
    );
  }

  // 7. Return result
  return {
    success: true,
    diff,
    oldSize: oldContent.length,
    newSize: newContent.length,
  };
}

// ============================================================================
// MCP Tool Handler
// ============================================================================

/**
 * Create the MCP tool handler for editFile.
 */
export function createEditFileToolHandler() {
  return async (args: Record<string, unknown>) => {
    try {
      const parsed = editFileInputSchema.parse(args);
      const result = await editFile(parsed);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: result.success,
                diff: result.diff,
                oldSize: result.oldSize,
                newSize: result.newSize,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Validation error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error in editFile: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  };
}
