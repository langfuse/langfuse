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

import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import {
  McpServer,
  type CallToolResult,
  type ClientCapabilities,
  type InputRequiredResult,
  type ServerContext as McpRequestContext,
} from "@modelcontextprotocol/server";
import { ForbiddenError } from "@langfuse/shared";
import { isProductFeedbackAvailable } from "@/src/features/feedback/server/FeedbackService";
import { shadowAuthorize } from "@/src/features/public-api/server/shadowAuth";
import { formatErrorForUser } from "../core/error-formatting";
import type { ServerContext } from "../types";
import type { McpTool } from "../core/define-tool";
import { toCallToolResult } from "../core/tool-result";
import { canCallTool, getEnabledTools, type RegisteredTool } from "./tools";
import { clientMayRenderApps, MCP_APPS_EXTENSION } from "../core/mcp-app";
import { contextWithLangfuseProps, logger } from "@langfuse/shared/src/server";
import { context as otelContext } from "@opentelemetry/api";
import { langfuseSkills } from "@/src/features/mcp/server/skills/resources";
import { registerWidgetAppResource } from "@/src/features/mcp/server/apps/resources";

const MCP_SERVER_NAME = "langfuse";

// This MCP server is self-describing. Clients should dynamically inspect available tools and schemas.
// Tool availability and schemas may evolve over time, including the addition, removal, or modification of tools and fields.
// Clients are expected to tolerate schema changes and refresh capabilities dynamically.
const MCP_SERVER_VERSION = "0.3.0-unstable";
const MCP_SERVER_INSTRUCTIONS = [
  "Use this server for project-scoped Langfuse data and actions such as prompts, datasets, scores, comments, metrics, observations etc.",
  "Inspect the available tools and their schemas dynamically; do not assume a fixed tool list.",
  "For conceptual Langfuse product guidance, SDK/API documentation, instrumentation help, or prompt-migration guidance, prefer the Langfuse docs MCP server or installed Langfuse agent skills when they are available.",
  "Discover bundled Langfuse skills with skills/list, retrieve metadata with skills/get, and read skill files with resources/read.",
];
const MCP_FEEDBACK_INSTRUCTION =
  "To send feedback about Langfuse skills, MCP tools, CLI, docs, or public API, ask the user for permission and show the exact feedback payload; if they want a reply, include only an email address they explicitly provide in the feedback text; exclude secrets, customer/project data, trace payloads, and unrelated context, then call submitFeedback.";

/** @internal */
export const getMcpServerInstructions = (): string =>
  isProductFeedbackAvailable()
    ? [...MCP_SERVER_INSTRUCTIONS, MCP_FEEDBACK_INSTRUCTION].join("\n")
    : MCP_SERVER_INSTRUCTIONS.join("\n");

/**
 * Create and configure the MCP server instance.
 *
 * Creates a fresh MCP server for each request with context captured in closures.
 * This follows the stateless pattern where no server state persists between requests.
 *
 * Tools come from the feature modules listed in `tools.ts`. Tools of
 * disabled features are not registered, so calling one fails like calling a
 * tool that does not exist.
 *
 * @param context - Server context from authenticated request (captured in closures)
 * @param clientCapabilities - Capabilities the request declared, if any;
 *   decides whether MCP App tools and their resources are offered
 * @returns Configured MCP Server instance
 *
 * @example
 * // In API route:
 * const server = await createMcpServer(context);
 * await server.connect(transport);
 * // ... handle request ...
 * // Server discarded after request
 */
export async function createMcpServer(
  context: ServerContext,
  clientCapabilities?: ClientCapabilities,
): Promise<McpServer> {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    {
      capabilities: { extensions: MCP_APPS_EXTENSION },
      instructions: getMcpServerInstructions(),
      // A stateless 2025-era request carries no client capabilities (those
      // are only declared in `initialize`), so there is nothing to check a
      // server-to-client prompt against; tools never ask for input there.
      inputRequired: { legacyShim: false },
    },
  );

  const skillCatalog = await langfuseSkills;
  skillCatalog.attach(server);

  const withApps = clientMayRenderApps(clientCapabilities);
  if (withApps) registerWidgetAppResource(server);

  for (const tool of await getEnabledTools(context)) {
    const { name, description, inputSchema, annotations, _meta } =
      tool.definition;
    const callback = (input: unknown, mcpRequest: McpRequestContext) =>
      callTool(tool, input, context, mcpRequest);
    if (!_meta) {
      server.registerTool(
        name,
        { description, inputSchema, annotations },
        callback,
      );
    } else if (withApps) {
      registerAppTool(
        server,
        name,
        { description, inputSchema, annotations, _meta },
        callback,
      );
    }
  }

  return server;
}

/**
 * Runs a tool on SDK-validated input. Errors, denials included, become tool
 * results with a message that is safe to show; internal details stay in the
 * logs.
 */
async function callTool(
  tool: RegisteredTool,
  input: unknown,
  context: ServerContext,
  mcpRequest: McpRequestContext,
): Promise<CallToolResult | InputRequiredResult> {
  const { name, run } = tool.definition;
  logger.debug("MCP CallTool", {
    projectId: context.projectId,
    toolName: name,
  });

  const clickHouseCtx = contextWithLangfuseProps({
    projectId: context.projectId,
    apiKeyId: context.apiKeyId,
    clickhouse: {
      surface: "mcp",
      route: name,
    },
  });
  try {
    if (!canCallTool(tool, context)) {
      throw new ForbiddenError(
        `Tool ${name} needs approval in this in-app agent run.`,
      );
    }
    assertToolAuthorized(tool.definition, context);
    const result = await otelContext.with(clickHouseCtx, () =>
      run(input, context, mcpRequest),
    );
    return toCallToolResult(result);
  } catch (error) {
    return {
      content: [{ type: "text", text: formatErrorForUser(error).message }],
      isError: true,
    };
  }
}

/** Throws the enforce-mode denial when the caller may not run the tool. */
function assertToolAuthorized(
  tool: Pick<McpTool, "action">,
  context: ServerContext,
): void {
  const decision = shadowAuthorize({
    ctx: context.auth,
    action: tool.action,
    resource: { projectId: context.projectId },
    legacyDecision: {
      success: true,
      scope: { accessLevel: context.accessLevel },
    },
  });
  if (!decision.success) throw decision.error;
}

/** @internal */
export const __test = { assertToolAuthorized };
