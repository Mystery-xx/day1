#!/usr/bin/env tsx
/**
 * Project Management Tools Test Script
 * Tests all 4 project tools with adversarial QA
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = '/mnt/f/git/day1';
const MCP_SERVER_PATH = path.join(REPO_ROOT, 'mcp-assistant', 'dist', 'index.js');
const INDEX_FILE = path.join(REPO_ROOT, 'mcp-assistant', '.index', 'projects.json');

interface TestResult {
  tool: string;
  passed: boolean;
  output?: string;
  error?: string;
}

const results: TestResult[] = [];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanup() {
  try {
    await fs.unlink(INDEX_FILE);
    log('✓ Cleaned up test artifacts\n');
  } catch {
    // File doesn't exist - that's fine
  }
}

async function testListProjects(client: Client, expectedCount: number): Promise<TestResult> {
  try {
    const result = await client.callTool({
      name: 'list_projects',
      arguments: {},
    });

    const text = (result.content as Array<{ text: string }>)?.[0]?.text || '';
    const parsed = JSON.parse(text);

    const passed = parsed.count === expectedCount && Array.isArray(parsed.projects);

    return {
      tool: 'list_projects',
      passed,
      output: `Count: ${parsed.count} (expected: ${expectedCount})`,
    };
  } catch (error) {
    return {
      tool: 'list_projects',
      passed: false,
      error: (error as Error).message,
    };
  }
}

async function testRegisterProject(
  client: Client,
  name: string,
  rootPath: string
): Promise<TestResult> {
  try {
    const result = await client.callTool({
      name: 'register_project',
      arguments: {
        name,
        rootPath,
      },
    });

    const text = (result.content as Array<{ text: string }>)?.[0]?.text || '';
    const parsed = JSON.parse(text);

    const passed = parsed.status === 'registered' && parsed.projectId;

    return {
      tool: 'register_project',
      passed,
      output: `Project ID: ${parsed.projectId}`,
    };
  } catch (error) {
    return {
      tool: 'register_project',
      passed: false,
      error: (error as Error).message,
    };
  }
}

async function testGetProjectInfo(client: Client, projectId: string): Promise<TestResult> {
  try {
    const result = await client.callTool({
      name: 'get_project_info',
      arguments: { projectId },
    });

    const text = (result.content as Array<{ text: string }>)?.[0]?.text || '';
    const parsed = JSON.parse(text);

    const passed = parsed.status === 'found' && parsed.id === projectId;

    return {
      tool: 'get_project_info',
      passed,
      output: `Name: ${parsed.name}, Root: ${parsed.rootPath}`,
    };
  } catch (error) {
    return {
      tool: 'get_project_info',
      passed: false,
      error: (error as Error).message,
    };
  }
}

async function testUnregisterProject(client: Client, projectId: string): Promise<TestResult> {
  try {
    const result = await client.callTool({
      name: 'unregister_project',
      arguments: { projectId },
    });

    const text = (result.content as Array<{ text: string }>)?.[0]?.text || '';
    const parsed = JSON.parse(text);

    const passed = parsed.status === 'removed';

    return {
      tool: 'unregister_project',
      passed,
      output: `Status: ${parsed.status}`,
    };
  } catch (error) {
    return {
      tool: 'unregister_project',
      passed: false,
      error: (error as Error).message,
    };
  }
}

async function testAdversarialNonExistentPath(client: Client): Promise<TestResult> {
  try {
    const result = await client.callTool({
      name: 'register_project',
      arguments: {
        name: 'fake-project',
        rootPath: '/non/existent/path',
      },
    });

    const passed = result.isError === true;

    return {
      tool: 'adversarial_bad_path',
      passed,
      output: result.isError ? 'Correctly rejected bad path' : 'Should have errored',
    };
  } catch (error) {
    return {
      tool: 'adversarial_bad_path',
      passed: false,
      error: (error as Error).message,
    };
  }
}

async function testAdversarialNonExistentProjectId(client: Client, action: string): Promise<TestResult> {
  try {
    const result = await client.callTool({
      name: action === 'unregister' ? 'unregister_project' : 'get_project_info',
      arguments: { projectId: 'non-existent-id' },
    });

    const passed = result.isError === true;

    return {
      tool: `adversarial_bad_${action}`,
      passed,
      output: result.isError ? `Correctly rejected bad ${action}` : `Should have errored on ${action}`,
    };
  } catch (error) {
    return {
      tool: `adversarial_bad_${action}`,
      passed: false,
      error: (error as Error).message,
    };
  }
}

async function testRegistryFilePersistence(): Promise<TestResult> {
  try {
    const content = await fs.readFile(INDEX_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    const projectCount = Object.keys(parsed.projects).length;

    return {
      tool: 'registry_persistence',
      passed: projectCount >= 0,
      output: `Registry contains ${projectCount} project(s)`,
    };
  } catch (error) {
    return {
      tool: 'registry_persistence',
      passed: false,
      error: (error as Error).message,
    };
  }
}

async function runTests(): Promise<void> {
  log('='.repeat(60), colors.cyan);
  log('Project Management Tools Test Suite', colors.cyan);
  log('='.repeat(60), colors.cyan);
  log('');

  // Clean up before tests
  await cleanup();

  // Build the MCP server first
  log('Building MCP server...', colors.blue);
  const { spawn } = await import('child_process');
  await new Promise<void>((resolve, reject) => {
    const build = spawn('npm', ['run', 'build'], {
      cwd: path.join(REPO_ROOT, 'mcp-assistant'),
      stdio: 'inherit',
    });

    build.on('close', (code: number) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build failed with code ${code}`));
      }
    });
  });
  log('Build complete!\n', colors.green);

  // Start MCP server
  log('Starting MCP server...', colors.blue);
  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_SERVER_PATH],
  });

  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });

  await client.connect(transport);
  log('MCP server connected!\n', colors.green);

  try {
    // Test 1: List projects (empty registry)
    log('Test 1: List projects (empty registry)', colors.blue);
    const result1 = await testListProjects(client, 0);
    results.push(result1);
    log(result1.passed ? `  ✓ PASS - ${result1.output}` : `  ✗ FAIL - ${result1.error}`, result1.passed ? colors.green : colors.red);
    log('');

    // Test 2: Register first project
    log('Test 2: Register first project (mcp-assistant)', colors.blue);
    const result2 = await testRegisterProject(client, 'mcp-assistant', '/mnt/f/git/day1/mcp-assistant');
    results.push(result2);
    log(result2.passed ? `  ✓ PASS - ${result2.output}` : `  ✗ FAIL - ${result2.error}`, result2.passed ? colors.green : colors.red);
    const projectId1 = result2.output?.replace('Project ID: ', '') || '';
    log('');

    // Test 3: Register second project
    log('Test 3: Register second project (ai-chat-backend)', colors.blue);
    const result3 = await testRegisterProject(client, 'ai-chat-backend', '/mnt/f/git/day1/ai-chat-backend');
    results.push(result3);
    log(result3.passed ? `  ✓ PASS - ${result3.output}` : `  ✗ FAIL - ${result3.error}`, result3.passed ? colors.green : colors.red);
    const projectId2 = result3.output?.replace('Project ID: ', '') || '';
    log('');

    // Test 4: List projects (should have 2)
    log('Test 4: List projects (should have 2)', colors.blue);
    const result4 = await testListProjects(client, 2);
    results.push(result4);
    log(result4.passed ? `  ✓ PASS - ${result4.output}` : `  ✗ FAIL - ${result4.error}`, result4.passed ? colors.green : colors.red);
    log('');

    // Test 5: Get project info for first project
    log('Test 5: Get project info for first project', colors.blue);
    const result5 = await testGetProjectInfo(client, projectId1);
    results.push(result5);
    log(result5.passed ? `  ✓ PASS - ${result5.output}` : `  ✗ FAIL - ${result5.error}`, result5.passed ? colors.green : colors.red);
    log('');

    // Test 6: Get project info for second project
    log('Test 6: Get project info for second project', colors.blue);
    const result6 = await testGetProjectInfo(client, projectId2);
    results.push(result6);
    log(result6.passed ? `  ✓ PASS - ${result6.output}` : `  ✗ FAIL - ${result6.error}`, result6.passed ? colors.green : colors.red);
    log('');

    // Test 7: Adversarial - Register with non-existent path
    log('Test 7: ADVERSARIAL - Register with non-existent path', colors.blue);
    const result7 = await testAdversarialNonExistentPath(client);
    results.push(result7);
    log(result7.passed ? `  ✓ PASS - ${result7.output}` : `  ✗ FAIL - ${result7.error}`, result7.passed ? colors.green : colors.red);
    log('');

    // Test 8: Adversarial - Unregister non-existent projectId
    log('Test 8: ADVERSARIAL - Unregister non-existent projectId', colors.blue);
    const result8 = await testAdversarialNonExistentProjectId(client, 'unregister');
    results.push(result8);
    log(result8.passed ? `  ✓ PASS - ${result8.output}` : `  ✗ FAIL - ${result8.error}`, result8.passed ? colors.green : colors.red);
    log('');

    // Test 9: Adversarial - Get info for non-existent projectId
    log('Test 9: ADVERSARIAL - Get info for non-existent projectId', colors.blue);
    const result9 = await testAdversarialNonExistentProjectId(client, 'get');
    results.push(result9);
    log(result9.passed ? `  ✓ PASS - ${result9.output}` : `  ✗ FAIL - ${result9.error}`, result9.passed ? colors.green : colors.red);
    log('');

    // Test 10: Unregister first project
    log('Test 10: Unregister first project', colors.blue);
    const result10 = await testUnregisterProject(client, projectId1);
    results.push(result10);
    log(result10.passed ? `  ✓ PASS - ${result10.output}` : `  ✗ FAIL - ${result10.error}`, result10.passed ? colors.green : colors.red);
    log('');

    // Test 11: List projects (should have 1)
    log('Test 11: List projects (should have 1)', colors.blue);
    const result11 = await testListProjects(client, 1);
    results.push(result11);
    log(result11.passed ? `  ✓ PASS - ${result11.output}` : `  ✗ FAIL - ${result11.error}`, result11.passed ? colors.green : colors.red);
    log('');

    // Test 12: Verify registry file persistence
    log('Test 12: Verify registry file persistence', colors.blue);
    const result12 = await testRegistryFilePersistence();
    results.push(result12);
    log(result12.passed ? `  ✓ PASS - ${result12.output}` : `  ✗ FAIL - ${result12.error}`, result12.passed ? colors.green : colors.red);
    log('');

    // Summary
    log('='.repeat(60), colors.cyan);
    log('Test Summary', colors.cyan);
    log('='.repeat(60), colors.cyan);

    const passed = results.filter((r) => r.passed).length;
    const total = results.length;

    log(`Passed: ${passed}/${total}`, colors.green);
    log('');

    // Print detailed results
    for (const result of results) {
      log(`${result.tool}:`, colors.yellow);
      if (result.passed) {
        log(`  Output: ${result.output || 'N/A'}`, colors.green);
      } else {
        log(`  Error: ${result.error || 'Unknown error'}`, colors.red);
      }
    }

    log('');

    if (passed === total) {
      log('All tests passed!', colors.green);
      await cleanup();
      process.exit(0);
    } else {
      log(`${total - passed} test(s) failed`, colors.red);
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}

runTests().catch((error) => {
  log(`Fatal error: ${error.message}`, colors.red);
  process.exit(1);
});
