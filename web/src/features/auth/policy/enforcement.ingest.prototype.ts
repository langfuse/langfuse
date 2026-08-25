/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). The ingestion authorization pipeline: per-event batch evaluation
 * over the PDP, the fused seam, and the shadow span diff against legacy's 207
 * errors. Run: `pnpm --filter web run test:in-source enforcement.ingest.prototype`.
 */

import { type IncomingHttpHeaders } from "http";

import { ForbiddenError } from "@langfuse/shared";
import {
  getCurrentSpan,
  type AuthHeaderVerificationResult,
} from "@langfuse/shared/src/server";
import {
  allProjectActions,
  authorize,
  systemRuleMessages,
  type AuthorizationContext,
  type ErrorResult,
  type Policy,
  type PrincipalOrganization,
  type ProjectAction,
  type Success,
} from "./policy.prototype";
import {
  authzMigrationMode,
  type AuthError,
} from "./enforcement.organizations.prototype";
import { enforceProjectAuth } from "./enforcement.projects.prototype";
import {
  newVerdict,
  recordParity,
  verdictFromStatus,
  type AuthorizeSeamResult,
  type ParitySink,
  type Verdict,
} from "./parity.prototype";

/** ingestionActionByEventType maps each authorization-relevant ingestion event type to its action; sdk-log needs bare authentication only. */
const ingestionActionByEventType: Record<string, ProjectAction> = {
  "trace-create": "traces:create",
  "event-create": "traces:create",
  "span-create": "traces:create",
  "span-update": "traces:create",
  "generation-create": "traces:create",
  "generation-update": "traces:create",
  "observation-create": "traces:create",
  "observation-update": "traces:create",
  "score-create": "scores:create",
};

/** enforceIngestionAuth runs the new ingestion pipeline — the project seam without an action, then per-event authorize — returning every outcome as a result value; it never throws one. */
export async function enforceIngestionAuth(params: {
  headers: IncomingHttpHeaders;
  batch: unknown[];
}): Promise<IngestionAccessResult | ErrorResult<AuthError>> {
  const { headers, batch } = params;
  const access = await enforceProjectAuth({ headers });
  if (!access.success) {
    return access;
  }
  const { context, projectId } = access;
  const evaluation = evaluateIngestionBatch({ context, projectId, batch });
  if (!evaluation.success) {
    return evaluation;
  }
  return {
    success: true,
    context,
    projectId,
    allowedBatch: evaluation.allowedBatch,
    rejectedEvents: evaluation.rejectedEvents,
  };
}

/** authorizeIngestionRequest is the ingestion chokepoint's shadow-and-enforce method: one legacy verify, the new per-event pipeline beside it, parity emitted from both, then the mode decides. It swaps in for the route's inline `verifyAuthHeaderAndReturnScope`. */
export async function authorizeIngestionRequest(params: {
  headers: IncomingHttpHeaders;
  batch: unknown[];
  verify: () => Promise<AuthHeaderVerificationResult>;
  mode?: "shadow" | "enforce";
  sink?: ParitySink;
}): Promise<AuthorizeSeamResult<IngestionAccessResult | ErrorResult<AuthError>>> {
  const { headers, batch, verify, mode = authzMigrationMode, sink } = params;
  const authCheck = await verify();
  const authz = await enforceIngestionAuth({ headers, batch });
  if (mode === "shadow") recordIngestionParity(authCheck, authz, batch, sink);
  return { authCheck, authz };
}

