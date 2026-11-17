/**
 * MCP Streamable HTTP Transport
 *
 * Serves both MCP protocol eras from one stateless endpoint:
 * - 2025-era clients (2025-11-25 and earlier) negotiate via `initialize` and are
 *   served by a per-request NodeStreamableHTTPServerTransport with JSON responses.
 * - 2026-07-28 clients send a `_meta` envelope on every request (no `initialize`;
 *   `server/discover` instead) and are served by the SDK's createMcpHandler.
 *
 * Both paths build the same per-request server via createMcpServer(context).
 */

import { type NextApiRequest, type NextApiResponse } from "next";
import {
  NodeStreamableHTTPServerTransport,
  toNodeHandler,
  toWebRequest,
} from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  isLegacyRequest,
} from "@modelcontextprotocol/server";
import { formatErrorForUser } from "../core/error-formatting";
import type { ServerContext } from "../types";
import { createMcpServer } from "./mcpServer";
import { getCurrentSpan, logger } from "@langfuse/shared/src/server";

/**
 * Returns whether the request is 2025-era (no 2026-07-28 `_meta` envelope
 * claim) and records the era and the `MCP-Protocol-Version` header, when
 * present, on the current span.
 */
async function classifyAndTagProtocolEra(
  req: NextApiRequest,
): Promise<boolean> {
  const webRequest = await toWebRequest(req, req.body);
  const isLegacy = await isLegacyRequest(webRequest, req.body);
  const protocolVersion = req.headers["mcp-protocol-version"];
  getCurrentSpan()?.setAttributes({
    "mcp.protocol.era": isLegacy ? "legacy" : "modern",
    ...(protocolVersion !== undefined && {
      "mcp.protocol.version": protocolVersion,
    }),
  });
  return isLegacy;
}

async function handleRequest(
  context: ServerContext,
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const handler = createMcpHandler(() => createMcpServer(context), {
    legacy: "reject",
    onerror: (error) => {
      logger.warn("MCP 2026-07-28 request error", {
        message: error.message,
        name: error.name,
      });
    },
  });
  await toNodeHandler(handler)(req, res, req.body);
}

async function handleLegacyRequest(
  context: ServerContext,
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const server = createMcpServer(context);
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);

    logger.debug("MCP server connected via Streamable HTTP transport", {
      method: req.method,
    });

    // The transport writes and ends the response (JSON or SSE).
    await transport.handleRequest(req, res, req.body);
  } finally {
    // server.close() also closes the transport.
    await server.close().catch((err) => {
      logger.warn("Error closing MCP server", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    });
  }
}

/**
 * Handle an authenticated MCP request.
 *
 * Request validation, CORS headers, OPTIONS handling, and authentication
 * happen in the API route before this is called.
 *
 * Supports:
 * - POST: JSON-RPC requests of either protocol era
 * - GET: SSE stream for server-initiated messages (2025 era, optional)
 * - DELETE: Session termination (returns 405 for stateless)
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
    // Validate Accept header for POST requests (per spec)
    if (req.method === "POST") {
      const acceptHeader = req.headers.accept || "";
      if (
        !acceptHeader.includes("application/json") &&
        !acceptHeader.includes("text/event-stream") &&
        !acceptHeader.includes("*/*")
      ) {
        res.status(406).json({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message:
              "Invalid Request: Accept header must include application/json or text/event-stream",
          },
          id: null,
        });
        return;
      }
    }

    const isLegacy = await classifyAndTagProtocolEra(req);
    if (isLegacy) {
      // dedicated path to keep json response for legacy requests
      await handleLegacyRequest(context, req, res);
      return;
    }

    await handleRequest(context, req, res);
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
