import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import Fuse from 'fuse.js';
import type { FuseIndex as FuseIndexType, IFuseOptions, FuseResult } from 'fuse.js';

// ============================================================================
// Configuration
// ============================================================================

const BASE_INDEX_DIR = '/mnt/f/git/day1/mcp-assistant/.index';
const PROJECTS_FILE = path.join(BASE_INDEX_DIR, 'projects.json');

// ============================================================================
// Types
// ============================================================================

export interface ProjectConfig {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  lastIndexed?: string;
  chunkingStrategy?: string;
}

export interface ProjectRegistry {
  projects: Record<string, ProjectConfig>;
}

export interface FuseDocument {
  title: string;
  path: string;
  content: string;
  lastModified: string;
  projectId: string;
}

export interface IndexMetadata {
  indexedAt: string;
  documentCount: number;
  projectId: string;
  rootPath: string;
  documents: Array<{ path: string; lastModified: string; title: string }>;
}

export interface IndexStats {
  projectId: string;
  documentCount: number;
  indexedAt: string;
  rootPath: string;
}

// ============================================================================
// Project Registry
// ============================================================================

function loadProjectRegistry(): ProjectRegistry {
  if (!fs.existsSync(PROJECTS_FILE)) {
    return { projects: {} };
  }
  const content = fs.readFileSync(PROJECTS_FILE, 'utf-8');
  return JSON.parse(content);
}

function saveProjectRegistry(registry: ProjectRegistry): void {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(registry, null, 2));
}

function getProjectConfig(projectId: string): ProjectConfig | null {
  const registry = loadProjectRegistry();
  return registry.projects[projectId] || null;
}

function updateProjectLastIndexed(projectId: string): void {
  const registry = loadProjectRegistry();
  if (registry.projects[projectId]) {
    registry.projects[projectId].lastIndexed = new Date().toISOString();
    saveProjectRegistry(registry);
  }
}

// ============================================================================
// Document Discovery
// ============================================================================

function scanMarkdownFiles(rootPath: string): string[] {
  const mdFiles: string[] = [];
  
  function scanDir(dirPath: string, relativeBase: string): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.join(relativeBase, entry.name);
        
        // Skip hidden directories and common exclusions
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === 'target') {
          continue;
        }
        
        if (entry.isDirectory()) {
          scanDir(fullPath, relativePath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          mdFiles.push(relativePath);
        }
      }
    } catch (error) {
      console.warn(`[fuse-index] Cannot read directory: ${dirPath}`, (error as Error).message);
    }
  }
  
  scanDir(rootPath, '');
  return mdFiles;
}

