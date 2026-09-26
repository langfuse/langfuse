import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType, type z } from "zod";
import {
  type ApiAccessScopeWithOptionalApiKeyId,
  type AuthHeaderValidVerificationResult,
  traceException,
  logger,
  contextWithLangfuseProps,
} from "@langfuse/shared/src/server";
import {
  BaseError,
  ForbiddenError,
  LangfuseNotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  UnauthorizedError,
  type RateLimitResource,
  type ApiDeprecationInfo,
} from "@langfuse/shared";
import { verifyGatewayIngestionAuthorization } from "@/src/features/ai-gateway/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { type RateLimitUpgradePath } from "@/src/features/public-api/server/rateLimitUpgradePaths";
import * as opentelemetry from "@opentelemetry/api";
import { env } from "@/src/env.mjs";
import { isZodError } from "@/src/features/public-api/server/withMiddlewares";
import {
  createStructuredPublicApiAuthError,
  createStructuredPublicApiRequestValidationError,
  sendStructuredPublicApiErrorResponse,
  structuredPublicApiErrorContract,
  type PublicApiErrorContract,
} from "./structuredPublicApiErrorContract";
import { clickHouseRouteForRequest } from "@/src/features/public-api/server/clickHouseRequestTags";
import { attachDeprecation } from "@/src/features/public-api/server/deprecations";
import { applyLegacyApiOrganizationCutoff } from "@/src/features/public-api/server/legacyApiOrganizationCutoff";
import { type RouteAccessLevel } from "@/src/features/public-api/server/verifyProjectApiKeyAuth";
import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";
import { type ProjectAction } from "@/src/features/rbac/types";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

// Next's res.json uses JSON.stringify; V8 throws this when the JSON string
// exceeds the engine limit. Keep this check scoped to the response write.
const isJsonStringTooLargeError = (error: unknown): error is RangeError =>
  error instanceof RangeError && error.message === "Invalid string length";

/** toMiddlewareAuthError maps seam auth failures onto the BaseError classes whose `name` withMiddlewares already puts in `{ error }`. */
function toMiddlewareAuthError(error: BaseError): BaseError {
  switch (error.httpCode) {
    case 401:
      return error instanceof UnauthorizedError
        ? error
        : new UnauthorizedError(error.message);
    case 403:
      return error instanceof ForbiddenError
        ? error
        : new ForbiddenError(error.message);
    case 404:
      return error instanceof LangfuseNotFoundError
        ? error
        : new LangfuseNotFoundError(error.message);
    case 503:
      return error instanceof ServiceUnavailableError
        ? error
        : new ServiceUnavailableError(error.message);
    default:
      return error;
  }
}

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
   */
  allowInAppAgentKey?: boolean;
  /**
   * Whether a signed AI-gateway ingestion token may authorize this route ahead
   * of the API-key pipeline. Defaults to false.
   */
  allowGatewayIngestionToken?: boolean;
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
    /**
     * Policy context from the new auth pipeline. Present in shadow and
     * enforce; absent in legacy and on gateway-token auth.
     */
    ctx?: AuthorizationContext;
  }) => Promise<z.infer<TResponse>>;
};

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

    const renderAuthError = (error: BaseError) => {
      const publicError = toMiddlewareAuthError(error);
      if (routeConfig.errorContract === structuredPublicApiErrorContract) {
        return sendStructuredPublicApiErrorResponse(
          res,
          createStructuredPublicApiAuthError({
            statusCode: publicError.httpCode,
            message: publicError.message,
          }),
        );
      }
      res.status(publicError.httpCode).json({
        message: publicError.message,
        error: publicError.name,
      });
    };

    // A signed AI-gateway ingestion token authorizes the project directly,
    // ahead of the API-key pipeline; an invalid one is a 401.
    let gatewayAuth: Awaited<
      ReturnType<typeof verifyGatewayIngestionAuthorization>
    > = null;
    if (routeConfig.allowGatewayIngestionToken) {
      try {
        gatewayAuth = await verifyGatewayIngestionAuthorization(
          req.headers.authorization,
          req.headers["langfuse-gateway-authorization"],
        );
      } catch (error) {
        renderAuthError(
          error instanceof BaseError
            ? error
            : new UnauthorizedError(
                error instanceof Error
                  ? error.message
                  : "Authentication failed",
              ),
        );
        return;
      }
    }

    // The route's action guarantees a project scope; narrow off the phantom org level.
    let auth: {
      validKey: true;
      scope: ApiAccessScopeWithOptionalApiKeyId & {
        projectId: string;
        accessLevel: RouteAccessLevel;
      };
    };
    let authzCtx: AuthorizationContext | undefined;

    if (gatewayAuth) {
      auth = gatewayAuth;
    } else {
      const result = await shadowAuth({
        req,
        action: routeConfig.action,
        isAdminApiKeyAuthAllowed: routeConfig.isAdminApiKeyAuthAllowed || false,
        allowedAccessLevels: routeConfig.allowedAccessLevels ?? ["project"],
        allowInAppAgentKey: routeConfig.allowInAppAgentKey === true,
      });

      if (!result.success) {
        renderAuthError(result.error);
        return;
      }

      auth = {
        validKey: true,
        scope: result.scope as ApiAccessScopeWithOptionalApiKeyId & {
          projectId: string;
          accessLevel: RouteAccessLevel;
        },
      };
      authzCtx = result.ctx;
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

    const cutoffRejection = applyLegacyApiOrganizationCutoff({
      req,
      deprecation,
      scope: auth.scope,
      routeName: routeConfig.name,
    });
    if (cutoffRejection) {
      res.status(410).json(cutoffRejection.body);
      return;
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

    const otelCtx = contextWithLangfuseProps({
      headers: req.headers,
      projectId: auth.scope.projectId,
      apiKeyId: auth.scope.apiKeyId,
      clickhouse: {
        surface: "publicapi",
        route: clickHouseRouteForRequest(req),
      },
    });
    return opentelemetry.context.with(otelCtx, async () => {
      const response = await routeConfig.fn({
        query,
        body,
        req,
        res,
        // A gateway-token scope carries no apiKeyId; route handlers that need
        // one gate on the api-key path, so narrow to the required shape here.
        auth: auth as AuthHeaderValidVerificationResult & {
          scope: { projectId: string; accessLevel: RouteAccessLevel };
        },
        ctx: authzCtx,
      });

      if (env.NODE_ENV === "development" && routeConfig.responseSchema) {
        const parsingResult = routeConfig.responseSchema.safeParse(response);
        if (!parsingResult.success) {
          logger.error("Response validation failed:", parsingResult.error);
          traceException(parsingResult.error);
        }
      }

      const statusCode =
        // Check whether status code was already set inside handler to non default value
        res.statusCode !== 200
          ? res.statusCode
          : routeConfig.successStatusCode || 200;

      if (statusCode === 204) {
        res.status(204).end();
        return;
      }

      res.status(statusCode);

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
