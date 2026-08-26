/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/parity-classification`,
 * LFE-15559). The org seam's shadow drop-in: `verifyOrgAuth` runs the new
 * pipeline (`enforceOrgAuth`) and the legacy verify (+ the inline org-scope
 * gate) as two non-throwing paths, diffs them in shadow, then decides — shadow
 * returns the legacy scope (throwing as the route did), enforce returns the new
 * pipeline's context and orgId. It swaps in for the org route's inline
 * `verifyAuthHeaderAndReturnScope`.
 */

import { type NextApiRequest } from "next";

import { prisma } from "@langfuse/shared/src/db";
import {
  redis,
  type AuthHeaderValidVerificationResult,
} from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { type Action } from "./policy.prototype";
import {
  authzMigrationMode,
  enforceOrgAuth,
  type EnforceOrgAuthDecision,
  type OrgAccessResult,
} from "./enforcement.organizations.prototype";
import {
  diffResults,
  legacyFromStatus,
  type LegacyAuthDecision,
} from "./shadow.prototype";

/** LegacyOrgAuthDecision is the org legacy verify captured as a value: the validated org scope, or the status + error to re-throw. */
type LegacyOrgAuthDecision = LegacyAuthDecision<AuthHeaderValidVerificationResult>;

/** verifyOrgAuth is the org route's shadow drop-in: it runs the legacy verify (+ org-scope gate) and the new pipeline as two non-throwing paths, diffs them in shadow, then throws or returns the verified scope — legacy in shadow, the new context+orgId in enforce. */
export async function verifyOrgAuth(params: {
  req: NextApiRequest;
  action: Action | null;
}): Promise<AuthHeaderValidVerificationResult | OrgAccessResult> {
  const { req, action } = params;
  const legacy = await runLegacyOrgAuth(req);
  const authz: EnforceOrgAuthDecision = await enforceOrgAuth({
    headers: req.headers,
    action: action ?? undefined,
  });

  if (authzMigrationMode === "shadow") {
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: "org_route",
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

/** runLegacyOrgAuth is the legacy non-throwing path: the single verify plus the org route's inline org-scope gate, captured as a value with the status the route would have sent. */
async function runLegacyOrgAuth(
  req: NextApiRequest,
): Promise<LegacyOrgAuthDecision> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return {
      ok: false,
      status: 401,
      error: { status: 401, message: authCheck.error },
    };
  }
  if (authCheck.scope.accessLevel !== "organization" || !authCheck.scope.orgId) {
    return {
      ok: false,
      status: 403,
      error: {
        status: 403,
        message:
          "Invalid API key. Organization-scoped API key required for this operation.",
      },
    };
  }
  return { ok: true, status: 200, auth: authCheck };
}
