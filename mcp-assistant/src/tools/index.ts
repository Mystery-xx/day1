import { promises as fs } from 'fs';
import * as path from 'path';
import * as z from 'zod/v4';
import Fuse from 'fuse.js';
import type { FuseIndex as FuseIndexType, IFuseOptions } from 'fuse.js';
import { projectRegistry, type ProjectConfig } from '../config/project-registry.js';
import { marked } from 'marked';

// ============================================================================
// Configuration
// ============================================================================

const INDEX_BASE_DIR = path.join(process.cwd(), '.index');
const MAX_CHUNK_SIZE = 2000;
const MIN_CHUNK_SIZE = 500;

// ============================================================================
// Types
// ============================================================================

interface ChunkMetadata {
  source: string;      // Relative path to source file
  section: string;     // Heading text (H2/H3)
  level: number;       // Heading level (1=H1, 2=H2, 3=H3)
  startLine: number;   // Starting line number in source file
  endLine: number;     // Ending line number in source file
  projectName: string;
  projectPath: string;
}

interface Chunk {
  id: string;          // Unique chunk identifier
  content: string;     // Markdown content
  metadata: ChunkMetadata;
  charCount: number;   // Character count
}

interface MarkedToken {
  type: string;
  depth?: number;
  text?: string;
  raw?: string;
  tokens?: MarkedToken[];
  start?: number;
}

interface FuseDocument {
  chunkId: string;
  content: string;
  source: string;
  section: string;
  projectName: string;
  projectPath: string;
  level: number;
}

interface FuseIndexData {
  keys: Array<{ path: string[]; id: string; weight: number; src: string }>;
  records: Array<{
    i: number;
    $: {
      [key: string]: {
        v: string;
        n: number;
      };
    };
  }>;
}

interface IndexMetadata {
  indexedAt: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  indexedFiles: number;
  totalChunks: number;
  chunkingStrategy: string;
}

// ============================================================================
// Zod Schema
// ============================================================================

export const indexInputSchema = z.object({
  projectId: z.string().min(1).describe('Project ID from registry'),
  folderPath: z.string().min(1).describe('Path to folder containing .md files'),
  chunkingStrategy: z.enum(['SEMANTIC', 'FIXED_SIZE']).optional().default('SEMANTIC').describe('Chunking strategy'),
});

export type IndexInputArgs = z.infer<typeof indexInputSchema>;

export interface IndexResult {
  indexedFiles: number;
  totalChunks: number;
  projectId: string;
}

// ============================================================================
// Markdown Parser (reused from chunker.ts)
// ============================================================================

function parseMarkdown(content: string): MarkedToken[] {
  const lexer = new marked.Lexer();
  return lexer.lex(content) as MarkedToken[];
}

function extractSections(tokens: MarkedToken[], sourceFile: string): Array<{
  heading: string;
  level: number;
  startLine: number;
  endLine: number;
  content: string;
}> {
  const sections: Array<{
    heading: string;
    level: number;
    startLine: number;
    endLine: number;
    content: string;
  }> = [];

  let currentSection: {
    heading: string;
    level: number;
    startLine: number;
    endLine: number;
    lines: string[];
  } | null = null;

  const lines = sourceFile.split('\n');
  let currentLine = 0;

  for (const token of tokens) {
    if (token.type === 'heading') {
      const headingText = token.text || '';
      const headingLevel = token.depth || 1;
      const headingPrefix = '#'.repeat(headingLevel) + ' ';
      
      let foundLine = -1;
      for (let i = currentLine; i < lines.length; i++) {
        if (lines[i].startsWith(headingPrefix) && lines[i].includes(headingText)) {
          foundLine = i + 1;
          currentLine = i + 1;
          break;
        }
      }
      const headingLine = foundLine > 0 ? foundLine : currentLine + 1;

      if (headingLevel <= 2) {
        if (currentSection) {
          const content = currentSection.lines.join('\n').trim();
          if (content.length > 0) {
            sections.push({
              heading: currentSection.heading,
              level: currentSection.level,
              startLine: currentSection.startLine,
              endLine: currentSection.endLine,
              content: content,
            });
          }
        }

        currentSection = {
          heading: headingText,
          level: headingLevel,
          startLine: headingLine,
          endLine: headingLine,
          lines: [],
        };
      } else if (currentSection) {
        currentSection.endLine = headingLine;
      }
    } else if (currentSection) {
      const rawContent = token.raw || token.text || '';
      if (rawContent) {
        currentSection.lines.push(rawContent);
        const newlines = (rawContent.match(/\n/g) || []).length;
        currentSection.endLine += newlines;
      }
    }
  }

  if (currentSection) {
    const content = currentSection.lines.join('\n').trim();
    if (content.length > 0) {
      sections.push({
        heading: currentSection.heading,
        level: currentSection.level,
        startLine: currentSection.startLine,
        endLine: currentSection.endLine,
        content: content,
      });
    }
  }

  return sections;
}

