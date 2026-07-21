import { describe, it, expect } from 'vitest';

describe('file-assistant', () => {
  it('should pass a basic sanity check', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have a module entry point', async () => {
    // Verify the module can be imported without error
    await expect(import('./index.js')).resolves.toBeDefined();
  });

  it('should register all required tools in index.ts', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf-8');

    // Core file operation tools
    expect(source).toContain("'readFile'");
    expect(source).toContain("'writeFile'");
    expect(source).toContain("'editFile'");
    expect(source).toContain("'diffFiles'");

    // Search/analysis tools
    expect(source).toContain("'findUsages'");
    expect(source).toContain("'analyzeBlastRadius'");

    // Generation tools
    expect(source).toContain("'generateREADME'");
    expect(source).toContain("'generateADR'");
    expect(source).toContain("'generateChangelog'");

    // Validation tools
    expect(source).toContain("'checkInvariants'");
    expect(source).toContain("'validateRules'");

    // Infrastructure tools
    expect(source).toContain("'approve_operation'");
    expect(source).toContain("'help'");

    // Echo test tool
    expect(source).toContain("'echo'");
  });

  it('should wire ApprovalGate for dangerous operations', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf-8');

    // ApprovalGate should be imported and instantiated
    expect(source).toContain('ApprovalGate');
    expect(source).toContain('createApproveOperationHandler');
    expect(source).toContain("z.enum(['approve', 'reject'])");
    expect(source).toContain('new ApprovalGate()');

    // writeFile registration should use approvalGate
    expect(source).toContain('approvalGate');
  });

  it('should import all tool modules', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf-8');

    // All tool module imports should be present
    expect(source).toContain("'./tools/read-file.js'");
    expect(source).toContain("'./tools/write-file.js'");
    expect(source).toContain("'./tools/edit-file.js'");
    expect(source).toContain("'./tools/diff-files.js'");
    expect(source).toContain("'./tools/find-usages.js'");
    expect(source).toContain("'./tools/analyze-blast-radius.js'");
    expect(source).toContain("'./tools/generate-readme.js'");
    expect(source).toContain("'./tools/generate-adr.js'");
    expect(source).toContain("'./tools/generate-changelog.js'");
    expect(source).toContain("'./tools/check-invariants.js'");
    expect(source).toContain("'./tools/validate-rules.js'");
    expect(source).toContain("'./utils/approval-gate.js'");
  });
});
