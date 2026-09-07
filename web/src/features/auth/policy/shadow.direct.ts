import { type NextApiRequest } from "next";

import { type ApiAccessScope } from "@langfuse/shared/src/server";

import { enforceOrgAuth, type EnforceOrgAuthDecision } from "./enforcement.org";
import {
  enforceProjectAuth,
  type EnforceProjectAuthDecision,
} from "./enforcement.projects";
import { type OrganizationAction, type ProjectAction } from "./types";

/** scopeDeniedCode is the http status a seam renders as the route's own key-required message. */
const scopeDeniedCode = 403;

/** verifyOrgAuth is the org direct-handler seam: the new PDP authenticates, gates the org action, and returns the resolved scope. */
export async function verifyOrgAuth(
  params: VerifyOrgAuthParams,
): Promise<DirectAuthResult> {
  const authz = await enforceOrgAuth({
    headers: params.req.headers,
    action: params.action ?? undefined,
  });
  return renderDirect(authz, params.scopeDeniedMessage);
}

/** verifyProjectAuthDirect is the project direct-handler seam for routes that authenticate inline rather than through the route factory. */
export async function verifyProjectAuthDirect(
  params: VerifyProjectAuthParams,
): Promise<DirectAuthResult> {
  const authz = await enforceProjectAuth({
    headers: params.req.headers,
    action: params.action ?? undefined,
    allowedAccessLevels: ["project"],
  });
  return renderDirect(authz, params.scopeDeniedMessage);
}

/** renderDirect lifts a pipeline decision into the handler-facing result: the route's own message on a 403, the pipeline's message otherwise. */
function renderDirect(
  authz: EnforceOrgAuthDecision | EnforceProjectAuthDecision,
  scopeDeniedMessage: string,
): DirectAuthResult {
  if (!authz.success) {
    return {
      validKey: false,
      status: authz.error.httpCode,
      error:
        authz.error.httpCode === scopeDeniedCode
          ? scopeDeniedMessage
          : authz.error.message,
    };
  }
  return { validKey: true, scope: authz.scope };
}

/** VerifyOrgAuthParams is the request, the route name for telemetry, its checked org action, and the route's own scope-denied message. */
export type VerifyOrgAuthParams = {
  req: NextApiRequest;
  name: string;
  action: OrganizationAction | null;
  scopeDeniedMessage: string;
};

/** VerifyProjectAuthParams is the request, the route name for telemetry, its checked project action, and the route's own scope-denied message. */
export type VerifyProjectAuthParams = {
  req: NextApiRequest;
  name: string;
  action: ProjectAction | null;
  scopeDeniedMessage: string;
};

/** DirectAuthResult is the direct seam's outcome: the verified scope, or the status and message the handler renders. */
export type DirectAuthResult =
  | { validKey: true; scope: ApiAccessScope }
  | { validKey: false; status: number; error: string };
