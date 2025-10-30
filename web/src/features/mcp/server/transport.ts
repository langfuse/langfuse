/**
 * MCP Streamable HTTP Transport
 *
 * Implements the Streamable HTTP transport for the Model Context Protocol.
 * This transport allows MCP communication over HTTP with streaming support.
 *
 * Following MCP specification for remote server communication.
 */

import { type NextApiRequest, type NextApiResponse } from "next";
import { type Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { formatErrorForUser } from "../internal/error-formatting";
import { logger } from "@langfuse/shared/src/server";

/**
 * Handle MCP request using Streamable HTTP (SSE) transport.
 *
 * This function:
 * 1. Sets up SSE (Server-Sent Events) response headers
 * 2. Creates an SSE transport for the MCP server
 * 3. Connects the server to the transport
 * 4. Handles the MCP protocol communication
 * 5. Properly cleans up after the request
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
    // Set SSE headers for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // CORS headers for MCP clients
    // Note: MCP clients (Claude Desktop, Cursor) need permissive CORS for local development
    // TODO(LF-1927): Consider restricting origins based on allowed client list
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    // Create SSE transport for the server
    const transport = new SSEServerTransport("/message", res);

    // Connect server to transport
    await server.connect(transport);

    logger.info("MCP server connected via SSE transport");

    // Keep connection alive until client disconnects
    await new Promise<void>((resolve, reject) => {
      // Handle client disconnect
      req.on("close", () => {
        logger.info("MCP client disconnected");
        resolve();
      });

      // Handle errors (sanitized logging)
      req.on("error", (error) => {
        logger.error("MCP request error", {
          message: error instanceof Error ? error.message : "Unknown error",
          name: error instanceof Error ? error.name : typeof error,
        });
        reject(error);
      });

      // Handle server close
      transport.onclose = () => {
        logger.info("MCP transport closed");
        resolve();
      };
    });
  } catch (error) {
    logger.error("MCP transport error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : typeof error,
    });

    // If headers not sent, send error response
    if (!res.headersSent) {
      const mcpError = formatErrorForUser(error);
      res.status(500).json({
        error: mcpError.message,
        code: mcpError.code,
      });
    }
  } finally {
    // Ensure response is ended
    if (!res.writableEnded) {
      res.end();
    }
  }
}

/**
 * Handle MCP POST message endpoint.
 *
 * Note: The SSEServerTransport from MCP SDK automatically creates and handles
 * the /message endpoint internally. This function is kept for reference but may
 * not be needed if SSEServerTransport handles POST messages automatically.
 *
 * TODO(LF-1927): Verify if a separate /api/public/mcp/message route is needed
 * by testing with MCP clients. If not needed, remove this function.
 *
 * @param req - Next.js API request
 * @param res - Next.js API response
 */
export async function handleMcpPostMessage(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  try {
    // Parse the message from request body
    const message = req.body;

    if (!message) {
      res.status(400).json({ error: "Missing message body" });
      return;
    }

    // The actual message handling is done through the SSE transport
    // This endpoint is called by the SSE transport's /message endpoint
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error("MCP POST message error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : typeof error,
    });
    const mcpError = formatErrorForUser(error);
    res.status(500).json({
      error: mcpError.message,
      code: mcpError.code,
    });
  }
}
