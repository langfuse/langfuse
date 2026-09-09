import { type NextApiRequest } from "next";

import {
  ApiError,
  type BaseError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import {
  type ApiAccessScope,
  traceException,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  verifyAuth as verifyLegacyAuth,
  type RouteAccessLevel,
} from "@/src/features/public-api/server/verifyProjectApiKeyAuth";
import {
  enforceAuth,
  type AccessResult,
  type AuthError,
} from "@/src/features/public-api/server/enforceAuth";
import {
  diffResults,
  legacyFromStatus,
  recordCoverage,
} from "@/src/features/auth/policy/shadow";
import {
  type ErrorResult,
  type ProjectAction,
} from "@/src/features/auth/policy/types";
import { isPrismaException } from "@/src/utils/exceptions";

/** verifyProjectAuth authorizes a public-API project route under the active migration mode, returning the scope or the error to render. */
export async function verifyProjectAuth(
  params: VerifyProjectAuthParams,
): Promise<VerifyProjectAuthResult> {
  if (env.API_AUTH_MIGRATION === "enforce") return enforceOnly(params);
  if (env.API_AUTH_MIGRATION === "shadow") return legacyWithShadow(params);
  return legacyOnly(params);
}

/** enforceOnly authorizes solely with the new pipeline and returns its project scope or error. */
function enforceOnly(
  params: VerifyProjectAuthParams,
): Promise<VerifyProjectAuthResult> {
  return runNewAuth(params);
}

/** legacyWithShadow lets legacy decide while the new pipeline records parity. */
async function legacyWithShadow(
  params: VerifyProjectAuthParams,
): Promise<VerifyProjectAuthResult> {
  const legacy = await runLegacyAuth(params);
  const authz = await runNewAuth(params);
  recordCoverage(params.req.url ?? "");
  diffResults(authz, legacyFromStatus(legacy.status), {
    seam: "project_route",
    action: params.action,
  });
  return legacyResult(legacy);
}

/** legacyOnly authorizes solely with the legacy verify. */
async function legacyOnly(
  params: VerifyProjectAuthParams,
): Promise<VerifyProjectAuthResult> {
  return legacyResult(await runLegacyAuth(params));
}

/** runNewAuth runs the new pipeline for the request's action and route opt-ins. */
function runNewAuth(
  params: VerifyProjectAuthParams,
): Promise<AccessResult | ErrorResult<AuthError>> {
  return enforceAuth({
    req: params.req,
    action: params.action,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
}

/** runLegacyAuth runs the legacy verify and captures its throw as a value: an infra 503, or the status and message it reported. */
async function runLegacyAuth(
  params: VerifyProjectAuthParams,
): Promise<LegacyDecision> {
  try {
    const auth = await verifyLegacyAuth(
      params.req,
      params.isAdminApiKeyAuthAllowed ?? false,
      params.allowedAccessLevels ?? ["project"],
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
function legacyResult(legacy: LegacyDecision): VerifyProjectAuthResult {
  if (legacy.ok) return { success: true, scope: legacy.scope };
  return { success: false, error: legacy.error };
}

/** VerifyProjectAuthParams is the request plus the route's action and legacy auth options. */
export type VerifyProjectAuthParams = {
  req: NextApiRequest;
  action: ProjectAction;
  isAdminApiKeyAuthAllowed?: boolean;
  allowedAccessLevels?: RouteAccessLevel[];
  allowInAppAgentKey?: boolean;
};

/** VerifyProjectAuthResult is the verified project scope, or the error the route renders. */
export type VerifyProjectAuthResult = AccessResult | ErrorResult<BaseError>;

/** LegacyDecision is the legacy verify captured as a value: the verified scope, or the status + error to render. */
type LegacyDecision =
  | { ok: true; status: 200; scope: ApiAccessScope }
  | { ok: false; status: number; error: BaseError };