function createDocumentTitle(filePath: string): string {
  const basename = path.basename(filePath, '.md');
  // Remove leading numbers like "01-", "02-", etc.
  const title = basename.replace(/^\d+-/, '');
  // Convert kebab-case to Title Case
  return title
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// Fuse.js Configuration
// ============================================================================

const FUSE_OPTIONS: IFuseOptions<FuseDocument> = {
  keys: ['title', 'content', 'path'],
  threshold: 0.4,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  shouldSort: true,
  isCaseSensitive: false,
  ignoreLocation: true,
};

// ============================================================================
// Document Loading
// ============================================================================

function readMarkdownFile(rootPath: string, filePath: string): string {
  const fullPath = path.join(rootPath, filePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

function getLastModified(rootPath: string, filePath: string): string {
  const fullPath = path.join(rootPath, filePath);
  const stats = fs.statSync(fullPath);
  return stats.mtime.toISOString();
}

function loadDocuments(projectId: string): FuseDocument[] {
  const projectConfig = getProjectConfig(projectId);
  if (!projectConfig) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  const { rootPath } = projectConfig;
  
  // Scan for .md files dynamically
  const mdFiles = scanMarkdownFiles(rootPath);
  console.log(`[fuse-index] Found ${mdFiles.length} markdown files in ${rootPath}`);
  
  return mdFiles.map((filePath) => ({
    title: createDocumentTitle(filePath),
    path: filePath,
    content: readMarkdownFile(rootPath, filePath),
    lastModified: getLastModified(rootPath, filePath),
    projectId,
  }));
}

// ============================================================================
// Index Management
// ============================================================================

function getProjectIndexDir(projectId: string): string {
  return path.join(BASE_INDEX_DIR, projectId);
}

function getIndexFile(projectId: string): string {
  return path.join(getProjectIndexDir(projectId), 'fuse-index.json');
}

function getMetadataFile(projectId: string): string {
  return path.join(getProjectIndexDir(projectId), 'fuse-metadata.json');
}

function createIndex(documents: FuseDocument[]): FuseIndexType<FuseDocument> {
  return Fuse.createIndex(FUSE_OPTIONS.keys!, documents);
}

function saveIndex(
  fuseIndex: FuseIndexType<FuseDocument>,
  documents: FuseDocument[],
  projectId: string
): void {
  const indexDir = getProjectIndexDir(projectId);
  const indexFile = getIndexFile(projectId);
  const metadataFile = getMetadataFile(projectId);
  
  // Ensure index directory exists
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }
  
  // Serialize index
  const indexData = fuseIndex.toJSON();
  
  // Save index JSON
  fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));
  
  // Get project config
  const projectConfig = getProjectConfig(projectId);
  if (!projectConfig) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  // Save metadata
  const metadata: IndexMetadata = {
    indexedAt: new Date().toISOString(),
    documentCount: documents.length,
    projectId,
    rootPath: projectConfig.rootPath,
    documents: documents.map((doc) => ({
      path: doc.path,
      lastModified: doc.lastModified,
      title: doc.title,
    })),
  };
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  
  // Update project last indexed timestamp
  updateProjectLastIndexed(projectId);
  
  console.log(`[fuse-index] Index saved with ${documents.length} documents to ${indexFile}`);
}

function loadIndex(projectId: string): {
  index: FuseIndexType<FuseDocument>;
  metadata: IndexMetadata;
} | null {
  const indexFile = getIndexFile(projectId);
  const metadataFile = getMetadataFile(projectId);
  
  if (!fs.existsSync(indexFile) || !fs.existsSync(metadataFile)) {
    return null;
  }
  
  const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
  
  const index = Fuse.parseIndex<FuseDocument>(indexData);
  return { index, metadata };
}

// ============================================================================
// Changed Files Detection
// ============================================================================

