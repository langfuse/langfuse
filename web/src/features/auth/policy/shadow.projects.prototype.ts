/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/parity-classification`,
 * LFE-15559). The project seam's shadow drop-in: `verifyAuth` runs the new
 * pipeline (`enforceProjectAuth`) and the legacy verify as two non-throwing
 * paths, diffs them in shadow, then decides. It swaps in for the legacy
 * `verifyAuth` inside the project route factory.
 */

import { type NextApiRequest } from "next";

import { verifyAuth as legacyVerifyAuth } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { type ProjectAction } from "./policy.prototype";
import { authzMigrationMode } from "./enforcement.organizations.prototype";
import {
  enforceProjectAuth,
  type EnforceProjectAuthDecision,
  type ProjectAccessResult,
} from "./enforcement.projects.prototype";
import { diffResults, legacyFromStatus, type LegacyAuthDecision } from "./shadow.prototype";

/** LegacyProjectAuthDecision is the project legacy verify captured as a value: the factory's verified scope, or the status + error to re-throw. */
type LegacyProjectAuthDecision = LegacyAuthDecision<
  Awaited<ReturnType<typeof legacyVerifyAuth>>
>;

/** verifyAuth is a drop-in for the legacy `verifyAuth`: it runs the new pipeline and the legacy verify as two non-throwing paths, diffs them in shadow, then decides — shadow returns the legacy scope (throwing as legacy does), enforce returns the new pipeline's context and projectId. */
export async function verifyAuth(params: {
  req: NextApiRequest;
  action: ProjectAction | null;
  isAdminApiKeyAuthAllowed?: boolean;
  allowedAccessLevels?: Parameters<typeof legacyVerifyAuth>[2];
  allowInAppAgentKey?: boolean;
}): Promise<Awaited<ReturnType<typeof legacyVerifyAuth>> | ProjectAccessResult> {
  const { req, action } = params;
  const legacy = await runLegacyAuth(params);
  const authz: EnforceProjectAuthDecision = await enforceProjectAuth({
    headers: req.headers,
    action: action ?? undefined,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });

  if (authzMigrationMode === "shadow") {
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: "project_route",
      action: action ?? "none",
    });
    if (!legacy.ok) throw legacy.error;
    return legacy.auth;
  }
  // enforce: the new decision governs and supplies the resolved target
  if (!authz.success) {
    throw { status: authz.error.httpCode, message: authz.error.message };
  }
  return authz;
}

/** runLegacyAuth is the legacy non-throwing path: it runs the legacy verify and captures its throw as a value with the status it reported. */
async function runLegacyAuth(params: {
  req: NextApiRequest;
  isAdminApiKeyAuthAllowed?: boolean;
  allowedAccessLevels?: Parameters<typeof legacyVerifyAuth>[2];
  allowInAppAgentKey?: boolean;
}): Promise<LegacyProjectAuthDecision> {
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
