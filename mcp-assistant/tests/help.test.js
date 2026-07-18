import { describe, it, expect } from 'vitest';
import { getDocsTool, getDocsSchema, getProjectStateTool, getProjectStateSchema } from '../src/tools/help.js';
describe('Help Tools', () => {
    describe('getDocsSchema', () => {
        it('should accept topic with valid length', () => {
            const result = getDocsSchema.safeParse({ topic: 'RAG' });
            expect(result.success).toBe(true);
        });
        it('should accept empty topic', () => {
            const result = getDocsSchema.safeParse({ topic: '' });
            expect(result.success).toBe(true);
        });
        it('should accept undefined topic', () => {
            const result = getDocsSchema.safeParse({});
            expect(result.success).toBe(true);
        });
        it('should reject topic longer than 100 chars', () => {
            const longTopic = 'a'.repeat(101);
            const result = getDocsSchema.safeParse({ topic: longTopic });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].message).toContain('100');
            }
        });
    });
    describe('getProjectStateSchema', () => {
        it('should accept empty object', () => {
            const result = getProjectStateSchema.safeParse({});
            expect(result.success).toBe(true);
        });
    });
    describe('getDocsTool', () => {
        it('should return project overview when no topic provided', async () => {
            const result = await getDocsTool({});
            expect(result.content).toBeDefined();
            expect(result.content.length).toBeGreaterThan(0);
            expect(result.content[0].type).toBe('text');
            expect(result.isError).not.toBe(true);
        });
        it('should return project overview when topic is empty', async () => {
            const result = await getDocsTool({ topic: '' });
            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('Project Overview');
        });
        it('should return relevant docs for RAG topic', async () => {
            const result = await getDocsTool({ topic: 'RAG' });
            expect(result.content).toBeDefined();
            expect(result.content[0].type).toBe('text');
            const text = result.content[0].text;
            // Should find RAG-related content
            expect(text.toLowerCase()).toContain('rag');
        });
        it('should handle non-existent topic gracefully', async () => {
            const result = await getDocsTool({ topic: 'xyznonexistent123' });
            expect(result.content).toBeDefined();
            // Should either return no results or fallback to overview
            expect(result.isError).not.toBe(true);
        });
    });
    describe('getProjectStateTool', () => {
        it('should return project state with required fields', async () => {
            const result = await getProjectStateTool({});
            expect(result.content).toBeDefined();
            expect(result.content.length).toBeGreaterThan(0);
            expect(result.content[0].type).toBe('text');
            expect(result.isError).not.toBe(true);
            const text = result.content[0].text;
            // Should contain project state information
            expect(text).toContain('Branch');
            expect(text).toContain('Last Commit');
            expect(text).toContain('Commit Count');
            expect(text).toContain('Indexed Docs');
        });
        it('should return valid JSON in response', async () => {
            const result = await getProjectStateTool({});
            const text = result.content[0].text;
            // Extract JSON from markdown code block
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                const stateObj = JSON.parse(jsonMatch[1]);
                expect(stateObj).toHaveProperty('branch');
                expect(stateObj).toHaveProperty('lastCommit');
                expect(stateObj).toHaveProperty('commitCount');
                expect(stateObj).toHaveProperty('indexedDocs');
                expect(stateObj).toHaveProperty('lastIndexed');
            }
        });
    });
});
//# sourceMappingURL=help.test.js.map