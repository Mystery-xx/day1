import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from './rate-limiter.js';
import { ApprovalGate, createApproveOperationHandler } from './approval-gate.js';
import type { PendingApprovalResponse } from './approval-gate.js';

// ============================================================================
// RateLimiter Tests
// ============================================================================

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkLimit', () => {
    it('should allow the first N requests within the window', () => {
      const r1 = limiter.checkLimit('user-1', 'write_file');
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = limiter.checkLimit('user-1', 'write_file');
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = limiter.checkLimit('user-1', 'write_file');
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it('should block requests exceeding the limit', () => {
      limiter.checkLimit('user-1', 'write_file');
      limiter.checkLimit('user-1', 'write_file');
      limiter.checkLimit('user-1', 'write_file');

      const r4 = limiter.checkLimit('user-1', 'write_file');
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.message).toContain('Rate limit exceeded');
    });

    it('should reset after the window expires', () => {
      limiter.checkLimit('user-1', 'write_file');
      limiter.checkLimit('user-1', 'write_file');
      limiter.checkLimit('user-1', 'write_file');

      // 4th should be blocked
      expect(limiter.checkLimit('user-1', 'write_file').allowed).toBe(false);

      // Advance past the window
      vi.advanceTimersByTime(1001);

      // Should be allowed again (window reset)
      const r = limiter.checkLimit('user-1', 'write_file');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2);
    });

    it('should track different keys independently', () => {
      limiter.checkLimit('user-1', 'write_file');
      limiter.checkLimit('user-1', 'write_file');
      limiter.checkLimit('user-1', 'write_file');

      // user-1 is blocked for write_file
      expect(limiter.checkLimit('user-1', 'write_file').allowed).toBe(false);

      // user-2 should still be allowed
      expect(limiter.checkLimit('user-2', 'write_file').allowed).toBe(true);

      // user-1 should be allowed for a different tool
      expect(limiter.checkLimit('user-1', 'read_file').allowed).toBe(true);
    });
  });

  describe('logViolation', () => {
    it('should log to stderr with key and tool name', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      limiter.logViolation('user-1', 'write_file');

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[RATE_LIMIT] Violation')
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("key='user-1'")
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("tool='write_file'")
      );

      spy.mockRestore();
    });

    it('should include extra details when provided', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      limiter.logViolation('user-1', 'write_file', { path: '/tmp/test' });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"/tmp/test"')
      );

      spy.mockRestore();
    });
  });

  describe('resetKey / resetAll', () => {
    it('should reset state for a specific key', () => {
      limiter.checkLimit('user-1', 'write_file');
      limiter.checkLimit('user-1', 'write_file');
      limiter.checkLimit('user-1', 'write_file');
      expect(limiter.checkLimit('user-1', 'write_file').allowed).toBe(false);

      limiter.resetKey('user-1');
      expect(limiter.checkLimit('user-1', 'write_file').allowed).toBe(true);
    });

    it('should reset all state', () => {
      limiter.checkLimit('user-1', 'write_file');
      limiter.checkLimit('user-2', 'delete_file');
      limiter.resetAll();

      expect(limiter.checkLimit('user-1', 'write_file').allowed).toBe(true);
      expect(limiter.checkLimit('user-2', 'delete_file').allowed).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return tracked key and tool counts', () => {
      expect(limiter.getStats()).toEqual({ trackedKeys: 0, trackedTools: 0 });

      limiter.checkLimit('user-1', 'write_file');
      expect(limiter.getStats().trackedKeys).toBe(1);
      expect(limiter.getStats().trackedTools).toBe(1);

      limiter.checkLimit('user-1', 'delete_file');
      expect(limiter.getStats().trackedTools).toBe(2);

      limiter.checkLimit('user-2', 'write_file');
      expect(limiter.getStats().trackedKeys).toBe(2);
    });
  });
});

// ============================================================================
// ApprovalGate Tests
// ============================================================================

