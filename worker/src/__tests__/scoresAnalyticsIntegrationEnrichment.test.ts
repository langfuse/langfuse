import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
  createEvent,
  createEventsCh,
  createScoresCh,
  createTrace,
  createTracesCh,
  createTraceScore,
  getScoresForAnalyticsIntegrations,
} from "@langfuse/shared/src/server";

// LFE-11009: score-export trace enrichment must work from both the legacy
// traces table and the events table, with matching 7d-lookback semantics.

// Events tables only exist when the deployment opts into the V4 preview.
const maybeDescribe =
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type TraceAttributes = {
  name: string;
  userId: string;
  sessionId: string;
  release: string;
  tags: string[];
  posthogSessionId: string;
  mixpanelSessionId: string;
};

const makeAttributes = (suffix: string): TraceAttributes => ({
  name: `trace-${suffix}`,
  userId: `user-${suffix}`,
  sessionId: `session-${suffix}`,
  release: `release-${suffix}`,
  tags: [`tag-a-${suffix}`, `tag-b-${suffix}`],
  posthogSessionId: `ph-${suffix}`,
  mixpanelSessionId: `mp-${suffix}`,
});

const seedTraceRow = (
  projectId: string,
  traceId: string,
  timestamp: number,
  attrs: TraceAttributes,
) =>
  createTrace({
    project_id: projectId,
    id: traceId,
    timestamp,
    name: attrs.name,
    user_id: attrs.userId,
    session_id: attrs.sessionId,
    release: attrs.release,
    tags: attrs.tags,
    metadata: {
      $posthog_session_id: attrs.posthogSessionId,
      $mixpanel_session_id: attrs.mixpanelSessionId,
    },
  });

// The events aggregation reads metadata from the root span (parent_span_id = '').
const seedRootEvent = (
  projectId: string,
  traceId: string,
  timestampMs: number,
  attrs: TraceAttributes,
) =>
  createEvent({
    project_id: projectId,
    trace_id: traceId,
    parent_span_id: "",
    is_app_root: true,
    type: "SPAN",
    trace_name: attrs.name,
    user_id: attrs.userId,
    session_id: attrs.sessionId,
    release: attrs.release,
    tags: attrs.tags,
    metadata_names: ["$mixpanel_session_id", "$posthog_session_id"],
    metadata_values: [attrs.mixpanelSessionId, attrs.posthogSessionId],
    start_time: timestampMs * 1000,
    end_time: timestampMs * 1000,
    event_ts: timestampMs * 1000,
    created_at: timestampMs * 1000,
    updated_at: timestampMs * 1000,
  });

const collect = async (
  generator: ReturnType<typeof getScoresForAnalyticsIntegrations>,
) => {
  const rows = [];
  for await (const row of generator) {
    rows.push(row);
  }
  return rows;
};

const expectEnriched = (
  row: Record<string, unknown>,
  attrs: TraceAttributes,
) => {
  expect(row.langfuse_trace_name).toBe(attrs.name);
  expect(row.langfuse_user_id).toBe(attrs.userId);
  expect(row.langfuse_session_id).toBe(attrs.sessionId);
  expect(row.langfuse_release).toBe(attrs.release);
  expect(row.langfuse_tags).toEqual(attrs.tags);
  expect(row.posthog_session_id).toBe(attrs.posthogSessionId);
  expect(row.mixpanel_session_id).toBe(attrs.mixpanelSessionId);
};

const expectUnenriched = (row: Record<string, unknown>) => {
  expect(row.langfuse_trace_name).toBeFalsy();
  expect(row.langfuse_user_id).toBeNull();
  expect(row.langfuse_release).toBeFalsy();
  expect(row.posthog_session_id).toBeFalsy();
  expect(row.mixpanel_session_id).toBeFalsy();
};

maybeDescribe(
  "getScoresForAnalyticsIntegrations trace enrichment (LFE-11009)",
  () => {
    it("enriches from traces and events sources with identical 7d-lookback semantics", async () => {
      const projectId = randomUUID();
      const now = Date.now();
      const minTimestamp = new Date(now - 1 * HOUR_MS);
      const maxTimestamp = new Date(now + 1 * HOUR_MS);

      // older than the sync window, within the 7d lookback (delayed score)
      const recent = { id: randomUUID(), ts: now - 2 * HOUR_MS };
      const recentAttrs = makeAttributes("recent");
      // days old, still within the lookback
      const midAge = { id: randomUUID(), ts: now - 3 * DAY_MS };
      const midAgeAttrs = makeAttributes("mid");
      // outside the lookback: unenriched today on the legacy path; the events
      // path must match, not widen the window
      const ancient = { id: randomUUID(), ts: now - 10 * DAY_MS };
      const ancientAttrs = makeAttributes("ancient");

      await createTracesCh([
        seedTraceRow(projectId, recent.id, recent.ts, recentAttrs),
        seedTraceRow(projectId, midAge.id, midAge.ts, midAgeAttrs),
        seedTraceRow(projectId, ancient.id, ancient.ts, ancientAttrs),
      ]);
      await createEventsCh([
        seedRootEvent(projectId, recent.id, recent.ts, recentAttrs),
        seedRootEvent(projectId, midAge.id, midAge.ts, midAgeAttrs),
        seedRootEvent(projectId, ancient.id, ancient.ts, ancientAttrs),
      ]);
      await createScoresCh(
        [recent, midAge, ancient].map((trace) =>
          createTraceScore({
            project_id: projectId,
            trace_id: trace.id,
            timestamp: now,
          }),
        ),
      );

      for (const source of ["traces", "events"] as const) {
        const rows = await collect(
          getScoresForAnalyticsIntegrations(
            projectId,
            "Test Project",
            minTimestamp,
            maxTimestamp,
            { traceAttributesSource: source },
          ),
        );
        expect(rows, `source=${source}`).toHaveLength(3);

        const byTraceId = new Map(rows.map((r) => [r.langfuse_trace_id, r]));
        expectEnriched(byTraceId.get(recent.id)!, recentAttrs);
        expectEnriched(byTraceId.get(midAge.id)!, midAgeAttrs);
        expectUnenriched(byTraceId.get(ancient.id)!);
      }
    });

    it("enriches from events when no traces rows exist (events_only deployment data)", async () => {
      const projectId = randomUUID();
      const traceId = randomUUID();
      const now = Date.now();
      const attrs = makeAttributes("events-only");

      await createEventsCh([
        seedRootEvent(projectId, traceId, now - 2 * HOUR_MS, attrs),
      ]);
      await createScoresCh([
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          timestamp: now,
        }),
      ]);

      const minTimestamp = new Date(now - 1 * HOUR_MS);
      const maxTimestamp = new Date(now + 1 * HOUR_MS);

      const fromEvents = await collect(
        getScoresForAnalyticsIntegrations(
          projectId,
          "Test Project",
          minTimestamp,
          maxTimestamp,
          { traceAttributesSource: "events" },
        ),
      );
      expect(fromEvents).toHaveLength(1);
      expectEnriched(fromEvents[0], attrs);

      // the silent-null gap this routing fixes
      const fromTraces = await collect(
        getScoresForAnalyticsIntegrations(
          projectId,
          "Test Project",
          minTimestamp,
          maxTimestamp,
          { traceAttributesSource: "traces" },
        ),
      );
      expect(fromTraces).toHaveLength(1);
      expectUnenriched(fromTraces[0]);
    });
  },
);
