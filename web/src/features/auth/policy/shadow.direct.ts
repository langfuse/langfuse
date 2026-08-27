import { type NextApiRequest } from "next";

import { prisma } from "@langfuse/shared/src/db";
import { type ApiAccessScope, redis } from "@langfuse/shared/src/server";

import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { env } from "@/src/env.mjs";
import { enforceOrgAuth } from "./enforcement.org";
import { enforceProjectAuth } from "./enforcement.projects";
import {
  diffResults,
  legacyFromStatus,
  recordCoverage,
  type Seam,
} from "./shadow";
import { type OrganizationAction, type ProjectAction } from "./types";

/** scopeDeniedCode is the http status legacy returns when a key's access level is wrong for the route. */
const scopeDeniedCode = 403;

/** verifyOrgAuth is the org direct-handler seam: legacy decides in legacy/shadow (byte-identical), the new PDP gates the org action in enforce. */
export async function verifyOrgAuth(
  params: VerifyOrgAuthParams,
): Promise<DirectAuthResult> {
  return runDirectSeam({
    req: params.req,
    name: params.name,
    seam: "org_route",
    accessLevel: "organization",
    scopeDeniedMessage: params.scopeDeniedMessage,
    action: params.action ?? "none",
    enforce: (headers) =>
      enforceOrgAuth({ headers, action: params.action ?? undefined }),
  });
}

/** verifyProjectAuthDirect is the project direct-handler seam for routes that authenticate inline rather than through the route factory. */
export async function verifyProjectAuthDirect(
  params: VerifyProjectAuthParams,
): Promise<DirectAuthResult> {
  return runDirectSeam({
    req: params.req,
    name: params.name,
    seam: "project_route",
    accessLevel: "project",
    scopeDeniedMessage: params.scopeDeniedMessage,
    action: params.action ?? "none",
    enforce: (headers) =>
      enforceProjectAuth({ headers, action: params.action ?? undefined }),
  });
}

/** runDirectSeam runs legacy auth, then the migration-mode-selected new pipeline, returning the legacy-shaped decision the handler renders. */
async function runDirectSeam(
  config: DirectSeamConfig,
): Promise<DirectAuthResult> {
  const legacy = await runLegacyScope(config);

  if (env.PUBLIC_API_AUTHZ_MIGRATION === "legacy") {
    return legacyResult(legacy, config.scopeDeniedMessage);
  }

  const authz = await config.enforce(config.req.headers);

  if (env.PUBLIC_API_AUTHZ_MIGRATION === "shadow") {
    recordCoverage(config.name);
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: config.seam,
      action: config.action,
    });
    return legacyResult(legacy, config.scopeDeniedMessage);
  }

  if (!authz.success) {
    return {
      validKey: false,
      status: authz.error.httpCode,
      error:
        authz.error.httpCode === scopeDeniedCode
          ? config.scopeDeniedMessage
          : authz.error.message,
    };
  }
  return legacyResult(legacy, config.scopeDeniedMessage);
}

/** runLegacyScope verifies the credential and its access level, capturing every outcome as a value. */
async function runLegacyScope(
  config: DirectSeamConfig,
): Promise<LegacyDecision> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(config.req.headers.authorization);
  if (!authCheck.validKey) {
    return { status: 401, authError: authCheck.error };
  }
  const id =
    config.accessLevel === "organization"
      ? authCheck.scope.orgId
      : authCheck.scope.projectId;
  if (authCheck.scope.accessLevel !== config.accessLevel || !id) {
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

/** VerifyOrgAuthParams is the request, the route name for coverage, its checked org action, and the route's own scope-denied message. */
export type VerifyOrgAuthParams = {
  req: NextApiRequest;
  name: string;
  action: OrganizationAction | null;
  scopeDeniedMessage: string;
};

/** VerifyProjectAuthParams is the request, the route name for coverage, its checked project action, and the route's own scope-denied message. */
export type VerifyProjectAuthParams = {
  req: NextApiRequest;
  name: string;
  action: ProjectAction | null;
  scopeDeniedMessage: string;
};

/** DirectAuthResult is the direct seam's outcome: the verified legacy scope, or the status and message the handler renders. */
export type DirectAuthResult =
  | { validKey: true; scope: ApiAccessScope }
  | { validKey: false; status: number; error: string };

/** DirectSeamConfig is one direct seam's shared inputs: the request, its telemetry tags, the required access level, and the new-pipeline call. */
type DirectSeamConfig = {
  req: NextApiRequest;
  name: string;
  seam: Seam;
  accessLevel: "organization" | "project";
  scopeDeniedMessage: string;
  action: string;
  enforce: (
    headers: NextApiRequest["headers"],
  ) => Promise<
    | { success: true }
    | { success: false; error: { httpCode: number; message: string } }
  >;
};

/** LegacyDecision is legacy auth captured as a value: the verified scope, a 401 with its message, or a 403 access-level denial. */
type LegacyDecision =
  | { status: 200; scope: ApiAccessScope }
  | { status: 401; authError: string }
  | { status: 403 };
