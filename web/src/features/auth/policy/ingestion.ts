import { type IncomingHttpHeaders } from "http";

import { type BaseError } from "@langfuse/shared";
import { type AuthHeaderValidVerificationResult } from "@langfuse/shared/src/server";

import {
  authorizeIngestionEvent,
  enforceIngestionAuth,
} from "./enforcement.ingestion";
import { type AuthorizationContext } from "./types";

/** verifyIngestionAuth authenticates the whole request through the policy core, resolving the target project and 403ing a suspended org. */
export async function verifyIngestionAuth(
  params: VerifyIngestionAuthParams,
): Promise<VerifyIngestionAuthResult> {
  const authz = await enforceIngestionAuth({ headers: params.headers });
  if (!authz.success) {
    return { ok: false, error: authz.error };
  }
  return {
    ok: true,
    authCheck: { validKey: true, scope: authz.scope },
    projectId: authz.projectId,
    context: authz.context,
  };
}

/** authorizeIngestionEvents gates a batch per-event against the PDP, dropping each denied event as a 207 rejection. */
export function authorizeIngestionEvents(
  params: AuthorizeIngestionEventsParams,
): IngestionEventAuthResult {
  const rejectedErrors: IngestionEventRejection[] = [];
  const batchForProcessing: unknown[] = [];

  for (const event of params.batch) {
    const decision = authorizeIngestionEvent(
      params.context,
      eventTypeOf(event),
      params.projectId,
    );
    if (!decision.success) {
      rejectedErrors.push({
        id: idOf(event),
        status: 401,
        message: "Authentication error",
        error: "Access Scope Denied",
      });
      continue;
    }
    batchForProcessing.push(event);
  }
  return { batchForProcessing, rejectedErrors };
}

/** eventTypeOf reads an event's `type`, defaulting to `unknown` for a malformed event. */
function eventTypeOf(event: unknown): string {
  return typeof event === "object" &&
    event !== null &&
    "type" in event &&
    typeof (event as { type: unknown }).type === "string"
    ? (event as { type: string }).type
    : "unknown";
}

/** idOf reads an event's `id`, defaulting to `unknown` for a malformed event. */
function idOf(event: unknown): string {
  return typeof event === "object" &&
    event !== null &&
    "id" in event &&
    typeof (event as { id: unknown }).id === "string"
    ? (event as { id: string }).id
    : "unknown";
}

/** VerifyIngestionAuthParams is the request headers the ingestion whole-request seam authenticates. */
export type VerifyIngestionAuthParams = {
  headers: IncomingHttpHeaders;
};

/** VerifyIngestionAuthResult is the whole-request seam's outcome: the verified scope and resolved context, or the error to throw. */
export type VerifyIngestionAuthResult =
  | {
      ok: true;
      authCheck: AuthHeaderValidVerificationResult;
      projectId: string;
      context: AuthorizationContext;
    }
  | { ok: false; error: BaseError };

/** AuthorizeIngestionEventsParams is the parsed batch, the resolved context, and the target project. */
export type AuthorizeIngestionEventsParams = {
  batch: unknown[];
  context: AuthorizationContext;
  projectId: string;
};

/** IngestionEventAuthResult is the per-event seam's output: the events to process and the per-event 207 rejections. */
export type IngestionEventAuthResult = {
  batchForProcessing: unknown[];
  rejectedErrors: IngestionEventRejection[];
};

/** IngestionEventRejection is one per-event 207 rejection, shaped as the ingestion batch result renders it. */
export type IngestionEventRejection = {
  id: string;
  status: number;
  message: string;
  error: string;
};
