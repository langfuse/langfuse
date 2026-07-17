/**
 * MCP (Model Context Protocol) Server API Endpoint
 *
 * This endpoint implements the MCP protocol for Langfuse, enabling AI assistants
 * like Claude Desktop and Cursor to directly query, create, and manage Langfuse prompts.
 *
 * Architecture:
 * - Stateless per-request pattern (fresh server instance per request)
 * - Streamable HTTP transport (2025-03-26 spec)
 * - BasicAuth using Langfuse API keys
 * - Context captured in closures (no session storage)
 *
 * Transport: Streamable HTTP (NOT the deprecated HTTP+SSE transport)
 * - Single endpoint handles POST (JSON-RPC), GET (SSE streams), DELETE (sessions)
 * - JSON-RPC messages sent via POST body
 * - No separate /message endpoint needed
 *
 * Note: This endpoint does NOT use withMiddlewares() like other public APIs because
 * the transport layer needs direct response control for both JSON and SSE responses.
 * Error handling, header validation, and CORS are implemented in this route layer.
 *
 * Authentication: BasicAuth (Public Key:Secret Key) - LF-1927
 * Resources: Added in LF-1928
 * Tools: Added in LF-1929
 */

import { type NextApiRequest, type NextApiResponse } from "next";
import { createMcpServer } from "@/src/features/mcp/server/mcpServer";
import { handleMcpRequest } from "@/src/features/mcp/server/transport";
import {
  applyMcpCorsHeaders,
  validateMcpRequestSecurity,
} from "@/src/features/mcp/server/security";
import { formatErrorForUser } from "@/src/features/mcp/core/error-formatting";
import { type ServerContext } from "@/src/features/mcp/types";
import { addUserToSpan, logger, redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { prisma } from "@langfuse/shared/src/db";
import { BaseError, UnauthorizedError, ForbiddenError } from "@langfuse/shared";
import { ZodError } from "zod";
import { isUserInputError } from "@/src/features/mcp/core/errors";
import { IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER } from "@/src/ee/features/in-app-agent/constants";
import { InAppAgentMcpRunOverrideSchema } from "@/src/ee/features/in-app-agent/server/human-in-the-loop";
import { safeJsonParse } from "@/src/utils/json";

// Bootstrap MCP features - registers all tools at module load time
import "@/src/features/mcp/server/bootstrap";

/**
 * MCP API Route Handler
 *
 * Handles MCP protocol requests using Streamable HTTP (SSE) transport.
 *
 * Request flow:
 * 1. Validate Host/Origin headers and handle CORS
 * 2. Authenticate request using BasicAuth (Public Key:Secret Key)
 * 3. Check rate limits
 * 4. Extract ServerContext from authenticated API key
 * 5. Create fresh MCP server instance with context in closures
 * 6. Connect to SSE transport
 * 7. Handle MCP protocol communication
 * 8. Discard server instance after request
 *
 * @param req - Next.js API request
 * @param res - Next.js API response
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const allowedOrigin = validateMcpRequestSecurity(req);
    applyMcpCorsHeaders(res, allowedOrigin);

    // Handle preflight OPTIONS request after request validation
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    // Authenticate request using BasicAuth (Public Key:Secret Key)
    const authCheck = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization, {
      allowInAppAgentKey: true,
    });

    if (!authCheck.validKey) {
      throw new UnauthorizedError(authCheck.error);
    }

    // MCP requires project-scoped access (no Bearer auth, no org-level keys)
    if (
      authCheck.scope.accessLevel !== "project" ||
      !authCheck.scope.projectId
    ) {
      throw new ForbiddenError(
        "Access denied: MCP requires project-scoped API keys with BasicAuth",
      );
    }

    addUserToSpan({
      apiKeyId: authCheck.scope.apiKeyId,
      publicKey: authCheck.scope.publicKey,
      projectId: authCheck.scope.projectId,
      orgId: authCheck.scope.orgId,
      plan: authCheck.scope.plan,
    });

    // Check if ingestion is suspended due to usage limits
    if (authCheck.scope.isIngestionSuspended) {
      throw new ForbiddenError(
        "Access suspended: Usage threshold exceeded. Please upgrade your plan.",
      );
    }

    // Rate limit MCP requests
    const rateLimitCheck =
      await RateLimitService.getInstance().rateLimitRequest(
        authCheck.scope,
        "public-api",
      );

    if (rateLimitCheck?.isRateLimited()) {
      return rateLimitCheck.sendRestResponseIfLimited(res);
    }

    // Build ServerContext from authenticated scope. In-app-agent keys need a
    // run override for mutating tools; read-only tools remain available
    // without it via their MCP readOnlyHint annotation.
    const context: ServerContext = {
      projectId: authCheck.scope.projectId,
      orgId: authCheck.scope.orgId,
      userId: undefined, // API keys don't have associated users
      apiKeyId: authCheck.scope.apiKeyId,
      accessLevel: "project",
      publicKey: authCheck.scope.publicKey,
      userAgent: req.headers["user-agent"],
      inAppAgent: getInAppAgentContext(req, authCheck.scope.isInAppAgentKey),
    };

    logger.debug("MCP request authenticated", {
      method: req.method,
      projectId: context.projectId,
      orgId: context.orgId,
      userAgent: req.headers["user-agent"],
      contentType: req.headers["content-type"],
      accept: req.headers.accept,
    });

    // Build fresh server per request (stateless pattern)
    // Context is captured in closures and available to all handlers
    const server = createMcpServer(context);

    // Handle the MCP request using Streamable HTTP transport
    // Transport handles routing based on HTTP method (POST, GET, DELETE, OPTIONS)
    await handleMcpRequest(server, req, res);
  } catch (error) {
    logger.error("MCP API route error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    // Format error for user (never throw from handler)
    if (!res.headersSent) {
      const mcpError = formatErrorForUser(error);

      // Return appropriate HTTP status based on error type
      let status = 500;
      if (error instanceof BaseError) {
        // BaseError subclasses have their own httpCode (401, 403, 404, 409, 500, etc.)
        status = error.httpCode;
      } else if (isUserInputError(error) || error instanceof ZodError) {
        // User-caused errors (invalid input, validation failures)
        status = 400;
      }

      res.status(status).json({
        error: mcpError.message,
        code: mcpError.code,
      });
    }
  }
}

export function getInAppAgentContext(
  req: NextApiRequest,
  isInAppAgentKey: boolean | undefined,
): ServerContext["inAppAgent"] {
  if (isInAppAgentKey !== true) {
    return undefined;
  }

  const headerValue = req.headers[IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER];

  if (typeof headerValue !== "string") {
    return { permissions: "read" };
  }

  const parsedOverride = InAppAgentMcpRunOverrideSchema.safeParse(
    safeJsonParse(headerValue),
  );

  return parsedOverride.success
    ? {
        permissions: "single-tool-override",
        allowedToolName: parsedOverride.data.toolName,
      }
    : { permissions: "read" };
}

/**
 * Enable body parsing for JSON-RPC messages
 * Streamable HTTP transport receives JSON-RPC via POST body
 */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};
