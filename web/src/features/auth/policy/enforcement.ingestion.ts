import { type IncomingHttpHeaders } from "http";

import { ForbiddenError } from "@langfuse/shared";
import { type ApiAccessScope, eventTypes } from "@langfuse/shared/src/server";

import { authorize } from "./authorize";
import { enforceProjectAuth, type AuthError } from "./enforcement.projects";
import {
  type AuthorizationContext,
  type Decision,
  type ErrorResult,
  type ProjectAction,
  type Success,
} from "./types";

/** ingestionSuspendedMessage is today's whole-request 403 body for a usage-suspended org. */
export const ingestionSuspendedMessage =
  "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.";

/** enforceIngestionAuth is the ingestion whole-request seam: authenticate, resolve the target project, then 403 a usage-suspended org at the seam. */
export async function enforceIngestionAuth(
  params: EnforceIngestionAuthParams,
): Promise<IngestionAccessResult | ErrorResult<AuthError>> {
  const access = await enforceProjectAuth({ headers: params.headers });
  if (!access.success) return access;

  if (isIngestionSuspended(access.context, access.projectId)) {
    return {
      success: false,
      error: new ForbiddenError(ingestionSuspendedMessage),
    };
  }
  return {
    success: true,
    context: access.context,
    projectId: access.projectId,
    scope: access.scope,
  };
}

/** authorizeIngestionEvent gates one event's write on the project action its type asserts; SDK logs assert nothing, matching legacy. */
export function authorizeIngestionEvent(
  context: AuthorizationContext,
  eventType: string,
  projectId: string,
): Decision {
  const action = ingestionActionForEventType(eventType);
  if (action === null) return { success: true };
  return authorize(context, action, { projectId });
}

/** ingestionActionForEventType maps an event type to the project action its write asserts: scores create scores, everything else creates traces, SDK logs assert nothing. */
export function ingestionActionForEventType(
  eventType: string,
): ProjectAction | null {
  if (eventType === eventTypes.SDK_LOG) return null;
  if (eventType === eventTypes.SCORE_CREATE) return "scores:create";
  return "traces:create";
}

/** isIngestionSuspended reads the seam-enforced suspension boolean off the org that owns the target project. */
function isIngestionSuspended(
  context: AuthorizationContext,
  projectId: string,
): boolean {
  if (!("organizations" in context.principal)) return false;
  const org = context.principal.organizations.find((o) =>
    o.projectIds.includes(projectId),
  );
  return org?.isIngestionSuspended ?? false;
}

/** EnforceIngestionAuthParams is the request headers the ingestion whole-request seam authenticates. */
export type EnforceIngestionAuthParams = {
  headers: IncomingHttpHeaders;
};

/** IngestionAccessResult is the whole-request seam's success outcome: the resolved context and target project. */
export type IngestionAccessResult = Success & {
  context: AuthorizationContext;
  projectId: string;
  scope: ApiAccessScope;
};

/** EnforceIngestionAuthDecision is the ingestion whole-request pipeline's outcome. */
export type EnforceIngestionAuthDecision = Awaited<
  ReturnType<typeof enforceIngestionAuth>
>;

/** __test exposes module-private helpers for the colocated unit test. */
export const __test = { isIngestionSuspended };
