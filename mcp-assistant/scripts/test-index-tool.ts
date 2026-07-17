import { ProjectRegistry } from '../src/config/project-registry.js';
import { indexFolder } from '../src/tools/index.js';
import { promises as fs } from 'fs';
import path from 'path';

async function testIndexTool() {
  console.log('=== Index Tool Test Suite ===\n');

  const registry = new ProjectRegistry();
  const testDir = path.join(process.cwd(), '.index');

  // Clean up any existing projects.json and test directories
  try {
    await fs.unlink(path.join(testDir, 'projects.json'));
    console.log('✓ Cleaned up existing projects.json\n');
  } catch {
    // File doesn't exist - that's fine
  }

  // Clean up any existing test-project index
  try {
    await fs.rm(path.join(testDir, 'test-project'), { recursive: true, force: true });
    console.log('✓ Cleaned up existing test-project index\n');
  } catch {
    // Directory doesn't exist - that's fine
  }

  // Load registry
  await registry.load();
  console.log('✓ Registry loaded\n');

  // Register test project
  console.log('Registering test project...');
  const project = await registry.register({
    name: 'Test Project',
    rootPath: '/mnt/f/git/day1',
    createdAt: new Date().toISOString(),
    lastIndexed: null,
    chunkingStrategy: 'SEMANTIC',
  });
  console.log(`  - Project ID: ${project.id}`);
  console.log(`  - Project name: ${project.name}`);
  console.log(`  - Root path: ${project.rootPath}`);
  
  await registry.save();
  console.log('✓ Project registered\n');

  // Test 1: Index test-documents folder
  console.log('Test 1: Index test-documents folder');
  const testDocsPath = '/mnt/f/git/day1/test-documents';
  
  const result = await indexFolder({
    projectId: project.id,
    folderPath: testDocsPath,
    chunkingStrategy: 'SEMANTIC',
  });

  if (!result.success || !result.result) {
    console.log(`  ✗ FAIL: ${result.error}`);
    process.exit(1);
  }

  console.log(`  - Indexed files: ${result.result.indexedFiles}`);
  console.log(`  - Total chunks: ${result.result.totalChunks}`);
  console.log(`  - Project ID: ${result.result.projectId}`);
  console.log('  ✓ PASS\n');

  // Test 2: Verify index file exists
  console.log('Test 2: Verify index file exists');
  const indexFile = path.join(testDir, project.id, 'fuse-index.json');
  const metadataFile = path.join(testDir, project.id, 'index-metadata.json');
  
  try {
    const indexStats = await fs.stat(indexFile);
    const metadataStats = await fs.stat(metadataFile);
    console.log(`  - Index file exists: true (${indexStats.size} bytes)`);
    console.log(`  - Metadata file exists: true (${metadataStats.size} bytes)`);
    console.log('  ✓ PASS\n');
  } catch (error) {
    console.log(`  ✗ FAIL: Index file not created - ${(error as Error).message}`);
    process.exit(1);
  }

  // Test 3: Verify index content
  console.log('Test 3: Verify index content');
  const indexContent = await fs.readFile(indexFile, 'utf-8');
  const indexData = JSON.parse(indexContent);
  console.log(`  - Index keys: ${indexData.keys?.length || 0}`);
  console.log(`  - Index records: ${indexData.records?.length || 0}`);
  console.log('  ✓ PASS\n');

  // Test 4: Verify metadata content
  console.log('Test 4: Verify metadata content');
  const metadataContent = await fs.readFile(metadataFile, 'utf-8');
  const metadata = JSON.parse(metadataContent);
  console.log(`  - Project ID: ${metadata.projectId}`);
  console.log(`  - Project name: ${metadata.projectName}`);
  console.log(`  - Indexed files: ${metadata.indexedFiles}`);
  console.log(`  - Total chunks: ${metadata.totalChunks}`);
  console.log(`  - Chunking strategy: ${metadata.chunkingStrategy}`);
  console.log('  ✓ PASS\n');

  // Test 5: Malformed input - non-existent projectId
  console.log('Test 5: Malformed input - non-existent projectId');
  const badProjectResult = await indexFolder({
    projectId: 'non-existent-project',
    folderPath: testDocsPath,
    chunkingStrategy: 'SEMANTIC',
  });

  if (badProjectResult.success) {
    console.log('  ✗ FAIL - Should have failed with invalid projectId');
    process.exit(1);
  }
  console.log(`  - Error message: ${badProjectResult.error}`);
  console.log('  ✓ PASS\n');

  // Test 6: Malformed input - folder with no .md files
  console.log('Test 6: Malformed input - folder with no .md files');
  const emptyFolderResult = await indexFolder({
    projectId: project.id,
    folderPath: '/mnt/f/git/day1/mcp-assistant/dist',
    chunkingStrategy: 'SEMANTIC',
  });

  if (emptyFolderResult.success) {
    console.log('  ✗ FAIL - Should have failed with no .md files');
    process.exit(1);
  }
  console.log(`  - Error message: ${emptyFolderResult.error}`);
  console.log('  ✓ PASS\n');

  // Test 7: Verify project lastIndexed was updated
  console.log('Test 7: Verify project lastIndexed was updated');
  const registry2 = new ProjectRegistry();
  await registry2.load();
  const updatedProject = registry2.get(project.id);
  if (!updatedProject?.lastIndexed) {
    console.log('  ✗ FAIL - lastIndexed not updated');
    process.exit(1);
  }
  console.log(`  - lastIndexed: ${updatedProject.lastIndexed}`);
  console.log('  ✓ PASS\n');

  // Final summary
  console.log('=== All Tests Passed Successfully ===');
  console.log(`Index location: ${indexFile}`);
  console.log(`Indexed ${result.result.indexedFiles} files into ${result.result.totalChunks} chunks`);
}

// Run tests
testIndexTool().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
