/**
 * MCP Streamable HTTP Transport
 *
 * Serves both MCP protocol eras through the SDK's createMcpHandler: 2026-07-28
 * requests directly, 2025-era requests through its stateless legacy fallback.
 * Every request gets a fresh server from createMcpServer(context).
 */

import { type NextApiRequest, type NextApiResponse } from "next";
import { EXTENSION_ID as MCP_APPS_EXTENSION_ID } from "@modelcontextprotocol/ext-apps/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  CLIENT_CAPABILITIES_META_KEY,
  createMcpHandler,
  type ClientCapabilities,
} from "@modelcontextprotocol/server";
import { getCurrentSpan, logger } from "@langfuse/shared/src/server";
import { formatErrorForUser } from "../core/error-formatting";
import type { ServerContext } from "../types";
import { createMcpServer } from "./mcpServer";
import { recordResourceRead } from "./resources";

/**
 * Capabilities a 2026-07-28 request declares in its `_meta` envelope, as sent:
 * the SDK validates the request only after the server is built.
 */
const declaredClientCapabilities = (
  body: unknown,
): ClientCapabilities | undefined =>
  (
    body as
      | { params?: { _meta?: Record<string, ClientCapabilities | undefined> } }
      | undefined
  )?.params?._meta?.[CLIENT_CAPABILITIES_META_KEY];

const TRACKED_CAPABILITIES = [
  "elicitation",
  "roots",
  "sampling",
  "tasks",
] as const satisfies readonly (keyof ClientCapabilities)[];

/**
 * The non-experimental extensions from
 * https://modelcontextprotocol.io/extensions/overview that a client declares.
 * Server Cards is left out: it is a document clients fetch, not a declaration.
 */
const TRACKED_EXTENSIONS = {
  enterprise_managed_authorization:
    "io.modelcontextprotocol/enterprise-managed-authorization",
  events: "io.modelcontextprotocol/events",
  oauth_client_credentials: "io.modelcontextprotocol/oauth-client-credentials",
  skills: "io.modelcontextprotocol/skills",
  tasks: "io.modelcontextprotocol/tasks",
  ui: MCP_APPS_EXTENSION_ID,
} as const;

/**
 * One boolean span attribute per tracked capability and extension, `false`
 * included, so each one splits requests into supported and unsupported.
 */
const clientSupportAttributes = (
  capabilities: ClientCapabilities,
): Record<string, boolean> => {
  const extensions: unknown = capabilities?.extensions;
  const declaredExtensions =
    extensions !== null && typeof extensions === "object" ? extensions : {};
  return {
    ...Object.fromEntries(
      TRACKED_CAPABILITIES.map((name) => [
        `mcp.client.capabilities.${name}`,
        capabilities?.[name] !== undefined,
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(TRACKED_EXTENSIONS).map(([name, id]) => [
        `mcp.client.extensions.${name}`,
        id in declaredExtensions,
      ]),
    ),
  };
};

/**
 * Handle an authenticated MCP request.
 *
 * Request validation, CORS headers, OPTIONS handling, and authentication
 * happen in the API route before this is called.
 *
 * Supports:
 * - POST: JSON-RPC requests of either protocol era
 * - GET/DELETE: 405, since serving is stateless
 *
 * @param context - Server context from the authenticated request
 * @param req - Next.js API request (body already parsed)
 * @param res - Next.js API response
 */
export async function handleMcpRequest(
  context: ServerContext,
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  try {
    const span = getCurrentSpan();
    const protocolVersion = req.headers["mcp-protocol-version"];
    if (protocolVersion !== undefined) {
      span?.setAttribute("mcp.protocol.version", protocolVersion);
    }

    // 2025-era clients declare capabilities only on `initialize`, so only
    // 2026-07-28 requests carry them.
    const clientCapabilities = declaredClientCapabilities(req.body);
    if (clientCapabilities !== undefined) {
      span?.setAttributes(clientSupportAttributes(clientCapabilities));
    }
    recordResourceRead(req.body, clientCapabilities);

    const handler = createMcpHandler(
      ({ era }) => {
        span?.setAttribute("mcp.protocol.era", era);
        return createMcpServer(context, clientCapabilities);
      },
      {
        onerror: (error) => {
          logger.warn("MCP request error", {
            message: error.message,
            name: error.name,
          });
        },
      },
    );
    await toNodeHandler(handler)(req, res, req.body);
  } catch (error) {
    logger.error("MCP transport error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : typeof error,
      method: req.method,
    });

    // If headers not sent, send JSON-RPC error response
    if (!res.headersSent) {
      const mcpError = formatErrorForUser(error);
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: mcpError.message,
        },
        id: null,
      });
    }
  }
}
