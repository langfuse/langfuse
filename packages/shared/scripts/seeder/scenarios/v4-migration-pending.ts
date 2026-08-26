import { prisma } from "../../../src/db";
import {
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  createEventsCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import {
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

// ---------------------------------------------------------------------------
// A project the v4 migration wizard still has work for. Readiness is derived
// from live signals, so a freshly seeded project reads as "ready" and every
// wizard surface disappears — the sidebar "Action required" item, the status
// page row, and the side panel they open.
//
// Trace-level evaluation rules are the cheapest signal that survives without
// an LLM connection or ingestion traffic: they count as affected evals, which
// puts the project into "action-needed". The traffic-derived signals (outdated
// SDK versions, deprecated API usage) come from ClickHouse system.query_log
// and worker-maintained Redis caches, which a seeder cannot fabricate
// honestly, so they stay untouched.
// ---------------------------------------------------------------------------

const TRACE_EVAL_TARGET = "trace";

const evaluatorId = (ctx: ScenarioContext, index: number) =>
  `${ctx.idPrefix}-evaluator-${index}`;
const ruleId = (ctx: ScenarioContext, index: number) =>
  `${ctx.idPrefix}-rule-${index}`;

/**
 * One legacy evaluator plus the trace-level rule that runs it. Written as the
 * product writes it — evaluator, version, rule, assignment — so the project's
 * evaluators page shows the same thing the migration count reports.
 */
const writeLegacyEvaluator = async (ctx: ScenarioContext, index: number) => {
  const evaluator = {
    id: evaluatorId(ctx, index),
    projectId: ctx.projectId,
    name: `legacy-trace-eval-${index}`,
    type: "LLM_AS_JUDGE" as const,
    description: "Seeded trace-level evaluator; blocks the v4 migration.",
  };
  const rule = {
    id: ruleId(ctx, index),
    projectId: ctx.projectId,
    name: `legacy-trace-rule-${index}`,
    status: "ACTIVE" as const,
    // Both fields are what getTraceLevelEvalSummaries counts.
    targetObject: TRACE_EVAL_TARGET,
    timeScope: ["NEW"],
    filter: [],
    sampling: 1,
    delay: 0,
  };

  await prisma.$transaction(async (tx) => {
    await tx.evaluator.upsert({
      where: { id: evaluator.id },
      create: evaluator,
      update: evaluator,
    });
    await tx.evaluatorVersion.upsert({
      where: { evaluatorId_version: { evaluatorId: evaluator.id, version: 1 } },
      create: {
        id: `${evaluator.id}-v1`,
        evaluatorId: evaluator.id,
        version: 1,
        prompt: "Is the answer helpful? Reply with a score between 0 and 1.",
        model: "gpt-4o-mini",
        provider: "openai",
        vars: ["input", "output"],
        variableMapping: [],
      },
      update: {},
    });
    await tx.evaluationRule.upsert({
      where: { id: rule.id },
      create: rule,
      update: rule,
    });
    await tx.evaluationRuleEvaluatorAssignment.upsert({
      where: {
        evaluationRuleId_evaluatorId: {
          evaluationRuleId: rule.id,
          evaluatorId: evaluator.id,
        },
      },
      create: {
        id: `${rule.id}-assignment`,
        projectId: ctx.projectId,
        evaluationRuleId: rule.id,
        evaluatorId: evaluator.id,
      },
      update: {},
    });
  });
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params.v4 === true;
  const evalCount = Math.max(1, Number(params.evals));
  const traceId = `${ctx.idPrefix}-t0`;
  // Anchored on today's UTC midnight, never the wall clock: these land in
  // ClickHouse ORDER BY keys and a re-run must overwrite in place.
  const traceTimestamp = utcDayStartMs() + 9 * 60 * 60 * 1000;
  const observationCount = 3;

  const links = [
    `${ctx.baseUrl}/v4-migration`,
    `${ctx.baseUrl}/project/${ctx.projectId}/evals`,
    traceLink(ctx, traceId, traceTimestamp),
  ];

  if (ctx.dryRun) {
    return {
      scenario: "v4-migration-pending",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [],
      counts: {
        evaluators: evalCount,
        evaluationRules: evalCount,
        traces: 1,
        observations: observationCount,
        events: withV4 ? observationCount + 1 : 0,
      },
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  ctx.log(`writing ${evalCount} trace-level evaluation rules to postgres`);
  for (let index = 0; index < evalCount; index++) {
    await writeLegacyEvaluator(ctx, index);
  }

  const trace: TraceRecordInsertType = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    session_id: null,
    timestamp: traceTimestamp,
    name: "legacy-sdk-chat",
    user_id: `user-${ctx.idPrefix}`,
    tags: ["seed", "v4-migration-pending"],
    public: false,
    bookmarked: false,
    metadata: { scenario: "v4-migration-pending" },
    input: JSON.stringify({ question: "How do I upgrade to v4?" }),
    output: "Start with the SDK, then your evals.",
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const observations: ObservationRecordInsertType[] = Array.from(
    { length: observationCount },
    (_, index) => {
      const startTime =
        traceTimestamp + index * 800 + jitter(ctx.seed, index, 150);
      return createObservation({
        id: `${traceId}-o${index}`,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: index === 1 ? "GENERATION" : "SPAN",
        parent_observation_id: index === 0 ? null : `${traceId}-o0`,
        name: index === 1 ? "answer" : `step-${index}`,
        start_time: startTime,
        end_time: startTime + 600,
        level: "DEFAULT",
        status_message: null,
        input: JSON.stringify({ step: index }),
        output: "ok",
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      });
    },
  );

  const events: EventRecordInsertType[] = withV4
    ? [
        traceToEvent(trace),
        ...observations.map((observation) =>
          observationToEvent(observation, trace),
        ),
      ]
    : [];

  ctx.log(
    `writing 1 trace, ${observations.length} observations${withV4 ? `, ${events.length} events` : ""}`,
  );
  await createTracesCh([trace]);
  await createObservationsCh(observations);
  if (events.length > 0) {
    await createEventsCh(events);
  }

  const ruleIds = Array.from({ length: evalCount }, (_, index) =>
    ruleId(ctx, index),
  );
  const verified: Record<string, number> = {
    evaluators: await prisma.evaluator.count({
      where: {
        id: {
          in: Array.from({ length: evalCount }, (_, i) => evaluatorId(ctx, i)),
        },
      },
    }),
    // Counted the way the migration check counts them, so a schema drift in
    // either field shows up here instead of as a silently "ready" project.
    evaluationRules: await prisma.evaluationRule.count({
      where: {
        id: { in: ruleIds },
        projectId: ctx.projectId,
        targetObject: TRACE_EVAL_TARGET,
        status: "ACTIVE",
        timeScope: { has: "NEW" },
      },
    }),
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND trace_id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(span_id)",
    );
  }

  if (verified.evaluationRules < evalCount) {
    throw new SeedError(
      `Readback mismatch: expected ${evalCount} trace-level evaluation rules, found ${verified.evaluationRules}`,
    );
  }
  if (verified.traces < 1) {
    throw new SeedError("Readback mismatch: the trace row did not land");
  }
  if (verified.observations < observations.length) {
    throw new SeedError(
      `Readback mismatch: expected ${observations.length} observations, found ${verified.observations}`,
    );
  }
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "v4-migration-pending",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [traceId],
    sessionIds: [],
    counts: {
      evaluators: evalCount,
      evaluationRules: evalCount,
      traces: 1,
      observations: observations.length,
      events: events.length,
    },
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const v4MigrationPendingScenario: ScenarioDefinition = {
  name: "v4-migration-pending",
  description:
    "A project the v4 migration wizard still has work for: active trace-level evaluation rules (counted as affected evals) plus one recent trace. Puts the project into 'Action needed' so the sidebar item, the migration status row, and the side panel they open are reachable. Traffic-derived signals (SDK versions, deprecated APIs) are not seeded.",
  supportsV4: true,
  flags: [
    {
      flag: "evals",
      type: "number",
      default: 1,
      description: "active trace-level evaluation rules to create",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "mirror the trace/observations into v4 events_full (on by default so the trace renders on a v4 instance)",
    },
  ],
  run,
};
