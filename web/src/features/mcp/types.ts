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

/**
 * Configuration for MCP tool definition
 *
 * @deprecated Use DefineToolOptions from define-tool.ts for new tools.
 * This interface exists for reference but defineTool() uses DefineToolOptions.
 */
export interface ToolConfig {
  /** Tool name (must be unique) */
  name: string;

  /** Tool description for LLM */
  description: string;

  /** Input schema (Zod schema) */
  inputSchema: unknown;

  /** Whether this tool is read-only */
  readOnly?: boolean;

  /** Whether this tool has destructive effects */
  destructive?: boolean;

  /** Whether this tool is expensive to run */
  expensive?: boolean;
}

/**
 * Resource URI structure for Langfuse resources
 *
 * TODO(LF-1928): This will be used when implementing MCP resource handlers.
 * Resources provide read-only URI-based access to Langfuse data.
 *
 * Example URIs:
 * - langfuse://prompts?projectId={id}&name={name}
 * - langfuse://prompt/{name}?projectId={id}&label={label}
 */
export interface ResourceUri {
  /** URI scheme (always "langfuse") */
  scheme: "langfuse";

  /** Resource type (e.g., "prompts", "prompt") */
  type: string;

  /** Resource identifier (e.g., prompt name) */
  id?: string;

  /** Query parameters */
  params?: Record<string, string>;
}
