import crypto from "node:crypto";
import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType, type z } from "zod";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { prisma } from "@langfuse/shared/src/db";
import {
  redis,
  type AuthHeaderValidVerificationResult,
  type ApiAccessLevel,
  traceException,
  logger,
} from "@langfuse/shared/src/server";
import { type RateLimitResource } from "@langfuse/shared";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { contextWithLangfuseProps } from "@langfuse/shared/src/server";
import * as opentelemetry from "@opentelemetry/api";
import { env } from "@/src/env.mjs";

/** Access levels that can be accepted by project-scoped API routes. */
type RouteAccessLevel = Exclude<ApiAccessLevel, "organization">;

type RouteConfig<
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
> = {
  name: string;
  querySchema?: TQuery;
  bodySchema?: TBody;
  responseSchema: TResponse;
  successStatusCode?: number;
  rateLimitResource?: z.infer<typeof RateLimitResource>; // defaults to public-api
  /**
   * Allow authentication via ADMIN_API_KEY for self-hosted instances only.
   * When enabled, the endpoint will accept admin API key authentication in addition to regular API keys.
   *
   * Admin API key authentication requires:
   * - Authorization: Bearer <ADMIN_API_KEY>
   * - x-langfuse-admin-api-key: <ADMIN_API_KEY> (must match exactly for redundancy)
   * - x-langfuse-project-id: <project-id> (target project)
   *
   * This authentication method is ONLY available when NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is not set (self-hosted).
   *
   * @default false
   */
  isAdminApiKeyAuthAllowed?: boolean;
  /**
   * Access levels accepted for this route. Defaults to ["project"] (Basic auth only).
   * Set to ["project", "scores"] to also allow Bearer auth with a public key
   * (which receives accessLevel "scores").
   */
  allowedAccessLevels?: RouteAccessLevel[];
  fn: (params: {
    query: z.infer<TQuery>;
    body: z.infer<TBody>;
    req: NextApiRequest;
    res: NextApiResponse;
    auth: AuthHeaderValidVerificationResult & {
      scope: { projectId: string; accessLevel: RouteAccessLevel };
    };
  }) => Promise<z.infer<TResponse>>;
};

/**
 * Verifies API key authentication (Basic or Bearer) using ApiAuthService.
 *
 * Delegates to ApiAuthService.verifyAuthHeaderAndReturnScope which handles
 * both Basic auth (public + secret key) and Bearer auth (public key only).
 * The caller controls which access levels are accepted via allowedAccessLevels.
 *
 * @param authHeader - The Authorization header from the request
 * @param allowedAccessLevels - Access levels to accept (default: ["project"])
 * @returns An auth scope object with the verified access level
 * @throws Error with appropriate message if authentication fails
 */
async function verifyApiKeyAuth(
  authHeader: string | undefined,
  allowedAccessLevels: RouteAccessLevel[] = ["project"],
): Promise<
  AuthHeaderValidVerificationResult & {
    scope: { projectId: string; accessLevel: RouteAccessLevel };
  }
> {
  const regularAuth = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(authHeader);

  if (!regularAuth.validKey) {
    throw { status: 401, message: regularAuth.error };
  }

  if (
    !(allowedAccessLevels as ApiAccessLevel[]).includes(
      regularAuth.scope.accessLevel,
    )
  ) {
    throw {
      status: 401,
      message: "Access denied - insufficient permissions for this endpoint",
    };
  }

  if (!regularAuth.scope.projectId) {
    throw {
      status: 401,
      message:
        "Project ID not found for API token. Are you using an organization key?",
    };
  }

  return regularAuth as AuthHeaderValidVerificationResult & {
    scope: { projectId: string; accessLevel: RouteAccessLevel };
  };
}

/**
 * Verifies admin API key authentication for self-hosted instances.
 *
 * This function checks if the request contains valid admin API key credentials:
 * 1. Authorization header must be Bearer token format with ADMIN_API_KEY value
 * 2. x-langfuse-admin-api-key header must match ADMIN_API_KEY env var exactly (for redundancy)
 * 3. x-langfuse-project-id header must be present and specify a valid project ID
 * 4. NEXT_PUBLIC_LANGFUSE_CLOUD_REGION must NOT be set (self-hosted instances only)
 *
 * The ADMIN_API_KEY must be set as an environment variable on the server.
 * This authentication method is intended for administrative operations on self-hosted instances.
 *
 * @param req - The Next.js API request
 * @returns An auth scope object if successful, null if admin auth is not being attempted
 * @throws Error with appropriate status code if admin auth fails
 */
async function verifyAdminApiKeyAuth(req: NextApiRequest): Promise<
  | (AuthHeaderValidVerificationResult & {
      scope: { projectId: string; accessLevel: "project" };
    })
  | null