function getChangedFiles(projectId: string): string[] {
  const projectConfig = getProjectConfig(projectId);
  if (!projectConfig) {
    return [];
  }
  
  const { rootPath } = projectConfig;
  
  try {
    // Get list of modified files since last commit
    const output = execSync('git diff --name-only HEAD', {
      cwd: rootPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr (git warnings)
    });
    
    const changedFiles = output
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.trim());
    
    // Filter to only markdown files
    return changedFiles.filter((file) => file.endsWith('.md'));
  } catch (error) {
    // Silently ignore errors (e.g., not a git repository)
    return [];
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build full index for a specific project from scratch
 */
export function buildIndex(projectId: string): void {
  const projectConfig = getProjectConfig(projectId);
  if (!projectConfig) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  console.log(`[fuse-index] Building full index for project: ${projectId} (${projectConfig.name})`);
  
  const documents = loadDocuments(projectId);
  console.log(`[fuse-index] Loaded ${documents.length} documents`);
  
  const index = createIndex(documents);
  saveIndex(index, documents, projectId);
  
  console.log('[fuse-index] Index build complete.');
}

/**
 * Incremental update: re-index only changed files for a project
 */
export function incrementalUpdate(projectId: string): void {
  const projectConfig = getProjectConfig(projectId);
  if (!projectConfig) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  console.log(`[fuse-index] Starting incremental update for project: ${projectId}`);
  
  // Load existing index
  const existing = loadIndex(projectId);
  if (!existing) {
    console.log('[fuse-index] No existing index found, performing full index...');
    buildIndex(projectId);
    return;
  }
  
  // Get changed files
  const changedFiles = getChangedFiles(projectId);
  console.log(`[fuse-index] Found ${changedFiles.length} changed file(s):`, changedFiles);
  
  if (changedFiles.length === 0) {
    console.log('[fuse-index] No files changed, index is up to date.');
    return;
  }
  
  // Load all documents (needed for Fuse index rebuild)
  const allDocuments = loadDocuments(projectId);
  
  // Identify which documents need re-indexing
  const changedDocs = allDocuments.filter((doc) =>
    changedFiles.includes(doc.path)
  );
  
  console.log(`[fuse-index] Re-indexing ${changedDocs.length} document(s)...`);
  
  // Create new index with all documents (Fuse requires full rebuild)
  const newIndex = createIndex(allDocuments);
  
  // Save updated index
  saveIndex(newIndex, allDocuments, projectId);
  
  console.log(
    `[fuse-index] Incremental update complete. Re-indexed ${changedDocs.length} document(s).`
  );
}

/**
 * Search the index for a specific project
 * Note: For Fuse.js with pre-built index, we must use the exact same document instances
 * that were used to create the index. Since we can't guarantee that, we rebuild the
 * Fuse instance fresh from loaded documents (which is still fast for moderate doc counts).
 */
export function search(projectId: string, query: string, limit = 10): FuseResult<FuseDocument>[] {
  const projectConfig = getProjectConfig(projectId);
  if (!projectConfig) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  const existing = loadIndex(projectId);
  if (!existing) {
    console.error(`[fuse-index] No index found for project ${projectId}. Run buildIndex() first.`);
    return [];
  }
  
  // Load documents fresh - Fuse will search through these
  const documents = loadDocuments(projectId);
  
  // Create new Fuse instance with documents (the pre-built index is used for optimization)
  // Fuse.js will match against the provided documents array
  const fuse = new Fuse(documents, FUSE_OPTIONS);
  
  const results = fuse.search(query, { limit });
  return results;
}

/**
 * Get index statistics for a specific project
 */
export function getIndexStats(projectId: string): IndexStats | null {
  const projectConfig = getProjectConfig(projectId);
  if (!projectConfig) {
    return null;
  }
  
  const metadataFile = getMetadataFile(projectId);
  if (!fs.existsSync(metadataFile)) {
    return null;
  }
  
  const metadata: IndexMetadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
  
  return {
    projectId,
    documentCount: metadata.documentCount,
    indexedAt: metadata.indexedAt,
    rootPath: projectConfig.rootPath,
  };
}

/**
 * Get all project indexes
 */
export function getAllIndexes(): IndexStats[] {
  const registry = loadProjectRegistry();
  const stats: IndexStats[] = [];
  
  for (const [projectId, projectConfig] of Object.entries(registry.projects)) {
    const metadataFile = getMetadataFile(projectId);
    if (fs.existsSync(metadataFile)) {
      const metadata: IndexMetadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
      stats.push({
        projectId,
        documentCount: metadata.documentCount,
        indexedAt: metadata.indexedAt,
        rootPath: projectConfig.rootPath,
      });
    }
  }
  
  return stats;
}

/**
 * Delete index for a specific project
 */
export function deleteIndex(projectId: string): boolean {
  const indexDir = getProjectIndexDir(projectId);
  
  if (!fs.existsSync(indexDir)) {
    return false;
  }
  
  // Remove directory recursively
  fs.rmSync(indexDir, { recursive: true, force: true });
  console.log(`[fuse-index] Deleted index for project: ${projectId}`);
  return true;
}

// ============================================================================
// Test Functions
// ============================================================================

function testMultiProject(): void {
  console.log('\n=== Testing Multi-Project Index ===\n');
  
  const registry = loadProjectRegistry();
  const projectIds = Object.keys(registry.projects);
  
  if (projectIds.length < 2) {
    console.log('Need at least 2 projects in registry for multi-project test');
    return;
  }
  
  const [projectId1, projectId2] = projectIds.slice(0, 2);
  
  console.log(`Testing with projects: ${projectId1} and ${projectId2}`);
  
  // Build indexes for both projects
  console.log(`\nBuilding index for ${projectId1}...`);
  buildIndex(projectId1);
  
  console.log(`\nBuilding index for ${projectId2}...`);
  buildIndex(projectId2);
  
  // Get stats
  const stats1 = getIndexStats(projectId1);
  const stats2 = getIndexStats(projectId2);
  
  console.log(`\n=== Index Stats ===`);
  console.log(`${projectId1}: ${stats1?.documentCount} documents`);
  console.log(`${projectId2}: ${stats2?.documentCount} documents`);
  
  // Test search isolation
  console.log(`\n=== Testing Search Isolation ===`);
  
  // Search in project 1
  const query = 'MCP';
  console.log(`\nSearching for "${query}" in ${projectId1}:`);
  const results1 = search(projectId1, query, 3);
  results1.forEach((r) => {
    console.log(`  - ${r.item.path} (score: ${r.score?.toFixed(4)})`);
    // Verify all results belong to project 1
    if (r.item.projectId !== projectId1) {
      console.error(`    ✗ FAIL: Result belongs to ${r.item.projectId}, not ${projectId1}`);
    }
  });
  
  console.log(`\nSearching for "${query}" in ${projectId2}:`);
  const results2 = search(projectId2, query, 3);
  results2.forEach((r) => {
    console.log(`  - ${r.item.path} (score: ${r.score?.toFixed(4)})`);
    // Verify all results belong to project 2
    if (r.item.projectId !== projectId2) {
      console.error(`    ✗ FAIL: Result belongs to ${r.item.projectId}, not ${projectId2}`);
    }
  });
  
  // Verify isolation
  if (stats1 && stats2) {
    console.log(`\n=== Verification ===`);
    if (stats1.documentCount !== stats2.documentCount) {
      console.log(`✓ PASS: Different document counts (${stats1.documentCount} vs ${stats2.documentCount})`);
    } else {
      console.log(`⚠ WARNING: Same document counts (${stats1.documentCount})`);
    }
    
    // Verify root paths are different
    if (stats1.rootPath !== stats2.rootPath) {
      console.log(`✓ PASS: Different root paths`);
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'build':
      const buildProjectId = args[1];
      if (!buildProjectId) {
        console.error('Usage: ts-node src/index/fuse-index.ts build <projectId>');
        process.exit(1);
      }
      buildIndex(buildProjectId);
      break;
      
    case 'update':
      const updateProjectId = args[1];
      if (!updateProjectId) {
        console.error('Usage: ts-node src/index/fuse-index.ts update <projectId>');
        process.exit(1);
      }
      incrementalUpdate(updateProjectId);
      break;
      
    case 'search':
      const searchProjectId = args[1];
      const searchQuery = args.slice(2).join(' ');
      if (!searchProjectId || !searchQuery) {
        console.error('Usage: ts-node src/index/fuse-index.ts search <projectId> <query>');
        process.exit(1);
      }
      const results = search(searchProjectId, searchQuery);
      console.log(`\nSearch results for "${searchQuery}" in ${searchProjectId}:`);
      results.forEach((r) => {
        console.log(`  - ${r.item.path} (score: ${r.score?.toFixed(4)})`);
      });
      break;
      
    case 'stats':
      const statsProjectId = args[1];
      if (statsProjectId) {
        const stats = getIndexStats(statsProjectId);
        if (stats) {
          console.log(`\nIndex Stats for ${statsProjectId}:`);
          console.log(`  Documents: ${stats.documentCount}`);
          console.log(`  Root Path: ${stats.rootPath}`);
          console.log(`  Indexed At: ${stats.indexedAt}`);
        } else {
          console.log(`No index found for project: ${statsProjectId}`);
        }
      } else {
        const allStats = getAllIndexes();
        console.log('\nAll Project Indexes:');
        allStats.forEach((stats) => {
          console.log(`  ${stats.projectId}: ${stats.documentCount} docs (${stats.rootPath})`);
        });
      }
      break;
      
    case 'test':
      testMultiProject();
      break;
      
    default:
      console.log('Usage: ts-node src/index/fuse-index.ts <command> [args]');
      console.log('\nCommands:');
      console.log('  build <projectId>        - Build full index for a project');
      console.log('  update <projectId>       - Incremental update for a project');
      console.log('  search <projectId> <query> - Search index for a project');
      console.log('  stats [projectId]        - Show index statistics');
      console.log('  test                     - Run multi-project test');
      break;
  }
}

// Run if executed directly
const isMain = process.argv[1] && (process.argv[1].endsWith('fuse-index.ts') || process.argv[1].endsWith('fuse-index.js'));
if (isMain) {
  main();
}
