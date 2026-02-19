/**
 * MCP Streamable HTTP Transport
 *
 * Implements the Streamable HTTP transport for the Model Context Protocol (2025-03-26 spec).
 * This transport allows MCP communication over HTTP with JSON-RPC messages.
 *
 */

import { type NextApiRequest, type NextApiResponse } from "next";
import { type Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { formatErrorForUser } from "../core/error-formatting";
import { logger } from "@langfuse/shared/src/server";

/**
 * Handle MCP request using Streamable HTTP transport.
 *
 * This function:
 * 1. Sets CORS headers for MCP clients
 * 2. Creates a StreamableHTTPServerTransport (stateless mode)
 * 3. Connects the server to the transport
 * 4. Routes the request to the transport handler
 * 5. Transport handles the response lifecycle
 *
 * Supports:
 * - POST: JSON-RPC requests (initialize, tool calls, etc.)
 * - GET: SSE stream for server-initiated messages (optional)
 * - DELETE: Session termination (returns 405 for stateless)
 * - OPTIONS: CORS preflight
 *
 * @param server - MCP Server instance (created per-request)
 * @param req - Next.js API request
 * @param res - Next.js API response
 */
export async function handleMcpRequest(
  server: Server,
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  try {
    // Note: CORS headers and OPTIONS handling are now in index.ts (before authentication)

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

    // Create Streamable HTTP transport (stateless mode - no sessionIdGenerator)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true, // Use JSON response (simpler for stateless mode)
      enableDnsRebindingProtection: true, // CVE-2025-66414: Protect against DNS rebinding attacks
    });

    try {
      // Connect server to transport
      await server.connect(transport);

      logger.info("MCP server connected via Streamable HTTP transport", {
        method: req.method,
      });

      // Handle the request through the transport
      // IMPORTANT: The transport manages the response lifecycle internally.
      // It will send the response and end it when appropriate.
      // Do NOT call res.end() after this - the transport handles it.
      await transport.handleRequest(req, res, req.body);

      // Note: Do NOT end the response here. The transport has already
      // sent the response (JSON or SSE) and ended it appropriately.
    } finally {
      // Clean up server and transport to prevent memory leaks
      // server.close() internally calls transport.close()
      await server.close().catch((err) => {
        logger.warn("Error closing MCP server", {
          error: err instanceof Error ? err.message : "Unknown",
        });
      });
    }
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
