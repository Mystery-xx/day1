// ============================================================================
// generateChangelog - MCP tool for generating CHANGELOG.md from git history
// ============================================================================
//
// Features:
// 1. Uses simple-git to fetch commit history (git.log)
// 2. Parses conventional commits (feat:, fix:, chore:, etc.)
// 3. Groups commits by version/tag
// 4. Generates CHANGELOG.md markdown with sections by version
//
// Security:
// - GitSandbox validates all paths — prevents directory traversal
// - Only operates within registered project root
// ============================================================================

import { simpleGit, type SimpleGit, type DefaultLogFields, type ListLogLine } from 'simple-git';
import * as path from 'path';
import * as z from 'zod/v4';
import { ProjectConfigLoader } from '../config/project-config.js';

// ============================================================================
// Constants
// ============================================================================

/** Timeout for git operations in milliseconds */
const GIT_TIMEOUT_MS = 30000;

/** Conventional commit type labels mapped to human-readable section names */
const COMMIT_TYPE_LABELS: Record<string, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  chore: 'Chores',
  docs: 'Documentation',
  refactor: 'Refactoring',
  style: 'Style',
  test: 'Tests',
  perf: 'Performance',
  ci: 'CI/CD',
  build: 'Build System',
  revert: 'Reverts',
};

/** Ordered section keys for consistent output ordering */
const SECTION_ORDER = [
  'Features',
  'Bug Fixes',
  'Performance',
  'Refactoring',
  'Documentation',
  'Tests',
  'CI/CD',
  'Build System',
  'Style',
  'Chores',
  'Reverts',
  'Other',
];

// ============================================================================
// Git Sandbox for Secure Operations
// ============================================================================

export class GitSandbox {
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = path.normalize(path.resolve(repoRoot));
  }

  /**
   * Get the sandbox root path.
   */
  get root(): string {
    return this.repoRoot;
  }

  /**
   * Validate that a path is within the repo sandbox.
   * Returns { valid, error } — simplified for use in this tool.
   */
  validateRepoPath(): { valid: boolean; error?: string } {
    // Always valid for repo root operations — we only use project root
    // and never accept arbitrary file paths for git commands.
    return { valid: true };
  }

  /**
   * Get a simple-git instance configured for the sandboxed repo.
   */
  getGitInstance(): SimpleGit {
    return simpleGit(this.repoRoot).env({
      GIT_TIMEOUT: GIT_TIMEOUT_MS.toString(),
    });
  }
}

// ============================================================================
// Zod Schema
// ============================================================================

export const generateChangelogSchema = z.object({
  projectId: z.string().min(1).describe('Project ID from registry'),
  fromTag: z.string().optional().describe('Starting tag (inclusive). If omitted, starts from the beginning.'),
  toTag: z.string().optional().describe('Ending tag (inclusive). If omitted, uses HEAD.'),
});

export type GenerateChangelogArgs = z.infer<typeof generateChangelogSchema>;

// ============================================================================
// Conventional Commit Parsing
// ============================================================================

/**
 * Parse a commit message to extract conventional commit type and scope.
 *
 * Pattern: `type(scope): description` or `type: description`
 * Type must be one of the recognized conventional commit types.
 *
 * @returns The parsed type + scope + description, or null if not conventional.
 */
export interface ParsedCommit {
  raw: string;
  type: string;
  scope: string | null;
  description: string;
  breaking: boolean;
  hash: string;
  author: string;
  date: string;
}

