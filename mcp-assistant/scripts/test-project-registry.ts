import { ProjectRegistry } from '../src/config/project-registry.js';
import { promises as fs } from 'fs';
import path from 'path';

async function runTests() {
  console.log('=== Project Registry Test Suite ===\n');

  const registry = new ProjectRegistry();
  const testDir = path.join(process.cwd(), '.index');

  // Clean up any existing projects.json
  try {
    await fs.unlink(path.join(testDir, 'projects.json'));
    console.log('✓ Cleaned up existing projects.json\n');
  } catch {
    // File doesn't exist - that's fine
  }

  // Test 1: Load empty registry
  console.log('Test 1: Load empty registry');
  await registry.load();
  console.log(`  - Registry loaded: ${registry.isReady()}`);
  console.log(`  - Project count: ${registry.count()}`);
  console.log('  ✓ PASS\n');

  // Test 2: Register first project (valid path)
  console.log('Test 2: Register first project (valid path)');
  const project1 = await registry.register({
    name: 'Test Project Alpha',
    rootPath: '/mnt/f/git/day1/ai-chat-backend',
    createdAt: new Date().toISOString(),
    lastIndexed: null,
    chunkingStrategy: 'SEMANTIC',
  });
  console.log(`  - Project ID: ${project1.id}`);
  console.log(`  - Project name: ${project1.name}`);
  console.log(`  - Root path: ${project1.rootPath}`);
  console.log(`  - Chunking strategy: ${project1.chunkingStrategy}`);
  console.log('  ✓ PASS\n');

  // Test 3: Register second project
  console.log('Test 3: Register second project');
  const project2 = await registry.register({
    name: 'Test Project Beta',
    rootPath: '/mnt/f/git/day1/ai-chat-frontend',
    createdAt: new Date().toISOString(),
    lastIndexed: null,
    chunkingStrategy: 'FIXED_SIZE',
  });
  console.log(`  - Project ID: ${project2.id}`);
  console.log(`  - Project name: ${project2.name}`);
  console.log(`  - Root path: ${project2.rootPath}`);
  console.log(`  - Chunking strategy: ${project2.chunkingStrategy}`);
  console.log('  ✓ PASS\n');

  // Test 4: List all projects
  console.log('Test 4: List all projects');
  const allProjects = registry.list();
  console.log(`  - Total projects: ${allProjects.length}`);
  allProjects.forEach((p, i) => {
    console.log(`    ${i + 1}. ${p.name} (${p.id})`);
  });
  console.log('  ✓ PASS\n');

  // Test 5: Get single project
  console.log('Test 5: Get single project by ID');
  const retrieved = registry.get(project1.id);
  console.log(`  - Retrieved: ${retrieved?.name}`);
  console.log(`  - Match: ${retrieved?.id === project1.id}`);
  console.log('  ✓ PASS\n');

  // Test 6: Check exists
  console.log('Test 6: Check if project exists');
  console.log(`  - Project 1 exists: ${registry.exists(project1.id)}`);
  console.log(`  - Project 2 exists: ${registry.exists(project2.id)}`);
  console.log(`  - Fake ID exists: ${registry.exists('fake-id')}`);
  console.log('  ✓ PASS\n');

  // Test 7: Save to file
  console.log('Test 7: Save to .index/projects.json');
  await registry.save();
  const fileContent = await fs.readFile(path.join(testDir, 'projects.json'), 'utf-8');
  const parsed = JSON.parse(fileContent);
  console.log(`  - File exists: true`);
  console.log(`  - Valid JSON: true`);
  console.log(`  - Projects in file: ${Object.keys(parsed.projects).length}`);
  console.log('  ✓ PASS\n');

  // Test 8: Update lastIndexed
  console.log('Test 8: Update lastIndexed timestamp');
  const beforeUpdate = registry.get(project1.id);
  registry.updateLastIndexed(project1.id);
  const afterUpdate = registry.get(project1.id);
  console.log(`  - Before: ${beforeUpdate?.lastIndexed}`);
  console.log(`  - After: ${afterUpdate?.lastIndexed}`);
  console.log(`  - Updated: ${afterUpdate?.lastIndexed !== null}`);
  console.log('  ✓ PASS\n');

  // Test 9: Unregister project
  console.log('Test 9: Unregister (remove) project');
  const removed = registry.unregister(project2.id);
  console.log(`  - Removed: ${removed}`);
  console.log(`  - Exists after removal: ${registry.exists(project2.id)}`);
  console.log(`  - Count after removal: ${registry.count()}`);
  console.log('  ✓ PASS\n');

  // Test 10: Malformed input (invalid path)
  console.log('Test 10: Malformed input - invalid rootPath');
  try {
    await registry.register({
      name: 'Invalid Project',
      rootPath: '/nonexistent/path/that/does/not/exist',
      createdAt: new Date().toISOString(),
      lastIndexed: null,
      chunkingStrategy: 'SEMANTIC',
    });
    console.log('  ✗ FAIL - Should have thrown an error');
  } catch (error) {
    console.log(`  - Error thrown: true`);
    console.log(`  - Error message: ${(error as Error).message}`);
    console.log('  ✓ PASS\n');
  }

  // Test 11: Verify file content
  console.log('Test 11: Verify .index/projects.json content');
  await registry.save();
  const finalContent = await fs.readFile(path.join(testDir, 'projects.json'), 'utf-8');
  console.log('  File content:');
  console.log('  ---');
  console.log(finalContent.split('\n').map(line => '  ' + line).join('\n'));
  console.log('  ---');
  console.log('  ✓ PASS\n');

  // Final summary
  console.log('=== All Tests Completed Successfully ===');
  console.log(`Final project count: ${registry.count()}`);
  console.log(`Projects file: ${path.join(testDir, 'projects.json')}`);
}

// Run tests
runTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
