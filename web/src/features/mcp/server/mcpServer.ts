/* eslint-disable @typescript-eslint/no-deprecated -- Keep the MCP low-level Server API for now; migration to McpServer needs endpoint-level coverage. */
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
import { contextWithLangfuseProps, logger } from "@langfuse/shared/src/server";
import { context as otelContext } from "@opentelemetry/api";

const MCP_SERVER_NAME = "langfuse";

// This MCP server is self-describing. Clients should dynamically inspect available tools and schemas.
// Tool availability and schemas may evolve over time, including the addition, removal, or modification of tools and fields.
// Clients are expected to tolerate schema changes and refresh capabilities dynamically.
const MCP_SERVER_VERSION = "0.3.0-unstable";
const MCP_SERVER_INSTRUCTIONS = [
  "Use this server for project-scoped Langfuse data and actions such as prompts, datasets, scores, comments, metrics, observations etc.",
  "Inspect the available tools and their schemas dynamically; do not assume a fixed tool list.",
  "For conceptual Langfuse product guidance, SDK/API documentation, instrumentation help, or prompt-migration guidance, prefer the Langfuse docs MCP server or installed Langfuse agent skills when they are available.",
  "To send feedback about Langfuse skills, MCP tools, CLI, docs, or public API, ask the user for permission, show the exact feedback payload, avoid secrets/customer data/trace payloads, then call submitFeedback.",
].join("\n");

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
      instructions: MCP_SERVER_INSTRUCTIONS,
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

    // Look up tool in registry and apply feature gates. Direct calls should
    // fail the same way as absent tools when a gated feature is disabled.
    const registeredTool = await toolRegistry.getEnabledTool(name, context);

    if (!registeredTool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Execute handler with context
    // Handler performs validation and error handling via defineTool wrapper
    const clickHouseCtx = contextWithLangfuseProps({
      projectId: context.projectId,
      apiKeyId: context.apiKeyId,
      clickhouse: {
        surface: "mcp",
        route: name,
      },
    });
    const result = await otelContext.with(clickHouseCtx, () =>
      registeredTool.handler(args, context),
    );

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