> {
  const authHeader = req.headers.authorization;
  const adminApiKeyHeader = req.headers["x-langfuse-admin-api-key"];
  const projectIdHeader = req.headers["x-langfuse-project-id"];

  // If not attempting admin auth, return null to proceed with regular auth
  if (!authHeader?.startsWith("Bearer ") || !adminApiKeyHeader) return null;

  // Verify this is a self-hosted instance (not Langfuse Cloud)
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw {
      status: 403,
      message: "Admin API key auth is not available on Langfuse Cloud",
    };
  }

  // Verify ADMIN_API_KEY is configured
  const adminApiKey = env.ADMIN_API_KEY;
  if (!adminApiKey) {
    throw {
      status: 500,
      message: "Admin API key is not configured on this instance",
    };
  }

  // Extract Bearer token
  const bearerToken = authHeader.replace("Bearer ", "");

  // Verify both the Bearer token and header match the ADMIN_API_KEY.
  // Keep this comparison in sync with the admin-key check in
  // web/src/ee/features/admin-api/server/adminApiAuth.ts.
  try {
    // timingSafeEqual throws on different input lengths, handle accordingly
    const bearerTokenEqual = crypto.timingSafeEqual(
      Buffer.from(bearerToken),
      Buffer.from(adminApiKey),
    );
    const headerEqual = crypto.timingSafeEqual(
      Buffer.from(String(adminApiKeyHeader)),
      Buffer.from(adminApiKey),
    );
    const isEqual = bearerTokenEqual && headerEqual;

    if (!isEqual) throw Error();
  } catch {
    throw { status: 401, message: "Invalid admin API key" };
  }

  // Verify project ID header is present
  if (!projectIdHeader || typeof projectIdHeader !== "string") {
    throw {
      status: 400,
      message:
        "x-langfuse-project-id header is required for admin API key authentication",
    };
  }

  // Verify project exists
  const project = await prisma.project.findUnique({
    where: { id: projectIdHeader, deletedAt: null },
    select: { id: true, orgId: true },
  });

  if (!project) {
    throw { status: 404, message: "Project not found" };
  }

  // Return auth scope matching the regular auth structure
  return {
    validKey: true,
    scope: {
      projectId: project.id,
      accessLevel: "project" as const,
      orgId: project.orgId,
      plan: "oss",
      rateLimitOverrides: [],
      apiKeyId: "ADMIN_API_KEY", // Special identifier for audit logging
      publicKey: "ADMIN_API_KEY",
      isIngestionSuspended: false,
    },
  };
}

/**
 * Verifies authentication for API routes with support for both regular API key
 * auth (Basic or Bearer) and admin API key auth.
 *
 * This is the main authentication entry point that delegates to either admin
 * or regular API key auth based on the configuration and request headers.
 *
 * @param req - The Next.js API request
 * @param isAdminApiKeyAuthAllowed - Whether to allow admin API key authentication
 * @param allowedAccessLevels - Access levels to accept for regular API key auth
 * @returns An auth scope object with the verified access level
 * @throws Error with appropriate status code if authentication fails
 */
export async function verifyAuth(
  req: NextApiRequest,
  isAdminApiKeyAuthAllowed: boolean,
  allowedAccessLevels: RouteAccessLevel[] = ["project"],
): Promise<
  AuthHeaderValidVerificationResult & {
    scope: { projectId: string; accessLevel: RouteAccessLevel };
  }
> {
  if (isAdminApiKeyAuthAllowed) {
    // Try admin API key authentication first
    const adminAuth = await verifyAdminApiKeyAuth(req);
    if (adminAuth) {
      // Admin auth succeeded
      return adminAuth;
    }
    // Admin auth not attempted, fall back to regular API key auth
    return await verifyApiKeyAuth(
      req.headers.authorization,
      allowedAccessLevels,
    );
  }

  // Only regular API key auth is allowed
  return await verifyApiKeyAuth(req.headers.authorization, allowedAccessLevels);
}

export const createAuthedProjectAPIRoute = <
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
>(
  routeConfig: RouteConfig<TQuery, TBody, TResponse>,
): ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    let auth: AuthHeaderValidVerificationResult & {
      scope: { projectId: string; accessLevel: RouteAccessLevel };
    };

    // Verify authentication (API key or admin API key)
    try {
      auth = await verifyAuth(
        req,
        routeConfig.isAdminApiKeyAuthAllowed || false,
        routeConfig.allowedAccessLevels || ["project"],
      );
    } catch (error: any) {
      const statusCode = error.status || 401;
      const message = error.message || "Authentication failed";

      res.status(statusCode).json({ message });

      return;
    }

    const rateLimitResponse =
      await RateLimitService.getInstance().rateLimitRequest(
        auth.scope,
        routeConfig.rateLimitResource || "public-api",
      );

    if (rateLimitResponse?.isRateLimited()) {
      return rateLimitResponse.sendRestResponseIfLimited(res);
    }

    logger.debug(
      `Request to route ${routeConfig.name} projectId ${auth.scope.projectId}`,
      {
        query: req.query,
        body: req.body,
      },
    );

    const query = routeConfig.querySchema
      ? routeConfig.querySchema.parse(req.query)
      : ({} as z.infer<TQuery>);
    const body = routeConfig.bodySchema
      ? routeConfig.bodySchema.parse(req.body)
      : ({} as z.infer<TBody>);

    const ctx = contextWithLangfuseProps({
      headers: req.headers,
      projectId: auth.scope.projectId,
    });
    return opentelemetry.context.with(ctx, async () => {
      const response = await routeConfig.fn({
        query,
        body,
        req,
        res,
        auth: auth as AuthHeaderValidVerificationResult & {
          scope: { projectId: string; accessLevel: RouteAccessLevel };
        },
      });

      if (env.NODE_ENV === "development" && routeConfig.responseSchema) {
        const parsingResult = routeConfig.responseSchema.safeParse(response);
        if (!parsingResult.success) {
          logger.error("Response validation failed:", parsingResult.error);
          traceException(parsingResult.error);
        }
      }

      res
        .status(
          // Check whether status code was already set inside handler to non default value
          res.statusCode !== 200
            ? res.statusCode
            : routeConfig.successStatusCode || 200,
        )
        .json(response || { message: "OK" });
    });
  };
};
