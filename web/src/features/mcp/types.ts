import type { AuditRequestContext } from "@langfuse/shared";
import type { ApiAccessScope } from "@langfuse/shared/src/server";

import type { AuthorizationContext } from "@/src/features/auth/policy/types";
import type { McpToolName } from "./server/tools";

/**
 * MCP (Model Context Protocol) Server Types
 *
 * Type definitions for the Langfuse MCP server implementation.
 * Following stateless design pattern from Sentry MCP server.
 */

/**
 * McpConnection is what authenticating one MCP request establishes, before
 * any tool names the project it runs in. An organization key's connection has
 * no project; each tool call resolves one (see resolveToolContext).
 */
export interface McpConnection {
  /** Resolved policy-core context of the API key; every tool call is authorized against it. */
  auth: AuthorizationContext;

  /** API Key ID for audit logging */
  apiKeyId: string;

  /** Public key of the API key, stamped on audit events */
  publicKey: string;

  /** The project a project-scoped key is bound to; undefined for organization keys. */
  boundProjectId?: string;

  /** User agent from the MCP client's HTTP request */
  userAgent?: string;

  /** Client IP, User-Agent and request id stored on access audit events */
  auditRequest?: AuditRequestContext;

  /** In-app-agent-specific MCP authorization state. */
  inAppAgent?: InAppAgentContext;
}

/**
 * ServerContext is a connection resolved to the one project a tool call runs
 * in. Stateless design: all context comes from the request, no session storage.
 *
 * SECURITY & COMPLIANCE:
 *
 * Audit Logging: All mutating operations must create audit log entries
 * using @/src/features/audit-logs/auditLog
 *
 * PII Protection: userId is PII - use sanitized logging
 *
 * RBAC: tools/call authorizes the tool's action on projectId before the handler runs
 *
 * @see /web/src/features/audit-logs/auditLog.ts - Audit logging
 * @see /web/src/features/rbac/README.md - RBAC patterns
 */
export interface ServerContext extends McpConnection {
  /** The project the tool call runs in */
  projectId: string;

  /** The organization that owns projectId */
  orgId: string;

  /** User ID from authenticated user (optional for API key auth) */
  userId?: string;

  /** Tools always run with project access to projectId */
  accessLevel: "project";

  /** Billing plan of the organization, for plan-based rate limiting */
  plan: ApiAccessScope["plan"];

  /** Org-level rate limit overrides from the cloud config */
  rateLimitOverrides: ApiAccessScope["rateLimitOverrides"];

  /** The org's opt-in for read-access audit events */
  accessAuditLogEnabled: ApiAccessScope["accessAuditLogEnabled"];
}

/** In-app agent MCP access is read-only unless a prior approval mints a mutating-tool allowlist. */
type InAppAgentContext =
  | {
      permissions: "read";
    }
  | {
      permissions: "tool-allowlist";
      allowedToolNames: McpToolName[];
    };
