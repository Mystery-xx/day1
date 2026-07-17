import { describe, it, expect } from 'vitest';
import { search, searchInputSchema } from '../src/tools/search.js';
describe('Search Tool', () => {
    describe('Schema Validation', () => {
        it('should accept valid query with minimum length', () => {
            const result = searchInputSchema.safeParse({ query: 'MCP', limit: 10 });
            expect(result.success).toBe(true);
        });
        it('should reject query shorter than 3 characters', () => {
            const result = searchInputSchema.safeParse({ query: '   ', limit: 10 });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].message).toContain('query must be at least 3 characters');
            }
        });
        it('should reject query longer than 200 characters', () => {
            const longQuery = 'a'.repeat(201);
            const result = searchInputSchema.safeParse({ query: longQuery, limit: 10 });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].message).toContain('query must be at most 200 characters');
            }
        });
        it('should reject limit below 1', () => {
            const result = searchInputSchema.safeParse({ query: 'MCP', limit: 0 });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].message).toContain('limit must be at least 1');
            }
        });
        it('should reject limit above 50', () => {
            const result = searchInputSchema.safeParse({ query: 'MCP', limit: 51 });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].message).toContain('limit must be at most 50');
            }
        });
        it('should default limit to 10 when not provided', () => {
            const result = searchInputSchema.safeParse({ query: 'MCP' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.limit).toBe(10);
            }
        });
    });
    describe('Search Functionality', () => {
        it('should return results for "MCP setup" query', async () => {
            const result = await search({ query: 'MCP setup', limit: 10 });
            expect(result.results).toBeDefined();
            expect(result.total).toBeGreaterThan(0);
            expect(result.results.length).toBeLessThanOrEqual(10);
            // Should find the MCP setup guide
            const mcpSetupResults = result.results.filter((r) => r.path.includes('02-mcp-setup-guide.md'));
            expect(mcpSetupResults.length).toBeGreaterThan(0);
            // Scores should be reasonable (< 0.5 for good matches)
            mcpSetupResults.forEach((r) => {
                expect(r.score).toBeLessThan(0.6);
            });
        });
        it('should filter by source when provided', async () => {
            const result = await search({
                query: 'MCP',
                limit: 10,
                filters: { source: '02-mcp-setup-guide.md' },
            });
            expect(result.results).toBeDefined();
            result.results.forEach((r) => {
                expect(r.path).toContain('02-mcp-setup-guide.md');
            });
        });
        it('should exclude sensitive paths', async () => {
            const result = await search({ query: 'config', limit: 50 });
            result.results.forEach((r) => {
                expect(r.path).not.toMatch(/^node_modules\//);
                expect(r.path).not.toMatch(/^\.git\//);
                expect(r.path).not.toMatch(/^\.env/);
                expect(r.path).not.toMatch(/\/node_modules\//);
                expect(r.path).not.toMatch(/\/\.git\//);
                expect(r.path).not.toMatch(/\/\.env/);
            });
        });
        it('should return structured results with path, section, content, and score', async () => {
            const result = await search({ query: 'Docker', limit: 5 });
            expect(result.results).toBeDefined();
            expect(Array.isArray(result.results)).toBe(true);
            if (result.results.length > 0) {
                const firstResult = result.results[0];
                expect(firstResult).toHaveProperty('path');
                expect(firstResult).toHaveProperty('section');
                expect(firstResult).toHaveProperty('content');
                expect(firstResult).toHaveProperty('score');
                expect(typeof firstResult.path).toBe('string');
                expect(typeof firstResult.section).toBe('string');
                expect(typeof firstResult.content).toBe('string');
                expect(typeof firstResult.score).toBe('number');
            }
        });
    });
});
//# sourceMappingURL=search.test.js.map