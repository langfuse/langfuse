import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType, type z } from "zod";
import {
  type AuthHeaderValidVerificationResult,
  traceException,
  logger,
  contextWithLangfuseProps,
} from "@langfuse/shared/src/server";
import {
  PayloadTooLargeError,
  type RateLimitResource,
  type ApiDeprecationInfo,
} from "@langfuse/shared";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { type RateLimitUpgradePath } from "@/src/features/public-api/server/rateLimitUpgradePaths";
import * as opentelemetry from "@opentelemetry/api";
import { env } from "@/src/env.mjs";
import { isZodError } from "@/src/features/public-api/server/withMiddlewares";
import { isPrismaException } from "@/src/utils/exceptions";
import {
  createStructuredPublicApiAuthError,
  createStructuredPublicApiRequestValidationError,
  sendStructuredPublicApiErrorResponse,
  structuredPublicApiErrorContract,
  type PublicApiErrorContract,
} from "./structuredPublicApiErrorContract";
import { clickHouseRouteForRequest } from "@/src/features/public-api/server/clickHouseRequestTags";
import { attachDeprecation } from "@/src/features/public-api/server/deprecations";
import {
  verifyAuth as verifyLegacyAuth,
  type RouteAccessLevel,
} from "@/src/features/public-api/server/verifyProjectApiKeyAuth";
import { enforceProjectAuth } from "@/src/features/auth/policy/enforcement.projects";
import {
  diffResults,
  legacyFromStatus,
  recordCoverage,
} from "@/src/features/auth/policy/shadow";
import { type ProjectAction } from "@/src/features/auth/policy/types";

// Next's res.json uses JSON.stringify; V8 throws this when the JSON string
// exceeds the engine limit. Keep this check scoped to the response write.
const isJsonStringTooLargeError = (error: unknown): error is RangeError =>
  error instanceof RangeError && error.message === "Invalid string length";

export type AuthedProjectAPIRouteConfig<
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
> = {
  name: string;
  /**
   * The project action this route authorizes through the policy core. Required
   * so a route cannot ship with no authorization.
   */
  action: ProjectAction;
  querySchema?: TQuery;
  bodySchema?: TBody;
  responseSchema: TResponse;
  successStatusCode?: number;
  rateLimitResource?: z.infer<typeof RateLimitResource>; // defaults to public-api
  rateLimitUpgradePath?: RateLimitUpgradePath;
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
  errorContract?: PublicApiErrorContract;
  /**
   * Access levels accepted for this route. Defaults to ["project"] (Basic auth only).
   * Set to ["project", "scores"] to also allow Bearer auth with a public key
   * (which receives accessLevel "scores").
   */
  allowedAccessLevels?: RouteAccessLevel[];
  /**
   * Whether in-app agent API keys can call this route without additional confirmation. Defaults to false.
   * Only set this to true on non-mutating (GET) routes that should be callable by the in-app agent.
   */
  allowInAppAgentKey?: boolean;
  /**
   * When true, this route returns 404 if LANGFUSE_MIGRATION_V4_WRITE_MODE is
   * "events_only". Set this on routes that read from the legacy traces,
   * observations, or dataset_run_items ClickHouse tables without an
   * events_full fallback — those tables are no longer populated in
   * events_only mode and would silently return stale or empty data.
   */
  rejectInEventsOnlyMode?: boolean;
  /** Stamps a top-level `_deprecation` object onto responses. */
  deprecation?: ApiDeprecationInfo;
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

/** verifyAuth is the project seam: legacy decides in legacy/shadow (byte-identical), and the new PDP gates the legacy scope in enforce. */
export async function verifyAuth(
  params: VerifyAuthParams,
): Promise<LegacyResult> {
  const legacy = await runLegacyAuth(params);

  // legacy mode skips the new pipeline entirely so self-host does no extra auth work
  if (env.API_AUTH_MIGRATION === "legacy") {
    if (!legacy.ok) throw legacy.error;
    return legacy.auth;
  }

  const authz = await enforceProjectAuth({
    headers: params.req.headers,
    action: params.action,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });

  if (env.API_AUTH_MIGRATION === "shadow") {
    recordCoverage(params.name);
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: "project_route",
      action: params.action,
    });
  }
  if (env.API_AUTH_MIGRATION === "enforce" && !authz.success) {
    throw { status: authz.error.httpCode, message: authz.error.message };
  }
  if (!legacy.ok) throw legacy.error;
  return legacy.auth;
}

/** runLegacyAuth runs the legacy verify and captures its throw as a value with the status it reported. */
async function runLegacyAuth(
  params: VerifyAuthParams,
): Promise<LegacyDecision> {
  try {
    const auth = await verifyLegacyAuth(
      params.req,
      params.isAdminApiKeyAuthAllowed ?? false,
      params.allowedAccessLevels ?? ["project"],
      params.allowInAppAgentKey ?? false,
    );
    return { ok: true, status: 200, auth };
  } catch (error) {
    const status = (error as { status?: unknown }).status;
    return {
      ok: false,
      status: typeof status === "number" ? status : 500,
      error,
    };
  }
}

