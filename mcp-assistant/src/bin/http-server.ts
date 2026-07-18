#!/usr/bin/env node
/**
 * Standalone HTTP server for multi-project-assistant
 */

import { startHttpServer } from '../config/http-server.js';

async function main() {
  try {
    await startHttpServer('multi-project-assistant', '2.0.0');
    
    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT, shutting down...');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('\nReceived SIGTERM, shutting down...');
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
