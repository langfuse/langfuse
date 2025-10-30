/**
 * MCP (Model Context Protocol) Server Types
 *
 * Type definitions for the Langfuse MCP server implementation.
 * Following stateless design pattern from Sentry MCP server.
 */

/**
 * Server context captured from authenticated request.
 * Stateless design - all context from request, no session storage.
 */
export interface ServerContext {
  /** Project ID from authenticated API key */
  projectId: string;

  /** Organization ID from authenticated API key */
  orgId: string;

  /** User ID from authenticated user (optional for API key auth) */
  userId?: string;

  /** API Key ID for audit logging */
  apiKeyId: string;

  /** Access level from API key scope */
  accessLevel: "project" | "organization" | "scores";

  /** Public key used for authentication */
  publicKey: string;
}

/**
 * Configuration for MCP tool definition
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
