import { type NextApiRequest } from "next";

import { type AuthHeaderValidVerificationResult } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  verifyAuth as verifyLegacyAuth,
  type RouteAccessLevel,
} from "@/src/features/public-api/server/verifyProjectApiKeyAuth";
import { enforceProjectAuth } from "@/src/features/auth/policy/enforceProjectAuth";
import { principalScope } from "@/src/features/auth/policy/principalScope";
import {
  diffResults,
  legacyFromStatus,
  recordCoverage,
} from "@/src/features/auth/policy/shadow";
import { type ProjectAction } from "@/src/features/auth/policy/types";

/** verifyProjectAuth is the project seam: the new pipeline decides alone in enforce, both run for parity in shadow (byte-identical to legacy), and legacy decides alone otherwise (the default). */
export async function verifyProjectAuth(
  params: VerifyAuthParams,
): Promise<VerifyAuthResult> {
  // enforce mode runs only the new pipeline, which is the sole authority.
  if (env.API_AUTH_MIGRATION === "enforce") {
    const authz = await runNewAuth(params);
    if (!authz.success) {
      throw { status: authz.error.httpCode, message: authz.error.message };
    }
    const mapped = await principalScope(authz.context.principal, {
      projectId: authz.projectId,
    });
    if (!mapped.success) {
      throw { status: mapped.error.httpCode, message: mapped.error.message };
    }
    return { validKey: true, scope: mapped.scope } as VerifyAuthResult;
  }

  // shadow mode runs both: legacy decides, the new pipeline records parity.
  if (env.API_AUTH_MIGRATION === "shadow") {
    const legacy = await runLegacyAuth(params);
    const authz = await runNewAuth(params);
    recordCoverage(params.req.url ?? "");
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: "project_route",
      action: params.action,
    });
    if (!legacy.ok) throw legacy.error;
    return legacy.auth;
  }

  // legacy is the default: any other value (including a blank one) fails safe
  // to the legacy path, so self-host does no new auth work.
  const legacy = await runLegacyAuth(params);
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

/** runNewAuth runs the new project pipeline for the request's action and route opt-ins. */
function runNewAuth(params: VerifyAuthParams) {
  return enforceProjectAuth({
    headers: params.req.headers,
    action: params.action,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
}

/** VerifyAuthParams is the request plus the route's action and legacy auth options. */
export type VerifyAuthParams = {
  req: NextApiRequest;
  action: ProjectAction;
  isAdminApiKeyAuthAllowed?: boolean;
  allowedAccessLevels?: RouteAccessLevel[];
  allowInAppAgentKey?: boolean;
};

/** VerifyAuthResult is the verified project scope the route handler receives. */
export type VerifyAuthResult = AuthHeaderValidVerificationResult & {
  scope: { projectId: string; accessLevel: RouteAccessLevel };
};

/** LegacyDecision is the legacy verify captured as a value: the verified scope, or the status + error to re-throw. */
type LegacyDecision =
  | { ok: true; status: 200; auth: VerifyAuthResult }
  | { ok: false; status: number; error: unknown };
