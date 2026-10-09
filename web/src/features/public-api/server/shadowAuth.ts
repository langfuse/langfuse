import { type NextApiRequest } from "next";

import { ApiError, isBaseError, type BaseError } from "@langfuse/shared";
import {
  type ApiAccessLevel,
  type ApiAccessScope,
  logger,
  redactLangfuseSecretKeys,
  redis,
  traceException,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  OrganizationId,
  ProjectId,
  type ResourceId,
  type TenantId,
} from "@langfuse/shared/rbac";

import { env } from "@/src/env.mjs";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import {
  verifyAuth as verifyLegacyProjectAuth,
  type RouteAccessLevel,
} from "@/src/features/public-api/server/verifyProjectApiKeyAuth";
import {
  __dangerouslySkipAuthz,
  enforceAuth,
  type ApiAction,
  type EnforceAuthParams,
  type EnforceAuthResult,
} from "@/src/features/public-api/server/enforceAuth";
import { shadowAuthDiff } from "@/src/features/public-api/server/shadowAuthDiff";
import { authorize } from "@/src/features/rbac/authorize";
import {
  forbiddenError,
  internalServerError,
  serviceUnavailableError,
  unauthorizedError,
  type AuthorizationContext,
  type Decision,
  type ErrorResult,
  type Resource,
  type Success,
} from "@/src/features/auth/policy/types";
import { isPrismaException } from "@/src/utils/exceptions";

/** shadowAuth authorizes a public-API request under the active migration mode, returning the scope or the error to render. */
export async function shadowAuth(
  params: ShadowAuthParams,
): Promise<ShadowAuthResult> {
  if (env.API_AUTH_MIGRATION === "enforce") return enforceOnly(params);
  if (env.API_AUTH_MIGRATION === "shadow") return legacyWithShadow(params);
  return legacyOnly(params);
}

/** enforceOnly authorizes solely with the new pipeline and returns its scope or error. */
async function enforceOnly(
  params: ShadowAuthParams,
): Promise<ShadowAuthResult> {
  try {
    const result = await runNewAuth(params);
    if (result.success || result.error.httpCode < 500) return result;
    return enforceInfrastructureError(result.error);
  } catch (error) {
    if (isBaseError(error) && error.isUserError()) throw error;
    return enforceInfrastructureError(error);
  }
}

/** enforceInfrastructureError logs diagnostics and returns a generic failure. */
function enforceInfrastructureError(error: unknown): ErrorResult<BaseError> {
  logAuthenticationError(error);
  return genericInfrastructureError(infrastructureHttpCode(error));
}

function logAuthenticationError(error: unknown): void {
  logger.error("Public API authentication failed", {
    error: redactLangfuseSecretKeys(errorDiagnostic(error)),
  });
}

function errorDiagnostic(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

/** infrastructureHttpCode preserves typed statuses and maps Prisma failures to 503. */
function infrastructureHttpCode(error: unknown): number {
  const fallbackCode = isPrismaException(error) ? 503 : 500;
  return isBaseError(error) ? error.httpCode : fallbackCode;
}

function genericInfrastructureError(httpCode: number): ErrorResult<BaseError> {
  if (httpCode === 503) return serviceUnavailableError();
  if (httpCode === 500) return internalServerError();
  return {
    success: false,
    error: new ApiError("Internal Server Error", httpCode),
  };
}

/** legacyWithShadow lets legacy decide while the new pipeline records parity. */
async function legacyWithShadow(
  params: ShadowAuthParams,
): Promise<ShadowAuthResult> {
  const legacyAuth = await runLegacyAuth(params);
  const newAuth = await runNewAuth(params);
  shadowAuthDiff(newAuth, legacyAuth, params.action);
  const result = legacyResult(legacyAuth);
  if (result.success && newAuth.success) return { ...result, ctx: newAuth.ctx };
  return result;
}

/** legacyOnly authorizes solely with the legacy verify. */
async function legacyOnly(params: ShadowAuthParams): Promise<ShadowAuthResult> {
  return legacyResult(await runLegacyAuth(params));
}

/** runNewAuth runs the new pipeline for the request's action and route opt-ins. */
function runNewAuth(params: ShadowAuthParams): Promise<EnforceAuthResult> {
  return enforceAuth(params);
}

/** runLegacyAuth dispatches to the legacy verify the route's access levels select. */
function runLegacyAuth(params: ShadowAuthParams): Promise<LegacyDecision> {
  return isOrgFamily(params.allowedAccessLevels)
    ? runLegacyOrgAuth(params.req)
    : runLegacyProjectAuth(params);
}

/** runLegacyOrgAuth verifies the credential and its organization access level, capturing every outcome as a value. */
async function runLegacyOrgAuth(req: NextApiRequest): Promise<LegacyDecision> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return unauthorizedError(authCheck.error);
  }
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    return forbiddenError();
  }
  return { success: true, scope: authCheck.scope };
}

