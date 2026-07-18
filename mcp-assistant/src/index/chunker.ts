#!/usr/bin/env node
/**
 * Markdown Chunking Script
 * 
 * Parses markdown files and splits them into semantic chunks based on heading hierarchy.
 * Outputs chunks to /mnt/f/git/day1/.index/chunks.json
 */

import { marked } from 'marked';
import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = '/mnt/f/git/day1';
const TEST_DOCS_DIR = path.join(REPO_ROOT, 'test-documents');
const OUTPUT_FILE = path.join(REPO_ROOT, '.index', 'chunks.json');
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
}

interface Chunk {
  id: string;          // Unique chunk identifier
  content: string;     // Markdown content
  metadata: ChunkMetadata;
  charCount: number;   // Character count
}

interface MarkedToken {
  type: string;
  depth?: number;      // Heading level (1, 2, 3, etc.)
  text?: string;       // Heading text or content
  raw?: string;        // Raw markdown source
  tokens?: MarkedToken[];
  start?: number;      // Start position (if available)
}

// ============================================================================
// Markdown Parser
// ============================================================================

/**
 * Parse markdown content into tokens using marked lexer
 */
function parseMarkdown(content: string): MarkedToken[] {
  const lexer = new marked.Lexer();
  return lexer.lex(content) as MarkedToken[];
}

/**
 * Extract sections from markdown tokens based on heading hierarchy.
 * Splits primarily by H2 headings, includes H3 content within parent H2 section.
 */
function extractSections(tokens: MarkedToken[], sourceFile: string): Array<{
  heading: string;
  level: number;
  startLine: number;
  endLine: number;
  content: string;
  subsections?: Array<{
    heading: string;
    level: number;
    startLine: number;
    endLine: number;
  }>;
}> {
  const sections: Array<{
    heading: string;
    level: number;
    startLine: number;
    endLine: number;
    content: string;
    subsections?: Array<{
      heading: string;
      level: number;
      startLine: number;
      endLine: number;
    }>;
  }> = [];

  let currentSection: {
    heading: string;
    level: number;
    startLine: number;
    endLine: number;
    lines: string[];
    subsections: Array<{
      heading: string;
      level: number;
      startLine: number;
      endLine: number;
    }>;
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
              subsections: currentSection.subsections,
            });
          }
        }

        currentSection = {
          heading: headingText,
          level: headingLevel,
          startLine: headingLine,
          endLine: headingLine,
          lines: [],
          subsections: [],
        };
      } else if (currentSection) {
        currentSection.subsections.push({
          heading: headingText,
          level: headingLevel,
          startLine: headingLine,
          endLine: headingLine,
        });
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
        subsections: currentSection.subsections,
      });
    }
  }

  return sections;
}

/**
 * Split a large section into smaller chunks if it exceeds MAX_CHUNK_SIZE
 */
function splitLargeSection(
  content: string,
  metadata: ChunkMetadata,
  chunkIdPrefix: string
): Chunk[] {
  const chunks: Chunk[] = [];

  if (content.length <= MAX_CHUNK_SIZE) {
    // No splitting needed
    chunks.push({
      id: `${chunkIdPrefix}-0`,
      content: content.trim(),
      metadata,
      charCount: content.length,
    });
    return chunks;
  }

  // Split by paragraphs to find good breaking points
  const paragraphs = content.split(/\n\n+/);
  let currentChunk = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > MAX_CHUNK_SIZE && currentChunk.length >= MIN_CHUNK_SIZE) {
      // Save current chunk
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

  // Save remaining content
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

/**
 * Process a single markdown file and return chunks
 */
async function processFile(filePath: string): Promise<Chunk[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const relativePath = path.relative(REPO_ROOT, filePath);
  
  // Parse markdown
  const tokens = parseMarkdown(content);
  
  // Extract sections based on heading hierarchy
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
    };

    const chunkIdPrefix = `${fileBaseName}-section-${i}`;
    
    // Split large sections
    const sectionChunks = splitLargeSection(section.content, metadata, chunkIdPrefix);
    chunks.push(...sectionChunks);
  }

  return chunks;
}

/**
 * Get all markdown files from test-documents directory
 */
async function getMarkdownFiles(): Promise<string[]> {
  const files = await fs.readdir(TEST_DOCS_DIR);
  return files
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(TEST_DOCS_DIR, file))
    .sort();
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.error('[Chunker] Starting markdown chunking process...');
  console.error(`[Chunker] Input directory: ${TEST_DOCS_DIR}`);
  console.error(`[Chunker] Output file: ${OUTPUT_FILE}`);
  console.error(`[Chunker] Max chunk size: ${MAX_CHUNK_SIZE} chars`);

  try {
    // Ensure output directory exists
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });

    // Get all markdown files
    const files = await getMarkdownFiles();
    console.error(`[Chunker] Found ${files.length} markdown files`);

    // Process each file
    const allChunks: Chunk[] = [];
    
    for (const file of files) {
      console.error(`[Chunker] Processing: ${path.basename(file)}`);
      const fileChunks = await processFile(file);
      console.error(`[Chunker]   → Generated ${fileChunks.length} chunks`);
      allChunks.push(...fileChunks);
    }

    // Write output
    const output = {
      generatedAt: new Date().toISOString(),
      totalChunks: allChunks.length,
      sourceFiles: files.length,
      chunks: allChunks,
    };

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    
    console.error(`[Chunker] Successfully wrote ${allChunks.length} chunks to ${OUTPUT_FILE}`);
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(`[Chunker] Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

main();
