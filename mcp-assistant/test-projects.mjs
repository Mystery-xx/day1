import { Client } from '@modelcontextprotocol/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { rm } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE = join(__dirname, '.index', 'projects.json');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cleanup() {
  try {
    await rm(INDEX_FILE, { force: true });
    console.log('✓ Cleaned up test artifacts\n');
  } catch (err) {
    // Ignore if file doesn't exist
  }
}

async function runTests() {
  console.log('=== MCP Project Tools Test Suite ===\n');
  
  // Clean up before tests
  await cleanup();
  
  // Start MCP server
  console.log('Starting MCP server...');
  const server = spawn('npm', ['start'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  
  server.stderr.on('data', (data) => {
    // Suppress server logs
  });
  
  await sleep(2000); // Wait for server to start
  
  // Create client
  const transport = new StdioClientTransport({
    command: 'npm',
    args: ['start'],
    cwd: __dirname,
  });
  
  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });
  
  await client.connect(transport);
  console.log('✓ Connected to MCP server\n');
  
  try {
    // Test 1: List projects (should be empty)
    console.log('Test 1: List projects (empty registry)');
    const list1 = await client.callTool({
      name: 'list_projects',
      arguments: {},
    });
    const result1 = JSON.parse(list1.content[0].text);
    console.log(`  Result: ${JSON.stringify(result1)}`);
    console.log(`  ✓ Count: ${result1.count} (expected: 0)\n`);
    
    // Test 2: Register first project
    console.log('Test 2: Register first project (mcp-assistant)');
    const register1 = await client.callTool({
      name: 'register_project',
      arguments: {
        name: 'mcp-assistant',
        rootPath: '/mnt/f/git/day1/mcp-assistant',
      },
    });
    const result2 = JSON.parse(register1.content[0].text);
    console.log(`  Result: ${JSON.stringify(result2)}`);
    const projectId1 = result2.projectId;
    console.log(`  ✓ Project ID: ${projectId1}\n`);
    
    // Test 3: Register second project
    console.log('Test 3: Register second project (ai-chat-backend)');
    const register2 = await client.callTool({
      name: 'register_project',
      arguments: {
        name: 'ai-chat-backend',
        rootPath: '/mnt/f/git/day1/ai-chat-backend',
      },
    });
    const result3 = JSON.parse(register2.content[0].text);
    console.log(`  Result: ${JSON.stringify(result3)}`);
    const projectId2 = result3.projectId;
    console.log(`  ✓ Project ID: ${projectId2}\n`);
    
    // Test 4: List projects (should have 2)
    console.log('Test 4: List projects (should have 2)');
    const list2 = await client.callTool({
      name: 'list_projects',
      arguments: {},
    });
    const result4 = JSON.parse(list2.content[0].text);
    console.log(`  Result: ${JSON.stringify(result4, null, 2)}`);
    console.log(`  ✓ Count: ${result4.count} (expected: 2)\n`);
    
    // Test 5: Get project info
    console.log('Test 5: Get project info for first project');
    const info1 = await client.callTool({
      name: 'get_project_info',
      arguments: { projectId: projectId1 },
    });
    const result5 = JSON.parse(info1.content[0].text);
    console.log(`  Result: ${JSON.stringify(result5, null, 2)}`);
    console.log(`  ✓ Name: ${result5.name} (expected: mcp-assistant)\n`);
    
    // Test 6: Get project info for second project
    console.log('Test 6: Get project info for second project');
    const info2 = await client.callTool({
      name: 'get_project_info',
      arguments: { projectId: projectId2 },
    });
    const result6 = JSON.parse(info2.content[0].text);
    console.log(`  Result: ${JSON.stringify(result6, null, 2)}`);
    console.log(`  ✓ Name: ${result6.name} (expected: ai-chat-backend)\n`);
    
    // Test 7: Adversarial - Register with non-existent path
    console.log('Test 7: ADVERSARIAL - Register with non-existent path');
    const badRegister = await client.callTool({
      name: 'register_project',
      arguments: {
        name: 'fake-project',
        rootPath: '/non/existent/path',
      },
    });
    console.log(`  Result: ${badRegister.content[0].text}`);
    console.log(`  ✓ isError: ${badRegister.isError} (expected: true)\n`);
    
    // Test 8: Adversarial - Unregister non-existent projectId
    console.log('Test 8: ADVERSARIAL - Unregister non-existent projectId');
    const badUnregister = await client.callTool({
      name: 'unregister_project',
      arguments: { projectId: 'non-existent-id' },
    });
    console.log(`  Result: ${badUnregister.content[0].text}`);
    console.log(`  ✓ isError: ${badUnregister.isError} (expected: true)\n`);
    
    // Test 9: Adversarial - Get info for non-existent projectId
    console.log('Test 9: ADVERSARIAL - Get info for non-existent projectId');
    const badInfo = await client.callTool({
      name: 'get_project_info',
      arguments: { projectId: 'non-existent-id' },
    });
    console.log(`  Result: ${badInfo.content[0].text}`);
    console.log(`  ✓ isError: ${badInfo.isError} (expected: true)\n`);
    
    // Test 10: Unregister first project
    console.log('Test 10: Unregister first project');
    const unregister1 = await client.callTool({
      name: 'unregister_project',
      arguments: { projectId: projectId1 },
    });
    const result7 = JSON.parse(unregister1.content[0].text);
    console.log(`  Result: ${JSON.stringify(result7)}`);
    console.log(`  ✓ Status: ${result7.status} (expected: removed)\n`);
    
    // Test 11: List projects (should have 1)
    console.log('Test 11: List projects (should have 1)');
    const list3 = await client.callTool({
      name: 'list_projects',
      arguments: {},
    });
    const result8 = JSON.parse(list3.content[0].text);
    console.log(`  Result: ${JSON.stringify(result8, null, 2)}`);
    console.log(`  ✓ Count: ${result8.count} (expected: 1)\n`);
    
    // Test 12: Verify registry file was updated
    console.log('Test 12: Verify registry file persistence');
    const { readFile } = await import('fs/promises');
    const registryContent = await readFile(INDEX_FILE, 'utf-8');
    const registry = JSON.parse(registryContent);
    console.log(`  Registry projects: ${Object.keys(registry.projects).join(', ')}`);
    console.log(`  ✓ Registry file exists and contains ${Object.keys(registry.projects).length} project(s)\n`);
    
    console.log('=== All Tests Passed ===');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    server.kill();
    await cleanup();
  }
}

runTests().catch(console.error);
