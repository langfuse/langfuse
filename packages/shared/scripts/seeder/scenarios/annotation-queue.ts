import { prisma } from "../../../src/db";
import {
  createObservation,
  createObservationsCh,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
  createEventsCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows } from "./verify";

// ---------------------------------------------------------------------------
// Score-config catalog — one of every shape the annotation form can render, so
// the keyboard UX is exercised across all its branches:
//  - categorical, short labels (≤3)      → ToggleGroup  (1-3 badges, ←/→ roving)
//  - categorical, long labels / >3 opts  → Combobox     (1-9 pick, Enter opens)
//  - boolean                             → ToggleGroup True/False
//  - numeric, ranged (int)               → out-of-range complete-gate
//  - numeric, ranged (decimal)           → step="any" decimals
//  - numeric, unranged                   → free number entry
//  - text                                → textarea (Enter newline / Enter edit)
//  - archived categorical                → disabled / delete-only path
// A stale categorical *score* (value no longer in the config) is seeded on one
// edge item to exercise the disabled stale-chip path.
// ---------------------------------------------------------------------------
type Category = { label: string; value: number };
type ConfigDef = {
  key: string;
  name: string;
  dataType: "CATEGORICAL" | "NUMERIC" | "BOOLEAN" | "TEXT";
  categories?: Category[];
  minValue?: number;
  maxValue?: number;
  isArchived?: boolean;
  description?: string;
};

const CONFIG_DEFS: ConfigDef[] = [
  {
    key: "accuracy",
    name: "Accuracy",
    dataType: "CATEGORICAL",
    categories: [
      { label: "Fully Correct", value: 2 },
      { label: "Partially Correct", value: 1 },
      { label: "Incorrect", value: 0 },
    ],
    description: "Long labels → renders as a searchable dropdown (combobox).",
  },
  {
    key: "sentiment",
    name: "Sentiment",
    dataType: "CATEGORICAL",
    categories: [
      { label: "Pos", value: 1 },
      { label: "Neu", value: 0 },
      { label: "Neg", value: -1 },
    ],
    description: "Short labels (≤3) → renders as a toggle group.",
  },
  {
    key: "quality",
    name: "Quality",
    dataType: "CATEGORICAL",
    categories: [
      { label: "Excellent", value: 5 },
      { label: "Good", value: 4 },
      { label: "Fair", value: 3 },
      { label: "Poor", value: 2 },
      { label: "Unusable", value: 1 },
    ],
    description: "5 options → combobox; exercises 1-9 on a long option list.",
  },
  {
    key: "toxicity",
    name: "Toxicity",
    dataType: "BOOLEAN",
    categories: [
      { label: "True", value: 1 },
      { label: "False", value: 0 },
    ],
  },
  {
    key: "helpfulness",
    name: "Helpfulness (1-5)",
    dataType: "NUMERIC",
    minValue: 1,
    maxValue: 5,
    description: "Ranged integer → out-of-range completion gate.",
  },
  {
    key: "confidence",
    name: "Confidence (0-1)",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 1,
    description: "Decimal range → step=any (e.g. 0.7 must stay valid).",
  },
  {
    key: "tokens",
    name: "Token estimate",
    dataType: "NUMERIC",
    description: "Unranged numeric → free entry, no validity gate.",
  },
  {
    key: "feedback",
    name: "Feedback",
    dataType: "TEXT",
    description: "Free-form text → Enter inserts a newline, not submit.",
  },
  {
    key: "legacy",
    name: "Legacy rating",
    dataType: "CATEGORICAL",
    isArchived: true,
    categories: [
      { label: "Yes", value: 1 },
      { label: "No", value: 0 },
    ],
    description: "Archived config → disabled, delete-only.",
  },
];

// Configs surfaced on the "core types" queue — every render path, nothing
// archived, kept small enough to process fast keyboard-first.
const CORE_KEYS = [
  "accuracy",
  "sentiment",
  "toxicity",
  "helpfulness",
  "confidence",
  "feedback",
];

