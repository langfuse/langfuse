import { type NextApiRequest } from "next";

import { prisma } from "@langfuse/shared/src/db";
import { type ApiAccessScope, redis } from "@langfuse/shared/src/server";

import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { env } from "@/src/env.mjs";
import {
  enforceOrgAuth,
  type AuthError,
  type OrgAccessResult,
} from "./enforceOrgAuth";
import {
  enforceProjectAuth,
  type ProjectAccessResult,
} from "./enforceProjectAuth";
import { principalScope, type ScopeTarget } from "./principalScope";
import { diffResults, legacyFromStatus, recordCoverage } from "./shadow";
import {
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
      seam: "projectId" in params ? "project_route" : "org_route",
      action: params.action,
    });
    return legacyResult(legacy);
  }

  // any other value fails safe to legacy
  return legacyResult(await runLegacyScope(params.req));
}

/** enforceNew runs the new pipeline alone and maps its principal to a scope. */
async function enforceNew(
  params: VerifyOrgAuthParams,
): Promise<DirectAuthResult> {
  const authz = await runNewPipeline(params);
  if (!authz.success) {
    return enforceDenial(authz.error);
  }
  const target: ScopeTarget =
    "orgId" in authz ? { orgId: authz.orgId } : { projectId: authz.projectId };
  const mapped = await principalScope(authz.context.principal, target);
  if (!mapped.success) {
    return enforceDenial(mapped.error);
  }
  return { validKey: true, scope: mapped.scope };
}

/** runNewPipeline routes to the project pipeline when given a projectId, else the org pipeline. */
function runNewPipeline(
  params: VerifyOrgAuthParams,
): Promise<OrgAccessResult | ProjectAccessResult | ErrorResult<AuthError>> {
  if ("projectId" in params) {
    return enforceProjectAuth({
      headers: params.req.headers,
      action: params.action,
      projectId: params.projectId,
    });
  }
  return enforceOrgAuth({
    headers: params.req.headers,
    action: params.action,
  });
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
    return { validKey: true, scope: legacy.scope };
  }
  if (legacy.status === 401) {
    return { validKey: false, status: 401, error: legacy.authError };
  }
  return { validKey: false, status: scopeDeniedCode, error: "" };
}

/** enforceDenial renders a new-pipeline denial as the error's status and message. */
function enforceDenial(error: EnforceError): DirectAuthResult {
  return { validKey: false, status: error.httpCode, error: error.message };
}

/** VerifyOrgAuthParams is a request with either an org action or a URL projectId and project action. */
export type VerifyOrgAuthParams = { req: NextApiRequest } & (
  | { action: OrganizationAction }
  | { projectId: string; action: ProjectAction }
);

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