function splitLargeSection(
  content: string,
  metadata: ChunkMetadata,
  chunkIdPrefix: string
): Chunk[] {
  const chunks: Chunk[] = [];

  if (content.length <= MAX_CHUNK_SIZE) {
    chunks.push({
      id: `${chunkIdPrefix}-0`,
      content: content.trim(),
      metadata,
      charCount: content.length,
    });
    return chunks;
  }

  const paragraphs = content.split(/\n\n+/);
  let currentChunk = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > MAX_CHUNK_SIZE && currentChunk.length >= MIN_CHUNK_SIZE) {
      chunks.push({
        id: `${chunkIdPrefix}-${chunkIndex}`,
        content: currentChunk.trim(),
        metadata: { ...metadata },
        charCount: currentChunk.length,
      });
      chunkIndex++;
      currentChunk = paragraph + '\n\n';
    } else {
      currentChunk += paragraph + '\n\n';
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `${chunkIdPrefix}-${chunkIndex}`,
      content: currentChunk.trim(),
      metadata: { ...metadata },
      charCount: currentChunk.length,
    });
  }

  return chunks;
}

// ============================================================================
// File Processing
// ============================================================================

async function processFile(
  filePath: string,
  project: ProjectConfig
): Promise<Chunk[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const relativePath = path.relative(project.rootPath, filePath);
  
  const tokens = parseMarkdown(content);
  const sections = extractSections(tokens, content);
  
  const chunks: Chunk[] = [];
  const fileBaseName = path.basename(filePath, '.md');

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const metadata: ChunkMetadata = {
      source: relativePath,
      section: section.heading,
      level: section.level,
      startLine: section.startLine,
      endLine: section.endLine,
      projectName: project.name,
      projectPath: project.rootPath,
    };

    const chunkIdPrefix = `${fileBaseName}-section-${i}`;
    const sectionChunks = splitLargeSection(section.content, metadata, chunkIdPrefix);
    chunks.push(...sectionChunks);
  }

  return chunks;
}

