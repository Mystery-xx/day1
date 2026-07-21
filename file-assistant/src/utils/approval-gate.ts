// ============================================================================
// ApprovalGate - MCP prompt-based approval for dangerous operations
// ============================================================================
//
// Uses an MCP prompt / tool-calling pattern for user confirmation of
// dangerous operations (writes, deletes, destructive actions). Returns a
// `pendingApproval` response from the tool, and the user confirms via a
// separate `approve_operation` MCP tool. No CLI readline is used.
//
// Flow:
//   1. Tool handler calls `gate.requireApproval(operation)`.
//   2. ApprovalGate records the pending request and returns
//      `{ pendingApproval: true, requestId, operation }`.
//   3. The AI receives this response and presents it to the user.
//   4. User (or AI) calls `approve_operation({ requestId })`.
//   5. ApprovalGate resolves the pending request.
//   6. Same tool handler re-checks and proceeds if approved.
//
// Usage:
//   const gate = new ApprovalGate();
//
//   // In a write-file tool handler:
//   const approval = gate.requireApproval({
//     type: 'write_file',
//     description: `Write ${path}`,
//     details: { path, contentLength: content.length },
//   });
//   if (approval.pendingApproval) return approval; // MCP returns this
//
//   // If we reach here, approval was granted — proceed.
// ============================================================================

import { randomUUID } from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

export interface Operation {
  /** Machine-readable operation type (e.g. 'write_file', 'delete_file') */
  type: string;
  /** Human-readable description shown to the user */
  description: string;
  /** Optional structured details for logging */
  details?: Record<string, unknown>;
}

export interface PendingApprovalResponse {
  pendingApproval: true;
  requestId: string;
  operation: Operation;
  message: string;
}

export interface ApprovedResponse {
  pendingApproval: false;
  requestId: string;
}

export interface ApprovalResult {
  approved: boolean;
  requestId: string;
  approvedAt?: string;
  rejectedAt?: string;
  reason?: string;
}

export type ApprovalCheckResult = PendingApprovalResponse | ApprovedResponse;

// ============================================================================
// In-memory pending-approval store
// ============================================================================

interface PendingRequest {
  id: string;
  operation: Operation;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  resolvedAt?: string;
  contextKey?: string;
}

// ============================================================================
// ApprovalGate Class
// ============================================================================

export class ApprovalGate {
  private pending: Map<string, PendingRequest> = new Map();
  /** Cache of auto-approved context keys: contextKey -> expiry timestamp */
  private autoApprovalCache: Map<string, number> = new Map();
  /** How long (ms) a pending request lives before auto-expiry */
  private ttlMs: number;

