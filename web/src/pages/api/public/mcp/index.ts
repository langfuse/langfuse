/**
 * MCP (Model Context Protocol) Server API Endpoint
 *
 * This endpoint implements the MCP protocol for Langfuse, enabling AI assistants
 * like Claude Desktop and Cursor to directly query, create, and manage Langfuse prompts.
 *
 * Architecture:
 * - Stateless per-request pattern (fresh server instance per request)
 * - Streamable HTTP (SSE) transport
 * - BasicAuth using Langfuse API keys
 * - Context captured in closures (no session storage)
 *
 * Authentication: Added in LF-1927 (currently using placeholder)
 * Resources: Added in LF-1928
 * Tools: Added in LF-1929
 */

import { type NextApiRequest, type NextApiResponse } from "next";
import { createMcpServer } from "@/src/features/mcp/server/mcpServer";
import { handleMcpRequest } from "@/src/features/mcp/server/transport";
import { formatErrorForUser } from "@/src/features/mcp/internal/error-formatting";
import { type ServerContext } from "@/src/features/mcp/types";
import { logger } from "@langfuse/shared/src/server";

/**
 * MCP API Route Handler
 *
 * Handles MCP protocol requests using Streamable HTTP (SSE) transport.
 *
 * Request flow:
 * 1. Authenticate request (placeholder for now, real auth in LF-1927)
 * 2. Extract ServerContext from auth
 * 3. Create fresh MCP server instance with context in closures
 * 4. Connect to SSE transport
 * 5. Handle MCP protocol communication
 * 6. Discard server instance after request
 *
 * @param req - Next.js API request
 * @param res - Next.js API response
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // TODO(LF-1927): Replace with real authentication
    // For now, use placeholder context to test the infrastructure
    const context: ServerContext = {
      projectId: "placeholder-project-id",
      orgId: "placeholder-org-id",
      userId: "placeholder-user-id",
      apiKeyId: "placeholder-api-key-id",
      accessLevel: "project",
      publicKey: "placeholder-public-key",
    };

    logger.info("MCP request received", {
      method: req.method,
      // Sanitized logging - no PII
    });

    // Build fresh server per request (stateless pattern)
    // Context is captured in closures and available to all handlers
    const server = createMcpServer(context);

    // Handle the MCP request using SSE transport
    await handleMcpRequest(server, req, res);
  } catch (error) {
    logger.error("MCP API route error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    // Format error for user (never throw from handler)
    if (!res.headersSent) {
      const mcpError = formatErrorForUser(error);
      res.status(500).json({
        error: mcpError.message,
        code: mcpError.code,
      });
    }
  }
}

/**
 * Disable body parsing for SSE streaming
 * The SSE transport needs to handle the raw stream
 */
export const config = {
  api: {
    bodyParser: false,
  },
};
