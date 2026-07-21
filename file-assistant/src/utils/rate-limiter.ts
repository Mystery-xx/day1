// ============================================================================
// RateLimiter - Per-token/per-tool sliding window rate limiter
// ============================================================================
//
// Prevents abuse by limiting how many times a tool can be called within a
// sliding time window. Tracks calls per key (typically a userId or sessionId)
// per toolName. Read operations are NOT rate-limited; only
// write/delete/dangerous operations are subject to limits.
//
// Usage:
//   const limiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });
//   const result = limiter.checkLimit('user-1', 'write_file');
//   if (!result.allowed) {
//     limiter.logViolation('user-1', 'write_file');
//     return { error: result.message };
//   }
// ============================================================================

// ============================================================================
// Configuration
// ============================================================================

export interface RateLimiterConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Sliding window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  message?: string;
  /** Remaining requests in current window */
  remaining: number;
  /** Milliseconds until the window resets */
  resetInMs: number;
}

// ============================================================================
// Internal State
// ============================================================================

interface RateLimitEntry {
  /** Timestamp marks for each request in the current window */
  timestamps: number[];
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequests: 10,
  windowMs: 60_000, // 1 minute
};

// ============================================================================
// RateLimiter Class
// ============================================================================

export class RateLimiter {
  private config: RateLimiterConfig;
  /** key (userId/sessionId) → toolName → entry */
  private limits: Map<string, Map<string, RateLimitEntry>> = new Map();

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check whether a call from `key` for `toolName` is within the rate limit.
   *
   * Automatically prunes expired timestamps on each check. If the call would
   * exceed the limit, returns `{ allowed: false, message, remaining: 0 }`.
   * Otherwise records the call and returns `{ allowed: true, remaining }`.
   */
  checkLimit(key: string, toolName: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let toolLimits = this.limits.get(key);
    if (!toolLimits) {
      toolLimits = new Map();
      this.limits.set(key, toolLimits);
    }

    let entry = toolLimits.get(toolName);

    // No previous calls → allow
    if (!entry) {
      entry = { timestamps: [now] };
      toolLimits.set(toolName, entry);
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetInMs: this.config.windowMs,
      };
    }

    // Prune expired timestamps
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    if (entry.timestamps.length >= this.config.maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const resetInMs = Math.max(1, oldestInWindow + this.config.windowMs - now);

      return {
        allowed: false,
        message: `Rate limit exceeded for '${toolName}' (${this.config.maxRequests} requests per ${this.config.windowMs / 1000}s). Try again in ${Math.ceil(resetInMs / 1000)}s.`,
        remaining: 0,
        resetInMs,
      };
    }

    // Record this call
    entry.timestamps.push(now);
    const remaining = this.config.maxRequests - entry.timestamps.length;
    const resetInMs = this.config.windowMs - (now - entry.timestamps[0]);

    return {
      allowed: true,
      remaining,
      resetInMs: Math.max(1, resetInMs),
    };
  }

  /**
   * Log a rate-limit violation to stderr for observability / metrics.
   */
  logViolation(key: string, toolName: string, extra?: Record<string, unknown>): void {
    const details = extra ? ` ${JSON.stringify(extra)}` : '';
    console.error(
      `[RATE_LIMIT] Violation: key='${key}' tool='${toolName}' limit=${this.config.maxRequests}/${this.config.windowMs / 1000}s${details}`
    );
  }

  /**
   * Reset all rate-limit state for a given key (e.g. on session end).
   */
  resetKey(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Reset all rate-limit state entirely.
   */
  resetAll(): void {
    this.limits.clear();
  }

  /**
   * Get current stats for observability.
   */
  getStats(): { trackedKeys: number; trackedTools: number } {
    let trackedTools = 0;
    for (const toolLimits of this.limits.values()) {
      trackedTools += toolLimits.size;
    }
    return {
      trackedKeys: this.limits.size,
      trackedTools,
    };
  }
}