/** recordIngestionParity emits the connection verdict once, then per authz-bearing event compares legacy's reconstructed verdict against the new path's — never against legacy's 207, which mixes validation into an overcount. */
export function recordIngestionParity(
  authCheck: AuthHeaderVerificationResult,
  authz: IngestionAccessResult | ErrorResult<AuthError>,
  batch: unknown[],
  sink?: ParitySink,
): void {
  const connLegacy = authCheck.validKey
    ? authCheck.scope.projectId
      ? 200
      : 403
    : 401;
  const connNew = newVerdict(authz);
  recordParity(
    {
      seam: "ingestion_event",
      action: "none",
      legacy: verdictFromStatus(connLegacy),
      neu: connNew.verdict,
      legacyCode: connLegacy,
      newCode: connNew.code,
    },
    sink,
  );
  if (!authCheck.validKey || !authz.success) return;
  const accessLevel = ingestionAccessLevel(authCheck.scope.accessLevel);
  const suspended = Boolean(authCheck.scope.isIngestionSuspended);
  const rejectedIds = new Set(authz.rejectedEvents.map((e) => e.id));
  for (const event of batch) {
    const { id, type } = ingestionEventIdentity(event);
    const action = type ? ingestionActionByEventType[type] : undefined;
    if (action === undefined) continue;
    const legacy = reconstructLegacyIngestionAuthz({
      accessLevel,
      eventType: type ?? "",
      suspended,
    });
    const neu: Verdict = rejectedIds.has(id) ? "deny" : "allow";
    recordParity(
      {
        seam: "ingestion_event",
        action,
        legacy,
        neu,
        legacyCode: legacy === "deny" ? 403 : 200,
        newCode: neu === "deny" ? 403 : 200,
      },
      sink,
    );
  }
}

/** reconstructLegacyIngestionAuthz models legacy's per-event authz verdict as a pure fn of `(accessLevel, eventType, suspension)`; sdk-log and unknown types carry no authz opinion. */
export function reconstructLegacyIngestionAuthz(params: {
  accessLevel: "project" | "scores";
  eventType: string;
  suspended: boolean;
}): Verdict {
  const family = ingestionFamily(params.eventType);
  if (family === "other") return "absent";
  if (params.suspended) return "deny";
  if (params.accessLevel === "scores" && family === "trace") return "deny";
  return "allow";
}

/** ingestionFamily buckets an ingestion event type into the authz family legacy gated on. */
function ingestionFamily(eventType: string): "trace" | "score" | "other" {
  if (eventType === "score-create") return "score";
  if (/^(trace|event|span|generation|observation)-/.test(eventType))
    return "trace";
  return "other";
}

/** ingestionAccessLevel narrows the legacy scope's accessLevel to the two the reconstruction distinguishes. */
function ingestionAccessLevel(accessLevel: string): "project" | "scores" {
  return accessLevel === "scores" ? "scores" : "project";
}

/** evaluateIngestionBatch asserts each event family's action on the target project: a system deny fails the whole batch as an error result, a grant deny rejects per event. */
export function evaluateIngestionBatch(params: {
  context: AuthorizationContext;
  projectId: string;
  batch: unknown[];
}): IngestionBatchResult | ErrorResult<ForbiddenError> {
  const { context, projectId, batch } = params;
  const allowed = new Set<ProjectAction>();
  const denied = new Map<ProjectAction, string>();
  const allowedBatch: unknown[] = [];
  const rejectedEvents: IngestionAuthzRejection[] = [];
  for (const event of batch) {
    const { id, type } = ingestionEventIdentity(event);
    let action: ProjectAction | undefined;
    if (type !== null) {
      action = ingestionActionByEventType[type];
    }
    if (action === undefined) {
      // sdk-log and unknown types pass; schema validation owns unknowns
      allowedBatch.push(event);
      continue;
    }
    if (!allowed.has(action) && !denied.has(action)) {
      const decision = authorize(context, action, { projectId });
      if (decision.success) {
        allowed.add(action);
      } else if (isSystemDenyMessage(decision.error.message)) {
        return { success: false, error: decision.error };
      } else {
        denied.set(action, decision.error.message);
      }
    }
    const message = denied.get(action);
    if (message === undefined) {
      allowedBatch.push(event);
      continue;
    }
    rejectedEvents.push({
      id,
      status: 403,
      message,
      error: ForbiddenError.name,
    });
  }
  return { success: true, allowedBatch, rejectedEvents };
}

