import { describe, expect, it } from "vitest";

import { AUDITED_TRACE_VIEW_PROCEDURES } from "@/src/server/api/trpc";
import { traceRouter } from "@/src/server/api/routers/traces";
import { eventsRouter } from "@/src/features/events/server/eventsRouter";

/**
 * Drift guard for the trace-view read-audit gate. The middleware audits a view
 * when `AUDITED_TRACE_VIEW_PROCEDURES.has(opts.path)`; that set is a hand-kept
 * list of dotted paths. This test binds the list to the ACTUAL routers so it
 * cannot drift from prod: renaming/moving an audited procedure makes its path
 * disappear from `realPaths` and fails the first assertion — exactly the
 * silent-audit-goes-dark case a hardcoded string (or a fake test router) can't
 * catch.
 */
function pathsFor(
  prefix: string,
  // Router `_def.procedures` is a flat record keyed by the procedure name.
  router: { _def: { procedures: Record<string, unknown> } },
): string[] {
  return Object.keys(router._def.procedures).map((name) => `${prefix}.${name}`);
}

describe("audited trace-view procedure drift guard", () => {
  const realPaths = new Set([
    ...pathsFor("traces", traceRouter),
    ...pathsFor("events", eventsRouter),
  ]);

  it("every audited path resolves to a real procedure", () => {
    for (const path of AUDITED_TRACE_VIEW_PROCEDURES) {
      expect(realPaths.has(path)).toBe(true);
    }
  });

  it("audits exactly the two single-trace content detail paths", () => {
    expect([...AUDITED_TRACE_VIEW_PROCEDURES].sort()).toEqual([
      "events.byTraceId",
      "traces.byIdWithObservationsAndScores",
    ]);
  });

  it("does NOT audit high-frequency or non-content trace procedures", () => {
    // These share enforceTraceAccess but must stay out of the audited set:
    // byId/batchIO back per-row table cells; getAgentGraphData and
    // scoresForTrace are not content views.
    for (const path of [
      "traces.byId",
      "traces.getAgentGraphData",
      "events.batchIO",
      "events.scoresForTrace",
      "events.getAgentGraphData",
    ]) {
      // Sanity: it is a real procedure (so a rename here would also surface) ...
      expect(realPaths.has(path)).toBe(true);
      // ... and it is deliberately excluded from auditing.
      expect(AUDITED_TRACE_VIEW_PROCEDURES.has(path)).toBe(false);
    }
  });
});
