import { readFileSync } from "fs";
import path from "path";
import { prisma } from "../../../src/db";
import {
  createObservation,
  createTrace,
  createTraceScore,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import {
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { jitter, utcDayStartMs } from "./rng";
import { escapeLike, tracesListLink } from "./verify";
import {
  greptimeCountRows,
  writeRecordsToGreptime,
} from "../utils/greptime-writer";

const SESSION_POOL_SIZE = 100;

/** Loads the bundled large fixtures used as rich payload bodies. */
const loadFileContent = () => {
  const utilsDir = path.join(__dirname, "../utils");
  const nestedJson = JSON.parse(
    readFileSync(path.join(utilsDir, "nested_json.json"), "utf-8"),
  );
  const chatMlJson = JSON.parse(
    readFileSync(path.join(utilsDir, "chat_ml_json.json"), "utf-8"),
  );
  return {
    heavyMarkdown: readFileSync(path.join(utilsDir, "markdown.txt"), "utf-8"),
    nestedJson: {
      ...nestedJson,
      products: nestedJson.products?.slice(0, 3) ?? [],
    },
    chatMlJson: {
      ...chatMlJson,
      messages: chatMlJson.messages?.slice(0, 4) ?? [],
    },
  };
};

type FileContent = ReturnType<typeof loadFileContent>;
type BulkPrompt = { id: string; name: string; version: number };

type BulkOpts = {
  count: number;
  observationsPerTrace: number;
  scoresPerTrace: number;
  anchorMs: number;
  spreadMs: number;
  suffix: string;
  fileContent?: FileContent;
  prompts: BulkPrompt[];
};

/**
 * Deterministic app-side replacement for the ClickHouse `INSERT ... SELECT FROM numbers()`
 * bulk generator (GreptimeDB has no `numbers()`). Produces one trace plus its observations and
 * scores from `jitter(seed, index)` so the same flags re-key identically. Ids match the readback
 * contract `{id-prefix}-{trace|obs|score}-bulk-...-{suffix}`.
 */
const buildBulkRecordsForTrace = (
  ctx: ScenarioContext,
  n: number,
  opts: BulkOpts,
): {
  trace: TraceRecordInsertType;
  observations: ObservationRecordInsertType[];
  scores: ScoreRecordInsertType[];
} => {
  const { anchorMs, spreadMs, suffix, fileContent, prompts } = opts;
  const h = (k: number): number => jitter(ctx.seed, n * 8 + k, 1_000_000);
  const h1 = h(0);
  const h2 = h(1);
  const ts = anchorMs - Math.floor((n * spreadMs) / Math.max(opts.count, 1));

  const trace = createTrace({
    id: `${ctx.idPrefix}-trace-bulk-${n}-${suffix}`,
    project_id: ctx.projectId,
    environment: ctx.environment,
    name: `trace-${n % 10}`,
    timestamp: ts,
    user_id: h1 % 10 < 3 ? `${ctx.idPrefix}-user_${h1 % 1000}` : null,
    session_id:
      h1 % 100 < 30
        ? `${ctx.idPrefix}-session_${h2 % SESSION_POOL_SIZE}`
        : null,
    release: null,
    version: null,
    public: h2 % 10 === 0,
    bookmarked: h2 % 20 === 1,
    tags: ["seed", "many-traces"],
    metadata: { scenario: "many-traces", source: "bulk" },
    input: fileContent
      ? JSON.stringify(fileContent.chatMlJson)
      : JSON.stringify({ q: `bulk trace ${n}` }),
    output: fileContent
      ? JSON.stringify(fileContent.nestedJson)
      : JSON.stringify({ a: `answer ${n}` }),
    created_at: anchorMs,
    updated_at: anchorMs,
    event_ts: anchorMs,
  });

  const observations = Array.from(
    { length: opts.observationsPerTrace },
    (_, j): ObservationRecordInsertType => {
      const oh = jitter(ctx.seed, n * 256 + j, 1_000_000);
      const isGeneration = j % 2 === 0;
      const usageInput = 50 + (oh % 2000);
      const usageOutput = 20 + (oh % 1000);
      const start = ts + j * 10;
      const prompt =
        isGeneration && prompts.length > 0 && oh % 10 < 1
          ? prompts[oh % prompts.length]
          : null;
      return createObservation({
        id: `${ctx.idPrefix}-obs-bulk-${n}-${j}-${suffix}`,
        trace_id: trace.id,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: isGeneration ? "GENERATION" : "SPAN",
        parent_observation_id: null,
        name: isGeneration ? "bulk-generation" : "bulk-span",
        start_time: start,
        end_time: start + 5 + (oh % 400),
        completion_start_time: isGeneration ? start + (oh % 100) : null,
        level: oh % 29 === 7 ? "ERROR" : "DEFAULT",
        status_message: null,
        version: null,
        input: null,
        output: null,
        metadata: { scenario: "many-traces" },
        provided_model_name: isGeneration ? "gpt-4o" : null,
        internal_model_id: null,
        model_parameters: "{}",
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
        prompt_id: prompt?.id ?? null,
        prompt_name: prompt?.name ?? null,
        prompt_version: prompt?.version ?? null,
        created_at: anchorMs,
        updated_at: anchorMs,
        event_ts: anchorMs,
      });
    },
  );

  const scores = Array.from(
    { length: opts.scoresPerTrace },
    (_, j): ScoreRecordInsertType => {
      const sh = jitter(ctx.seed, n * 128 + j, 1_000_000);
      return createTraceScore({
        id: `${ctx.idPrefix}-score-bulk-${n}-${j}-${suffix}`,
        project_id: ctx.projectId,
        trace_id: trace.id,
        environment: ctx.environment,
        name: j % 2 === 0 ? "quality" : "relevance",
        value: (sh % 100) / 100,
        data_type: "NUMERIC",
        source: "API",
        comment: null,
        metadata: {},
        timestamp: ts,
      });
    },
  );

  return { trace, observations, scores };
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const count = params["count"] as number;
  const days = params["days"] as number;
  const observationsPerTrace = params["observations-per-trace"] as number;
  const scoresPerTrace = params["scores-per-trace"] as number;
  const richPayloads = params["rich-payloads"] as boolean;

  if (count < 1) {
    throw new SeedError(
      `--count must be >= 1, got ${count}`,
      "pass a positive integer, e.g. --count 10000",
    );
  }
  if (observationsPerTrace < 0 || scoresPerTrace < 0) {
    throw new SeedError(
      `--observations-per-trace and --scores-per-trace must be >= 0, got ${observationsPerTrace} / ${scoresPerTrace}`,
      "pass 0 to seed traces without observations/scores, or a positive integer",
    );
  }
  if (days < 0) {
    throw new SeedError(
      `--days must be >= 0, got ${days}`,
      "negative windows would place traces in the future, hidden by UI time filters",
    );
  }

  const fileContent = richPayloads ? loadFileContent() : undefined;
  const counts: Record<string, number> = {
    sessions: SESSION_POOL_SIZE,
    traces: count,
    observations: count * observationsPerTrace,
    scores: count * scoresPerTrace,
  };
  const links = [tracesListLink(ctx)];

  if (ctx.dryRun) {
    return {
      scenario: "many-traces",
      target: "greptime",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [],
      sessionIds: Array.from(
        { length: 5 },
        (_, i) => `${ctx.idPrefix}-session_${i}`,
      ),
      counts,
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  // Ids are `{id-prefix}-trace-bulk-{n}-{projectId-suffix}`: re-runs with the
  // same prefix and count overwrite (merge-on-write projection), a different
  // --id-prefix adds an independent copy.
  ctx.log(
    `bulk-writing ${count} traces, ${counts.observations} observations, ${counts.scores} scores over ${days} day(s)`,
  );
  // Single anchor so observations/scores share the trace's UTC day; deterministic
  // timestamps spread over the window keep re-runs stable.
  const anchorMs = utcDayStartMs();
  const spreadMs = days * 86400 * 1000;
  const suffix = ctx.projectId.slice(-8);
  // Link ~10% of generations to REAL prompts — fabricated prompt ids would
  // silently break the trace-detail prompt badge. No prompts -> NULL columns.
  const prompts: BulkPrompt[] = await prisma.prompt.findMany({
    where: { projectId: ctx.projectId },
    select: { id: true, name: true, version: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  // The {id-prefix}-session_0..99 pool referenced on ~30% of traces; the session
  // detail page 404s without the Postgres trace_sessions rows.
  await prisma.traceSession.createMany({
    data: Array.from({ length: SESSION_POOL_SIZE }, (_, i) => ({
      id: `${ctx.idPrefix}-session_${i}`,
      projectId: ctx.projectId,
      environment: ctx.environment,
    })),
    skipDuplicates: true,
  });

  const opts = {
    count,
    observationsPerTrace,
    scoresPerTrace,
    anchorMs,
    spreadMs,
    suffix,
    fileContent,
    prompts,
  };
  // Generate + write in trace-batches so a 100k-trace run never holds every row in memory.
  const TRACE_BATCH = 500;
  for (let start = 0; start < count; start += TRACE_BATCH) {
    const end = Math.min(start + TRACE_BATCH, count);
    const traces: TraceRecordInsertType[] = [];
    const observations: ObservationRecordInsertType[] = [];
    const scores: ScoreRecordInsertType[] = [];
    for (let n = start; n < end; n++) {
      const records = buildBulkRecordsForTrace(ctx, n, opts);
      traces.push(records.trace);
      observations.push(...records.observations);
      scores.push(...records.scores);
    }
    await writeRecordsToGreptime({ traces, observations, scores });
  }

  const idSuffix = escapeLike(ctx.projectId.slice(-8));
  const verified: Record<string, number> = {
    traces: await greptimeCountRows(
      "traces",
      `project_id = :projectId AND id LIKE :prefix AND is_deleted = false`,
      {
        projectId: ctx.projectId,
        prefix: `${escapeLike(ctx.idPrefix)}-trace-bulk-%-${idSuffix}`,
      },
      "count(distinct id)",
    ),
    observations: await greptimeCountRows(
      "observations",
      `project_id = :projectId AND id LIKE :prefix AND is_deleted = false`,
      {
        projectId: ctx.projectId,
        prefix: `${escapeLike(ctx.idPrefix)}-obs-bulk-%-${idSuffix}`,
      },
      "count(distinct id)",
    ),
    scores: await greptimeCountRows(
      "scores",
      `project_id = :projectId AND id LIKE :prefix AND is_deleted = false`,
      {
        projectId: ctx.projectId,
        prefix: `${escapeLike(ctx.idPrefix)}-score-bulk-%-${idSuffix}`,
      },
      "count(distinct id)",
    ),
  };

  if (verified.traces < count) {
    throw new SeedError(
      `Readback mismatch: expected at least ${count} bulk traces, found ${verified.traces}`,
    );
  }
  if (verified.observations < counts.observations) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.observations} bulk observations, found ${verified.observations}`,
    );
  }
  if (verified.scores < counts.scores) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.scores} bulk scores, found ${verified.scores}`,
    );
  }

  return {
    scenario: "many-traces",
    target: "greptime",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: Array.from(
      { length: 5 },
      (_, i) => `${ctx.idPrefix}-session_${i}`,
    ),
    counts,
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const manyTracesScenario: ScenarioDefinition = {
  name: "many-traces",
  description:
    "Bulk traces/observations/scores for trace-list and filter performance work: deterministic app-side generation written to GreptimeDB in batches, deterministic ids so re-runs do not duplicate.",
  supportsV4: false,
  flags: [
    {
      flag: "count",
      type: "number",
      default: 10_000,
      description: "number of traces",
    },
    {
      flag: "days",
      type: "number",
      default: 3,
      description: "spread timestamps over the past N days",
    },
    {
      flag: "observations-per-trace",
      type: "number",
      default: 5,
      description: "observations per trace",
    },
    {
      flag: "scores-per-trace",
      type: "number",
      default: 2,
      description: "scores per trace",
    },
    {
      flag: "rich-payloads",
      type: "boolean",
      default: false,
      description: "embed bundled markdown/JSON fixtures as payloads",
    },
  ],
  run,
};