/** tagIngestionAuthzOutcome stamps the shadow batch decision onto the active http.server span, diffing the new path's per-event rejections against legacy's 207 errors by event id. */
export function tagIngestionAuthzOutcome(
  authz: IngestionAccessResult | ErrorResult<AuthError>,
  legacyErrors: { id: string }[],
) {
  const span = getCurrentSpan();
  if (!span) {
    return;
  }
  // attribute names are placeholders — the parity contract is LFE-15034's
  if (!authz.success) {
    span.setAttribute("langfuse.authz.decision", "deny");
    span.setAttribute("langfuse.authz.error", authz.error.message);
    return;
  }
  span.setAttribute("langfuse.authz.decision", "allow");
  span.setAttribute("langfuse.authz.projectId", authz.projectId);
  span.setAttribute(
    "langfuse.authz.rejectedCount",
    authz.rejectedEvents.length,
  );
  // legacy's 207 errors mix validation and authz failures — an acceptable
  // overcount in the shadow diff (LFE-15034 refines)
  const legacyIds = new Set(legacyErrors.map((e) => e.id));
  const newIds = new Set(authz.rejectedEvents.map((e) => e.id));
  span.setAttribute(
    "langfuse.authz.newDeniesLegacyAllows",
    authz.rejectedEvents.filter((e) => !legacyIds.has(e.id)).length,
  );
  span.setAttribute(
    "langfuse.authz.legacyDeniesNewAllows",
    legacyErrors.filter((e) => !newIds.has(e.id)).length,
  );
}

/** isSystemDenyMessage reports whether a 403 message came from a system deny rule. */
const isSystemDenyMessage = (message: string): boolean =>
  Object.values(systemRuleMessages).includes(message);

/** ingestionEventIdentity extracts the id and type an ingestion event claims, before schema validation. */
const ingestionEventIdentity = (
  event: unknown,
): { id: string; type: string | null } => {
  const record =
    typeof event === "object" && event !== null
      ? (event as { id?: unknown; type?: unknown })
      : null;
  return {
    id: record && typeof record.id === "string" ? record.id : "unknown",
    type: record && typeof record.type === "string" ? record.type : null,
  };
};

/** IngestionAuthzRejection mirrors the per-event error shape of the 207 ingestion response. */
export type IngestionAuthzRejection = {
  id: string;
  status: number;
  message: string;
  error: string;
};

/** IngestionBatchResult is batch evaluation's success outcome: the events that may process and the per-event 403 rejections. */
export type IngestionBatchResult = Success & {
  allowedBatch: unknown[];
  rejectedEvents: IngestionAuthzRejection[];
};

