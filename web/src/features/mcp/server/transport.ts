/**
 * MCP Streamable HTTP Transport
 *
 * Serves both MCP protocol eras through the SDK's createMcpHandler: 2026-07-28
 * requests directly, 2025-era requests through its stateless legacy fallback.
 * Every request gets a fresh server from createMcpServer(context).
 */

import { type NextApiRequest, type NextApiResponse } from "next";
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

/** Capabilities a 2026-07-28 request declares in its `_meta` envelope. */
const declaredClientCapabilities = (
  body: unknown,
): ClientCapabilities | undefined =>
  (
    body as
      | { params?: { _meta?: Record<string, ClientCapabilities | undefined> } }
      | undefined
  )?.params?._meta?.[CLIENT_CAPABILITIES_META_KEY];

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

    const clientCapabilities = declaredClientCapabilities(req.body);
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
