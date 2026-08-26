/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/parity-classification`,
 * LFE-15559). The ingestion seam's shadow drop-in: `authorizeIngestionRequest`
 * runs the new per-event pipeline beside the legacy verify the route already did,
 * emits parity in shadow, and returns the new decision for the route to apply in
 * enforce. Ingest is per-event (207), so the route filters the batch rather than
 * the drop-in throwing; the legacy per-event verdict is a reconstruction, never
 * legacy's 207, which mixes validation into an overcount.
 * Run: `pnpm --filter web run test:in-source shadow.ingest.prototype`.
 */

import { type IncomingHttpHeaders } from "http";

import { type AuthHeaderVerificationResult } from "@langfuse/shared/src/server";
import type { ErrorResult } from "./policy.prototype";
import {
  authzMigrationMode,
  type AuthError,
} from "./enforcement.organizations.prototype";
import {
  enforceIngestionAuth,
  ingestionActionByEventType,
  ingestionEventIdentity,
  type IngestionAccessResult,
} from "./enforcement.ingest.prototype";
import {
  diffResults,
  legacyFromStatus,
  legacyFromVerdict,
  newFromVerdict,
  type ParitySink,
  type Verdict,
} from "./shadow.prototype";

/** authorizeIngestionRequest runs the new per-event pipeline beside the legacy verify the route already computed, emits parity in shadow, and returns the new decision; the route applies it per-event in enforce and ignores it in shadow. */
export async function authorizeIngestionRequest(params: {
  headers: IncomingHttpHeaders;
  batch: unknown[];
  authCheck: AuthHeaderVerificationResult;
}): Promise<IngestionAccessResult | ErrorResult<AuthError>> {
  const { headers, batch, authCheck } = params;
  const authz = await enforceIngestionAuth({ headers, batch });
  if (authzMigrationMode === "shadow") {
    recordIngestionParity(authCheck, authz, batch);
  }
  return authz;
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
  diffResults(
    authz,
    legacyFromStatus(connLegacy),
    { seam: "ingestion_event", action: "none" },
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
    const neu = rejectedIds.has(id) ? "deny" : "allow";
    diffResults(
      newFromVerdict(neu),
      legacyFromVerdict(legacy),
      { seam: "ingestion_event", action },
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

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const PRJ = "prj_1";

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
    const scoresAuthCheck = {
      validKey: true,
      scope: { projectId: PRJ, accessLevel: "scores", isIngestionSuspended: false },
    } as AuthHeaderVerificationResult;

    it("agrees per event: scores key denies the trace, allows the score", () => {
      const batch = [
        { id: "e1", type: "trace-create" },
        { id: "e2", type: "score-create" },
      ];
      const calls: Record<string, string | number>[] = [];
      const sink: ParitySink = {
        increment: (_stat, tags) => calls.push(tags),
        span: () => undefined,
      };
      const authz: IngestionAccessResult = {
        success: true,
        context: { principal: { kind: "admin", userId: null }, policies: [] },
        projectId: PRJ,
        allowedBatch: [batch[1]],
        rejectedEvents: [
          { id: "e1", status: 403, message: "", error: "ForbiddenError" },
        ],
      };
      recordIngestionParity(scoresAuthCheck, authz, batch, sink);
      // connection + two events, all agreeing
      expect(calls).toHaveLength(3);
      expect(calls.every((c) => c.seam === "ingestion_event")).toBe(true);
      expect(calls.every((c) => c.result === "match")).toBe(true);
    });
  });
}
