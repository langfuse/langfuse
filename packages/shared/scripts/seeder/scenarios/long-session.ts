import { prisma } from "../../../src/db";
import {
  createTrace,
  createObservation,
  createTraceScore,
  createSessionScore,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  createEventsCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { buildPayload, PayloadStyle } from "./payload";
import { jitter, Rng, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, sessionLink, traceLink } from "./verify";

const TRACE_NAMES = [
  "answer-support-question",
  "summarize-thread",
  "classify-intent",
  "draft-reply",
  "lookup-order",
  "escalate-to-human",
];

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const traceCount = params["traces"] as number;
  const observationsPerTrace = params["observations-per-trace"] as number;
  const payloadBytes = params["payload-bytes"] as number;
  const windowMinutes = params["minutes"] as number;
  const withV4 = params["v4"] as boolean;
  const sessionId =
    (params["session-id"] as string) || `${ctx.idPrefix}-session`;

  if (traceCount < 1) {
    throw new SeedError(
      `--traces must be >= 1, got ${traceCount}`,
      "pass a positive integer, e.g. --traces 120",
    );
  }
  if (observationsPerTrace < 0) {
    throw new SeedError(
      `--observations-per-trace must be >= 0, got ${observationsPerTrace}`,
      "pass 0 for traces without observations, or a positive integer",
    );
  }
  if (windowMinutes < 1) {
    throw new SeedError(
      `--minutes must be >= 1, got ${windowMinutes}`,
      "negative windows would place traces in the future, hidden by UI time filters",
    );
  }
  if (payloadBytes < 0 || payloadBytes > 50_000_000) {
    throw new SeedError(
      `--payload-bytes must be between 0 and 50000000 (50 MB), got ${payloadBytes}`,
      "larger payloads exceed V8 string limits during generation",
    );
  }

  if (ctx.dryRun) {
    // counts are derivable from the flags — skip payload/array generation
    const firstTraceTimestamp =
      utcDayStartMs() - windowMinutes * 60 * 1000 + jitter(ctx.seed, 0, 500);
    return {
      scenario: "long-session",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: Array.from(
        { length: Math.min(traceCount, 5) },
        (_, i) => `${ctx.idPrefix}-t${i}`,
      ),
      sessionIds: [sessionId],
      counts: {
        sessions: 1,
        traces: traceCount,
        observations: traceCount * observationsPerTrace,
        scores: Math.ceil(traceCount / 3) + Math.ceil(traceCount / 5) + 1,
        events: withV4 ? traceCount + traceCount * observationsPerTrace : 0,
      },
      verified: {},
      links: [
        sessionLink(ctx, sessionId),
        traceLink(ctx, `${ctx.idPrefix}-t0`, firstTraceTimestamp),
      ],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const rng = new Rng(ctx.seed);
  const sessionStart = utcDayStartMs() - windowMinutes * 60 * 1000;
  const stepMs = (windowMinutes * 60 * 1000) / Math.max(traceCount, 1);
  const users = Array.from(
    { length: 8 },
    (_, i) => `user-${ctx.idPrefix}-${i}`,
  );

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];

  for (let t = 0; t < traceCount; t++) {
    const traceId = `${ctx.idPrefix}-t${t}`;
    // jitter() not rng: these timestamps land in ClickHouse ORDER BY keys
    // (events_full start_time); stream-position randomness would re-key rows
    // when unrelated flags change between re-runs with the same id prefix.
    const timestamp =
      sessionStart + Math.floor(t * stepMs) + jitter(ctx.seed, t, 500);
    const isHuge = t > 0 && t % 17 === 0;
    const style: PayloadStyle =
      t % 7 === 3 ? "unicode" : rng.bool(0.6) ? "json" : "text";
    const name =
      t % 9 === 4
        ? `${rng.pick(TRACE_NAMES)}-with-a-very-long-descriptive-name-${"y".repeat(120)}`
        : t % 7 === 3
          ? `多言語サポート ${rng.pick(TRACE_NAMES)}`
          : rng.pick(TRACE_NAMES);

    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      session_id: sessionId,
      timestamp,
      name,
      user_id: rng.pick(users),
      // release !== version on some traces (a v4 regression shape)
      release: "v1.2.3",
      version: t % 11 === 5 ? "v1.2.4" : "v1.2.3",
      tags: ["seed", "long-session"],
      public: false,
      bookmarked: false,
      metadata: {
        scenario: "long-session",
        turn: String(t),
      },
      input: buildPayload(
        style,
        isHuge ? 100_000 : rng.int(Math.min(300, payloadBytes), payloadBytes),
        rng,
      ),
      output: buildPayload(
        style,
        rng.int(Math.min(200, payloadBytes), payloadBytes),
        rng,
      ),
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    traces.push(trace);

    const rootObservationIndex = observations.length;
    let maxChildEndTime = 0;
    for (let o = 0; o < observationsPerTrace; o++) {
      const observationId = `${traceId}-o${o}`;
      const isRoot = o === 0;
      // jitter() not rng for isGeneration/type: observation `type` is the
      // 2nd v3 observations ORDER BY column, and stream-position randomness
      // (shifted by --payload-bytes) would re-key rows on re-run.
      const isGeneration =
        o === 1 || (o > 1 && jitter(ctx.seed, t * 311 + o, 9) < 3);
      const startTime =
        timestamp + o * 350 + jitter(ctx.seed, t * 131 + o, 100);
      const endTime =
        startTime + (isGeneration ? rng.int(700, 3500) : rng.int(10, 300));
      if (!isRoot) maxChildEndTime = Math.max(maxChildEndTime, endTime);
      const hasError = t % 13 === 6 && isGeneration;
      const usageInput = rng.int(100, 4000);
      const usageOutput = rng.int(50, 2000);

      observations.push(
        createObservation({
          id: observationId,
          trace_id: traceId,
          project_id: ctx.projectId,
          environment: ctx.environment,
          type: isRoot
            ? "AGENT"
            : isGeneration
              ? "GENERATION"
              : (["TOOL", "SPAN", "EVENT"] as const)[
                  jitter(ctx.seed, t * 977 + o, 2)
                ],
          parent_observation_id: isRoot ? null : `${traceId}-o0`,
          name: isRoot
            ? "session-turn"
            : isGeneration
              ? "gpt-4o-completion"
              : rng.pick(["fetch-context", "log-event", "format-reply"]),
          start_time: startTime,
          end_time: endTime,
          completion_start_time: isGeneration
            ? startTime + rng.int(90, 350)
            : null,
          level: hasError ? "ERROR" : "DEFAULT",
          status_message: hasError ? "Model timeout, retried once" : null,
          version: null,
          input: isGeneration
            ? JSON.stringify({
                messages: [
                  {
                    role: "user",
                    content: buildPayload("text", rng.int(100, 800), rng),
                  },
                ],
              })
            : null,
          output: isGeneration
            ? buildPayload("text", rng.int(100, 600), rng)
            : null,
          metadata: { scenario: "long-session", turn: String(t) },
          provided_model_name: isGeneration ? "gpt-4o" : null,
          internal_model_id: null,
          model_parameters: isGeneration
            ? JSON.stringify({ temperature: 0.7 })
            : "{}",
          provided_usage_details: isGeneration
            ? {
                input: usageInput,
                output: usageOutput,
                total: usageInput + usageOutput,
              }
            : {},
          usage_details: isGeneration
            ? {
                input: usageInput,
                output: usageOutput,
                total: usageInput + usageOutput,
              }
            : {},
          provided_cost_details: isGeneration
            ? { input: usageInput * 2e-6, output: usageOutput * 6e-6 }
            : {},
          cost_details: isGeneration
            ? {
                input: usageInput * 2e-6,
                output: usageOutput * 6e-6,
                total: usageInput * 2e-6 + usageOutput * 6e-6,
              }
            : {},
          total_cost: isGeneration
            ? usageInput * 2e-6 + usageOutput * 6e-6
            : null,
          prompt_id: null,
          prompt_name: null,
          prompt_version: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          event_ts: Date.now(),
        }),
      );
    }

    // The root "session-turn" span must cover its children, otherwise the
    // waterfall shows children running after their parent already ended.
    if (observationsPerTrace > 1) {
      observations[rootObservationIndex].end_time = maxChildEndTime + 25;
    }

    if (t % 3 === 0) {
      scores.push(
        createTraceScore({
          id: `${traceId}-score-helpfulness`,
          project_id: ctx.projectId,
          trace_id: traceId,
          environment: ctx.environment,
          name: "helpfulness",
          value: Math.round(rng.next() * 100) / 100,
          data_type: "NUMERIC",
          source: "API",
          timestamp,
        }),
      );
    }
    if (t % 5 === 0) {
      scores.push(
        createTraceScore({
          id: `${traceId}-score-intent`,
          project_id: ctx.projectId,
          trace_id: traceId,
          environment: ctx.environment,
          name: "intent",
          value: 1,
          string_value: rng.pick(["billing", "refund", "technical", "other"]),
          data_type: "CATEGORICAL",
          source: "API",
          timestamp,
        }),
      );
    }
  }

  scores.push(
    createSessionScore({
      id: `${ctx.idPrefix}-session-quality`,
      project_id: ctx.projectId,
      session_id: sessionId,
      environment: ctx.environment,
      name: "session-quality",
      value: Math.round(rng.next() * 100) / 100,
      data_type: "NUMERIC",
      source: "API",
      timestamp: sessionStart,
    }),
  );

  if (withV4) {
    const tracesById = new Map(traces.map((tr) => [tr.id, tr]));
    for (const trace of traces) {
      events.push(traceToEvent(trace));
    }
    for (const obs of observations) {
      const trace = obs.trace_id ? tracesById.get(obs.trace_id) : undefined;
      if (trace) events.push(observationToEvent(obs, trace));
    }
  }

  const counts: Record<string, number> = {
    sessions: 1,
    traces: traces.length,
    observations: observations.length,
    scores: scores.length,
    events: events.length,
  };

  const links = [
    sessionLink(ctx, sessionId),
    traceLink(ctx, traces[0].id, traces[0].timestamp as number),
  ];

  // The session detail page 404s without the Postgres trace_sessions row.
  await prisma.traceSession.upsert({
    where: { id_projectId: { id: sessionId, projectId: ctx.projectId } },
    update: {},
    create: {
      id: sessionId,
      projectId: ctx.projectId,
      environment: ctx.environment,
      createdAt: new Date(sessionStart),
    },
  });

  ctx.log(
    `writing 1 session, ${traces.length} traces, ${observations.length} observations, ${scores.length} scores${withV4 ? `, ${events.length} events` : ""}`,
  );
  for (const batch of chunk(traces, 1000)) {
    await createTracesCh(batch);
  }
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  await createScoresCh(scores);
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  // uniqExact(id): count() would see pre-merge ReplacingMergeTree duplicates
  // after re-runs with the same id prefix.
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND session_id = {sessionId: String}`,
      { projectId: ctx.projectId, sessionId },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds: traces.map((tr) => tr.id) },
      "uniqExact(id)",
    ),
    scores: await countRows(
      "scores",
      `project_id = {projectId: String} AND (trace_id IN {traceIds: Array(String)} OR session_id = {sessionId: String})`,
      {
        projectId: ctx.projectId,
        traceIds: traces.map((tr) => tr.id),
        sessionId,
      },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND session_id = {sessionId: String}`,
      { projectId: ctx.projectId, sessionId },
      "uniqExact(span_id)",
    );
  }

  if (verified.traces < traces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${traces.length} session traces, found ${verified.traces}`,
    );
  }
  if (verified.observations < observations.length) {
    throw new SeedError(
      `Readback mismatch: expected ${observations.length} observations, found ${verified.observations}`,
    );
  }
  if (verified.scores < scores.length) {
    throw new SeedError(
      `Readback mismatch: expected ${scores.length} scores, found ${verified.scores}`,
    );
  }
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "long-session",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traces.slice(0, 5).map((t) => t.id),
    sessionIds: [sessionId],
    counts,
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const longSessionScenario: ScenarioDefinition = {
  name: "long-session",
  description:
    "One session with many traces for session-detail and virtualization work: mixed payload sizes (incl. 100KB outliers), long and unicode trace names, generation usage/cost, trace + session scores. Creates the required Postgres trace_sessions row.",
  supportsV4: true,
  flags: [
    {
      flag: "traces",
      type: "number",
      default: 120,
      description: "traces in the session",
    },
    {
      flag: "observations-per-trace",
      type: "number",
      default: 6,
      description: "observations per trace",
    },
    {
      flag: "payload-bytes",
      type: "number",
      default: 2_000,
      description:
        "approx max bytes for regular trace payloads (generation granularity is ~one paragraph/object, so very small values overshoot)",
    },
    {
      flag: "minutes",
      type: "number",
      default: 180,
      description: "session time window ending at UTC midnight of today",
    },
    {
      flag: "session-id",
      type: "string",
      default: "",
      description: "override the generated session id",
    },
    {
      flag: "v4",
      type: "boolean",
      default: false,
      description: "also mirror traces into v4 events tables",
    },
  ],
  run,
};
