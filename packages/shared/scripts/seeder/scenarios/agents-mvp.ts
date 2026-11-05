import { createEvent } from "../../../src/server/test-utils/tracing-factory";
import { createEventsCh } from "../../../src/server/test-utils/clickhouse-helpers";
import { type EventRecordInsertType } from "../../../src/server/repositories/definitions";
import {
  chunk,
  SeedError,
  type ScenarioContext,
  type ScenarioDefinition,
} from "./types";
import { countRows, escapeLike } from "./verify";
import { utcDayStartMs } from "./rng";
import {
  AGENTS_MVP_UNRESOLVED_SKILL,
  agentsMvpManagedSkillName,
  seedAgentsMvpSkills,
} from "./agents-mvp-skills";
import { seedAgentsMvpLegacyApi } from "./agents-mvp-legacy-api";

const NAMES = [
  "agentique",
  "intake",
  "research",
  "verify",
  "verify-citation",
  "compose",
  "compose / résumé? v1#",
  "native-name-only",
];
const INPUT = [824, 4556, 11727];
const OUTPUT = [36, 34, 421];
const COST = [0.001, 0.01, 0.02];

/** Deterministic telemetry, including rewrites and incomplete instrumentation. */
export function buildAgentsMvpFixture(
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
) {
  if (params.v4 === false) throw new SeedError("Agents MVP requires v4 events");
  const runs = Number(params.runs ?? 80);
  if (!Number.isInteger(runs) || runs < 8 || runs > 100_000)
    throw new SeedError("runs must be between 8 and 100000");
  const textDate = String(params.date ?? "");
  const start = textDate
    ? Date.parse(`${textDate}T11:00:00.000Z`)
    : utcDayStartMs() + 11 * 3_600_000;
  if (
    !Number.isFinite(start) ||
    (textDate && new Date(start).toISOString().slice(0, 10) !== textDate)
  )
    throw new SeedError("date must be a UTC YYYY-MM-DD");
  const end = start + 4 * 3_600_000;
  const version = Date.now();
  const events: EventRecordInsertType[] = [];
  const skillName = agentsMvpManagedSkillName(ctx.idPrefix);
  for (let i = 0; i < runs; i++) {
    const agent = i % NAMES.length;
    const historic = i >= 8 && i % 5 === 0;
    const at =
      start +
      Math.floor((i / runs) * 3.5 * 3_600_000) -
      (historic ? (i % 2 ? 7 : 40) * 86_400_000 : 0);
    const traceId = `${ctx.idPrefix}-trace-${i}`;
    const runId = `${ctx.idPrefix}-run-${i}`;
    const agentId = agent === 7 ? "" : `agentique:${agent}`;
    const environment = i >= 8 && i % 11 === 0 ? "staging" : ctx.environment;
    const skillVersion = (Math.floor(i / NAMES.length) % 2) + 1;
    const common = {
      project_id: ctx.projectId,
      trace_id: traceId,
      trace_name: `Agent demo ${i}`,
      environment,
      agent_id: agentId,
      agent_name: NAMES[agent],
      agent_run_id: runId,
      agent_identity_source: "gen-ai",
      start_time: at,
      end_time: at + 5000,
      event_ts: version,
      provided_usage_details: {},
      usage_details: {},
      provided_cost_details: {},
      cost_details: {},
      input: JSON.stringify({
        question: "Which sources support this answer?",
        context: "Evidence ".repeat(120),
      }),
      output: JSON.stringify({ answer: "A verified answer with a source." }),
    };
    events.push(
      createEvent({
        ...common,
        span_id: `t-${traceId}`,
        parent_span_id: "",
        type: "SPAN",
        name: `Agent demo ${i}`,
        agent_id: "",
        agent_name: "",
        agent_run_id: "",
        agent_identity_source: "",
      }),
    );
    events.push(
      createEvent({
        ...common,
        span_id: runId,
        parent_span_id: `t-${traceId}`,
        type: "AGENT",
        name: NAMES[agent],
        usage_details: { input: 17107, output: 491, total: 17598 },
        cost_details: { total: 0.031 },
        scope_name: "agentique-demo",
        scope_version: "1",
        service_name: "agentique",
        level: i % 17 === 0 ? "ERROR" : "DEFAULT",
      }),
    );
    for (let request = 0; request < 3; request++) {
      const missing = i >= 8 && i % 7 === 0 && request === 2;
      const model = createEvent({
        ...common,
        span_id: `${runId}-model-${request}`,
        parent_span_id: runId,
        type: "GENERATION",
        name: "Model request",
        provided_model_name: "demo-model",
        start_time: at + 500 + request * 1000,
        end_time: at + 1000 + request * 1000,
        agent_run_id: i >= 8 && i % 13 === 0 ? "" : runId,
        usage_details: missing
          ? {}
          : {
              input: INPUT[request]!,
              output: OUTPUT[request]!,
              total: INPUT[request]! + OUTPUT[request]!,
            },
        cost_details: missing ? {} : { total: COST[request]! },
        skills_available: [{ skillName, skillVersion }],
      });
      if (i === 2 && request === 0)
        events.push({
          ...model,
          usage_details: { input: 999999, output: 999999, total: 1999998 },
          cost_details: { total: 99 },
          event_ts: new Date(version - 1000)
            .toISOString()
            .replace("T", " ")
            .replace("Z", ""),
        });
      events.push(model);
    }
    events.push(
      createEvent({
        ...common,
        span_id: `${runId}-skill`,
        parent_span_id: runId,
        type: "TOOL",
        name: "Skill",
        start_time: at + 100,
        end_time: at + 300,
        skills_resource_loaded: [
          {
            skillName: i === 7 ? AGENTS_MVP_UNRESOLVED_SKILL : skillName,
            ...(i === 7 ? {} : { skillVersion }),
            filePath: i % 3 ? "SKILL.md" : "references/cases.md",
          },
        ],
      }),
    );
    if (i === 3) {
      const removed = createEvent({
        ...common,
        span_id: `${runId}-deleted-model`,
        parent_span_id: runId,
        type: "GENERATION",
        name: "Removed request",
        cost_details: { total: 999 },
      });
      events.push(removed, {
        ...removed,
        is_deleted: 1,
        event_ts: new Date(version + 1)
          .toISOString()
          .replace("T", " ")
          .replace("Z", ""),
      });
    }
    if (i === 4)
      events.push(
        ...events
          .filter((event) => event.trace_id === traceId && event.agent_name)
          .map((event) => ({
            ...event,
            environment: "staging",
            event_ts: new Date(version + 2)
              .toISOString()
              .replace("T", " ")
              .replace("Z", ""),
          })),
      );
  }
  const boundaryTrace = `${ctx.idPrefix}-boundary-trace`;
  const boundaryRun = `${ctx.idPrefix}-boundary-run`;
  const boundary = {
    project_id: ctx.projectId,
    trace_id: boundaryTrace,
    trace_name: "Invocation crossing the selected period",
    environment: ctx.environment,
    agent_id: "agentique:0",
    agent_name: NAMES[0],
    agent_run_id: boundaryRun,
    agent_identity_source: "gen-ai",
    start_time: start - 60_000,
    end_time: end,
    event_ts: version,
    provided_usage_details: {},
    usage_details: {},
    provided_cost_details: {},
    cost_details: {},
  };
  events.push(
    createEvent({
      ...boundary,
      span_id: `t-${boundaryTrace}`,
      parent_span_id: "",
      type: "SPAN",
      name: boundary.trace_name,
      agent_id: "",
      agent_name: "",
      agent_run_id: "",
      agent_identity_source: "",
    }),
    createEvent({
      ...boundary,
      span_id: boundaryRun,
      parent_span_id: `t-${boundaryTrace}`,
      type: "AGENT",
      name: NAMES[0],
    }),
    createEvent({
      ...boundary,
      span_id: `${boundaryRun}-model`,
      parent_span_id: boundaryRun,
      type: "GENERATION",
      name: "Model request",
      start_time: end - 30_000,
      end_time: end - 29_750,
      usage_details: { input: 9, output: 1, total: 10 },
      cost_details: { total: 0.002 },
    }),
  );
  return { events, start, end, runs: runs + 1 };
}

