import { type NextApiRequest } from "next";

import { ApiError, type BaseError } from "@langfuse/shared";
import {
  type ApiAccessLevel,
  type ApiAccessScope,
  evaluateSandboxCredential,
  redis,
  SANDBOX_PUBLIC_KEY_PREFIX,
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
  __dangerouslySkipAuthz,
  enforceAuth,
  type ApiAction,
  type EnforceAuthParams,
  type EnforceAuthResult,
} from "@/src/features/public-api/server/enforceAuth";
import { shadowAuthDiff } from "@/src/features/public-api/server/shadowAuthDiff";
import { authorize } from "@/src/features/auth/policy/authorize";
import {
  forbiddenError,
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
  let result: ShadowAuthResult;
  if (env.API_AUTH_MIGRATION === "enforce") {
    result = await enforceOnly(params);
  } else if (env.API_AUTH_MIGRATION === "shadow") {
    result = await legacyWithShadow(params);
  } else {
    result = await legacyOnly(params);
  }
  return applySandboxCredential(result, params.action);
}

/**
 * Sandbox execution keys are ordinary project keys plus a stored grant.
 * The public-key prefix selects them. The live grant is re-read so a
 * cached "valid project key" cannot outlive revocation, expiry, or a
 * membership change. This runs in every auth migration mode.
 */
async function applySandboxCredential(
  result: ShadowAuthResult,
  action: ApiAction,
): Promise<ShadowAuthResult> {
  if (!result.success) return result;
  if (!result.scope.publicKey?.startsWith(SANDBOX_PUBLIC_KEY_PREFIX)) {
    return result;
  }
  if (!result.scope.apiKeyId) {
    return unauthorizedError("Sandbox credential is not valid");
  }

  const evaluation = await evaluateSandboxCredential({
    apiKeyId: result.scope.apiKeyId,
    action: action === __dangerouslySkipAuthz ? null : action,
  });
  if (evaluation.kind === "denied") {
    return evaluation.status === 401
      ? unauthorizedError(evaluation.message)
      : forbiddenError(evaluation.message);
  }

  return { ...result, sandboxActions: evaluation.actions };
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

/** shadowAuthorize authorizes one item against a shadowAuth-resolved context for the active migration mode: legacy and ungated items pass, shadow only diffs against legacy's implicit allow, and enforce returns the decision the caller disposes of. */
export function shadowAuthorize(params: ShadowAuthorizeParams): Decision {
  if (
    params.sandboxActions &&
    params.action !== __dangerouslySkipAuthz &&
    !params.sandboxActions.includes(params.action)
  ) {
    return forbiddenError(
      "Sandbox credential is not allowed to perform this action",
    );
  }
  if (params.action === __dangerouslySkipAuthz || !params.ctx) {
    return { success: true };
  }
  const decision = authorize(params.ctx, params.action, params.resource);
  if (env.API_AUTH_MIGRATION === "shadow") {
    shadowAuthDiff(
      decision,
      { success: true, scope: { accessLevel: params.accessLevel } },
      params.action,
    );
    return { success: true };
  }
  return decision;
}

/** ShadowAuthParams is enforceAuth's params plus the access levels the legacy verify gates on. */
export type ShadowAuthParams = EnforceAuthParams & {
  allowedAccessLevels: ApiAccessLevel[];
};

/** ShadowAuthorizeParams is one per-item authorization: the resolved context, the action the item asserts or the explicit opt-out, the resource it targets, and the access level the shadow diff records. */
export type ShadowAuthorizeParams = {
  ctx: AuthorizationContext | undefined;
  action: ApiAction;
  resource: Resource;
  accessLevel: ApiAccessLevel;
  /** Present for sandbox execution keys. Checked in every auth migration mode. */
  sandboxActions?: readonly string[];
};

/** ShadowAuthAccessResult is a verified scope; the authorizing context rides along only when the new pipeline produced it. */
export type ShadowAuthAccessResult = Success & {
  scope: ApiAccessScope;
  ctx?: AuthorizationContext;
  /** Effective actions when the credential is a sandbox execution key. */
  sandboxActions?: readonly string[];
};

/** ShadowAuthResult is the verified project or organization scope, or the error the route renders. */
export type ShadowAuthResult = ShadowAuthAccessResult | ErrorResult<BaseError>;

/** LegacyDecision is the legacy verify captured as a value: the verified scope, or the error to render. */
type LegacyDecision =
  | { success: true; scope: ApiAccessScope }
  | { success: false; error: BaseError };
