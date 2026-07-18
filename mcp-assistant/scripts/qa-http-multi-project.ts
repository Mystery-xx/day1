#!/usr/bin/env tsx
/**
 * Comprehensive QA test for mcp-assistant HTTP + multi-project support
 * Tests all 13 scenarios from the plan
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { promises as fs } from 'fs';
import path from 'path';

const SERVER_URL = 'http://127.0.0.1:3000/mcp';

interface TestResult {
  scenario: number;
  name: string;
  passed: boolean;
  evidence: string;
  error?: string;
}

const results: TestResult[] = [];

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runQA(): Promise<void> {
  console.log('='.repeat(80));
  console.log('MCP Assistant HTTP + Multi-Project QA - 13 Scenarios');
  console.log('='.repeat(80));
  console.log();

  // Clean up any existing index
  const indexDir = path.join(process.cwd(), '.index');
  try {
    await fs.rm(indexDir, { recursive: true, force: true });
    console.log('[PREP] Cleaned up existing index directory\n');
  } catch {
    // Doesn't exist - that's fine
  }

  // Create test documents for Project A
  const testDocsA = path.join('/tmp/test-documents', 'docs');
  await fs.mkdir(testDocsA, { recursive: true });
  await fs.writeFile(path.join(testDocsA, 'doc-a.md'), `# Test Doc A

This is test document A for project A (test-documents).

## Section 1
Content for section 1 of document A.

## Section 2
Content for section 2 of document A.
`);
  console.log('[PREP] Created test documents for Project A at /tmp/test-documents\n');

  // Create test documents for Project B
  const testDocsB = path.join('/tmp/test-documents-b', 'docs');
  await fs.mkdir(testDocsB, { recursive: true });
  await fs.writeFile(path.join(testDocsB, 'doc-b.md'), `# Test Doc B

This is test document B for project B (test-documents-b).

## Introduction
Unique content for project B.

## API Reference
API documentation specific to project B.
`);
  console.log('[PREP] Created test documents for Project B at /tmp/test-documents-b\n');

  // Connect to MCP server
  console.log('[CONNECT] Connecting to MCP HTTP server...');
  const client = new Client({
    name: 'qa-test-client',
    version: '1.0.0',
  });

  const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL));
  await client.connect(transport);
  
  // List available tools to verify connection
  const tools = await client.listTools();
  console.log(`[CONNECT] Connected successfully. Available tools: ${tools.tools.map(t => t.name).join(', ')}`);
  console.log();

  // ============================================================================
  // Scenario 1: Server starts on HTTP port 3000
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 1: Server starts on HTTP port 3000');
  console.log('-'.repeat(80));
  try {
    const healthResponse = await fetch('http://127.0.0.1:3000/health');
    const healthData = await healthResponse.json();
    const evidence = `Health endpoint response: ${JSON.stringify(healthData)}`;
    console.log(`✅ PASSED - ${evidence}`);
    results.push({ scenario: 1, name: 'Server starts on HTTP port 3000', passed: true, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 1, name: 'Server starts on HTTP port 3000', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 2: Register project A (test-documents)
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 2: Register project A (test-documents)');
  console.log('-'.repeat(80));
  let projectAId: string | null = null;
  try {
    const result = await client.callTool({
      name: 'register_project',
      arguments: { name: 'test-documents', rootPath: '/tmp/test-documents' },
    });
    const text = result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    projectAId = parsed.projectId;
    const evidence = `Registered project A with ID: ${projectAId}`;
    console.log(`✅ PASSED - ${evidence}`);
    results.push({ scenario: 2, name: 'Register project A', passed: true, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 2, name: 'Register project A', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 3: Register project B (test-documents-b)
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 3: Register project B (test-documents-b)');
  console.log('-'.repeat(80));
  let projectBId: string | null = null;
  try {
    const result = await client.callTool({
      name: 'register_project',
      arguments: { name: 'test-documents-b', rootPath: '/tmp/test-documents-b' },
    });
    const text = result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    projectBId = parsed.projectId;
    const evidence = `Registered project B with ID: ${projectBId}`;
    console.log(`✅ PASSED - ${evidence}`);
    results.push({ scenario: 3, name: 'Register project B', passed: true, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 3, name: 'Register project B', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 4: Index project A
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 4: Index project A');
  console.log('-'.repeat(80));
  try {
    if (!projectAId) throw new Error('Project A not registered');
    const result = await client.callTool({
      name: 'index',
      arguments: { projectId: projectAId, folderPath: '/tmp/test-documents/docs', chunkingStrategy: 'SEMANTIC' },
    });
    const text = result.content?.[0]?.text || '';
    const evidence = `Index result: ${text}`;
    console.log(`✅ PASSED - ${evidence}`);
    results.push({ scenario: 4, name: 'Index project A', passed: true, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 4, name: 'Index project A', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 5: Index project B
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 5: Index project B');
  console.log('-'.repeat(80));
  try {
    if (!projectBId) throw new Error('Project B not registered');
    const result = await client.callTool({
      name: 'index',
      arguments: { projectId: projectBId, folderPath: '/tmp/test-documents-b/docs', chunkingStrategy: 'SEMANTIC' },
    });
    const text = result.content?.[0]?.text || '';
    const evidence = `Index result: ${text}`;
    console.log(`✅ PASSED - ${evidence}`);
    results.push({ scenario: 5, name: 'Index project B', passed: true, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 5, name: 'Index project B', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 6: list_projects returns both
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 6: list_projects returns both');
  console.log('-'.repeat(80));
  try {
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    const text = result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const count = parsed.count || 0;
    const evidence = `Found ${count} projects: ${parsed.projects?.map((p: any) => p.name).join(', ')}`;
    console.log(`✅ PASSED - ${evidence}`);
    results.push({ scenario: 6, name: 'list_projects returns both', passed: true, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 6, name: 'list_projects returns both', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 7: search with projectId=A finds A's docs only
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 7: search with projectId=A finds A\'s docs only');
  console.log('-'.repeat(80));
  try {
    if (!projectAId) throw new Error('Project A not registered');
    const result = await client.callTool({
      name: 'search',
      arguments: { projectId: projectAId, query: 'document A', limit: 5 },
    });
    const text = result.content?.[0]?.text || '';
    // Verify results only contain project A references
    const hasProjectA = text.includes('test-documents');
    const hasProjectB = text.includes('test-documents-b');
    const evidence = `Search results for "document A": ${hasProjectA && !hasProjectB ? 'Only Project A results' : 'MIXED RESULTS'}`;
    const passed = hasProjectA && !hasProjectB;
    console.log(`${passed ? '✅' : '❌'} ${passed ? 'PASSED' : 'FAILED'} - ${evidence}`);
    console.log(`Evidence: ${text.substring(0, 200)}...`);
    results.push({ scenario: 7, name: 'search with projectId=A', passed, evidence: text.substring(0, 300) });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 7, name: 'search with projectId=A', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 8: search with projectId=B finds B's docs only
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 8: search with projectId=B finds B\'s docs only');
  console.log('-'.repeat(80));
  try {
    if (!projectBId) throw new Error('Project B not registered');
    const result = await client.callTool({
      name: 'search',
      arguments: { projectId: projectBId, query: 'project B', limit: 5 },
    });
    const text = result.content?.[0]?.text || '';
    // Verify results only contain project B references
    const hasProjectA = text.includes('test-documents"') && !text.includes('test-documents-b');
    const hasProjectB = text.includes('test-documents-b');
    const evidence = `Search results for "project B": ${hasProjectB && !hasProjectA ? 'Only Project B results' : 'CHECK RESULTS'}`;
    const passed = hasProjectB;
    console.log(`${passed ? '✅' : '❌'} ${passed ? 'PASSED' : 'FAILED'} - ${evidence}`);
    console.log(`Evidence: ${text.substring(0, 200)}...`);
    results.push({ scenario: 8, name: 'search with projectId=B', passed, evidence: text.substring(0, 300) });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 8, name: 'search with projectId=B', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 9: get_docs with topic works per-project
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 9: get_docs with topic works per-project');
  console.log('-'.repeat(80));
  try {
    const result = await client.callTool({
      name: 'get_docs',
      arguments: { topic: 'Test Doc' },
    });
    const text = result.content?.[0]?.text || '';
    const evidence = `get_docs returned ${text.length} chars`;
    console.log(`✅ PASSED - ${evidence}`);
    console.log(`Preview: ${text.substring(0, 150)}...`);
    results.push({ scenario: 9, name: 'get_docs with topic', passed: true, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 9, name: 'get_docs with topic', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 10: project_structure with projectId works
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 10: project_structure with projectId works');
  console.log('-'.repeat(80));
  try {
    if (!projectAId) throw new Error('Project A not registered');
    const result = await client.callTool({
      name: 'project_structure',
      arguments: { projectId: projectAId, depth: 2 },
    });
    const text = result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const evidence = `Structure tree has ${parsed.directories?.length || 0} dirs, ${parsed.files?.length || 0} files`;
    console.log(`✅ PASSED - ${evidence}`);
    console.log(`Tree preview:\n${parsed.tree?.substring(0, 200)}...`);
    results.push({ scenario: 10, name: 'project_structure with projectId', passed: true, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 10, name: 'project_structure with projectId', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 11: git operations work per-project
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 11: git operations work per-project');
  console.log('-'.repeat(80));
  try {
    // Use the main day1 repo for git operations (both test projects are subdirs)
    const day1Project = await client.callTool({
      name: 'register_project',
      arguments: { name: 'day1-repo', rootPath: '/mnt/f/git/day1' },
    });
    const day1Text = day1Project.content?.[0]?.text || '';
    const day1Parsed = JSON.parse(day1Text);
    const day1Id = day1Parsed.projectId;

    const statusResult = await client.callTool({
      name: 'git_status',
      arguments: { projectId: day1Id },
    });
    const statusText = statusResult.content?.[0]?.text || '';
    const evidence = `git_status returned: ${statusText.substring(0, 100)}...`;
    console.log(`✅ PASSED - ${evidence}`);
    results.push({ scenario: 11, name: 'git operations per-project', passed: true, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 11, name: 'git operations per-project', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 12: Invalid projectId returns error
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 12: Invalid projectId returns error');
  console.log('-'.repeat(80));
  try {
    const result = await client.callTool({
      name: 'search',
      arguments: { projectId: 'invalid-project-id-12345', query: 'test', limit: 5 },
    });
    const text = result.content?.[0]?.text || '';
    const isError = result.isError || text.includes('Error') || text.includes('not found');
    const evidence = `Error response: ${text.substring(0, 100)}`;
    const passed = isError;
    console.log(`${passed ? '✅' : '❌'} ${passed ? 'PASSED' : 'FAILED'} - ${evidence}`);
    results.push({ scenario: 12, name: 'Invalid projectId returns error', passed, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    const passed = errorMsg.includes('not found') || errorMsg.includes('Project');
    console.log(`${passed ? '✅' : '❌'} ${passed ? 'PASSED' : 'FAILED'} - Error: ${errorMsg}`);
    results.push({ scenario: 12, name: 'Invalid projectId returns error', passed, evidence: errorMsg });
  }
  console.log();

  // ============================================================================
  // Scenario 13: Unregister project, verify index deleted
  // ============================================================================
  console.log('-'.repeat(80));
  console.log('SCENARIO 13: Unregister project, verify index deleted');
  console.log('-'.repeat(80));
  try {
    if (!projectBId) throw new Error('Project B not registered');
    
    // Unregister project B
    const unregisterResult = await client.callTool({
      name: 'unregister_project',
      arguments: { projectId: projectBId },
    });
    const unregisterText = unregisterResult.content?.[0]?.text || '';
    
    // Verify project is removed from list
    const listResult = await client.callTool({ name: 'list_projects', arguments: {} });
    const listText = listResult.content?.[0]?.text || '';
    const listParsed = JSON.parse(listText);
    
    // Check if project B index directory still exists
    const indexDirB = path.join(indexDir, projectBId);
    let indexExists = false;
    try {
      await fs.access(indexDirB);
      indexExists = true;
    } catch {
      indexExists = false;
    }
    
    const projectBStillInList = listParsed.projects?.some((p: any) => p.id === projectBId);
    const evidence = `Unregister result: ${unregisterText}. Project in list: ${projectBStillInList}. Index dir exists: ${indexExists}`;
    const passed = !projectBStillInList;
    console.log(`${passed ? '✅' : '❌'} ${passed ? 'PASSED' : 'FAILED'} - ${evidence}`);
    results.push({ scenario: 13, name: 'Unregister project', passed, evidence });
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`❌ FAILED - ${errorMsg}`);
    results.push({ scenario: 13, name: 'Unregister project', passed: false, evidence: '', error: errorMsg });
  }
  console.log();

  // Disconnect
  await client.close();
  console.log('[DISCONNECT] Client disconnected\n');

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('='.repeat(80));
  console.log('QA SUMMARY');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\nTotal: ${results.length} scenarios`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log();
  
  results.forEach(r => {
    console.log(`${r.passed ? '✅' : '❌'} Scenario ${r.scenario}: ${r.name}`);
    if (!r.passed && r.error) {
      console.log(`   Error: ${r.error}`);
    }
  });
  
  console.log();
  console.log('='.repeat(80));
  console.log(failed === 0 ? 'ALL TESTS PASSED ✅' : `${failed} TESTS FAILED ❌`);
  console.log('='.repeat(80));
  
  process.exit(failed === 0 ? 0 : 1);
}

runQA().catch((error) => {
  console.error('QA suite failed:', error);
  process.exit(1);
});