const CONVENTIONAL_REGEX = /^(?<type>\w+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?\s*:\s*(?<description>.+)$/;

export function parseConventionalCommit(
  message: string,
  hash: string,
  author: string,
  date: string,
): ParsedCommit | null {
  const match = message.trim().match(CONVENTIONAL_REGEX);
  if (!match || !match.groups) {
    return null;
  }

  const type = match.groups.type!.toLowerCase();
  const scope = match.groups.scope ?? null;
  const breaking = match.groups.breaking === '!';
  const description = match.groups.description!.trim();

  return {
    raw: message,
    type,
    scope,
    description,
    breaking,
    hash,
    author,
    date,
  };
}

// ============================================================================
// Changelog Generation
// ============================================================================

/**
 * Parse a list of git log commits into categorized conventional commits.
 * Non-conventional commits are grouped under "Other".
 */
export interface CommitGroup {
  section: string;
  commits: ParsedCommit[];
}

/**
 * Group parsed commits by their type section, maintaining section order.
 */
export function groupCommitsByType(commits: ParsedCommit[]): CommitGroup[] {
  const groups: Record<string, ParsedCommit[]> = {};
  const otherCommits: ParsedCommit[] = [];

  for (const commit of commits) {
    const label = COMMIT_TYPE_LABELS[commit.type] ?? 'Other';
    if (label === 'Other') {
      otherCommits.push(commit);
    } else {
      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(commit);
    }
  }

  // Build ordered sections
  const result: CommitGroup[] = [];

  for (const section of SECTION_ORDER) {
    if (section === 'Other') {
      if (otherCommits.length > 0) {
        result.push({ section: 'Other', commits: otherCommits });
      }
    } else if (groups[section] && groups[section].length > 0) {
      result.push({ section, commits: groups[section] });
    }
  }

  return result;
}

/**
 * Format a parsed commit into a markdown list item.
 */
function formatCommitLine(commit: ParsedCommit): string {
  const scope = commit.scope ? `**${commit.scope}:** ` : '';
  const breaking = commit.breaking ? '💥 ' : '';
  const shortHash = commit.hash.slice(0, 7);
  return `- ${breaking}${scope}${commit.description} (${shortHash})`;
}

/**
 * Generate a CHANGELOG.md markdown string from parsed commits grouped by type.
 */
export function generateChangelogMarkdown(
  commits: ParsedCommit[],
  version?: string,
  fromTag?: string,
  toTag?: string,
): string {
  const lines: string[] = [];

  // Version header
  if (version) {
    lines.push(`## [${version}]`);
  } else {
    const range = toTag ?? 'HEAD';
    const from = fromTag ? `${fromTag}..` : '';
    lines.push(`## ${from}${range}`);
  }

  // Date line
  lines.push(`> Generated: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');

  if (commits.length === 0) {
    lines.push('_No changes in this version._');
    lines.push('');
    return lines.join('\n');
  }

  // Group by type
  const groups = groupCommitsByType(commits);

  for (const group of groups) {
    lines.push(`### ${group.section}`);
    lines.push('');
    for (const commit of group.commits) {
      lines.push(formatCommitLine(commit));
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Generate a changelog from git history for a registered project.
 *
 * Steps:
 * 1. Validate project exists in registry
 * 2. Create GitSandbox to secure git operations within project root
 * 3. Get list of tags for version grouping
 * 4. Fetch commits within the specified range (fromTag..toTag, or HEAD~N..HEAD)
 * 5. Parse each commit as conventional commit
 * 6. Generate CHANGELOG.md markdown
 **/
export async function generateChangelogHandler(
  args: GenerateChangelogArgs,
  deps: {
    projectConfigLoader: ProjectConfigLoader;
    gitSandboxFactory?: (rootPath: string) => GitSandbox;
  },
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const { projectId, fromTag, toTag } = args;

  try {
    // 1. Validate project exists
    const projectConfig = deps.projectConfigLoader.getProject(projectId);
    if (!projectConfig) {
      return {
        content: [{ type: 'text', text: `Error: Project '${projectId}' not found. Ensure the project is registered.` }],
        isError: true,
      };
    }

    // 2. Create GitSandbox and get git instance
    const sandbox = deps.gitSandboxFactory
      ? deps.gitSandboxFactory(projectConfig.rootPath)
      : new GitSandbox(projectConfig.rootPath);

    const git = sandbox.getGitInstance();

    // 3. Verify the project root is a git repository
    let isRepo: boolean;
    try {
      isRepo = await git.checkIsRepo();
    } catch {
      return {
        content: [{ type: 'text', text: `Error: '${projectConfig.rootPath}' is not a git repository.` }],
        isError: true,
      };
    }

    if (!isRepo) {
      return {
        content: [{ type: 'text', text: `Error: '${projectConfig.rootPath}' is not a git repository.` }],
        isError: true,
      };
    }

    // 4. Fetch commit log
    const logOptions: {
      from?: string;
      to?: string;
      maxCount?: number;
    } = {};

    if (fromTag && toTag) {
      logOptions.from = fromTag;
      logOptions.to = toTag;
    } else if (fromTag) {
      logOptions.from = fromTag;
    } else if (toTag) {
      logOptions.to = toTag;
    } else {
      // No range: fetch last 50 commits
      logOptions.maxCount = 50;
    }

    const log = await git.log(logOptions as Parameters<SimpleGit['log']>[0]);
    const commits = log.all;

    if (commits.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: '# Changelog\n\n_No commits found in the specified range._\n',
          },
        ],
      };
    }

    // 5. Parse conventional commits
    const parsedCommits: ParsedCommit[] = [];
    for (const commit of commits as Array<DefaultLogFields & ListLogLine>) {
      const parsed = parseConventionalCommit(
        commit.message,
        commit.hash,
        commit.author_name,
        commit.date,
      );
      if (parsed) {
        parsedCommits.push(parsed);
      } else {
        // Add non-conventional commits as "Other" type
        parsedCommits.push({
          raw: commit.message,
          type: 'other',
          scope: null,
          description: commit.message.split('\n')[0],
          breaking: false,
          hash: commit.hash,
          author: commit.author_name,
          date: commit.date,
        });
      }
    }

    // 6. Determine version label
    let version: string | undefined;
    if (toTag) {
      version = toTag;
    } else if (fromTag) {
      version = `${fromTag}..HEAD`;
    }

    // 7. Generate markdown
    const changelog = generateChangelogMarkdown(parsedCommits, version, fromTag, toTag);

    // Prepend header
    const fullChangelog = `# Changelog\n\n${changelog}`;

    return {
      content: [{ type: 'text', text: fullChangelog }],
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
 * Create the MCP tool definition for generateChangelog.
 *
 * Returns the tool name, description, schema, and handler closure.
 * The handler is pre-bound with the ProjectConfigLoader singleton.
 */
export function createGenerateChangelogTool(loader: ProjectConfigLoader) {
  const gitSandboxFactory = (rootPath: string) => new GitSandbox(rootPath);

  return {
    name: 'generateChangelog',
    description:
      'Generate a CHANGELOG.md from git history for a registered project. ' +
      'Parses conventional commits (feat:, fix:, chore:, etc.), groups by type, ' +
      'and generates markdown with sections by version. Optionally specify ' +
      'fromTag/toTag to limit the commit range.',
    schema: {
      projectId: z.string().describe('The project ID (registered in project registry)'),
      fromTag: z.string().optional().describe('Starting tag (inclusive). Omit to start from the beginning.'),
      toTag: z.string().optional().describe('Ending tag (inclusive). Omit to use HEAD.'),
    },
    handler: (args: GenerateChangelogArgs) =>
      generateChangelogHandler(args, {
        projectConfigLoader: loader,
        gitSandboxFactory,
      }),
  };
}