async function getMarkdownFiles(folderPath: string): Promise<string[]> {
  const files: string[] = [];
  
  async function scanDir(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  await scanDir(folderPath);
  return files.sort();
}

// ============================================================================
// Fuse.js Index Building
// ============================================================================

const FUSE_OPTIONS: IFuseOptions<FuseDocument> = {
  keys: ['content', 'section', 'source', 'projectName'],
  threshold: 0.3,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  shouldSort: true,
};

function chunksToFuseDocuments(chunks: Chunk[], projectId: string): FuseDocument[] {
  return chunks.map((chunk) => ({
    chunkId: chunk.id,
    content: chunk.content,
    source: chunk.metadata.source,
    section: chunk.metadata.section,
    projectName: chunk.metadata.projectName,
    projectPath: chunk.metadata.projectPath,
    level: chunk.metadata.level,
  }));
}

function createFuseIndex(documents: FuseDocument[]): FuseIndexData {
  const fuseIndex = Fuse.createIndex<FuseDocument>(FUSE_OPTIONS.keys!, documents);
  return fuseIndex.toJSON() as FuseIndexData;
}

// ============================================================================
// Index Folder Function
// ============================================================================

async function indexFolder(args: IndexInputArgs): Promise<{
  success: boolean;
  result?: IndexResult;
  error?: string;
}> {
  try {
    // Ensure registry is loaded
    await projectRegistry.load();

    // Validate projectId exists
    const project = projectRegistry.get(args.projectId);
    if (!project) {
      return {
        success: false,
        error: `Project with ID '${args.projectId}' not found in registry. Register the project first.`,
      };
    }

    // Resolve and validate folderPath
    const resolvedPath = path.resolve(args.folderPath);
    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Path '${args.folderPath}' exists but is not a directory.`,
        };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          error: `Path '${args.folderPath}' does not exist.`,
        };
      }
      return {
        success: false,
        error: `Failed to access path '${args.folderPath}': ${(error as Error).message}`,
      };
    }

    // Scan for .md files
    const mdFiles = await getMarkdownFiles(resolvedPath);
    
    if (mdFiles.length === 0) {
      return {
        success: false,
        error: `No .md files found in '${args.folderPath}'.`,
      };
    }

    console.error(`[index] Processing ${mdFiles.length} markdown files for project ${project.name}...`);

    // Process each file and collect chunks
    const allChunks: Chunk[] = [];
    
    for (const file of mdFiles) {
      console.error(`[index] Processing: ${path.basename(file)}`);
      const fileChunks = await processFile(file, project);
      console.error(`[index]   → Generated ${fileChunks.length} chunks`);
      allChunks.push(...fileChunks);
    }

    if (allChunks.length === 0) {
      return {
        success: false,
        error: 'No chunks generated from markdown files. Files may be empty or have no valid sections.',
      };
    }

    // Create project-specific index directory
    const projectIndexDir = path.join(INDEX_BASE_DIR, args.projectId);
    await fs.mkdir(projectIndexDir, { recursive: true });

    // Convert chunks to Fuse documents and build index
    const fuseDocuments = chunksToFuseDocuments(allChunks, args.projectId);
    const fuseIndex = createFuseIndex(fuseDocuments);

    // Save Fuse index
    const indexFile = path.join(projectIndexDir, 'fuse-index.json');
    await fs.writeFile(indexFile, JSON.stringify(fuseIndex, null, 2), 'utf-8');

    // Save metadata
    const metadata: IndexMetadata = {
      indexedAt: new Date().toISOString(),
      projectId: args.projectId,
      projectName: project.name,
      projectPath: project.rootPath,
      indexedFiles: mdFiles.length,
      totalChunks: allChunks.length,
      chunkingStrategy: args.chunkingStrategy,
    };
    const metadataFile = path.join(projectIndexDir, 'index-metadata.json');
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf-8');

    // Update project's lastIndexed timestamp
    projectRegistry.updateLastIndexed(args.projectId);
    await projectRegistry.save();

    console.error(`[index] Successfully indexed ${mdFiles.length} files into ${allChunks.length} chunks`);
    console.error(`[index] Index saved to: ${indexFile}`);

    return {
      success: true,
      result: {
        indexedFiles: mdFiles.length,
        totalChunks: allChunks.length,
        projectId: args.projectId,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[index] Error: ${errorMessage}`);
    
    return {
      success: false,
      error: `Index operation failed: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Tool Handler for MCP Server
// ============================================================================

export async function createIndexToolHandler() {
  return async (args: IndexInputArgs) => {
    const result = await indexFolder(args);

    if (result.success && result.result) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Successfully indexed ${result.result.indexedFiles} files into ${result.result.totalChunks} chunks for project ${result.result.projectId}.`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text' as const,
            text: result.error || 'Unknown error occurred',
          },
        ],
        isError: true,
      };
    }
  };
}

// ============================================================================
// Exports
// ============================================================================

export { indexFolder };