describe('ApprovalGate', () => {
  let gate: ApprovalGate;

  beforeEach(() => {
    vi.useFakeTimers();
    gate = new ApprovalGate(60_000); // 60s TTL
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('requireApproval', () => {
    it('should return pendingApproval for a new operation', () => {
      const result = gate.requireApproval({
        type: 'write_file',
        description: 'Write to /tmp/test.txt',
      });

      const pendingResult = result as PendingApprovalResponse;
      expect(pendingResult.pendingApproval).toBe(true);
      expect(pendingResult.requestId).toBeDefined();
      expect(pendingResult.requestId.length).toBeGreaterThan(0);
      expect(pendingResult.operation.type).toBe('write_file');
      expect(pendingResult.message).toContain('approve_operation');
      expect(pendingResult.message).toContain(pendingResult.requestId);
    });

    it('should include operation details in response', () => {
      const result = gate.requireApproval({
        type: 'delete_file',
        description: 'Delete /tmp/test.txt',
        details: { path: '/tmp/test.txt', size: 1024 },
      });

      const pendingResult = result as PendingApprovalResponse;
      expect(pendingResult.operation.details).toEqual({ path: '/tmp/test.txt', size: 1024 });
    });
  });

  describe('grantApproval', () => {
    it('should approve a pending request', () => {
      const { requestId } = gate.requireApproval({
        type: 'write_file',
        description: 'Write test',
      });

      const result = gate.grantApproval(requestId);
      expect(result.approved).toBe(true);
      expect(result.requestId).toBe(requestId);
      expect(result.approvedAt).toBeDefined();
    });

    it('should throw for unknown requestId', () => {
      expect(() => gate.grantApproval('non-existent-id')).toThrow('not found');
    });

    it('should throw for already resolved request', () => {
      const { requestId } = gate.requireApproval({
        type: 'write_file',
        description: 'Write test',
      });

      gate.grantApproval(requestId);
      expect(() => gate.grantApproval(requestId)).toThrow('already approved');
    });

    it('should throw for rejected request', () => {
      const { requestId } = gate.requireApproval({
        type: 'write_file',
        description: 'Write test',
      });

      gate.rejectApproval(requestId, 'Not needed');
      expect(() => gate.grantApproval(requestId)).toThrow('already rejected');
    });
  });

  describe('rejectApproval', () => {
    it('should reject a pending request with reason', () => {
      const { requestId } = gate.requireApproval({
        type: 'delete_file',
        description: 'Delete important file',
      });

      const result = gate.rejectApproval(requestId, 'File is needed');
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('File is needed');
      expect(result.rejectedAt).toBeDefined();
    });

    it('should reject without reason', () => {
      const { requestId } = gate.requireApproval({
        type: 'delete_file',
        description: 'Delete test',
      });

      const result = gate.rejectApproval(requestId);
      expect(result.approved).toBe(false);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('isPending / getStatus', () => {
    it('should return true for pending requests', () => {
      const { requestId } = gate.requireApproval({
        type: 'write_file',
        description: 'Write test',
      });

      expect(gate.isPending(requestId)).toBe(true);
    });

    it('should return false for resolved requests', () => {
      const { requestId } = gate.requireApproval({
        type: 'write_file',
        description: 'Write test',
      });
      gate.grantApproval(requestId);

      expect(gate.isPending(requestId)).toBe(false);
    });

    it('should return null for unknown requestId', () => {
      expect(gate.getStatus('unknown')).toBeNull();
    });

    it('should return status and operation for existing request', () => {
      const { requestId } = gate.requireApproval({
        type: 'write_file',
        description: 'Write test',
      });

      const status = gate.getStatus(requestId);
      expect(status).not.toBeNull();
      expect(status!.status).toBe('pending');
      expect(status!.operation.type).toBe('write_file');
    });
  });

  describe('listPending', () => {
    it('should list all pending requests', () => {
      gate.requireApproval({ type: 'write_file', description: 'Write 1' });
      gate.requireApproval({ type: 'delete_file', description: 'Delete 2' });

      const pending = gate.listPending();
      expect(pending.length).toBe(2);
    });

    it('should not list resolved requests', () => {
      const { requestId } = gate.requireApproval({
        type: 'write_file',
        description: 'Write 1',
      });
      gate.requireApproval({ type: 'delete_file', description: 'Delete 2' });
      gate.grantApproval(requestId);

      const pending = gate.listPending();
      expect(pending.length).toBe(1);
      expect(pending[0].operation.type).toBe('delete_file');
    });
  });

  describe('getStats', () => {
    it('should return counts for each status', () => {
      const r1 = gate.requireApproval({ type: 'write_file', description: 'W1' });
      const r2 = gate.requireApproval({ type: 'delete_file', description: 'D1' });
      gate.requireApproval({ type: 'write_file', description: 'W2' });

      gate.grantApproval(r1.requestId);
      gate.rejectApproval(r2.requestId, 'Nope');

      const stats = gate.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.expired).toBe(0);
    });
  });

  describe('approve_operation MCP tool handler', () => {
    it('should approve via the MCP handler', async () => {
      const { requestId } = gate.requireApproval({
        type: 'write_file',
        description: 'Write test',
      });

      const handler = createApproveOperationHandler(gate);
      const response = await handler({ requestId, action: 'approve' });

      expect(response.content[0].text).toContain('✅');
      expect(response.content[0].text).toContain(requestId);
      expect(gate.isPending(requestId)).toBe(false);
      expect(gate.getStatus(requestId)!.status).toBe('approved');
    });

    it('should reject via the MCP handler with reason', async () => {
      const { requestId } = gate.requireApproval({
        type: 'delete_file',
        description: 'Delete important file',
      });

      const handler = createApproveOperationHandler(gate);
      const response = await handler({ requestId, action: 'reject', reason: 'Not now' });

      expect(response.content[0].text).toContain('❌');
      expect(response.content[0].text).toContain('Not now');
      expect(gate.getStatus(requestId)!.status).toBe('rejected');
    });

    it('should return error for invalid requestId via MCP handler', async () => {
      const handler = createApproveOperationHandler(gate);
      const response = await handler({ requestId: 'non-existent', action: 'approve' });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    });
  });
});

// ============================================================================
// Integration: read ops pass without approval, write ops require approval
// ============================================================================

describe('ApprovalGate + RateLimiter Integration', () => {
  let gate: ApprovalGate;
  let limiter: RateLimiter;

  beforeEach(() => {
    gate = new ApprovalGate();
    limiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });
  });

  /**
   * Simulates a read operation handler.
   * Read ops should pass through without rate limiting or approval.
   */
  function handleRead(key: string, _path: string): { ok: boolean; data?: string } {
    // Reads are NOT rate-limited (by design)
    // Reads do NOT require approval
    return { ok: true, data: 'file content' };
  }

  /**
   * Simulates a write operation handler with rate limiting + approval.
   */
  function handleWrite(
    key: string,
    _path: string,
    _content: string,
    _approvalRequestId?: string
  ): { ok: boolean; error?: string; pendingApproval?: boolean; requestId?: string } {
    // Rate limit check
    const rateCheck = limiter.checkLimit(key, 'write_file');
    if (!rateCheck.allowed) {
      limiter.logViolation(key, 'write_file');
      return { ok: false, error: rateCheck.message };
    }

    // If no approval requestId provided, require approval
    if (!_approvalRequestId) {
      const approval = gate.requireApproval({
        type: 'write_file',
        description: `Write to ${_path}`,
        details: { path: _path, contentLength: _content.length },
      });
      // Return pending approval — caller must call approve_operation and retry
      return {
        ok: false,
        pendingApproval: approval.pendingApproval,
        requestId: approval.requestId,
      };
    }

    // Verify the approval was granted
    const status = gate.getStatus(_approvalRequestId);
    if (!status || status.status !== 'approved') {
      return { ok: false, error: 'Operation not approved' };
    }

    // Proceed with write
    return { ok: true };
  }

  it('should let read operations pass without approval', () => {
    const result = handleRead('user-1', '/tmp/readme.md');
    expect(result.ok).toBe(true);
    expect(result.data).toBe('file content');
  });

  it('should require approval for write operations', () => {
    const result = handleWrite('user-1', '/tmp/test.txt', 'hello world');
    expect(result.ok).toBe(false);
    expect(result.pendingApproval).toBe(true);
    expect(result.requestId).toBeDefined();
  });

  it('should complete write after approval', () => {
    // Step 1: Request write -> get pendingApproval
    const pending = handleWrite('user-1', '/tmp/test.txt', 'hello world');
    expect(pending.pendingApproval).toBe(true);

    // Step 2: Approve the operation
    gate.grantApproval(pending.requestId!);

    // Step 3: Retry the write with the approved requestId
    const result = handleWrite('user-1', '/tmp/test.txt', 'hello world', pending.requestId);
    expect(result.ok).toBe(true);
  });

  it('should reject write with the wrong requestId', () => {
    const result = handleWrite('user-1', '/tmp/test.txt', 'hello world', 'invalid-id');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Operation not approved');
  });

  it('should reject write with rejected approval', () => {
    // Step 1: Request write -> get pendingApproval
    const pending = handleWrite('user-1', '/tmp/test.txt', 'hello world');
    expect(pending.pendingApproval).toBe(true);

    // Step 2: Reject the operation
    gate.rejectApproval(pending.requestId!);

    // Step 3: Retry the write with the rejected requestId
    const result = handleWrite('user-1', '/tmp/test.txt', 'hello world', pending.requestId);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Operation not approved');
  });

  it('should still allow reads even when rate limited for writes', () => {
    // Exhaust write rate limit
    for (let i = 0; i < 10; i++) {
      limiter.checkLimit('user-1', 'write_file');
    }

    // Write should be blocked
    const writeResult = handleWrite('user-1', '/tmp/test.txt', 'hello');
    expect(writeResult.ok).toBe(false);

    // Read should pass (no rate limit on reads)
    const readResult = handleRead('user-1', '/tmp/readme.md');
    expect(readResult.ok).toBe(true);
  });
});
