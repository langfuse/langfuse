/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/parity-classification`,
 * LFE-15559). The new ingestion pipeline: `enforceIngestionAuth` (project seam
 * then per-event authorize over the PDP) returning every outcome as a value. The
 * shadow drop-in that pairs it with the legacy verify + per-event reconstruction
 * lives in shadow.ingest.prototype.
 * Run: `pnpm --filter web run test:in-source enforcement.ingest.prototype`.
 */

import { type IncomingHttpHeaders } from "http";

import { ForbiddenError } from "@langfuse/shared";
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
import { type AuthError } from "./enforcement.organizations.prototype";
import { enforceProjectAuth } from "./enforcement.projects.prototype";

/** ingestionActionByEventType maps each authorization-relevant ingestion event type to its action; sdk-log needs bare authentication only. */
export const ingestionActionByEventType: Record<string, ProjectAction> = {
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

/** isSystemDenyMessage reports whether a 403 message came from a system deny rule. */
const isSystemDenyMessage = (message: string): boolean =>
  Object.values(systemRuleMessages).includes(message);

/** ingestionEventIdentity extracts the id and type an ingestion event claims, before schema validation. */
export const ingestionEventIdentity = (
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
export type IngestionAccessResult = Success & {
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
}
