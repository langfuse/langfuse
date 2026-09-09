import { type NextApiRequest } from "next";

import { prisma } from "@langfuse/shared/src/db";
import { type ApiAccessScope, redis } from "@langfuse/shared/src/server";

import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { env } from "@/src/env.mjs";
import {
  enforceAuth,
  type AccessResult,
  type AuthError,
} from "../../public-api/server/enforceAuth";
import { diffResults, legacyFromStatus, recordCoverage } from "./shadow";
import {
  isOrgAction,
  type ErrorResult,
  type OrganizationAction,
  type ProjectAction,
} from "./types";

/** scopeDeniedCode is the status for a key with the wrong access level. */
const scopeDeniedCode = 403;

/** verifyOrgAuth authorizes an org direct-handler request under the active migration mode. */
export async function verifyOrgAuth(
  params: VerifyOrgAuthParams,
): Promise<DirectAuthResult> {
  if (env.API_AUTH_MIGRATION === "enforce") {
    return enforceNew(params);
  }

  if (env.API_AUTH_MIGRATION === "shadow") {
    const legacy = await runLegacyScope(params.req);
    const authz = await runNewPipeline(params);
    recordCoverage(params.req.url ?? "");
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: isOrgAction(params.action) ? "org_route" : "project_route",
      action: params.action,
    });
    return legacyResult(legacy);
  }

  // any other value fails safe to legacy
  return legacyResult(await runLegacyScope(params.req));
}

/** enforceNew runs the new pipeline alone and returns its scope. */
async function enforceNew(
  params: VerifyOrgAuthParams,
): Promise<DirectAuthResult> {
  const authz = await runNewPipeline(params);
  if (!authz.success) {
    return deny(authz.error);
  }
  return allow(authz.scope);
}

/** runNewPipeline authorizes the request through the unified pipeline. */
function runNewPipeline(
  params: VerifyOrgAuthParams,
): Promise<AccessResult | ErrorResult<AuthError>> {
  return enforceAuth({ req: params.req, action: params.action });
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

/** legacyResult lifts a legacy decision into the handler-facing result. */
function legacyResult(legacy: LegacyDecision): DirectAuthResult {
  if (legacy.status === 200) {
    return allow(legacy.scope);
  }
  if (legacy.status === 401) {
    return deny({ httpCode: 401, message: legacy.authError });
  }
  return deny({ httpCode: scopeDeniedCode, message: "" });
}

/** allow lifts a verified scope into the seam's success result. */
function allow(scope: ApiAccessScope): DirectAuthResult {
  return { validKey: true, scope };
}

/** deny renders a failure as the status and message the seam returns. */
function deny(error: EnforceError): DirectAuthResult {
  return { validKey: false, status: error.httpCode, error: error.message };
}

/** VerifyOrgAuthParams is a request and either an org or project action; project routes carry the projectId in the URL. */
export type VerifyOrgAuthParams = {
  req: NextApiRequest;
  action: OrganizationAction | ProjectAction;
};

/** DirectAuthResult is the direct seam's outcome: a verified scope, or a status and message to render. */
export type DirectAuthResult =
  | { validKey: true; scope: ApiAccessScope }
  | { validKey: false; status: number; error: string };

/** EnforceError is a new-pipeline failure reduced to what the seam renders. */
type EnforceError = { httpCode: number; message: string };

/** LegacyDecision is legacy auth captured as a value: a verified scope, a 401 with its message, or a 403 denial. */
type LegacyDecision =
  | { status: 200; scope: ApiAccessScope }
  | { status: 401; authError: string }
  | { status: 403 };
