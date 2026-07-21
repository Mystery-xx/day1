#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { projectConfigLoader } from './config/project-config.js';
import {
  createEditFileToolHandler,
} from './tools/edit-file.js';
import {
  createDiffFilesTool,
} from './tools/diff-files.js';
import { registerReadFileTool } from './tools/read-file.js';
import { registerWriteFileTool } from './tools/write-file.js';
import {
  createAnalyzeBlastRadiusTool,
} from './tools/analyze-blast-radius.js';
import {
  createFindUsagesTool,
} from './tools/find-usages.js';
import {
  createGenerateChangelogTool,
} from './tools/generate-changelog.js';
import { registerGenerateADRTool } from './tools/generate-adr.js';
import { registerGenerateReadmeTool } from './tools/generate-readme.js';
import {
  createCheckInvariantsTool,
} from './tools/check-invariants.js';
import {
  createValidateRulesTool,
} from './tools/validate-rules.js';
import { ApprovalGate, createApproveOperationHandler } from './utils/approval-gate.js';

const TOOL_DEFINITIONS: Array<{ name: string; description: string }> = [
  { name: 'readFile', description: 'Read a file from a registered project workspace. Returns content, size, lastModified, and encoding. Warns on files >10MB.' },
  { name: 'writeFile', description: 'Write a file to a registered project workspace. DANGEROUS — requires explicit approval via approve_operation. Creates parent directories if needed. Returns {written, path, size}.' },
  { name: 'editFile', description: 'Edit a file by applying a string replacement or unified diff patch. Reads the current file content, applies the edit, generates a unified diff with @@ headers, and writes the result back.' },
  { name: 'diffFiles', description: 'Generate a unified diff between two files in a project. Supports comparing different files, same file across git revisions, or mixed (file vs revision).' },
  { name: 'findUsages', description: 'Find usages/references of a symbol in a project via grep+regex patterns. Searches import statements, function calls, class references, and variable assignments.' },
  { name: 'analyzeBlastRadius', description: 'Find all files that depend on a given file or symbol via grep+regex. Returns dependent files with confidence scores and risk assessment (low/medium/high).' },
  { name: 'generateREADME', description: 'Generate a README.md for a registered project by analyzing project structure. Reads package.json, parses src/index.ts exports, builds a directory tree. Does NOT overwrite existing README.' },
  { name: 'generateADR', description: 'Generate an Architecture Decision Record (ADR) markdown file in docs/adr/. Creates sequentially-numbered ADR files from a template with sections: Context, Decision, Status, Consequences.' },
  { name: 'generateChangelog', description: 'Generate a CHANGELOG.md from git history for a registered project. Parses conventional commits, groups by type, and generates markdown with sections by version. Optionally specify fromTag/toTag.' },
  { name: 'checkInvariants', description: 'Check structural invariants of a project: file naming conventions, directory structure, required exports, and file extensions. Uses grep+regex. Reports violations only — does NOT auto-fix.' },
  { name: 'validateRules', description: 'Validate stylistic rules of a project: copyright headers, import order (stdlib → npm → local), no console.log in production code, and max line length (120 chars). Reports violations only — does NOT auto-fix.' },
  { name: 'approve_operation', description: 'Approve or reject a pending dangerous operation (e.g., writeFile). Call with the requestId returned by the dangerous tool to confirm or deny the operation.' },
  { name: 'help', description: 'List all available tools with descriptions. Provides a summary of the file-assistant MCP server capabilities.' },
];

/**
 * Creates and configures the McpServer with all tools registered.
 * This is exported so both stdio and HTTP transports can share the same server instance.
 */
