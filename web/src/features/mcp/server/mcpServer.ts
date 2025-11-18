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
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ServerContext } from "../types";
import {
  getPromptTool,
  handleGetPrompt,
  listPromptsTool,
  handleListPrompts,
  createTextPromptTool,
  handleCreateTextPrompt,
  createChatPromptTool,
  handleCreateChatPrompt,
  updatePromptLabelsTool,
  handleUpdatePromptLabels,
} from "./tools";

const MCP_SERVER_NAME = "langfuse";
const MCP_SERVER_VERSION = "0.1.0";

/**
 * Create and configure the MCP server instance.
 *
 * Creates a fresh MCP server for each request with context captured in closures.
 * This follows the stateless pattern where no server state persists between requests.
 *
 * Tools are registered with access to 'context' via closures.
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
        tools: {},
      },
    },
  );

  // Context is captured here and available to all handlers via closure
  // Authentication completed in LF-1927 using BasicAuth
  // Tools registered in LF-1929
  // Each handler can access '_context' via closure

  // Register tool handlers (LF-1929)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const toolsResponse = {
      tools: [
        getPromptTool,
        listPromptsTool,
        createTextPromptTool,
        createChatPromptTool,
        updatePromptLabelsTool,
      ],
    };

    return toolsResponse;
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Route to appropriate tool handler based on name
    // Handlers are wrapped with validation and error handling via defineTool
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolArgs = args as any;

    switch (name) {
      case "getPrompt":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleGetPrompt(toolArgs, _context),
                null,
                2,
              ),
            },
          ],
        };
      case "listPrompts":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleListPrompts(toolArgs, _context),
                null,
                2,
              ),
            },
          ],
        };
      case "createTextPrompt":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleCreateTextPrompt(toolArgs, _context),
                null,
                2,
              ),
            },
          ],
        };
      case "createChatPrompt":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleCreateChatPrompt(toolArgs, _context),
                null,
                2,
              ),
            },
          ],
        };
      case "updatePromptLabels":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await handleUpdatePromptLabels(toolArgs, _context),
                null,
                2,
              ),
            },
          ],
        };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}