const TRACE_NAMES = [
  "rag-answer",
  "summarize-doc",
  "classify-intent",
  "qa-eval-run",
  "extract-entities",
  "draft-reply",
] as const;

const QUESTIONS = [
  "What is Langfuse used for?",
  "Summarize the attached release notes.",
  "Is this support ticket urgent?",
  "Translate the message to German.",
  "Extract the action items from the call.",
] as const;

const ANSWERS = [
  "Langfuse is an open-source LLM engineering platform.",
  "The release adds keyboard-first annotation and bug fixes.",
  "Yes — the customer reports a production outage.",
  "Der Build schlug fehl; bitte erneut versuchen.",
  "1) Send the report 2) Schedule a follow-up call.",
] as const;

const annotationQueueLink = (ctx: ScenarioContext, queueId: string): string =>
  `${ctx.baseUrl}/project/${ctx.projectId}/annotation-queues/${encodeURIComponent(queueId)}/items`;

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const coreItems = Math.max(1, Number(params["core-items"] ?? 12));
  const withV4 = params.v4 !== false; // default true — local dev renders v4 events
  const pfx = ctx.idPrefix && ctx.idPrefix.length > 0 ? ctx.idPrefix : "annoqa";

  // Deterministic time window (6h before today's UTC midnight); jitter() adds
  // stateless per-row variation so re-runs overwrite in place.
  const windowMs = 6 * 60 * 60 * 1000;
  const endMs = utcDayStartMs();
  const startMs = endMs - windowMs;

  // Desired ids for fresh creation; reassigned to the actual row id after the
  // upserts (the queues are keyed by name, so a row created under a different
  // --id-prefix is reused — items must reference its real id, not ours).
  let coreQueueId = `${pfx}-q-core`;
  let edgeQueueId = `${pfx}-q-edge`;

  if (ctx.dryRun) {
    return {
      scenario: "annotation-queue",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [`${pfx}-core-t0`],
      sessionIds: [`${pfx}-edge-session`],
      counts: {
        // Mirror the real-run counts: 8 edge items (partial1/2, stale, 2 obs,
        // session, missing, done), of which 8 have traces (missing has none),
        // 2 carry observations, and 9 pre-existing scores (2+3+1+3) are seeded.
        scoreConfigs: CONFIG_DEFS.length,
        queues: 2,
        items: coreItems + 8,
        traces: coreItems + 8,
        observations: 2,
        scores: 9,
        events: withV4 ? coreItems + 10 : 0,
      },
      verified: {},
      links: [
        annotationQueueLink(ctx, coreQueueId),
        annotationQueueLink(ctx, edgeQueueId),
      ],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  // --- 1. Score configs (Postgres) ----------------------------------------
  const configId: Record<string, string> = {};
  for (const def of CONFIG_DEFS) {
    const id = `${pfx}-cfg-${def.key}`;
    configId[def.key] = id;
    const base = {
      name: def.name,
      dataType: def.dataType,
      isArchived: def.isArchived ?? false,
      description: def.description ?? null,
      minValue: def.minValue ?? null,
      maxValue: def.maxValue ?? null,
      ...(def.categories ? { categories: def.categories } : {}),
    };
    await prisma.scoreConfig.upsert({
      where: { id },
      update: base,
      create: { id, projectId: ctx.projectId, ...base },
    });
  }

  // --- 2. Queues (Postgres) -----------------------------------------------
  const coreConfigIds = CORE_KEYS.map((k) => configId[k]);
  const edgeConfigIds = CONFIG_DEFS.map((d) => configId[d.key]);

  const coreQueue = await prisma.annotationQueue.upsert({
    where: {
      projectId_name: {
        projectId: ctx.projectId,
        name: "Keyboard QA · core types",
      },
    },
    update: {
      description: "Every score-field type, fresh items — fast keyboard run.",
      scoreConfigIds: coreConfigIds,
    },
    create: {
      id: coreQueueId,
      projectId: ctx.projectId,
      name: "Keyboard QA · core types",
      description: "Every score-field type, fresh items — fast keyboard run.",
      scoreConfigIds: coreConfigIds,
    },
  });
  coreQueueId = coreQueue.id;
  const edgeQueue = await prisma.annotationQueue.upsert({
    where: {
      projectId_name: {
        projectId: ctx.projectId,
        name: "Keyboard QA · edge cases",
      },
    },
    update: {
      description:
        "Many fields + partial/stale/archived scores, observation/session/deleted/completed items.",
      scoreConfigIds: edgeConfigIds,
    },
    create: {
      id: edgeQueueId,
      projectId: ctx.projectId,
      name: "Keyboard QA · edge cases",
      description:
        "Many fields + partial/stale/archived scores, observation/session/deleted/completed items.",
      scoreConfigIds: edgeConfigIds,
    },
  });
  edgeQueueId = edgeQueue.id;

  // --- 3. ClickHouse rows + queue items -----------------------------------
  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];
  const events: EventRecordInsertType[] = [];

  // Spread all traces (core + the 8 edge traces) across the window; derive the
  // step from the real total so timestamps never spill past the UTC-day anchor
  // (the seeder contract), even with a large --core-items.
  const totalTraces = coreItems + 8;
  const stepMs = windowMs / totalTraces;
  let traceIndex = 0;
  const newTrace = (id: string, opts?: { sessionId?: string }) => {
    const timestamp =
      startMs +
      Math.floor(traceIndex * stepMs) +
      jitter(ctx.seed, traceIndex, 1000);
    traceIndex += 1;
    const i = traceIndex;
    const trace = createTrace({
      id,
      project_id: ctx.projectId,
      environment: ctx.environment,
      session_id: opts?.sessionId ?? null,
      timestamp,
      name: TRACE_NAMES[i % TRACE_NAMES.length],
      user_id: `user-${pfx}-${i % 6}`,
      tags: ["seed", "annotation-queue"],
      metadata: { scenario: "annotation-queue" },
      input: JSON.stringify({ question: QUESTIONS[i % QUESTIONS.length] }),
      output: ANSWERS[i % ANSWERS.length],
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    traces.push(trace);
    if (withV4) events.push(traceToEvent(trace));
    return { trace, timestamp };
  };
  const newObservation = (
    traceId: string,
    obsId: string,
    timestamp: number,
  ) => {
    const observation = createObservation({
      id: obsId,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "GENERATION",
      name: "answer-generation",
      start_time: timestamp,
      end_time: timestamp + 1500,
      input: JSON.stringify({ prompt: "Answer the question." }),
      output: ANSWERS[traceIndex % ANSWERS.length],
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });
    observations.push(observation);
    const parent = traces.find((t) => t.id === traceId);
    if (withV4 && parent) events.push(observationToEvent(observation, parent));
    return observation;
  };

  // Pre-existing ANNOTATION score helper (so an item shows as partly annotated).
  const annScore = (args: {
    traceId: string;
    observationId?: string | null;
    timestamp: number;
    key: string;
    value: number;
    stringValue?: string | null;
    comment?: string | null;
    queueId: string;
  }) => {
    const def = CONFIG_DEFS.find((d) => d.key === args.key);
    if (!def) return;
    scores.push(
      createTraceScore({
        id: `${args.traceId}-ann-${args.key}`,
        project_id: ctx.projectId,
        trace_id: args.traceId,
        observation_id: args.observationId ?? null,
        environment: ctx.environment,
        name: def.name,
        value: args.value,
        string_value: args.stringValue ?? null,
        data_type: def.dataType,
        source: "ANNOTATION",
        config_id: configId[args.key],
        queue_id: args.queueId,
        comment: args.comment ?? null,
        metadata: {},
        timestamp: args.timestamp,
      }),
    );
  };

  const items: Array<{
    id: string;
    queueId: string;
    objectId: string;
    objectType: "TRACE" | "OBSERVATION" | "SESSION";
    status: "PENDING" | "COMPLETED";
    completedAt?: Date | null;
    order: number;
  }> = [];
  let order = 0;
  const pushItem = (
    id: string,
    queueId: string,
    objectId: string,
    objectType: "TRACE" | "OBSERVATION" | "SESSION",
    status: "PENDING" | "COMPLETED" = "PENDING",
    completedAt: Date | null = null,
  ) => {
    items.push({
      id,
      queueId,
      objectId,
      objectType,
      status,
      completedAt,
      order: order++,
    });
  };

  // 3a. Core queue — fresh trace items.
  for (let i = 0; i < coreItems; i++) {
    const traceId = `${pfx}-core-t${i}`;
    newTrace(traceId);
    pushItem(`${pfx}-core-i${i}`, coreQueueId, traceId, "TRACE");
  }

  // 3b. Edge queue — varied, complex items.
  // (i) Two partly-annotated traces (filled comment icon, re-annotation).
  {
    const { timestamp } = newTrace(`${pfx}-edge-partial1`);
    annScore({
      traceId: `${pfx}-edge-partial1`,
      timestamp,
      key: "accuracy",
      value: 1,
      stringValue: "Partially Correct",
      comment: "Missed the second half of the answer.",
      queueId: edgeQueueId,
    });
    annScore({
      traceId: `${pfx}-edge-partial1`,
      timestamp,
      key: "toxicity",
      value: 0,
      stringValue: "False",
      queueId: edgeQueueId,
    });
    pushItem(
      `${pfx}-edge-i-partial1`,
      edgeQueueId,
      `${pfx}-edge-partial1`,
      "TRACE",
    );
  }
  {
    const { timestamp } = newTrace(`${pfx}-edge-partial2`);
    annScore({
      traceId: `${pfx}-edge-partial2`,
      timestamp,
      key: "helpfulness",
      value: 4,
      queueId: edgeQueueId,
    });
    annScore({
      traceId: `${pfx}-edge-partial2`,
      timestamp,
      key: "confidence",
      value: 0.8,
      queueId: edgeQueueId,
    });
    annScore({
      traceId: `${pfx}-edge-partial2`,
      timestamp,
      key: "sentiment",
      value: 1,
      stringValue: "Pos",
      queueId: edgeQueueId,
    });
    pushItem(
      `${pfx}-edge-i-partial2`,
      edgeQueueId,
      `${pfx}-edge-partial2`,
      "TRACE",
    );
  }
  // (ii) Stale categorical value — score string no longer in the config.
  {
    const { timestamp } = newTrace(`${pfx}-edge-stale`);
    annScore({
      traceId: `${pfx}-edge-stale`,
      timestamp,
      key: "accuracy",
      value: 99,
      stringValue: "Needs Review (v1)",
      comment: "Imported from an older rubric.",
      queueId: edgeQueueId,
    });
    pushItem(`${pfx}-edge-i-stale`, edgeQueueId, `${pfx}-edge-stale`, "TRACE");
  }
  // (iii) Observation items (annotate an observation, not the whole trace).
  for (let i = 0; i < 2; i++) {
    const traceId = `${pfx}-edge-obsT${i}`;
    const obsId = `${traceId}-o0`;
    const { timestamp } = newTrace(traceId);
    newObservation(traceId, obsId, timestamp);
    pushItem(`${pfx}-edge-i-obs${i}`, edgeQueueId, obsId, "OBSERVATION");
  }
  // (iv) Session item (trace_sessions row + traces sharing the session).
  const sessionId = `${pfx}-edge-session`;
  {
    newTrace(`${pfx}-edge-sessT0`, { sessionId });
    newTrace(`${pfx}-edge-sessT1`, { sessionId });
    await prisma.traceSession.upsert({
      where: { id_projectId: { id: sessionId, projectId: ctx.projectId } },
      update: {},
      create: {
        id: sessionId,
        projectId: ctx.projectId,
        environment: ctx.environment,
        createdAt: new Date(startMs),
      },
    });
    pushItem(`${pfx}-edge-i-session`, edgeQueueId, sessionId, "SESSION");
  }
  // (v) Deleted/missing object — no trace created → ObjectNotFound card.
  pushItem(
    `${pfx}-edge-i-missing`,
    edgeQueueId,
    `${pfx}-edge-missing-trace`,
    "TRACE",
  );
  // (vi) An already-completed item, fully scored.
  {
    const { timestamp } = newTrace(`${pfx}-edge-done`);
    annScore({
      traceId: `${pfx}-edge-done`,
      timestamp,
      key: "accuracy",
      value: 2,
      stringValue: "Fully Correct",
      queueId: edgeQueueId,
    });
    annScore({
      traceId: `${pfx}-edge-done`,
      timestamp,
      key: "toxicity",
      value: 0,
      stringValue: "False",
      queueId: edgeQueueId,
    });
    annScore({
      traceId: `${pfx}-edge-done`,
      timestamp,
      key: "helpfulness",
      value: 5,
      queueId: edgeQueueId,
    });
    pushItem(
      `${pfx}-edge-i-done`,
      edgeQueueId,
      `${pfx}-edge-done`,
      "TRACE",
      "COMPLETED",
      new Date(startMs),
    );
  }

  // --- 4. Persist queue items (Postgres) ----------------------------------
  for (const it of items) {
    const data = {
      queueId: it.queueId,
      projectId: ctx.projectId,
      objectId: it.objectId,
      objectType: it.objectType,
      status: it.status,
      completedAt: it.completedAt ?? null,
      createdAt: new Date(startMs + it.order * 1000),
    };
    await prisma.annotationQueueItem.upsert({
      where: { id: it.id },
      update: data,
      create: { id: it.id, ...data },
    });
  }

  // --- 5. Persist ClickHouse rows -----------------------------------------
  ctx.log(
    `writing ${CONFIG_DEFS.length} score configs, 2 queues, ${items.length} items, ${traces.length} traces, ${observations.length} observations, ${scores.length} scores${withV4 ? `, ${events.length} events` : ""}`,
  );
  for (const batch of chunk(traces, 1000)) await createTracesCh(batch);
  for (const batch of chunk(observations, 1000))
    await createObservationsCh(batch);
  for (const batch of chunk(scores, 1000)) await createScoresCh(batch);
  for (const batch of chunk(events, 500)) await createEventsCh(batch);

  // --- 6. Readback verification -------------------------------------------
  const traceIds = traces.map((t) => t.id);
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
    scores: await countRows(
      "scores",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
  };
  const pgItems = await prisma.annotationQueueItem.count({
    where: {
      projectId: ctx.projectId,
      queueId: { in: [coreQueueId, edgeQueueId] },
    },
  });
  verified.queueItems = pgItems;

  if (verified.traces < traces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${traces.length} traces, found ${verified.traces}`,
    );
  }
  if (verified.scores < scores.length) {
    throw new SeedError(
      `Readback mismatch: expected ${scores.length} scores, found ${verified.scores}`,
    );
  }
  if (verified.queueItems < items.length) {
    throw new SeedError(
      `Readback mismatch: expected ${items.length} queue items, found ${verified.queueItems}`,
    );
  }

  return {
    scenario: "annotation-queue",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traceIds.slice(0, 5),
    sessionIds: [sessionId],
    counts: {
      scoreConfigs: CONFIG_DEFS.length,
      queues: 2,
      items: items.length,
      traces: traces.length,
      observations: observations.length,
      scores: scores.length,
      events: events.length,
    },
    verified,
    links: [
      annotationQueueLink(ctx, coreQueueId),
      annotationQueueLink(ctx, edgeQueueId),
    ],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const annotationQueueScenario: ScenarioDefinition = {
  name: "annotation-queue",
  description:
    "Two human-annotation queues for testing the annotate UI keyboard-first: a 'core types' queue with one of every score-field render path (categorical toggle/combobox, boolean, ranged/decimal/unranged numeric, text) over fresh trace items, and an 'edge cases' queue adding archived/stale/partial scores, comments, and observation/session/deleted/completed items.",
  supportsV4: true,
  flags: [
    {
      flag: "core-items",
      type: "number",
      default: 12,
      description: "number of fresh trace items on the core-types queue",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "mirror traces/observations into v4 events_full (on by default so they render on a v4 local dev instance)",
    },
  ],
  run,
};
