import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import Fuse from 'fuse.js';
import type { FuseIndex as FuseIndexType, IFuseOptions, FuseResult } from 'fuse.js';

// Configuration
const PROJECT_ROOT = '/mnt/f/git/day1';
const INDEX_DIR = path.join(PROJECT_ROOT, '.index');
const INDEX_FILE = path.join(INDEX_DIR, 'fuse-index.json');
const METADATA_FILE = path.join(INDEX_DIR, 'fuse-metadata.json');

// Documents to index
const DOCUMENTS = [
  { path: 'README.md', title: 'AI Chat Application' },
  { path: 'test-documents/01-project-overview.md', title: 'AI Chat Project Overview' },
  { path: 'test-documents/02-mcp-setup-guide.md', title: 'MCP Setup Guide' },
  { path: 'test-documents/03-api-reference.md', title: 'API Reference' },
  { path: 'test-documents/04-environment-variables.md', title: 'Environment Variables Guide' },
  { path: 'test-documents/05-docker-deployment.md', title: 'Docker Deployment Guide' },
  { path: 'test-documents/06-rag-architecture.md', title: 'RAG Architecture' },
  { path: 'test-documents/07-context-strategies.md', title: 'Context Management Strategies' },
  { path: 'test-documents/08-troubleshooting.md', title: 'Troubleshooting Guide' },
  { path: 'test-documents/09-model-settings.md', title: 'Model Settings Guide' },
  { path: 'test-documents/10-security-guide.md', title: 'Security Guide' },
  { path: 'test-documents/11-reranking-guide.md', title: 'Reranking Guide' },
];

// Fuse.js configuration
const FUSE_OPTIONS: IFuseOptions<FuseDocument> = {
  keys: ['title', 'content', 'path'],
  threshold: 0.3,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  shouldSort: true,
};

export interface FuseDocument {
  title: string;
  path: string;
  content: string;
  lastModified: string;
}

export interface IndexMetadata {
  indexedAt: string;
  documentCount: number;
  documents: Array<{ path: string; lastModified: string; title: string }>;
}

/**
 * Read a markdown file and extract its content
 */
function readMarkdownFile(filePath: string): string {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * Get the last modified time of a file as ISO string
 */
function getLastModified(filePath: string): string {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  const stats = fs.statSync(fullPath);
  return stats.mtime.toISOString();
}

/**
 * Load all documents and create FuseDocument objects
 */
function loadDocuments(): FuseDocument[] {
  return DOCUMENTS.map((doc) => ({
    title: doc.title,
    path: doc.path,
    content: readMarkdownFile(doc.path),
    lastModified: getLastModified(doc.path),
  }));
}

/**
 * Create a new Fuse index from documents
 */
function createIndex(documents: FuseDocument[]): FuseIndexType<FuseDocument> {
  return Fuse.createIndex(FUSE_OPTIONS.keys!, documents);
}

/**
 * Save index to JSON file
 */
function saveIndex(
  fuseIndex: FuseIndexType<FuseDocument>,
  documents: FuseDocument[]
): void {
  // Ensure index directory exists
  if (!fs.existsSync(INDEX_DIR)) {
    fs.mkdirSync(INDEX_DIR, { recursive: true });
  }

  // Serialize index
  const indexData = fuseIndex.toJSON();

  // Save index JSON
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));

  // Save metadata
  const metadata: IndexMetadata = {
    indexedAt: new Date().toISOString(),
    documentCount: documents.length,
    documents: documents.map((doc) => ({
      path: doc.path,
      lastModified: doc.lastModified,
      title: doc.title,
    })),
  };
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));

  console.log(`Index saved with ${documents.length} documents to ${INDEX_FILE}`);
}

/**
 * Load existing index from JSON file
 */
function loadIndex(): {
  index: FuseIndexType<FuseDocument>;
  metadata: IndexMetadata;
} | null {
  if (!fs.existsSync(INDEX_FILE) || !fs.existsSync(METADATA_FILE)) {
    return null;
  }

  const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));

  const index = Fuse.parseIndex<FuseDocument>(indexData);
  return { index, metadata };
}

/**
 * Get files changed since last index via git diff
 */
function getChangedFiles(): string[] {
  try {
    // Get list of modified files since last commit
    const output = execSync('git diff --name-only HEAD', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });

    const changedFiles = output
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.trim());

    // Filter to only our indexed documents
    const indexedPaths = DOCUMENTS.map((d) => d.path);
    return changedFiles.filter((file) => indexedPaths.includes(file));
  } catch (error) {
    console.error('Error getting changed files:', error);
    return [];
  }
}

/**
 * Incremental update: re-index only changed files
 */