/** IngestionAccessResult is the ingestion seam's success outcome: the resolved context and target with the events that may process and the per-event rejections. */
type IngestionAccessResult = Success & {
  context: AuthorizationContext;
  projectId: string;
  allowedBatch: unknown[];
  rejectedEvents: IngestionAuthzRejection[];
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const ORG = "org_1";
  const PRJ = "prj_1";

  const organization = (projectIds: string[]): PrincipalOrganization => ({
    orgId: ORG,
    plan: "cloud:hobby",
    rateLimitConfig: [],
    projectIds,
  });

  const grantProject = (
    actions: ProjectAction[],
    projectIds: string[],
  ): Policy => ({
    kind: "project",
    source: { kind: "grant" },
    actions,
    resources: projectIds,
    effect: "allow",
  });

  const suspensionDenies = (projectIds: string[]): Policy[] => [
    {
      kind: "project",
      source: { kind: "system", rule: "ingestion_suspended" },
      actions: ["traces:create", "scores:create", "media:create"],
      resources: projectIds,
      effect: "deny",
    },
    {
      kind: "project",
      source: { kind: "system", rule: "mcp_suspended" },
      actions: ["mcp:access"],
      resources: projectIds,
      effect: "deny",
    },
  ];

  const projectKey = (
    policies: Policy[] = [grantProject(allProjectActions, [PRJ])],
  ): AuthorizationContext => ({
    principal: {
      kind: "apiKey",
      apiKeyId: "key_1",
      userId: null,
      organizations: [organization([PRJ])],
      boundResource: { projectId: PRJ },
    },
    policies,
  });

  const scoresKey = () => projectKey([grantProject(["scores:create"], [PRJ])]);

  const suspendedKey = () =>
    projectKey([grantProject(allProjectActions, [PRJ]), ...suspensionDenies([PRJ])]);

  describe("evaluateIngestionBatch", () => {
    const batch = [
      { id: "e1", type: "trace-create" },
      { id: "e2", type: "score-create" },
      { id: "e3", type: "sdk-log" },
    ];
    it("passes a full batch for a project key", () => {
      const result = evaluateIngestionBatch({
        context: projectKey(),
        projectId: PRJ,
        batch,
      });
      expect(result).toEqual({
        success: true,
        allowedBatch: batch,
        rejectedEvents: [],
      });
    });
    it("rejects per event on a grant deny, keeping the allowed family", () => {
      const result = evaluateIngestionBatch({
        context: scoresKey(),
        projectId: PRJ,
        batch,
      });
      expect(
        result.success && result.rejectedEvents.map((e) => e.id),
      ).toEqual(["e1"]);
    });
    it("fails the whole batch on suspension with the legacy message", () => {
      const result = evaluateIngestionBatch({
        context: suspendedKey(),
        projectId: PRJ,
        batch,
      });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe(
        systemRuleMessages.ingestion_suspended,
      );
    });
    it("passes an sdk-log-only batch under suspension (known divergence: legacy 403s)", () => {
      const result = evaluateIngestionBatch({
        context: suspendedKey(),
        projectId: PRJ,
        batch: [{ id: "e1", type: "sdk-log" }],
      });
      expect(result.success && result.rejectedEvents).toEqual([]);
    });
  });

  describe("reconstructLegacyIngestionAuthz", () => {
    it.each([
      ["project key writes traces", "project", "trace-create", false, "allow"],
      ["scores key cannot write traces", "scores", "trace-create", false, "deny"],
      ["scores key writes scores", "scores", "score-create", false, "allow"],
      ["suspension denies scores", "project", "score-create", true, "deny"],
      ["sdk-log has no authz opinion", "project", "sdk-log", false, "absent"],
    ] as const)("%s", (_name, accessLevel, eventType, suspended, verdict) => {
      expect(
        reconstructLegacyIngestionAuthz({ accessLevel, eventType, suspended }),
      ).toBe(verdict);
    });
  });

  describe("recordIngestionParity", () => {
    const capture = () => {
      const calls: Record<string, string | number>[] = [];
      const sink: ParitySink = {
        increment: (_stat, tags) => calls.push(tags),
        span: () => undefined,
      };
      return { calls, sink };
    };

    const scoresAuthCheck = {
      validKey: true,
      scope: { projectId: PRJ, accessLevel: "scores", isIngestionSuspended: false },
    } as AuthHeaderVerificationResult;

    it("agrees per event: scores key denies the trace, allows the score", () => {
      const batch = [
        { id: "e1", type: "trace-create" },
        { id: "e2", type: "score-create" },
      ];
      const authz: IngestionAccessResult = {
        success: true,
        context: scoresKey(),
        projectId: PRJ,
        allowedBatch: [batch[1]],
        rejectedEvents: [
          { id: "e1", status: 403, message: "", error: "ForbiddenError" },
        ],
      };
      const { calls, sink } = capture();
      recordIngestionParity(scoresAuthCheck, authz, batch, sink);
      // connection + two events, all agreeing
      expect(calls).toHaveLength(3);
      expect(calls.every((c) => c.seam === "ingestion_event")).toBe(true);
      expect(calls.every((c) => c.result === "match")).toBe(true);
    });
  });
}
