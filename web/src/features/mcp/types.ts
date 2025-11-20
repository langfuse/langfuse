/**
 * MCP (Model Context Protocol) Server Types
 *
 * Type definitions for the Langfuse MCP server implementation.
 * Following stateless design pattern from Sentry MCP server.
 */

/**
 * Server context captured from authenticated request.
 * Stateless design - all context from request, no session storage.
 *
 * SECURITY & COMPLIANCE:
 *
 * Audit Logging: All mutating operations must create audit log entries
 * using @/src/features/audit-logs/auditLog
 *
 * PII Protection: userId is PII - use sanitized logging
 *
 * RBAC: Check accessLevel and scope before operations
 *
 * Rate Limiting: Use RateLimitService from public API
 *
 * @see /web/src/features/public-api/server/apiAuth.ts - Auth patterns
 * @see /web/src/features/audit-logs/auditLog.ts - Audit logging
 * @see /web/src/features/rbac/README.md - RBAC patterns
 */
export interface ServerContext {
  /**
   * Project ID from authenticated API key
   * MCP requires project-scoped access only (never null)
   */
  projectId: string;

  /** Organization ID from authenticated API key */
  orgId: string;

  /** User ID from authenticated user (optional for API key auth) */
  userId?: string;

  /** API Key ID for audit logging */
  apiKeyId: string;

  /**
   * Access level from API key
   * MCP enforces "project" level access only
   */
  accessLevel: "project";

  /** Public key used for authentication */
  publicKey: string;
}