export function createServer(): McpServer {
  const srv = new McpServer({
    name: 'file-assistant',
    version: '1.0.0',
  });

  // Shared ApprovalGate instance for dangerous operations
  const gate = new ApprovalGate();

  // ============================================================================
  // Help Tool — describes all available tools
  // ============================================================================

  srv.tool(
    'help',
    'List all available tools with descriptions. Provides a summary of all file-assistant MCP server capabilities.',
    {},
    async () => {
      const lines = ['# file-assistant MCP Server — Available Tools', ''];
      for (const tool of TOOL_DEFINITIONS) {
        lines.push(`## ${tool.name}`);
        lines.push(tool.description);
        lines.push('');
      }
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );

  // ============================================================================
  // Approve Operation Tool (ApprovalGate infrastructure)
  // ============================================================================

  const approveOperationHandler = createApproveOperationHandler(gate);

  srv.tool(
    'approve_operation',
    'Approve or reject a pending dangerous operation (e.g., writeFile). ' +
    'Call with the requestId returned by a dangerous tool to confirm or deny. ' +
    'Use action="approve" to approve (default) or action="reject" to deny with an optional reason.',
    {
      requestId: z.string().describe('The approval request ID returned by a tool that requires approval'),
      action: z.enum(['approve', 'reject']).optional().describe('Whether to approve or reject the operation (default: approve)'),
      reason: z.string().optional().describe('Optional reason for rejection (only used when action=reject)'),
    },
    approveOperationHandler,
  );

  srv.tool(
    'echo',
    'Echo a message back (test tool)',
    {
      message: z.string().describe('The message to echo'),
    },
    async ({ message }) => ({
      content: [{ type: 'text' as const, text: `Echo: ${message}` }],
    }),
  );

  // ============================================================================
  // Edit File Tool
  // ============================================================================

  const editFileHandler = createEditFileToolHandler();

  srv.tool(
    'editFile',
    'Edit a file by applying a string replacement or unified diff patch. ' +
    'Reads the current file content, applies the edit, generates a unified diff ' +
    'with @@ headers, and writes the result back. For string replacement, provide ' +
    'oldString and newString. For patching, provide a unified diff patch string.',
    {
      projectId: z.string().min(1).describe('Project ID from registry'),
      filePath: z.string().min(1).describe('Relative path to the file to edit'),
      oldString: z.string().optional().describe('The exact string to replace (string mode). Omit when using patch mode.'),
      newString: z.string().optional().describe('The replacement text (string mode). Omit when using patch mode.'),
      patch: z.string().optional().describe('Unified diff patch string to apply (patch mode). Omit when using string mode.'),
    },
    editFileHandler,
  );

  registerTools(srv, gate);
  return srv;
}

function registerTools(srv: McpServer, gate: ApprovalGate): void {
  // Register diffFiles tool
  const diffFilesTool = createDiffFilesTool(projectConfigLoader);
  srv.tool(
    diffFilesTool.name,
    diffFilesTool.description,
    diffFilesTool.schema,
    diffFilesTool.handler,
  );

  // Register writeFile tool (dangerous — requires ApprovalGate)
  registerWriteFileTool(srv, {
    projectConfigLoader,
    approvalGate: gate,
  });

  // Register readFile tool
  registerReadFileTool(srv, { projectConfigLoader });

  // Register analyzeBlastRadius tool
  const analyzeBlastRadiusTool = createAnalyzeBlastRadiusTool(projectConfigLoader);
  srv.tool(
    analyzeBlastRadiusTool.name,
    analyzeBlastRadiusTool.description,
    analyzeBlastRadiusTool.schema,
    analyzeBlastRadiusTool.handler,
  );

  // Register findUsages tool
  const findUsagesTool = createFindUsagesTool(projectConfigLoader);
  srv.tool(
    findUsagesTool.name,
    findUsagesTool.description,
    findUsagesTool.schema,
    findUsagesTool.handler,
  );

  // Register generateREADME tool
  registerGenerateReadmeTool(srv, { projectConfigLoader });

  // Register generateADR tool
  registerGenerateADRTool(srv, { projectConfigLoader });

  // Register checkInvariants tool
  const checkInvariantsTool = createCheckInvariantsTool(projectConfigLoader);
  srv.tool(
    checkInvariantsTool.name,
    checkInvariantsTool.description,
    checkInvariantsTool.schema,
    checkInvariantsTool.handler,
  );

  // Register validateRules tool
  const validateRulesTool = createValidateRulesTool(projectConfigLoader);
  srv.tool(
    validateRulesTool.name,
    validateRulesTool.description,
    validateRulesTool.schema,
    validateRulesTool.handler,
  );

  // Register generateChangelog tool
  const generateChangelogTool = createGenerateChangelogTool(projectConfigLoader);
  srv.tool(
    generateChangelogTool.name,
    generateChangelogTool.description,
    generateChangelogTool.schema,
    generateChangelogTool.handler,
  );
}

async function main() {
  const srv = createServer();
  const transport = new StdioServerTransport();
  await srv.connect(transport);
  console.error('file-assistant MCP server running on stdio');
}

// Only start stdio server when executed directly (not when imported)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/dist/index.js') ||
  process.argv[1].endsWith('\\dist\\index.js') ||
  process.argv[1].endsWith('/index.ts')
);

if (isMainModule) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
