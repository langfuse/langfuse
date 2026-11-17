import { describe, expect, it } from "vitest";
import { buildAgentsActivityDemoPlan } from "../../../scripts/seeder/scenarios/agents-activity-demo-plan";
import {
  activityDemoReplaySettings,
  buildActivityDemoLiveBatch,
} from "../../../scripts/seeder/scenarios/agents-activity-demo-replay";
import { buildActivityDemoApiPayload } from "../../../scripts/seeder/scenarios/agents-activity-demo-api-plan";
import { PostScoreBody } from "../../features/scores/interfaces/api/shared";
import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "../../server/otel/OtelIngestionProcessor";
import { validateOtelSpanIds } from "../../server/otel/utils";

const ctx = {
  projectId: "live-demo-project",
  environment: "production",
  seed: 42,
  idPrefix: "live-proof",
  dryRun: true,
  baseUrl: "http://localhost:3017",
  log() {},
};

describe("Opt-in synthetic activity replay", () => {
  it("is disabled by default and bounds batch count and scheduling", () => {
    expect(activityDemoReplaySettings({})).toBeNull();
    expect(activityDemoReplaySettings({ replay: true })).toEqual({
      count: 6,
      intervalMs: 5000,
      deadlineMs: 300000,
    });
    const invalidSettings: Record<string, string | number | boolean>[] = [
      { "replay-count": 21 },
      { "replay-count": 0 },
      { "replay-interval-ms": 0 },
      { "replay-count": 20, "replay-interval-ms": 15000 },
    ];
    for (const invalid of invalidSettings)
      expect(() =>
        activityDemoReplaySettings({ replay: true, ...invalid }),
      ).toThrow();
  });

  it("exports deterministic historical OTLP ids without moving timestamps or breaking parents, run owners, scores and skill evidence", () => {
    const plan = buildAgentsActivityDemoPlan(ctx, {
      date: "2026-11-01",
      days: 3,
      conversations: 6,
      "background-jobs": 2,
    });
    const original = structuredClone(plan);
    const payload = buildActivityDemoApiPayload(plan);
    expect(buildActivityDemoApiPayload(plan)).toEqual(payload);
    expect(plan).toEqual(original);
    expect(validateOtelSpanIds(payload.resourceSpans)).toMatchObject({
      invalidSpanCount: 0,
      malformedCollectionCount: 0,
    });
    const mapped = new Map(
      plan.events.map((event, index) => [
        `${event.trace_id}:${event.span_id}`,
        payload.events[index]!,
      ]),
    );
    for (const [index, event] of payload.events.entries()) {
      const source = plan.events[index]!;
      expect(event.trace_id).toMatch(/^[0-9a-f]{32}$/);
      expect(event.span_id).toMatch(/^[0-9a-f]{16}$/);
      expect(event.start_time).toBe(source.start_time);
      expect(event.end_time).toBe(source.end_time);
      expect(event.session_id).toBe(source.session_id);
      expect(event.parent_span_id).toBe(
        source.parent_span_id
          ? mapped.get(`${source.trace_id}:${source.parent_span_id}`)!.span_id
          : "",
      );
      expect(event.agent_run_id).toBe(
        source.agent_run_id
          ? mapped.get(`${source.trace_id}:${source.agent_run_id}`)!.span_id
          : "",
      );
      expect(event.skills_resource_loaded).toEqual(
        source.skills_resource_loaded,
      );
    }
    const spans = new Map(
      payload.resourceSpans.flatMap((resource) =>
        resource.scopeSpans.flatMap((scope) =>
          scope.spans.map((span) => [span.spanId, span] as const),
        ),
      ),
    );
    for (const event of payload.events) {
      const span = spans.get(event.span_id)!;
      expect(span.startTimeUnixNano).toBe(
        (
          BigInt(Date.parse(`${event.start_time.replace(" ", "T")}Z`)) *
          1_000_000n
        ).toString(),
      );
      const attrs = Object.fromEntries(
        span.attributes!.map((attribute) => [
          attribute.key,
          attribute.value?.stringValue,
        ]),
      );
      if (event.agent_id)
        expect(attrs["langfuse.agent.run_id"]).toBe(event.agent_run_id);
      if (event.skills_resource_loaded?.length) {
        const available = JSON.parse(
          attrs["langfuse.observation.skills_available"]!,
        );
        expect(available).toContainEqual({
          name: event.skills_resource_loaded[0]!.skillName,
          version: event.skills_resource_loaded[0]!.skillVersion,
        });
      }
    }
    for (const [index, score] of payload.scoreBodies.entries()) {
      PostScoreBody.parse(score);
      const source = plan.scores[index]!;
      expect(score.timestamp).toBe(
        new Date(`${source.timestamp.replace(" ", "T")}Z`).toISOString(),
      );
      if (source.observation_id)
        expect(score.observationId).toBe(
          mapped.get(`${source.trace_id}:${source.observation_id}`)!.span_id,
        );
      if (source.session_id) expect(score.sessionId).toBe(source.session_id);
    }
    expect(
      payload.scoreBodies.some((score) => score.sessionId && !score.traceId),
    ).toBe(true);
  });

  it("produces fresh, completed OTLP work whose real ingestion parser preserves each agent owner, models, skill loads and run-score references", () => {
    const plan = buildAgentsActivityDemoPlan(ctx, {
      date: "2026-11-01",
      days: 3,
      conversations: 6,
      "background-jobs": 3,
    });
    const now = Date.parse("2026-11-06T15:00:00Z");
    const errorRun = plan.events.find(
      (event) =>
        event.trace_id === plan.heroTraceIds[2] &&
        event.type === "AGENT" &&
        event.agent_name === "Researcher",
    )!;
    errorRun.level = "ERROR";
    errorRun.status_message = "Synthetic replay adapter timeout";
    const live = buildActivityDemoLiveBatch(ctx, plan, "proof-nonce", 2, now);
    const other = buildActivityDemoLiveBatch(
      ctx,
      plan,
      "proof-nonce",
      3,
      now + 5000,
    );
    const staticIds = new Set(plan.events.map((event) => event.span_id));
    expect(live.events.every((event) => !staticIds.has(event.span_id))).toBe(
      true,
    );
    expect(new Set(live.events.map((event) => event.trace_id)).size).toBe(4);
    expect(live.events.some((event) => !event.session_id)).toBe(true);
    const later = buildActivityDemoLiveBatch(ctx, plan, "proof-nonce", 11, now);
    expect(
      later.events.some(
        (event) =>
          event.metadata_values?.[
            event.metadata_names?.indexOf("demo.workload") ?? -1
          ] === "failure",
      ),
    ).toBe(false);
    expect(
      live.events.every(
        (event) => event.agent_id !== `${ctx.idPrefix}:agent:halo:router`,
      ),
    ).toBe(true);
    expect(
      other.events.every(
        (event) =>
          !live.events.some((prior) => prior.span_id === event.span_id),
      ),
    ).toBe(true);
    for (const event of live.events) {
      expect(event.trace_id).toMatch(/^[0-9a-f]{32}$/);
      expect(event.span_id).toMatch(/^[0-9a-f]{16}$/);
      expect(Date.parse(`${event.end_time!.replace(" ", "T")}Z`)).toBeLessThan(
        now,
      );
    }
    expect(validateOtelSpanIds(live.resourceSpans)).toMatchObject({
      invalidSpanCount: 0,
      malformedCollectionCount: 0,
    });
    const decoded: ResourceSpan[] = live.resourceSpans.map((resource) => ({
      ...resource,
      scopeSpans: resource.scopeSpans.map((scope) => ({
        ...scope,
        spans: scope.spans.map((span) => ({
          ...span,
          traceId: Buffer.from(span.traceId, "hex"),
          spanId: Buffer.from(span.spanId, "hex"),
          parentSpanId: span.parentSpanId
            ? Buffer.from(span.parentSpanId, "hex")
            : undefined,
        })),
      })),
    }));
    const actual = new OtelIngestionProcessor({
      projectId: ctx.projectId,
      publicKey: "synthetic-public",
      sdkName: "seed-cli",
      sdkVersion: "1",
    }).processToEvent(decoded);
    expect(actual).toHaveLength(live.events.length);
    const bySpan = new Map(actual.map((event) => [event.spanId, event]));
    for (const expected of live.events) {
      const event = bySpan.get(expected.span_id)!;
      expect(event.type).toBe(expected.type);
      expect(event.level).toBe(expected.level);
      expect(event.statusMessage ?? null).toBe(expected.status_message ?? null);
      expect(event.environment).toBe(expected.environment);
      expect(event.completionStartTime ?? null).toEqual(
        expected.completion_start_time
          ? new Date(
              `${expected.completion_start_time.replace(" ", "T")}Z`,
            ).toISOString()
          : null,
      );
      expect(event.sessionId ?? "").toBe(expected.session_id);
      expect(event.tags).toEqual(expected.tags);
      expect(event.serviceName).toBe(expected.service_name);
      expect(event.serviceVersion ?? "").toBe(expected.service_version ?? "");
      expect(event.scopeName).toBe(expected.scope_name || "langfuse-seed-cli");
      expect(event.scopeVersion).toBe(expected.scope_version || "1");
      if (expected.agent_id)
        expect(event.agentIdentity).toMatchObject({
          id: expected.agent_id,
          runId: expected.agent_run_id,
        });
      if (expected.type === "GENERATION") {
        expect(event.modelName).toBe(expected.provided_model_name);
        expect(event.modelParameters).toEqual(
          JSON.parse(expected.model_parameters!),
        );
        expect(event.providedUsageDetails).toEqual(expected.usage_details);
        expect(event.providedCostDetails).toEqual(expected.cost_details);
      }
      if (expected.skills_resource_loaded?.length) {
        expect(event.skillsResourceLoaded).toEqual([
          {
            skillName: expected.skills_resource_loaded![0]!.skillName,
            filePath: expected.skills_resource_loaded![0]!.filePath,
          },
        ]);
        expect(event.skillsAvailable[0].version).toBe(
          expected.skills_resource_loaded![0]!.skillVersion,
        );
      }
    }
    for (const score of live.scoreBodies) {
      PostScoreBody.parse(score);
      if (score.observationId)
        expect(bySpan.get(score.observationId)?.traceId).toBe(score.traceId);
    }
    expect(
      live.scoreBodies.some(
        (score) => score.name === "answer_quality" && score.observationId,
      ),
    ).toBe(true);
  });
});