/** VerifyAuthParams is the request plus the route's action and legacy auth options. */
export type VerifyAuthParams = {
  req: NextApiRequest;
  name: string;
  action: ProjectAction;
  isAdminApiKeyAuthAllowed?: boolean;
  allowedAccessLevels?: RouteAccessLevel[];
  allowInAppAgentKey?: boolean;
};

/** LegacyResult is the legacy verify's verified scope. */
type LegacyResult = Awaited<ReturnType<typeof verifyLegacyAuth>>;

/** LegacyDecision is the legacy verify captured as a value: the verified scope, or the status + error to re-throw. */
type LegacyDecision =
  | { ok: true; status: 200; auth: LegacyResult }
  | { ok: false; status: number; error: unknown };

export const createAuthedProjectAPIRoute = <
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
>(
  routeConfig: AuthedProjectAPIRouteConfig<TQuery, TBody, TResponse>,
): ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Cloud-only: the sunset date binds Cloud, not self-hosted deployments.
    const deprecation = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      ? routeConfig.deprecation
      : undefined;

    // Short-circuit routes that read from legacy traces/observations tables
    // when the deployment is in events_only mode — those tables are no longer
    // populated, so the response would be stale or empty. Returning 404 keeps
    // the surface area consistent with "this endpoint is not available here".
    if (
      routeConfig.rejectInEventsOnlyMode &&
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only"
    ) {
      res.status(404).json(
        attachDeprecation(
          {
            message:
              "This endpoint is not available on deployments running in Langfuse v4 events_only mode. Learn more about Langfuse v4 at: https://langfuse.com/docs/v4",
          },
          deprecation,
        ),
      );
      return;
    }

    let auth: AuthHeaderValidVerificationResult & {
      scope: { projectId: string; accessLevel: RouteAccessLevel };
    };

    // Verify authentication (API key or admin API key)
    try {
      auth = await verifyAuth({
        req,
        name: routeConfig.name,
        action: routeConfig.action,
        isAdminApiKeyAuthAllowed: routeConfig.isAdminApiKeyAuthAllowed || false,
        allowedAccessLevels: routeConfig.allowedAccessLevels || ["project"],
        allowInAppAgentKey: routeConfig.allowInAppAgentKey === true,
      });
    } catch (error: any) {
      if (isPrismaException(error)) {
        traceException(error);

        if (routeConfig.errorContract === structuredPublicApiErrorContract) {
          return sendStructuredPublicApiErrorResponse(
            res,
            createStructuredPublicApiAuthError({
              statusCode: 503,
              message: "Service Unavailable",
            }),
          );
        }

        res.status(503).json({ message: "Service Unavailable" });
        return;
      }

      const statusCode = error.status ?? 401;
      const message = error.message ?? "Authentication failed";

      if (routeConfig.errorContract === structuredPublicApiErrorContract) {
        return sendStructuredPublicApiErrorResponse(
          res,
          createStructuredPublicApiAuthError({ statusCode, message }),
        );
      }

      res.status(statusCode).json({ message });

      return;
    }

    const rateLimitResponse =
      await RateLimitService.getInstance().rateLimitRequest(
        auth.scope,
        routeConfig.rateLimitResource || "public-api",
      );

    if (rateLimitResponse?.isRateLimited()) {
      return rateLimitResponse.sendRestResponseIfLimited(res, {
        errorContract: routeConfig.errorContract,
        upgradePath: routeConfig.rateLimitUpgradePath,
      });
    }

    logger.debug(
      `Request to route ${routeConfig.name} projectId ${auth.scope.projectId}`,
    );

    let query: z.infer<TQuery>;
    try {
      query = routeConfig.querySchema
        ? routeConfig.querySchema.parse(req.query)
        : ({} as z.infer<TQuery>);
    } catch (error) {
      if (
        routeConfig.errorContract === structuredPublicApiErrorContract &&
        isZodError(error)
      ) {
        return sendStructuredPublicApiErrorResponse(
          res,
          createStructuredPublicApiRequestValidationError({
            error,
            requestPart: "query",
          }),
        );
      }

      throw error;
    }

    let body: z.infer<TBody>;
    try {
      body = routeConfig.bodySchema
        ? routeConfig.bodySchema.parse(req.body)
        : ({} as z.infer<TBody>);
    } catch (error) {
      if (
        routeConfig.errorContract === structuredPublicApiErrorContract &&
        isZodError(error)
      ) {
        return sendStructuredPublicApiErrorResponse(
          res,
          createStructuredPublicApiRequestValidationError({
            error,
            requestPart: "body",
          }),
        );
      }

      throw error;
    }

    const ctx = contextWithLangfuseProps({
      headers: req.headers,
      projectId: auth.scope.projectId,
      apiKeyId: auth.scope.apiKeyId,
      clickhouse: {
        surface: "publicapi",
        route: clickHouseRouteForRequest(req),
      },
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

      res.status(
        // Check whether status code was already set inside handler to non default value
        res.statusCode !== 200
          ? res.statusCode
          : routeConfig.successStatusCode || 200,
      );

      try {
        res.json(attachDeprecation(response || { message: "OK" }, deprecation));
      } catch (error) {
        if (isJsonStringTooLargeError(error)) {
          throw new PayloadTooLargeError();
        }

        throw error;
      }
    });
  };
};
