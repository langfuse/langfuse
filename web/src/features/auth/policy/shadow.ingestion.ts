import { type NextApiRequest } from "next";

import {
  type BaseError,
  ForbiddenError,
  UnauthorizedError,
} from "@langfuse/shared";
import {
  type ApiAccessLevel,
  type AuthHeaderValidVerificationResult,
  eventTypes,
  redis,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { env } from "@/src/env.mjs";
import {
  authorizeIngestionEvent,
  enforceIngestionAuth,
  ingestionActionForEventType,
  ingestionSuspendedMessage,
} from "./enforcement.ingestion";
import { diffResults, legacyFromStatus, recordCoverage } from "./shadow";
import { type AuthorizationContext } from "./types";

/** ingestionCoverageOperation is the coverage key for the ingestion edge. */
const ingestionCoverageOperation = "ingestion";

/** ingestionBatchAction is the parity label for the whole-request auth+suspension gate. */
const ingestionBatchAction = "ingestion:write";

/** verifyIngestionAuth is the ingestion whole-request seam: legacy decides in legacy/shadow (byte-identical), the new boolean-suspension pipeline decides in enforce. */
export async function verifyIngestionAuth(
  params: VerifyIngestionAuthParams,
): Promise<VerifyIngestionAuthResult> {
  const legacy = await runLegacyWholeRequest(params.req);

  if (env.PUBLIC_API_AUTHZ_MIGRATION === "legacy") {
    return legacyWholeRequestResult(legacy);
  }

  const authz = await enforceIngestionAuth({ headers: params.req.headers });

  if (env.PUBLIC_API_AUTHZ_MIGRATION === "shadow") {
    recordCoverage(ingestionCoverageOperation);
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: "ingestion_event",
      action: ingestionBatchAction,
    });
    const base = legacyWholeRequestResult(legacy);
    return base.ok && authz.success
      ? { ...base, context: authz.context }
      : base;
  }

  if (!authz.success) {
    return { ok: false, error: authz.error, projectId: projectIdOf(legacy) };
  }
  if (legacy.status !== 200) {
    return legacyWholeRequestResult(legacy);
  }
  return {
    ok: true,
    authCheck: legacy.authCheck,
    projectId: legacy.projectId,
    context: authz.context,
  };
}

/** authorizeIngestionEvents gates a batch per-event against the new PDP: shadow records per-event parity and keeps the batch, enforce drops each denied event as a 207 rejection. */
export function authorizeIngestionEvents(
  params: AuthorizeIngestionEventsParams,
): IngestionEventAuthResult {
  const rejectedErrors: IngestionEventRejection[] = [];
  const batchForProcessing: unknown[] = [];
  const enforcing = env.PUBLIC_API_AUTHZ_MIGRATION === "enforce";

  for (const event of params.batch) {
    const eventType = eventTypeOf(event);
    const decision = authorizeIngestionEvent(
      params.context,
      eventType,
      params.projectId,
    );

    if (env.PUBLIC_API_AUTHZ_MIGRATION === "shadow") {
      diffResults(
        decision,
        legacyFromStatus(
          legacyEventVerdict(params.accessLevel, eventType) ? 200 : 401,
        ),
        {
          seam: "ingestion_event",
          action: ingestionActionForEventType(eventType) ?? "none",
        },
      );
    }

    if (enforcing && !decision.success) {
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

/** runLegacyWholeRequest verifies the credential and its whole-request gates, capturing every outcome as a value. */
async function runLegacyWholeRequest(
  req: NextApiRequest,
): Promise<LegacyWholeRequest> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return { status: 401, error: new UnauthorizedError(authCheck.error) };
  }
  const projectId = authCheck.scope.projectId;
  if (!projectId) {
    return {
      status: 401,
      error: new UnauthorizedError(
        "Missing projectId in scope. Are you using an organization key?",
      ),
    };
  }
  if (authCheck.scope.isIngestionSuspended) {
    return {
      status: 403,
      error: new ForbiddenError(ingestionSuspendedMessage),
      projectId,
    };
  }
  return { status: 200, authCheck, projectId };
}

/** legacyWholeRequestResult lifts a legacy whole-request decision into the handler-facing result. */
function legacyWholeRequestResult(
  legacy: LegacyWholeRequest,
): VerifyIngestionAuthResult {
  if (legacy.status === 200) {
    return {
      ok: true,
      authCheck: legacy.authCheck,
      projectId: legacy.projectId,
    };
  }
  return { ok: false, error: legacy.error, projectId: projectIdOf(legacy) };
}

/** legacyEventVerdict reconstructs legacy per-event authorization as a pure fn of access level and event type. */
function legacyEventVerdict(
  accessLevel: ApiAccessLevel,
  eventType: string,
): boolean {
  if (eventType === eventTypes.SDK_LOG) return true;
  if (eventType === eventTypes.SCORE_CREATE) {
    return accessLevel === "scores" || accessLevel === "project";
  }
  return accessLevel === "project";
}

/** projectIdOf reads the target project off a legacy decision that carries one. */
function projectIdOf(legacy: LegacyWholeRequest): string | undefined {
  return "projectId" in legacy ? legacy.projectId : undefined;
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

/** VerifyIngestionAuthParams is the request plus the route name for coverage. */
export type VerifyIngestionAuthParams = {
  req: NextApiRequest;
};

/** VerifyIngestionAuthResult is the whole-request seam's outcome: the verified legacy scope and the resolved context, or the error to throw. */
export type VerifyIngestionAuthResult =
  | {
      ok: true;
      authCheck: AuthHeaderValidVerificationResult;
      projectId: string;
      context?: AuthorizationContext;
    }
  | { ok: false; error: BaseError; projectId?: string };

/** AuthorizeIngestionEventsParams is the parsed batch, the legacy access level, the resolved context, and the target project. */
export type AuthorizeIngestionEventsParams = {
  batch: unknown[];
  accessLevel: ApiAccessLevel;
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

/** LegacyWholeRequest is legacy whole-request auth captured as a value: the verified scope, a 401, or a 403 suspension. */
type LegacyWholeRequest =
  | {
      status: 200;
      authCheck: AuthHeaderValidVerificationResult;
      projectId: string;
    }
  | { status: 401; error: UnauthorizedError }
  | { status: 403; error: ForbiddenError; projectId: string };

/** __test exposes module-private helpers for the colocated unit test. */
export const __test = { legacyEventVerdict };
