#!/usr/bin/env tsx
/**
 * Register the day1 project in the MCP Assistant project registry.
 * This script should be run once to set up the default project.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

const INDEX_DIR = path.join(process.cwd(), '.index');
const PROJECTS_FILE = path.join(INDEX_DIR, 'projects.json');

const DAY1_PROJECT = {
  id: 'day1',
  name: 'day1',
  rootPath: '/mnt/f/git/day1',
  createdAt: new Date().toISOString(),
  lastIndexed: null,
  chunkingStrategy: 'SEMANTIC' as const,
};

async function registerDay1Project(): Promise<void> {
  console.log('[register-day1-project] Registering day1 project...');

  // Ensure index directory exists
  try {
    await fs.mkdir(INDEX_DIR, { recursive: true });
    console.log(`[register-day1-project] Created index directory: ${INDEX_DIR}`);
  } catch (error) {
    console.error('[register-day1-project] Failed to create index directory:', error);
    process.exit(1);
  }

  // Load existing projects or create empty registry
  let projects: Record<string, any> = {};
  try {
    const data = await fs.readFile(PROJECTS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    projects = parsed.projects || {};
    console.log(`[register-day1-project] Loaded existing registry with ${Object.keys(projects).length} projects`);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('[register-day1-project] No existing registry found, creating new one');
    } else {
      console.error('[register-day1-project] Failed to read projects file:', error);
      process.exit(1);
    }
  }

  // Check if day1 project already exists
  if (projects['day1']) {
    console.log('[register-day1-project] day1 project already registered, updating...');
    projects['day1'] = {
      ...projects['day1'],
      ...DAY1_PROJECT,
      createdAt: projects['day1'].createdAt || DAY1_PROJECT.createdAt,
    };
  } else {
    console.log('[register-day1-project] Registering new day1 project...');
    projects['day1'] = DAY1_PROJECT;
  }

  // Save updated registry
  try {
    await fs.writeFile(
      PROJECTS_FILE,
      JSON.stringify({ projects }, null, 2),
      'utf-8'
    );
    console.log(`[register-day1-project] Successfully registered day1 project`);
    console.log(`[register-day1-project] Project config:`, JSON.stringify(projects['day1'], null, 2));
  } catch (error) {
    console.error('[register-day1-project] Failed to save projects file:', error);
    process.exit(1);
  }
}

// Run the registration
registerDay1Project().catch((error) => {
  console.error('[register-day1-project] Fatal error:', error);
  process.exit(1);
});
