import { type NextApiRequest } from "next";

import { env } from "@/src/env.mjs";
import { verifyAuth as legacyVerifyAuth } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  enforceProjectAuth,
  type EnforceProjectAuthDecision,
} from "./enforcement.projects";
import { diffResults, legacyFromStatus, recordCoverage } from "./shadow";
import { type ProjectAction } from "./types";

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
    action: params.action ?? undefined,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });

  if (env.API_AUTH_MIGRATION === "shadow") {
    recordCoverage(params.name);
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: "project_route",
      action: params.action ?? "none",
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
    const auth = await legacyVerifyAuth(
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
  action: ProjectAction | null;
  isAdminApiKeyAuthAllowed?: boolean;
  allowedAccessLevels?: Parameters<typeof legacyVerifyAuth>[2];
  allowInAppAgentKey?: boolean;
};

/** LegacyResult is the legacy verify's verified scope. */
type LegacyResult = Awaited<ReturnType<typeof legacyVerifyAuth>>;

/** LegacyDecision is the legacy verify captured as a value: the verified scope, or the status + error to re-throw. */
type LegacyDecision =
  | { ok: true; status: 200; auth: LegacyResult }
  | { ok: false; status: number; error: unknown };

/** EnforceDecision re-exports the new pipeline's outcome type for the seam. */
export type EnforceDecision = EnforceProjectAuthDecision;
