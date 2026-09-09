import { type NextApiRequest } from "next";

import {
  ApiError,
  type BaseError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import {
  type ApiAccessLevel,
  type ApiAccessScope,
  redis,
  traceException,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import {
  verifyAuth as verifyLegacyProjectAuth,
  type RouteAccessLevel,
} from "@/src/features/public-api/server/verifyProjectApiKeyAuth";
import {
  enforceAuth,
  type AccessResult,
  type AuthError,
  type EnforceAuthParams,
} from "@/src/features/public-api/server/enforceAuth";
import {
  diffResults,
  legacyFromStatus,
  recordCoverage,
  type Seam,
} from "@/src/features/auth/policy/shadow";
import { type ErrorResult } from "@/src/features/auth/policy/types";
import { isPrismaException } from "@/src/utils/exceptions";

/** scopeDeniedCode is the status for a key with the wrong access level. */
const scopeDeniedCode = 403;

/** shadowAuth authorizes a public-API request under the active migration mode, returning the scope or the error to render. */
export async function shadowAuth(
  params: ShadowAuthParams,
): Promise<ShadowAuthResult> {
  if (env.API_AUTH_MIGRATION === "enforce") return enforceOnly(params);
  if (env.API_AUTH_MIGRATION === "shadow") return legacyWithShadow(params);
  return legacyOnly(params);
}

/** enforceOnly authorizes solely with the new pipeline and returns its scope or error. */
function enforceOnly(params: ShadowAuthParams): Promise<ShadowAuthResult> {
  return runNewAuth(params);
}

/** legacyWithShadow lets legacy decide while the new pipeline records parity. */
async function legacyWithShadow(
  params: ShadowAuthParams,
): Promise<ShadowAuthResult> {
  const legacy = await runLegacyAuth(params);
  const authz = await runNewAuth(params);
  recordCoverage(params.req.url ?? "");
  diffResults(authz, legacyFromStatus(legacy.status), {
    seam: seamOf(params.allowedAccessLevels),
    action: params.action,
  });
  return legacyResult(legacy);
}

/** legacyOnly authorizes solely with the legacy verify. */
async function legacyOnly(params: ShadowAuthParams): Promise<ShadowAuthResult> {
  return legacyResult(await runLegacyAuth(params));
}

/** runNewAuth runs the new pipeline for the request's action and route opt-ins. */
function runNewAuth(
  params: ShadowAuthParams,
): Promise<AccessResult | ErrorResult<AuthError>> {
  return enforceAuth({
    req: params.req,
    action: params.action,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
}

/** runLegacyAuth dispatches to the legacy verify the route's access levels select. */
function runLegacyAuth(params: ShadowAuthParams): Promise<LegacyDecision> {
  return isOrgFamily(params.allowedAccessLevels)
    ? runLegacyOrgScope(params.req)
    : runLegacyProjectAuth(params);
}

/** runLegacyOrgScope verifies the credential and its organization access level, capturing every outcome as a value. */
async function runLegacyOrgScope(req: NextApiRequest): Promise<LegacyDecision> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return {
      ok: false,
      status: 401,
      error: new ApiError(authCheck.error, 401),
    };
  }
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    return {
      ok: false,
      status: scopeDeniedCode,
      error: new ApiError("", scopeDeniedCode),
    };
  }
  return { ok: true, status: 200, scope: authCheck.scope };
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
    return { ok: true, status: 200, scope: auth.scope };
  } catch (error) {
    if (isPrismaException(error)) {
      traceException(error);
      return {
        ok: false,
        status: 503,
        error: new ServiceUnavailableError("Service Unavailable"),
      };
    }
    const status = (error as { status?: unknown }).status;
    const message = (error as { message?: unknown }).message;
    const httpCode = typeof status === "number" ? status : 401;
    return {
      ok: false,
      status: httpCode,
      error: new ApiError(
        typeof message === "string" ? message : "Authentication failed",
        httpCode,
      ),
    };
  }
}

/** legacyResult lifts a legacy decision into the seam's success or error value. */
function legacyResult(legacy: LegacyDecision): ShadowAuthResult {
  if (legacy.ok) return { success: true, scope: legacy.scope };
  return { success: false, error: legacy.error };
}

/** isOrgFamily reports whether the route's access levels select the organization legacy verify. */
function isOrgFamily(allowedAccessLevels: ApiAccessLevel[]): boolean {
  return (
    allowedAccessLevels.length === 1 &&
    allowedAccessLevels[0] === "organization"
  );
}

/** seamOf labels the telemetry seam from the route's access levels. */
function seamOf(allowedAccessLevels: ApiAccessLevel[]): Seam {
  return isOrgFamily(allowedAccessLevels) ? "org_route" : "project_route";
}

/** ShadowAuthParams is enforceAuth's params plus the access levels the legacy verify and telemetry read; the shim field is deleted at cutover. */
export type ShadowAuthParams = EnforceAuthParams & {
  allowedAccessLevels: ApiAccessLevel[];
};

/** ShadowAuthResult is the verified project or organization scope, or the error the route renders. */
export type ShadowAuthResult = AccessResult | ErrorResult<BaseError>;

/** LegacyDecision is the legacy verify captured as a value: the verified scope, or the status + error to render. */
type LegacyDecision =
  | { ok: true; status: 200; scope: ApiAccessScope }
  | { ok: false; status: number; error: BaseError };
