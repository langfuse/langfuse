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
  type EnforceAuthParams,
  type EnforceAuthResult,
} from "@/src/features/public-api/server/enforceAuth";
import { shadowAuthDiff } from "@/src/features/public-api/server/shadowAuthDiff";
import {
  type AuthorizationContext,
  type ErrorResult,
  type Success,
} from "@/src/features/auth/policy/types";
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
  const legacyAuth = await runLegacyAuth(params);
  const newAuth = await runNewAuth(params);
  shadowAuthDiff(newAuth, legacyAuth, params.action);
  return legacyResult(legacyAuth);
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
      success: false,
      status: 401,
      error: new ApiError(authCheck.error, 401),
    };
  }
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    return {
      success: false,
      status: scopeDeniedCode,
      error: new ApiError("", scopeDeniedCode),
    };
  }
  return { success: true, status: 200, scope: authCheck.scope };
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
    return { success: true, status: 200, scope: auth.scope };
  } catch (error) {
    if (isPrismaException(error)) {
      traceException(error);
      return {
        success: false,
        status: 503,
        error: new ServiceUnavailableError("Service Unavailable"),
      };
    }
    const status = (error as { status?: unknown }).status;
    const message = (error as { message?: unknown }).message;
    const httpCode = typeof status === "number" ? status : 401;
    return {
      success: false,
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

/** ShadowAuthParams is enforceAuth's params; the legacy verify reads the same access levels. */
export type ShadowAuthParams = EnforceAuthParams;

/** ShadowAuthAccessResult is a verified scope; the authorizing context rides along only when the new pipeline produced it. */
export type ShadowAuthAccessResult = Success & {
  scope: ApiAccessScope;
  ctx?: AuthorizationContext;
};

/** ShadowAuthResult is the verified project or organization scope, or the error the route renders. */
export type ShadowAuthResult = ShadowAuthAccessResult | ErrorResult<BaseError>;

/** LegacyDecision is the legacy verify captured as a value: the verified scope, or the status + error to render. */
type LegacyDecision =
  | { success: true; status: 200; scope: ApiAccessScope }
  | { success: false; status: number; error: BaseError };
