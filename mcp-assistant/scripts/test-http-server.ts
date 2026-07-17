#!/usr/bin/env tsx
/**
 * Test script for HTTP server
 * Starts the server and tests the /health endpoint
 */

import { startHttpServer } from '../src/config/http-server.js';

async function testHealthEndpoint(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const status = response.status;
    const contentType = response.headers.get('content-type');
    const body = await response.json();

    console.log('\n=== Health Check Result ===');
    console.log(`Status: ${status}`);
    console.log(`Content-Type: ${contentType}`);
    console.log(`Body: ${JSON.stringify(body, null, 2)}`);

    if (status === 200 && contentType?.includes('application/json') && body.status === 'ok') {
      console.log('\n✅ Health check PASSED\n');
      return true;
    } else {
      console.log('\n❌ Health check FAILED\n');
      return false;
    }
  } catch (error) {
    console.error('\n❌ Health check FAILED with error:', (error as Error).message);
    return false;
  }
}

async function main() {
  const PORT = parseInt(process.env.PORT || '3000', 10);

  console.log('=== Starting HTTP Server Test ===\n');

  // Start server
  const httpServer = await startHttpServer('test-assistant', '1.0.0');

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // Test health endpoint
    const healthCheckPassed = await testHealthEndpoint(PORT);

    if (!healthCheckPassed) {
      throw new Error('Health check failed');
    }

    // Test CORS headers
    console.log('=== Testing CORS Headers ===\n');
    const corsResponse = await fetch(`http://127.0.0.1:${PORT}/health`, {
      method: 'OPTIONS',
    });
    
    console.log(`CORS Preflight Status: ${corsResponse.status}`);
    console.log(`Access-Control-Allow-Origin: ${corsResponse.headers.get('access-control-allow-origin')}`);
    console.log(`Access-Control-Allow-Methods: ${corsResponse.headers.get('access-control-allow-methods')}`);

    if (corsResponse.status === 204 && corsResponse.headers.get('access-control-allow-origin') === '*') {
      console.log('\n✅ CORS check PASSED\n');
    } else {
      console.log('\n❌ CORS check FAILED\n');
    }

    // Test 404 for unknown paths
    console.log('=== Testing 404 Response ===\n');
    const notFoundResponse = await fetch(`http://127.0.0.1:${PORT}/unknown`);
    console.log(`404 Status: ${notFoundResponse.status}`);
    
    if (notFoundResponse.status === 404) {
      console.log('\n✅ 404 check PASSED\n');
    } else {
      console.log('\n❌ 404 check FAILED\n');
    }

  } finally {
    // Shutdown
    console.log('=== Shutting Down Server ===\n');
    await httpServer.shutdown();
    console.log('\n✅ Test completed successfully\n');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
