import { type NextApiRequest } from "next";

import { type AuthHeaderValidVerificationResult } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  verifyAuth as verifyLegacyAuth,
  type RouteAccessLevel,
} from "@/src/features/public-api/server/verifyProjectApiKeyAuth";
import { enforceAuth } from "@/src/features/public-api/server/enforceAuth";
import {
  diffResults,
  legacyFromStatus,
  recordCoverage,
} from "@/src/features/auth/policy/shadow";
import { type ProjectAction } from "@/src/features/auth/policy/types";

/** verifyProjectAuth authorizes a public-API project route under the active migration mode. */
export async function verifyProjectAuth(
  params: VerifyAuthParams,
): Promise<VerifyAuthResult> {
  if (env.API_AUTH_MIGRATION === "enforce") return enforceOnly(params);
  if (env.API_AUTH_MIGRATION === "shadow") return legacyWithShadow(params);
  return legacyOnly(params);
}

/** enforceOnly authorizes solely with the new pipeline and returns its project scope. */
async function enforceOnly(
  params: VerifyAuthParams,
): Promise<VerifyAuthResult> {
  const authz = await runNewAuth(params);
  if (!authz.success) {
    throw { status: authz.error.httpCode, message: authz.error.message };
  }
  return { validKey: true, scope: authz.scope } as VerifyAuthResult;
}

/** legacyWithShadow lets legacy decide while the new pipeline records parity. */
async function legacyWithShadow(
  params: VerifyAuthParams,
): Promise<VerifyAuthResult> {
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

/** legacyOnly authorizes solely with the legacy verify. */
async function legacyOnly(params: VerifyAuthParams): Promise<VerifyAuthResult> {
  const legacy = await runLegacyAuth(params);
  if (!legacy.ok) throw legacy.error;
  return legacy.auth;
}

/** runNewAuth runs the new pipeline for the request's action and route opt-ins. */
function runNewAuth(params: VerifyAuthParams) {
  return enforceAuth({
    req: params.req,
    action: params.action,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
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