/** runLegacyProjectAuth runs the legacy project verify and captures its throw as a value: an infra 503, or the status and message it reported. */
async function runLegacyProjectAuth(
  params: ShadowAuthParams,
): Promise<LegacyDecision> {
  try {
    const auth = await verifyLegacyProjectAuth(
      params.req,
      params.isAdminApiKeyAuthAllowed ?? false,
      params.allowedAccessLevels as RouteAccessLevel[],
      params.allowInAppAgentKey ?? false,
    );
    return { success: true, scope: auth.scope };
  } catch (error) {
    if (isPrismaException(error)) {
      traceException(error);
      return serviceUnavailableError("Service Unavailable");
    }
    const status = (error as { status?: unknown }).status;
    const message = (error as { message?: unknown }).message;
    const httpCode = typeof status === "number" ? status : 401;
    return {
      success: false,
      error: new ApiError(
        typeof message === "string" ? message : "Authentication failed",
        httpCode,
      ),
    };
  }
}

/** legacyResult lifts a legacy decision into the seam's success or error value. */
function legacyResult(legacy: LegacyDecision): ShadowAuthResult {
  if (legacy.success) return { success: true, scope: legacy.scope };
  return { success: false, error: legacy.error };
}

/** isOrgFamily reports whether the route's access levels select the organization legacy verify. */
function isOrgFamily(allowedAccessLevels: ApiAccessLevel[]): boolean {
  return (
    allowedAccessLevels.length === 1 &&
    allowedAccessLevels[0] === "organization"
  );
}

/** shadowAuthorize enforces per-item permissions or compares them with the caller's legacy decision. */
export function shadowAuthorize(params: ShadowAuthorizeParams): Decision {
  if (params.action === __dangerouslySkipAuthz) {
    return { success: true };
  }
  if (!params.ctx) return skipAuthorization(params);
  const decision = authorize(
    params.ctx,
    tenantFor(params.ctx, params.resource),
    params.action,
    toResourceId(params.resource),
  );
  return diffOrGate(params, decision);
}

/** skipAuthorization returns an early decision when policy evaluation is skipped or unavailable. */
function skipAuthorization(params: ShadowAuthorizeParams): Decision {
  if (env.API_AUTH_MIGRATION === "enforce") {
    return unauthorizedError("Missing authz context");
  }
  return params.legacyDecision;
}

/** diffOrGate shadows the authorization outcome or enforces it depending on the AUTH_API_MIGRATION */
function diffOrGate(
  params: ShadowAuthorizeParams,
  decision: Decision,
): Decision {
  if (env.API_AUTH_MIGRATION === "shadow") {
    shadowAuthDiff(decision, params.legacyDecision, params.action);
    return params.legacyDecision;
  }
  return decision;
}

/** toResourceId tags a per-item resource for the PDP. */
function toResourceId(resource: Resource): ResourceId {
  return "projectId" in resource
    ? ProjectId(resource.projectId)
    : OrganizationId(resource.orgId);
}

/** tenantFor is the resource's tenant: an org resource is its own tenant; a per-item project is scoped to the key's already-resolved bound org. Admin carries no tenant and the PDP grants it directly. */
function tenantFor(ctx: AuthorizationContext, resource: Resource): TenantId {
  if ("orgId" in resource) return OrganizationId(resource.orgId);
  const boundOrg =
    ctx.principal.kind === "apiKey" ? ctx.principal.boundResource.orgId : "";
  return OrganizationId(boundOrg);
}

/** ShadowAuthParams is enforceAuth's params plus the access levels the legacy verify gates on. */
export type ShadowAuthParams = EnforceAuthParams & {
  allowedAccessLevels: ApiAccessLevel[];
};

/** ShadowAuthorizeParams carries the per-item action, context, resource, and legacy decision. */
export type ShadowAuthorizeParams = {
  ctx: AuthorizationContext | undefined;
  action: ApiAction;
  resource: Resource;
  legacyDecision:
    | { success: true; scope: { accessLevel: ApiAccessLevel } }
    | ErrorResult<BaseError>;
};

/** ShadowAuthAccessResult is a verified scope; the authorizing context rides along only when the new pipeline produced it. */
export type ShadowAuthAccessResult = Success & {
  scope: ApiAccessScope;
  ctx?: AuthorizationContext;
};

/** ShadowAuthResult is the verified project or organization scope, or the error the route renders. */
export type ShadowAuthResult = ShadowAuthAccessResult | ErrorResult<BaseError>;

/** LegacyDecision is the legacy verify captured as a value: the verified scope, or the error to render. */
type LegacyDecision =
  | { success: true; scope: ApiAccessScope }
  | { success: false; error: BaseError };
