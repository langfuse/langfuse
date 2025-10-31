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
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ServerContext } from "../types";
import { listPromptsResource, getPromptResource } from "./resources/prompts";
import { formatErrorForUser } from "../internal/error-formatting";

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
  // Resources registered in LF-1928
  // Tools will be registered in LF-1929
  // Each handler can access '_context' via closure

  // Register resource handlers (LF-1928)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "langfuse://prompts",
          name: "Langfuse Prompts",
          description:
            "List prompts in the project. Query params: ?name={partial match}&label={exact match}&tag={exact match}&limit={1-250, default 100}&offset={skip count, default 0}. Returns prompt metadata ordered by creation date (newest first).",
          mimeType: "application/json",
        },
        {
          uri: "langfuse://prompt/{name}",
          name: "Langfuse Prompt",
          description:
            "Get a compiled prompt by name. Query params: ?label={label} OR ?version={number} (mutually exclusive). Defaults to 'production' label if neither specified. Returns fully compiled prompt with resolved dependencies.",
          mimeType: "application/json",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const uri = new URL(request.params.uri);

      // Route to appropriate handler based on URI
      if (uri.protocol === "langfuse:" && uri.hostname === "prompts") {
        return await listPromptsResource(uri, _context);
      }

      if (uri.protocol === "langfuse:" && uri.hostname === "prompt") {
        // Extract and decode prompt name from URI path
        let promptName = uri.pathname.slice(1); // Remove leading /

        // Decode URI-encoded characters (e.g., %20 → space)
        try {
          promptName = decodeURIComponent(promptName);
        } catch (decodeError) {
          throw new Error(
            `Invalid URI encoding in prompt name: ${uri.pathname}`,
          );
        }

        // Validate prompt name
        if (!promptName || !promptName.trim()) {
          throw new Error("Prompt name is required in URI path");
        }

        return await getPromptResource(uri, promptName.trim(), _context);
      }

      throw new Error(`Unknown resource URI: ${uri.toString()}`);
    } catch (error) {
      const mcpError = formatErrorForUser(error);
      throw mcpError;
    }
  });

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