export const agentsMvpScenario: ScenarioDefinition = {
  name: "agents-mvp",
  description:
    "Eight real agent identities, model-only accounting, versioned skill resources and history for query-pruning checks",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "Required v4 events (enabled by default)",
    },
    {
      flag: "runs",
      type: "number",
      default: 80,
      description:
        "Ordinary invocations, plus one crossing-period case; up to 100000 for scale checks",
    },
    {
      flag: "date",
      type: "string",
      default: "",
      description: "UTC date (today by default), fixed 11:00–15:00 window",
    },
    {
      flag: "legacy-api",
      type: "boolean",
      default: false,
      description:
        "Also verify legacy public JSON ingestion in a separate trace namespace",
    },
  ],
  async run(ctx, params) {
    const startedAt = Date.now();
    const includeLegacyApi = params["legacy-api"] === true;
    const fixture = buildAgentsMvpFixture(ctx, params);
    const traceIds = Array.from(
      new Set(fixture.events.map((event) => event.trace_id)),
    );
    const summary = {
      scenario: "agents-mvp",
      target: "clickhouse" as const,
      projectId: ctx.projectId,
      environment: ctx.environment,
      params,
      traceIds,
      sessionIds: [],
      counts: { agents: 8, runs: fixture.runs, events: fixture.events.length },
      verified: {} as Record<string, number>,
      links: [
        `${ctx.baseUrl}/project/${ctx.projectId}/agents?dateRange=${fixture.start}-${fixture.end}`,
      ],
      dryRun: ctx.dryRun,
      durationMs: 0,
    };
    if (!ctx.dryRun) {
      const skills = await seedAgentsMvpSkills(ctx);
      for (const event of fixture.events) {
        for (const field of [
          "skills_available",
          "skills_resource_loaded",
        ] as const) {
          for (const reference of event[field] ?? []) {
            const skill = skills.find(
              (candidate) =>
                candidate.name === reference.skillName &&
                candidate.version === reference.skillVersion,
            );
            if (skill) reference.langfuseSkillId = skill.id;
          }
        }
      }
      summary.verified.managedSkillVersions = skills.length;
      summary.links.push(
        `${ctx.baseUrl}/project/${ctx.projectId}/skills/${agentsMvpManagedSkillName(ctx.idPrefix)}`,
      );
      for (const batch of chunk(fixture.events, 10_000))
        await createEventsCh(batch);
      summary.verified.runs = await countRows(
        "events_core",
        `project_id = {projectId:String} AND start_time >= {from:DateTime64(3)} AND start_time < {to:DateTime64(3)} AND trace_id LIKE {prefix:String} AND type = 'AGENT'${includeLegacyApi ? " AND trace_id != {legacyTrace:String}" : ""}`,
        {
          projectId: ctx.projectId,
          prefix: `${escapeLike(ctx.idPrefix)}-%`,
          ...(includeLegacyApi
            ? { legacyTrace: `${ctx.idPrefix}-legacy-api-trace` }
            : {}),
          from: new Date(fixture.start - 41 * 86_400_000)
            .toISOString()
            .replace("T", " ")
            .replace("Z", ""),
          to: new Date(fixture.end)
            .toISOString()
            .replace("T", " ")
            .replace("Z", ""),
        },
        "uniqExact(span_id)",
      );
      if (summary.verified.runs !== fixture.runs)
        throw new SeedError("Agents fixture readback mismatch");
      if (includeLegacyApi) {
        const legacy = await seedAgentsMvpLegacyApi(
          ctx,
          String(params.date ?? ""),
        );
        summary.traceIds.push(...legacy.traceIds);
        summary.links.push(...legacy.links);
        for (const [key, value] of Object.entries(legacy.verified))
          summary.verified[`legacyApi${key}`] = value;
      }
    }
    summary.durationMs = Date.now() - startedAt;
    return summary;
  },
};
