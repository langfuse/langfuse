/**
 * MCP Server Instance
 *
 * Main MCP server configuration and initialization.
 * Implements stateless per-request server pattern.
 *
 * Key principles:
 * - Fresh server instance per request
 * - Context captured in closures (no session storage)
 * - Tools dynamically loaded from registry
 * - Server discarded after request completes
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ServerContext } from "../types";
import { toolRegistry } from "./registry";
import { logger } from "@langfuse/shared/src/server";

const MCP_SERVER_NAME = "langfuse";
const MCP_SERVER_VERSION = "0.2.0";

/**
 * Create and configure the MCP server instance.
 *
 * Creates a fresh MCP server for each request with context captured in closures.
 * This follows the stateless pattern where no server state persists between requests.
 *
 * Tools are dynamically loaded from the global registry, eliminating hardcoded tool lists.
 * Features register themselves at application startup via the bootstrap module.
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
export function createMcpServer(context: ServerContext): Server {
  const server = new Server(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ListTools handler - dynamically load from registry
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await toolRegistry.getToolDefinitions(context);

    logger.debug("MCP ListTools", {
      projectId: context.projectId,
      toolCount: tools.length,
      toolNames: tools.map((t) => t.name),
    });

    return { tools };
  });

  // CallTool handler - route to registered tool handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.debug("MCP CallTool", {
      projectId: context.projectId,
      toolName: name,
    });

    // Look up tool in registry
    const registeredTool = toolRegistry.getTool(name);

    if (!registeredTool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Execute handler with context
    // Handler performs validation and error handling via defineTool wrapper
    const result = await registeredTool.handler(args, context);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  return server;
}
