/**
 * MCP Server Instance
 *
 * Main MCP server configuration and initialization.
 * Implements stateless per-request server pattern from Sentry MCP.
 *
 * Key principles:
 * - Fresh server instance per request
 * - Context captured in closures (no session storage)
 * - Server discarded after request completes
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ServerContext } from "../types";

const MCP_SERVER_NAME = "langfuse";
const MCP_SERVER_VERSION = "0.1.0";

/**
 * Create and configure the MCP server instance.
 *
 * Creates a fresh MCP server for each request with context captured in closures.
 * This follows the stateless pattern where no server state persists between requests.
 *
 * Tools and resources will be registered with access to 'context' via closures.
 * Each handler can access the context without it being stored in the server instance.
 *
 * @param context - Server context from authenticated request (captured in closures)
 * @returns Configured MCP Server instance
 *
 * @example
 * // In API route:
 * const server = createMcpServer(context);
 * await server.connect(transport);
 * // ... handle request ...
 * // Server discarded after request
 */
export function createMcpServer(_context: ServerContext): Server {
  const server = new Server(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  // Context is captured here and available to all handlers via closure
  // Authentication completed in LF-1927 using BasicAuth
  // Resources will be registered in LF-1928
  // Tools will be registered in LF-1929
  // Each handler will have access to '_context' without storing it in server

  // TODO(LF-1928): Register prompt resources using _context
  // TODO(LF-1929): Register prompt tools using _context
  //
  // CRITICAL: All mutating tool handlers MUST include audit logging:
  // import { auditLog } from "@/src/features/audit-logs/auditLog";
  // await auditLog({
  //   action: "create" | "update" | "delete",
  //   resourceType: "prompt",
  //   resourceId: prompt.id,
  //   projectId: _context.projectId,
  //   orgId: _context.orgId,
  //   apiKeyId: _context.apiKeyId,
  //   after: newData,  // For create/update
  //   before: oldData, // For update/delete
  // });

  return server;
}