function incrementalUpdate(): void {
  console.log('Starting incremental update...');

  // Load existing index
  const existing = loadIndex();
  if (!existing) {
    console.log('No existing index found, performing full index...');
    buildIndex();
    return;
  }

  const { index, metadata } = existing;

  // Get changed files
  const changedFiles = getChangedFiles();
  console.log(`Found ${changedFiles.length} changed file(s):`, changedFiles);

  if (changedFiles.length === 0) {
    console.log('No files changed, index is up to date.');
    return;
  }

  // Load all documents (needed for Fuse index rebuild)
  const allDocuments = loadDocuments();

  // Identify which documents need re-indexing
  const changedDocs = allDocuments.filter((doc) =>
    changedFiles.includes(doc.path)
  );

  console.log(`Re-indexing ${changedDocs.length} document(s)...`);

  // Create new index with all documents (Fuse requires full rebuild)
  const newIndex = createIndex(allDocuments);

  // Save updated index
  saveIndex(newIndex, allDocuments);

  console.log(
    `Incremental update complete. Re-indexed ${changedDocs.length} document(s).`
  );
}

/**
 * Build full index from scratch
 */
function buildIndex(): void {
  console.log('Building full index...');

  const documents = loadDocuments();
  console.log(`Loaded ${documents.length} documents`);

  const index = createIndex(documents);
  saveIndex(index, documents);

  console.log('Index build complete.');
}

/**
 * Search the index
 */
function search(query: string, limit = 10): FuseResult<FuseDocument>[] {
  const existing = loadIndex();
  if (!existing) {
    console.error('No index found. Run buildIndex() first.');
    return [];
  }

  const documents = loadDocuments();
  const fuse = new Fuse(documents, FUSE_OPTIONS, existing.index);

  const results = fuse.search(query, { limit });
  return results;
}

/**
 * Test function to verify search works
 */
function testSearch(): void {
  console.log('\n=== Testing Fuse.js Search ===\n');

  // Test query: "MCP setup"
  const query = 'MCP setup';
  console.log(`Searching for: "${query}"`);

  const results = search(query, 5);

  if (results.length === 0) {
    console.log('No results found.');
    return;
  }

  console.log(`\nFound ${results.length} result(s):\n`);

  results.forEach((result, i) => {
    console.log(`${i + 1}. ${result.item.path}`);
    console.log(`   Title: ${result.item.title}`);
    console.log(`   Score: ${result.score?.toFixed(4)}`);
    if (result.matches) {
      result.matches.forEach((match) => {
        console.log(`   Matched key: ${match.key}`);
        if (match.indices && match.indices.length > 0) {
          const [start, end] = match.indices[0];
          const snippet = result.item.content.substring(start, Math.min(end + 1, start + 50));
          console.log(`   Snippet: "...${snippet}..."`);
        }
      });
    }
    console.log('');
  });

  // Verify expected result
  const expectedFile = 'test-documents/02-mcp-setup-guide.md';
  const foundExpected = results.find((r) => r.item.path === expectedFile);

  if (foundExpected) {
    const score = foundExpected.score ?? 1;
    if (score < 0.5) {
      console.log(`✓ PASS: "${expectedFile}" found with score ${score.toFixed(4)} < 0.5`);
    } else {
      console.log(`✗ FAIL: "${expectedFile}" found but score ${score.toFixed(4)} >= 0.5`);
    }
  } else {
    console.log(`✗ FAIL: Expected file "${expectedFile}" not found in results`);
  }
}

/**
 * Main entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'build':
      buildIndex();
      break;
    case 'update':
      incrementalUpdate();
      break;
    case 'search':
      const query = args.slice(1).join(' ') || 'MCP setup';
      const results = search(query);
      console.log(`\nSearch results for "${query}":`);
      results.forEach((r) => {
        console.log(`  - ${r.item.path} (score: ${r.score?.toFixed(4)})`);
      });
      break;
    case 'test':
      testSearch();
      break;
    default:
      console.log('Usage: ts-node src/index/fuse-index.ts <command>');
      console.log('Commands:');
      console.log('  build   - Build full index from scratch');
      console.log('  update  - Incremental update (re-index changed files)');
      console.log('  search  - Search the index (e.g., search "MCP setup")');
      console.log('  test    - Run test search');
      break;
  }
}

// Export for programmatic use
export {
  buildIndex,
  incrementalUpdate,
  search,
  loadDocuments,
  createIndex,
  saveIndex,
  loadIndex,
  getChangedFiles,
  FUSE_OPTIONS,
  DOCUMENTS,
};

// Run if executed directly
const isMain = process.argv[1] && (process.argv[1].endsWith('fuse-index.ts') || process.argv[1].endsWith('fuse-index.js'));
if (isMain) {
  main();
}
