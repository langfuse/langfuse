import { type NextApiRequest } from "next";

import { prisma } from "@langfuse/shared/src/db";
import { type ApiAccessScope, redis } from "@langfuse/shared/src/server";

import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { env } from "@/src/env.mjs";
import { enforceOrgAuth } from "./enforceOrgAuth";
import { principalScope } from "./principalScope";
import { diffResults, legacyFromStatus, recordCoverage } from "./shadow";
import { type OrganizationAction } from "./types";

/** scopeDeniedCode is the http status legacy returns when a key's access level is wrong for the route. */
const scopeDeniedCode = 403;

/** verifyOrgAuth is the org direct-handler seam: legacy decides in legacy/shadow (byte-identical), the new pipeline decides alone in enforce. */
export async function verifyOrgAuth(
  params: VerifyOrgAuthParams,
): Promise<DirectAuthResult> {
  if (env.API_AUTH_MIGRATION === "enforce") {
    const authz = await enforceOrgAuth({
      headers: params.req.headers,
      action: params.action ?? undefined,
    });
    if (!authz.success) {
      return enforceDenial(authz.error, params.scopeDeniedMessage);
    }
    const mapped = await principalScope(authz.context.principal, {
      orgId: authz.orgId,
    });
    if (!mapped.success) {
      return enforceDenial(mapped.error, params.scopeDeniedMessage);
    }
    return { validKey: true, scope: mapped.scope };
  }

  if (env.API_AUTH_MIGRATION === "shadow") {
    const legacy = await runLegacyScope(params.req);
    const authz = await enforceOrgAuth({
      headers: params.req.headers,
      action: params.action ?? undefined,
    });
    recordCoverage(params.name);
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: "org_route",
      action: params.action ?? "none",
    });
    return legacyResult(legacy, params.scopeDeniedMessage);
  }

  // any other value, a blank one included, fails safe to legacy
  return legacyResult(
    await runLegacyScope(params.req),
    params.scopeDeniedMessage,
  );
}

/** runLegacyScope verifies the credential and its organization access level, capturing every outcome as a value. */
async function runLegacyScope(req: NextApiRequest): Promise<LegacyDecision> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return { status: 401, authError: authCheck.error };
  }
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    return { status: scopeDeniedCode };
  }
  return { status: 200, scope: authCheck.scope };
}

/** legacyResult lifts a legacy decision into the handler-facing result: the auth message on 401, the route's own message on 403. */
function legacyResult(
  legacy: LegacyDecision,
  scopeDeniedMessage: string,
): DirectAuthResult {
  if (legacy.status === 200) {
    return { validKey: true, scope: legacy.scope };
  }
  if (legacy.status === 401) {
    return { validKey: false, status: 401, error: legacy.authError };
  }
  return {
    validKey: false,
    status: scopeDeniedCode,
    error: scopeDeniedMessage,
  };
}

/** enforceDenial renders a new-pipeline denial: the route's own message on an access-level 403, else the error's own. */
function enforceDenial(
  error: EnforceError,
  scopeDeniedMessage: string,
): DirectAuthResult {
  return {
    validKey: false,
    status: error.httpCode,
    error:
      error.httpCode === scopeDeniedCode ? scopeDeniedMessage : error.message,
  };
}

/** VerifyOrgAuthParams is the request, the route name for coverage, its checked org action, and the route's own scope-denied message. */
export type VerifyOrgAuthParams = {
  req: NextApiRequest;
  name: string;
  action: OrganizationAction | null;
  scopeDeniedMessage: string;
};

/** DirectAuthResult is the direct seam's outcome: the verified scope, or the status and message the handler renders. */
export type DirectAuthResult =
  | { validKey: true; scope: ApiAccessScope }
  | { validKey: false; status: number; error: string };

/** EnforceError is a new-pipeline failure reduced to what the seam renders. */
type EnforceError = { httpCode: number; message: string };

/** LegacyDecision is legacy auth captured as a value: the verified scope, a 401 with its message, or a 403 access-level denial. */
type LegacyDecision =
  | { status: 200; scope: ApiAccessScope }
  | { status: 401; authError: string }
  | { status: 403 };
