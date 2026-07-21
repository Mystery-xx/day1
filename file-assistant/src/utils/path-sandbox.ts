import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// Path Validation Result
// ============================================================================

export interface PathValidationResult {
  valid: boolean;
  resolvedPath?: string;
  error?: string;
}

// ============================================================================
// PathSandbox: Secure path validation within project root
// ============================================================================
//
// CRITICAL: This is the security boundary for ALL file operations.
// Every file read/write/edit operation MUST go through this sandbox.
// Do NOT weaken these checks for any reason.
//
// Security measures:
// 1. Normalize paths to prevent ../ traversal
// 2. Resolve to absolute paths (no relative escapes)
// 3. Verify resolved path starts with project root
// 4. Resolve symlinks to detect link-based escapes
// 5. For non-existent paths (file creation), verify parent directory
// ============================================================================

export class PathSandbox {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = path.normalize(path.resolve(rootPath));
  }

  /**
   * Get the sandbox root path.
   */
  get root(): string {
    return this.rootPath;
  }

  /**
   * Validate that a requested path is safely within the project root.
   *
   * For existing paths: resolves symlinks and verifies the real path is within root.
   * For non-existent paths (file creation): checks parent directory is within root.
   *
   * Returns {valid: true, resolvedPath} on success, or {valid: false, error} on failure.
   */
  async validatePath(requestedPath: string): Promise<PathValidationResult> {
    try {
      // Normalize the requested path first (handles .., ., // etc.)
      const normalizedRequested = path.normalize(requestedPath);

      // Resolve to absolute path relative to root
      const resolvedPath = path.resolve(this.rootPath, normalizedRequested);

      // Check if resolved path starts with root (basic check before realpath)
      if (!resolvedPath.startsWith(this.rootPath)) {
        return {
          valid: false,
          error: `Access denied: path must be within project root`,
        };
      }

      // Check for path traversal using path.relative as additional safeguard
      const relative = path.relative(this.rootPath, resolvedPath);
      if (relative.startsWith('..')) {
        return {
          valid: false,
          error: `Access denied: path must be within project root`,
        };
      }

      // Verify the path exists and get the real path (resolves symlinks)
      try {
        const realPath = await fs.realpath(resolvedPath);

        // Final check: ensure real path is still within sandbox
        // This catches symlink-based escape attempts
        if (!realPath.startsWith(this.rootPath)) {
          return {
            valid: false,
            error: `Access denied: path must be within project root`,
          };
        }

        return { valid: true, resolvedPath: realPath };
      } catch {
        // Path doesn't exist - for file creation operations,
        // check that the parent directory is within the sandbox
        const parentDir = path.dirname(resolvedPath);
        try {
          const realParentPath = await fs.realpath(parentDir);
          if (!realParentPath.startsWith(this.rootPath)) {
            return {
              valid: false,
              error: `Access denied: path must be within project root`,
            };
          }
          return { valid: true, resolvedPath: resolvedPath };
        } catch {
          // Parent directory doesn't exist either - reject
          return {
            valid: false,
            error: `Access denied: path must be within project root`,
          };
        }
      }
    } catch {
      return {
        valid: false,
        error: `Access denied: path must be within project root`,
      };
    }
  }

  /**
   * Convenience method: validate and throw on failure.
   * Returns the resolved path on success.
   */
  async resolvePath(requestedPath: string): Promise<string> {
    const result = await this.validatePath(requestedPath);
    if (!result.valid || !result.resolvedPath) {
      throw new Error(result.error ?? 'Access denied');
    }
    return result.resolvedPath;
  }
}
