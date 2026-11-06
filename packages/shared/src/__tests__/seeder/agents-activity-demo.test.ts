import { describe, expect, it } from "vitest";
import {
  activityDemoWriteRows,
  buildAgentsActivityDemoPlan,
} from "../../../scripts/seeder/scenarios/agents-activity-demo-plan";
import {
  eventRecordInsertSchema,
  scoreRecordInsertSchema,
} from "../../server/repositories/definitions";

const ctx = {
  projectId: "demo-project",
  environment: "production",
  seed: 42,
  idPrefix: "activity-proof",
  dryRun: true,
  baseUrl: "http://localhost:3017",
  log() {},
};
const params = {
  date: "2026-11-01",
  days: 3,
  conversations: 6,
  "background-jobs": 2,
  stories: "agentique",
};
const build = () => buildAgentsActivityDemoPlan(ctx, params);

describe("Agents activity demo telemetry plan", () => {
  it("adds a terminal pre-model timeout without interpreting missing model usage or an unscored run as zero quality", () => {
    const plan = buildAgentsActivityDemoPlan(ctx, { date: params.date });
    const failed = plan.events.filter((event) =>
      event.trace_id.endsWith("-failure-product-search-timeout"),
    );
    expect(failed).toHaveLength(3);
    const root = failed.find((event) => event.is_app_root)!;
    const run = failed.find((event) => event.type === "AGENT")!;
    const tool = failed.find((event) => event.type === "TOOL")!;
    expect(run.agent_id).toBe(`${ctx.idPrefix}:agent:halo:researcher`);
    expect(run.agent_run_id).toBe(run.span_id);
    expect(tool.parent_span_id).toBe(run.span_id);
    expect(tool.agent_run_id).toBe(run.span_id);
    expect(run.parent_span_id).toBe(root.span_id);
    expect(
      failed.every((event) => event.level === "ERROR" && !event.session_id),
    ).toBe(true);
    expect(
      failed.every(
        (event) =>
          Object.keys(event.usage_details).length === 0 &&
          Object.keys(event.cost_details).length === 0,
      ),
    ).toBe(true);
    expect(
      Date.parse(`${root.start_time.replace(" ", "T")}Z`),
    ).toBeGreaterThanOrEqual(plan.displayFrom);
    expect(
      plan.scores.filter((score) => score.trace_id === root.trace_id),
    ).toMatchObject([{ observation_id: null, name: "task_success", value: 0 }]);
  });

  it("updates write revisions without changing event or score storage keys or mutating the deterministic plan", () => {
    const plan = build();
    const at = Date.parse("2026-11-06T16:00:00Z");
    const events = activityDemoWriteRows(plan.events, at);
    const scores = activityDemoWriteRows(plan.scores, at);
    for (const [index, event] of events.entries()) {
      const original = plan.events[index]!;
      expect(event.event_ts).not.toBe(original.event_ts);
      expect(event).toEqual({
        ...original,
        event_ts: "2026-11-06 16:00:00.000",
        updated_at: "2026-11-06 16:00:00.000",
      });
    }
    expect(scores[0]).toEqual({
      ...plan.scores[0],
      event_ts: "2026-11-06 16:00:00.000",
      updated_at: "2026-11-06 16:00:00.000",
    });
    expect(build()).toEqual(plan);
  });
  it("varies reported cache reuse without changing the hero's tokens or cost, and separates cold misses from missing reporting", () => {
    const plan = build();
    const models = plan.events.filter((event) => event.type === "GENERATION");
    const reported = models.filter((event) =>
      Object.hasOwn(event.usage_details, "input_cached_tokens"),
    );
    expect(
      reported.some((event) => event.usage_details.input_cached_tokens === 0),
    ).toBe(true);
    expect(
      reported.some((event) => event.usage_details.input_cached_tokens! > 0),
    ).toBe(true);
    expect(
      models.some(
        (event) => !Object.hasOwn(event.usage_details, "input_cached_tokens"),
      ),
    ).toBe(true);
    for (const event of models) {
      expect(event.usage_details.total).toBe(
        event.usage_details.input! +
          (event.usage_details.input_cached_tokens ?? 0) +
          event.usage_details.output!,
      );
      expect(event.provided_usage_details).toEqual(event.usage_details);
    }
    const ratio = (behavior: string) => {
      const cohort = reported.filter(
        (event) =>
          event.metadata_values?.[
            event.metadata_names?.indexOf("demo.behavior") ?? -1
          ] === behavior,
      );
      const hits = cohort.reduce(
        (sum, event) => sum + event.usage_details.input_cached_tokens!,
        0,
      );
      const input = cohort.reduce(
        (sum, event) =>
          sum +
          event.usage_details.input! +
          event.usage_details.input_cached_tokens!,
        0,
      );
      return hits / input;
    };
    expect(ratio("baseline")).toBeGreaterThan(ratio("model-regression") + 0.2);
    const hero = models.filter(
      (event) => event.session_id === plan.heroSessionId,
    );
    expect(
      hero.reduce((sum, event) => sum + event.usage_details.total!, 0),
    ).toBe(38032);
    expect(
      hero.reduce((sum, event) => sum + event.cost_details.total!, 0),
    ).toBeCloseTo(0.103532, 8);
  });

  it("keeps product-answer and coding identities, skill versions and model regressions distinct, with quality scores owned by agent runs", () => {
    const plan = buildAgentsActivityDemoPlan(ctx, { date: params.date });
    const runs = plan.events.filter((event) => event.type === "AGENT");
    expect(
      new Set(
        runs.map(
          (event) =>
            event.metadata_values?.[
              event.metadata_names?.indexOf("demo.story") ?? -1
            ],
        ),
      ),
    ).toEqual(new Set(["agentique", "halo", "coding"]));
    expect(new Set(plan.skills.map((skill) => skill.name)).size).toBe(3);
    const retired = runs.filter(
      (event) => event.agent_id === `${ctx.idPrefix}:agent:halo:router`,
    );
    expect(retired.length).toBeGreaterThan(0);
    expect(
      retired.every(
        (event) =>
          event.metadata_values?.[
            event.metadata_names?.indexOf("demo.behavior") ?? -1
          ] === "baseline",
      ),
    ).toBe(true);
    expect(
      retired.every(
        (event) =>
          Date.parse(`${event.start_time.replace(" ", "T")}Z`) <
          plan.displayFrom,
      ),
    ).toBe(true);
    expect(plan.to - plan.displayFrom).toBe(7 * 86400000);
    expect(plan.displayFrom - plan.comparisonFrom).toBe(7 * 86400000);
    const qualities = plan.scores.filter(
      (score) => score.name === "answer_quality",
    );
    expect(qualities).toHaveLength(
      runs.filter((event) => event.level !== "ERROR").length,
    );
    const regressed = runs.find(
      (event) =>
        event.metadata_values?.[
          event.metadata_names?.indexOf("demo.behavior") ?? -1
        ] === "model-regression",
    )!;
    expect(regressed).toBeDefined();
    expect(
      qualities.find((score) => score.observation_id === regressed.span_id)
        ?.value,
    ).toBeLessThan(0.7);
    expect(
      plan.events
        .filter(
          (event) =>
            event.agent_run_id === regressed.agent_run_id &&
            event.type === "GENERATION",
        )
        .every((event) => event.provided_model_name !== "gpt-4.1-mini"),
    ).toBe(true);
  });
  it("explains one conversation as three traces and six researcher invocations, independently of background work", () => {
    const plan = build();
    const hero = plan.events.filter(
      (event) => event.session_id === plan.heroSessionId,
    );
    const runs = hero.filter((event) => event.type === "AGENT");
    expect(new Set(hero.map((event) => event.trace_id)).size).toBe(3);
    expect(runs).toHaveLength(14);
    expect(
      plan.heroTraceIds.map(
        (traceId) =>
          runs.filter(
            (event) =>
              event.trace_id === traceId &&
              event.agent_id === `${ctx.idPrefix}:agent:researcher`,
          ).length,
      ),
    ).toEqual([2, 3, 1]);
    expect(new Set(runs.map((event) => event.agent_id)).size).toBe(4);
    const background = plan.events.filter((event) =>
      event.trace_id.includes("-background-"),
    );
    expect(new Set(background.map((event) => event.trace_id)).size).toBe(2);
    expect(background.every((event) => !event.session_id)).toBe(true);
    expect(
      new Set(plan.events.map((event) => event.session_id).filter(Boolean))
        .size,
    ).toBe(6);
  });

  it("keeps repeated invocations and all tool/model children owned by the nearest agent, with complete session propagation", () => {
    const { events } = build();
    expect(events.length).toBeGreaterThan(0);
    const spans = new Map(events.map((event) => [event.span_id, event]));
    for (const event of events) {
      eventRecordInsertSchema.parse(event);
      expect(event.project_id).toBe(ctx.projectId);
      if (event.type === "AGENT") {
        expect(event.agent_run_id).toBe(event.span_id);
        expect(event.agent_id?.startsWith(`${ctx.idPrefix}:agent:`)).toBe(true);
        expect(event.cost_details).toEqual({});
      } else if (event.type === "GENERATION" || event.type === "TOOL") {
        const owner = spans.get(event.agent_run_id ?? "");
        expect(owner?.type).toBe("AGENT");
        expect(event.agent_id).toBe(owner?.agent_id);
        expect(event.trace_id).toBe(owner?.trace_id);
        expect(event.session_id).toBe(owner?.session_id);
        let parent = spans.get(event.parent_span_id ?? "");
        while (parent && parent.type !== "AGENT")
          parent = spans.get(parent.parent_span_id ?? "");
        expect(parent?.span_id).toBe(event.agent_run_id);
        if (event.type === "TOOL") {
          const callId =
            event.metadata_values?.[
              event.metadata_names?.indexOf("toolCallId") ?? -1
            ];
          const calls = events
            .filter(
              (candidate) =>
                candidate.agent_run_id === owner?.span_id &&
                candidate.type === "GENERATION",
            )
            .flatMap((candidate) => candidate.tool_calls ?? [])
            .map((call) => JSON.parse(call) as { id: string });
          expect(calls.some((call) => call.id === callId)).toBe(true);
        }
      }
    }
  });

  it("separates tool dropout from an expensive retry loop and a candidate-model recovery", () => {
    const { events } = build();
    const researchers = events.filter(
      (event) => event.type === "AGENT" && event.agent_name === "Researcher",
    );
    const behavior = (event: (typeof events)[number]) =>
      event.metadata_values?.[
        event.metadata_names?.indexOf("demo.behavior") ?? -1
      ];
    const examples = ["baseline", "tool-dropout", "retry-loop", "recovery"].map(
      (name) => researchers.find((event) => behavior(event) === name)!,
    );
    expect(examples.every(Boolean)).toBe(true);
    const children = (owner: (typeof events)[number]) =>
      events.filter(
        (event) =>
          event.agent_run_id === owner.span_id && event.type !== "AGENT",
      );
    expect(
      children(examples[1]!).filter((event) => event.type === "TOOL"),
    ).toHaveLength(0);
    expect(
      children(examples[0]!).filter((event) => event.type === "TOOL").length,
    ).toBeGreaterThan(0);
    const cost = (owner: (typeof events)[number]) =>
      children(owner).reduce(
        (sum, event) => sum + (event.cost_details.total ?? 0),
        0,
      );
    expect(cost(examples[2]!)).toBeGreaterThan(cost(examples[0]!) * 2);
    const duration = (event: (typeof events)[number]) =>
      Date.parse(`${event.end_time!.replace(" ", "T")}Z`) -
      Date.parse(`${event.start_time.replace(" ", "T")}Z`);
    expect(duration(examples[2]!)).toBeGreaterThan(duration(examples[0]!) * 2);
    const models = examples.map((owner) =>
      children(owner)
        .filter((event) => event.type === "GENERATION")
        .map((event) => event.provided_model_name),
    );
    expect(models[3]).not.toEqual(models[0]);
  });

  it("attaches synthetic outcomes to their actual trace, invocation or session and pins resource versions", () => {
    const plan = build();
    expect(plan.scores.length).toBeGreaterThan(0);
    const spans = new Map(plan.events.map((event) => [event.span_id, event]));
    const traces = new Set(plan.events.map((event) => event.trace_id));
    const sessions = new Set(
      plan.events.map((event) => event.session_id).filter(Boolean),
    );
    for (const score of plan.scores) {
      expect(scoreRecordInsertSchema.safeParse(score).success).toBe(true);
      expect(score.project_id).toBe(ctx.projectId);
      expect(score.metadata.synthetic).toBe("true");
      if (score.observation_id)
        expect(spans.get(score.observation_id)?.trace_id).toBe(score.trace_id);
      else if (score.trace_id) expect(traces.has(score.trace_id)).toBe(true);
      else expect(sessions.has(score.session_id)).toBe(true);
    }
    const loads = plan.events.flatMap(
      (event) => event.skills_resource_loaded ?? [],
    );
    expect(new Set(loads.map((load) => load.skillVersion))).toEqual(
      new Set([1, 2]),
    );
    expect(
      loads.every(
        (load) =>
          load.skillName === plan.skillName && load.filePath === "SKILL.md",
      ),
    ).toBe(true);
  });

  it("is deterministic, bounded to completed history, and preserves existing storage keys when volume increases", () => {
    const plan = build();
    expect(plan.events.length).toBeGreaterThan(0);
    expect(build()).toEqual(plan);
    const more = buildAgentsActivityDemoPlan(ctx, {
      ...params,
      conversations: 12,
    });
    const extra = new Map(more.events.map((event) => [event.span_id, event]));
    for (const event of plan.events)
      expect(extra.get(event.span_id)?.start_time).toBe(event.start_time);
    expect(plan.to - plan.from).toBe(3 * 86400000);
    for (const event of plan.events) {
      expect(
        Date.parse(`${event.start_time.replace(" ", "T")}Z`),
      ).toBeGreaterThanOrEqual(plan.from);
      expect(Date.parse(`${event.end_time!.replace(" ", "T")}Z`)).toBeLessThan(
        plan.to,
      );
    }
    expect(() =>
      buildAgentsActivityDemoPlan(ctx, { ...params, days: 31 }),
    ).toThrow();
    expect(() =>
      buildAgentsActivityDemoPlan(ctx, { ...params, date: "2099-01-01" }),
    ).toThrow();
    const history = buildAgentsActivityDemoPlan(ctx, { date: params.date });
    const roots = history.events.filter((event) => event.is_app_root);
    const daily = new Map<string, number>();
    for (const event of roots)
      daily.set(
        event.start_time.slice(0, 10),
        (daily.get(event.start_time.slice(0, 10)) ?? 0) + 1,
      );
    expect(
      new Set(history.events.map((event) => event.session_id).filter(Boolean))
        .size,
    ).toBe(120);
    expect(daily.size).toBeGreaterThanOrEqual(10);
    expect(new Set(daily.values()).size).toBeGreaterThan(1);
    expect(
      new Set(roots.map((event) => event.start_time.slice(11, 13))).size,
    ).toBeGreaterThanOrEqual(6);
  });
});
