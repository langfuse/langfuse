import { type NextApiRequest } from "next";

import {
  type BaseError,
  ForbiddenError,
  UnauthorizedError,
} from "@langfuse/shared";
import {
  type AuthHeaderValidVerificationResult,
  eventTypes,
  redis,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";
import { authorize } from "./authorize";
import {
  type AuthorizationContext,
  type Decision,
  type ProjectAction,
} from "./types";

/** ingestionSuspendedMessage is the whole-request 403 body for a usage-suspended org. */
const ingestionSuspendedMessage =
  "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.";

/** verifyIngestionAuth authenticates the ingestion request through the legacy scope, then in shadow/enforce runs the action-less policy core through shadowAuth for parity and the context that authorizes each event. */
export async function verifyIngestionAuth(
  params: VerifyIngestionAuthParams,
): Promise<VerifyIngestionAuthResult> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(params.req.headers.authorization);
  if (!authCheck.validKey) {
    return { ok: false, error: new UnauthorizedError(authCheck.error) };
  }
  const projectId = authCheck.scope.projectId;
  if (!projectId) {
    return {
      ok: false,
      error: new UnauthorizedError(
        "Missing projectId in scope. Are you using an organization key?",
      ),
    };
  }
  if (authCheck.scope.isIngestionSuspended) {
    return {
      ok: false,
      error: new ForbiddenError(ingestionSuspendedMessage),
      projectId,
    };
  }

  if (env.API_AUTH_MIGRATION === "legacy") {
    return { ok: true, authCheck, projectId };
  }

  const result = await shadowAuth({
    req: params.req,
    allowedAccessLevels: ["project", "scores"],
    allowInAppAgentKey: true,
  });
  if (env.API_AUTH_MIGRATION === "enforce" && !result.success) {
    return { ok: false, error: result.error, projectId };
  }
  return {
    ok: true,
    authCheck,
    projectId,
    context: result.success ? result.ctx : undefined,
  };
}

/** authorizeIngestionEvents gates a batch per-event against the policy core, dropping each denied event as a 207 rejection; the caller runs it only once enforce resolves a context. */
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

/** authorizeIngestionEvent gates one event's write on the project action its type asserts; SDK logs assert nothing, matching legacy. */
function authorizeIngestionEvent(
  context: AuthorizationContext,
  eventType: string,
  projectId: string,
): Decision {
  const action = ingestionActionForEventType(eventType);
  if (action === null) return { success: true };
  return authorize(context, action, { projectId });
}

/** ingestionActionForEventType maps an event type to the project action its write asserts: scores create scores, everything else creates traces, SDK logs assert nothing. */
function ingestionActionForEventType(eventType: string): ProjectAction | null {
  if (eventType === eventTypes.SDK_LOG) return null;
  if (eventType === eventTypes.SCORE_CREATE) return "scores:create";
  return "traces:create";
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

/** VerifyIngestionAuthParams is the request the ingestion whole-request seam authorizes. */
export type VerifyIngestionAuthParams = {
  req: NextApiRequest;
};

/** VerifyIngestionAuthResult is the verified legacy scope and the resolved context, or the error to throw. */
export type VerifyIngestionAuthResult =
  | {
      ok: true;
      authCheck: AuthHeaderValidVerificationResult;
      projectId: string;
      context?: AuthorizationContext;
    }
  | { ok: false; error: BaseError; projectId?: string };

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
type IngestionEventRejection = {
  id: string;
  status: number;
  message: string;
  error: string;
};