  constructor(ttlMs: number = 120_000) {
    this.ttlMs = ttlMs;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Require user approval before a dangerous operation proceeds.
   *
   * Creates a pending approval request and returns a response that the AI
   * tool handler should return to the caller. The caller (or user) must then
   * invoke `approve_operation` with the returned `requestId`.
   *
   * If the key (`userId/sessionId + operationType`) already has a *granted*
   * approval that hasn't expired, returns `{ pendingApproval: false }`
   * so the operation can proceed without asking again (within the TTL).
   *
   * @param operation  The operation that needs approval.
   * @param contextKey  Optional context key to group approvals (e.g. sessionId).
   *                    If provided and same key+type was recently approved,
   *                    approval is auto-granted.
   */
  requireApproval(operation: Operation, contextKey?: string): ApprovalCheckResult {
    // Auto-approve if contextKey+type was recently granted and not expired
    if (contextKey) {
      const autoKey = this.autoKey(contextKey, operation.type);
      const expiry = this.autoApprovalCache.get(autoKey);
      if (expiry && Date.now() < expiry) {
        return {
          pendingApproval: false,
          requestId: 'auto-approved',
        };
      }
    }

    // Create pending request
    const requestId = randomUUID();
    const request: PendingRequest = {
      id: requestId,
      operation,
      status: 'pending',
      createdAt: new Date().toISOString(),
      contextKey: contextKey ?? undefined,
    };

    this.pending.set(requestId, request);

    // Schedule expiry
    this.scheduleExpiry(requestId);

    return {
      pendingApproval: true,
      requestId,
      operation,
      message: `Operation requires approval: ${operation.description}. Call approve_operation with requestId="${requestId}" to confirm.`,
    };
  }

  /**
   * Grant approval for a previously created request.
   *
   * @param requestId  The ID returned by `requireApproval`.
   * @returns ApprovalResult with the final status.
   * @throws If requestId is unknown or already resolved.
   */
  grantApproval(requestId: string): ApprovalResult {
    const request = this.pending.get(requestId);
    if (!request) {
      throw new Error(`Approval request '${requestId}' not found. It may have expired or been already resolved.`);
    }
    if (request.status !== 'pending') {
      throw new Error(`Approval request '${requestId}' is already ${request.status} (resolved at ${request.resolvedAt}).`);
    }

    request.status = 'approved';
    request.resolvedAt = new Date().toISOString();

    // Cache the auto-approval key so subsequent requireApproval() calls
    // with the same contextKey+type skip the approval prompt within TTL
    if (request.contextKey) {
      const cacheKey = this.autoKey(request.contextKey, request.operation.type);
      this.autoApprovalCache.set(cacheKey, Date.now() + this.ttlMs);
    }

    return {
      approved: true,
      requestId,
      approvedAt: request.resolvedAt,
    };
  }

  /**
   * Reject (deny) a previously created request.
   *
   * @param requestId  The ID returned by `requireApproval`.
   * @param reason     Optional reason for rejection.
   * @returns ApprovalResult with the final status.
   * @throws If requestId is unknown or already resolved.
   */
  rejectApproval(requestId: string, reason?: string): ApprovalResult {
    const request = this.pending.get(requestId);
    if (!request) {
      throw new Error(`Approval request '${requestId}' not found.`);
    }
    if (request.status !== 'pending') {
      throw new Error(`Approval request '${requestId}' is already ${request.status}.`);
    }

    request.status = 'rejected';
    request.resolvedAt = new Date().toISOString();

    return {
      approved: false,
      requestId,
      rejectedAt: request.resolvedAt,
      reason,
    };
  }

  /**
   * Check whether a request is still pending.
   */
  isPending(requestId: string): boolean {
    const request = this.pending.get(requestId);
    return request?.status === 'pending';
  }

  /**
   * Get the status of a request (without resolving it).
   */
  getStatus(requestId: string): { status: string; operation: Operation } | null {
    const request = this.pending.get(requestId);
    if (!request) return null;
    return { status: request.status, operation: request.operation };
  }

  /**
   * List all pending requests.
   */
  listPending(): Array<{ requestId: string; operation: Operation; createdAt: string }> {
    const result: Array<{ requestId: string; operation: Operation; createdAt: string }> = [];
    for (const [id, req] of this.pending) {
      if (req.status === 'pending') {
        result.push({ requestId: id, operation: req.operation, createdAt: req.createdAt });
      }
    }
    return result;
  }

  /**
   * Get statistics for observability.
   */
  getStats(): { pending: number; approved: number; rejected: number; expired: number } {
    let approved = 0;
    let rejected = 0;
    let expired = 0;
    let pending = 0;

    for (const req of this.pending.values()) {
      switch (req.status) {
        case 'pending': pending++; break;
        case 'approved': approved++; break;
        case 'rejected': rejected++; break;
        default: expired++;
      }
    }

    return { pending, approved, rejected, expired };
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private autoKey(contextKey: string, operationType: string): string {
    return `${contextKey}::${operationType}`;
  }

  private scheduleExpiry(requestId: string): void {
    setTimeout(() => {
      const request = this.pending.get(requestId);
      if (request && request.status === 'pending') {
        request.status = 'expired';
        console.error(`[APPROVAL_GATE] Request '${requestId}' expired after ${this.ttlMs}ms`);
      }
    }, this.ttlMs).unref(); // Don't keep process alive for timers
  }
}

// ============================================================================
// MCP Tool: approve_operation
// ============================================================================

/**
 * Zod schema for the approve_operation MCP tool input.
 */
export const approveOperationSchema = {
  type: 'object',
  properties: {
    requestId: {
      type: 'string',
      description: 'The approval request ID returned by a tool that requires approval',
    },
    action: {
      type: 'string',
      enum: ['approve', 'reject'],
      description: 'Whether to approve or reject the operation (default: approve)',
    },
    reason: {
      type: 'string',
      description: 'Optional reason for rejection (only used when action=reject)',
    },
  },
  required: ['requestId'],
} as const;

export interface ApproveOperationArgs {
  requestId: string;
  action?: 'approve' | 'reject';
  reason?: string;
}

/**
 * Handler for the approve_operation MCP tool.
 *
 * Call this when the user wants to confirm or deny a pending operation.
 *
 * @param gate  The ApprovalGate instance managing pending requests.
 * @param args  The tool arguments (requestId, action, reason).
 * @returns MCP-compatible response content.
 */
export function createApproveOperationHandler(gate: ApprovalGate) {
  return async (args: ApproveOperationArgs) => {
    try {
      const action = args.action ?? 'approve';

      if (action === 'approve') {
        const result = gate.grantApproval(args.requestId);
        return {
          content: [
            {
              type: 'text' as const,
              text: `✅ Operation '${args.requestId}' approved at ${result.approvedAt}. The tool handler can now proceed.`,
            },
          ],
        };
      } else {
        const result = gate.rejectApproval(args.requestId, args.reason);
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Operation '${args.requestId}' rejected${result.reason ? `: ${result.reason}` : ''}. The tool handler will not proceed.`,
            },
          ],
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  };
}
