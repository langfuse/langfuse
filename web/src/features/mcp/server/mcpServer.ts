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
import type { ToolAnalyticsProperties } from "../core/define-tool";
import { toolRegistry } from "./registry";
import { contextWithLangfuseProps, logger } from "@langfuse/shared/src/server";
import { context as otelContext } from "@opentelemetry/api";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import { env } from "@/src/env.mjs";

const MCP_SERVER_NAME = "langfuse";
const posthog = new ServerPosthog();
const isLangfuseCloud = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined;

// This MCP server is self-describing. Clients should dynamically inspect available tools and schemas.
// Tool availability and schemas may evolve over time, including the addition, removal, or modification of tools and fields.
// Clients are expected to tolerate schema changes and refresh capabilities dynamically.
const MCP_SERVER_VERSION = "0.3.0-unstable";

const hasHttpCode = (error: unknown): error is { httpCode: number } => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return typeof (error as { httpCode?: unknown }).httpCode === "number";
};

const hasErrorCode = (error: unknown): error is { code: string | number } => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === "string" || typeof code === "number";
};

const getToolAnalyticsProperties = (
  context: ServerContext,
  toolName: string,
  analyticsProperties: ToolAnalyticsProperties,
  success: boolean,
) => ({
  toolName,
  success,
  projectId: context.projectId,
  orgId: context.orgId,
  apiKeyId: context.apiKeyId,
  accessLevel: context.accessLevel,
  isInAppAgent: context.inAppAgent !== undefined,
  inAppAgentPermission: context.inAppAgent?.permissions,
  ...analyticsProperties,
});

const getToolErrorAnalyticsProperties = (error: unknown) => {
  const properties: ToolAnalyticsProperties = {
    errorName: error instanceof Error ? error.name : typeof error,
  };

  if (hasHttpCode(error)) {
    properties.errorHttpCode = error.httpCode;
  }

  if (hasErrorCode(error)) {
    properties.errorCode = error.code;
  }

  return properties;
};

const captureToolCall = (
  context: ServerContext,
  toolName: string,
  analyticsProperties: ToolAnalyticsProperties,
  success: boolean,
  error?: unknown,
) => {
  if (!isLangfuseCloud) {
    return;
  }

  try {
    posthog.capture({
      distinctId: context.apiKeyId,
      event: "mcp_tool_call",
      properties: {
        ...getToolAnalyticsProperties(
          context,
          toolName,
          analyticsProperties,
          success,
        ),
        ...(error ? getToolErrorAnalyticsProperties(error) : {}),
      },
    });
  } catch (captureError) {
    logger.warn("Failed to capture MCP PostHog event", {
      toolName,
      message:
        captureError instanceof Error ? captureError.message : "Unknown error",
    });
  }
};

const executeWithToolCallCapture = async <TResult>({
  context,
  toolName,
  analyticsProperties,
  execute,
}: {
  context: ServerContext;
  toolName: string;
  analyticsProperties: ToolAnalyticsProperties;
  execute: () => Promise<TResult>;
}) => {
  let result: TResult | undefined;
  let error: unknown;

  try {
    result = await execute();
  } catch (caughtError) {
    error = caughtError;
  }

  captureToolCall(
    context,
    toolName,
    analyticsProperties,
    error === undefined,
    error,
  );

  if (error !== undefined) {
    throw error;
  }

  return result;
};

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

    let analyticsProperties: ToolAnalyticsProperties = {};

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
    const result = await executeWithToolCallCapture({
      context,
      toolName: name,
      analyticsProperties,
      execute: async () => {
        // Look up tool in registry and apply feature gates. Direct calls should
        // fail the same way as absent tools when a gated feature is disabled.
        const registeredTool = await toolRegistry.getEnabledTool(name, context);

        if (!registeredTool) {
          throw new Error(`Unknown tool: ${name}`);
        }

        let parsedArgs = args;

        try {
          parsedArgs = registeredTool.handler.parseInput?.(args) ?? args;
          Object.assign(
            analyticsProperties,
            registeredTool.handler.getAnalyticsProperties?.(
              parsedArgs,
              context,
            ) ?? {},
          );
        } catch (error) {
          logger.warn("Failed to extract MCP tool analytics properties", {
            projectId: context.projectId,
            toolName: name,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }

        return await otelContext.with(
          clickHouseCtx,
          () =>
            registeredTool.handler.executeParsed?.(parsedArgs, context) ??
            registeredTool.handler(parsedArgs, context),
        );
      },
    });

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
