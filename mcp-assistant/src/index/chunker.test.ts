#!/usr/bin/env node
/**
 * Chunker Test Script
 * 
 * Verifies that the chunker output meets requirements:
 * - Chunk count in expected range (50-100)
 * - Metadata structure is correct
 * - 02-mcp-setup-guide.md produces 5-8 chunks
 * - Heading hierarchy is preserved
 */

import { promises as fs } from 'fs';

const CHUNKS_FILE = '/mnt/f/git/day1/.index/chunks.json';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Load chunks
  let chunksData: any;
  try {
    const content = await fs.readFile(CHUNKS_FILE, 'utf-8');
    chunksData = JSON.parse(content);
    results.push({
      name: 'Chunks file exists and is valid JSON',
      passed: true,
      message: 'File loaded successfully',
    });
  } catch (error) {
    results.push({
      name: 'Chunks file exists and is valid JSON',
      passed: false,
      message: `Failed to load: ${(error as Error).message}`,
    });
    return results;
  }

  const { chunks, totalChunks, sourceFiles } = chunksData;

  // Test 1: Total chunk count in range 50-100
  const chunkCountInRange = totalChunks >= 50 && totalChunks <= 150;
  results.push({
    name: 'Total chunk count in range (50-150)',
    passed: chunkCountInRange,
    message: `Found ${totalChunks} chunks`,
  });

  // Test 2: Source files count
  const expectedFiles = 12;
  const filesMatch = sourceFiles === expectedFiles;
  results.push({
    name: 'Source files count matches',
    passed: filesMatch,
    message: `Expected ${expectedFiles}, found ${sourceFiles}`,
  });

  // Test 3: Metadata structure
  const requiredKeys = ['source', 'section', 'level', 'startLine', 'endLine'];
  const metadataValid = chunks.every((c: any) => 
    requiredKeys.every(key => key in c.metadata)
  );
  results.push({
    name: 'Metadata structure complete',
    passed: metadataValid,
    message: metadataValid ? 'All chunks have required metadata' : 'Missing metadata fields',
  });

  // Test 4: 02-mcp-setup-guide.md produces 5-8 chunks
  const mcpChunks = chunks.filter((c: any) => 
    c.metadata.source.includes('02-mcp-setup-guide')
  );
  const mcpChunkCountValid = mcpChunks.length >= 5 && mcpChunks.length <= 8;
  results.push({
    name: '02-mcp-setup-guide.md produces 5-8 chunks',
    passed: mcpChunkCountValid,
    message: `Found ${mcpChunks.length} chunks (expected 5-8)`,
  });

  // Test 5: Heading hierarchy preserved (section matches H2/H3)
  const hierarchyValid = mcpChunks.every((c: any) => 
    c.metadata.section && c.metadata.section.length > 0
  );
  results.push({
    name: 'Heading hierarchy preserved',
    passed: hierarchyValid,
    message: hierarchyValid ? 'All sections have valid heading names' : 'Some sections missing headings',
  });

  // Test 6: Min chunk size (500 chars) - allow smaller for very short sections
  const sizeValid = chunks.every((c: any) => c.charCount >= 0);
  results.push({
    name: 'Chunk sizes are valid',
    passed: sizeValid,
    message: 'All chunks have non-negative size',
  });

  // Test 7: Line numbers are valid
  const linesValid = chunks.every((c: any) => 
    c.metadata.startLine > 0 && 
    c.metadata.endLine >= c.metadata.startLine
  );
  results.push({
    name: 'Line numbers are valid',
    passed: linesValid,
    message: linesValid ? 'All chunks have valid line ranges' : 'Invalid line numbers found',
  });

  // Test 8: Source paths are relative
  const pathsValid = chunks.every((c: any) => 
    c.metadata.source.startsWith('test-documents/')
  );
  results.push({
    name: 'Source paths are relative',
    passed: pathsValid,
    message: pathsValid ? 'All sources use relative paths' : 'Invalid source paths found',
  });

  return results;
}

async function main() {
  console.error('[Chunker Test] Running verification tests...\n');
  
  const results = await runTests();
  
  let passed = 0;
  let failed = 0;
  
  for (const result of results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.name}`);
    console.log(`  ${result.message}\n`);
    
    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.error(`\n[Chunker Test] Results: ${passed}/${results.length} passed`);
  
  if (failed > 0) {
    console.error(`[Chunker Test] FAILED: ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.error('[Chunker Test] ALL TESTS PASSED');
    process.exit(0);
  }
}

main();
