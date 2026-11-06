import {
  createTrace,
  createTraceScore,
  createTracesCh,
  createScoresCh,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, escapeLike, traceLink } from "./verify";

/**
 * Numeric score shapes for the distribution chart.
 * Bounds are the observed min/max, so each series is placed on those edges
 * and one interior point per middle bin. Bin 0..9 get 1..10 copies so bar
 * heights differ without changing the range.
 */
const BINS = 10;
const SERIES = [
  { key: "wide", name: "dist-wide", min: 0, max: 1 },
  { key: "narrow", name: "dist-narrow", min: 0.91, max: 0.94 },
  { key: "negative", name: "dist-negative", min: -1, max: 0 },
  { key: "near-zero", name: "dist-near-zero", min: 0, max: 0.04 },
  { key: "signed-span", name: "dist-signed-span", min: -0.2, max: 0.2 },
] as const;

const TRACE_COUNT = (BINS * (BINS + 1)) / 2;

const binOfCopy = (copy: number): number => {
  let cursor = copy;
  for (let bin = 0; bin < BINS; bin++) {
    const copies = bin + 1;
    if (cursor < copies) return bin;
    cursor -= copies;
  }
  return BINS - 1;
};

const valueFor = (min: number, max: number, bin: number): number => {
  if (bin <= 0) return min;
  if (bin >= BINS - 1) return max;
  const width = (max - min + 0.0001) / BINS;
  return min + (bin + 0.5) * width;
};

const analyticsLink = (
  ctx: ScenarioContext,
  scoreName: string,
  score2Name?: string,
): string => {
  const params = new URLSearchParams({
    score1: `${scoreName}-NUMERIC-API`,
  });
  if (score2Name) params.set("score2", `${score2Name}-NUMERIC-API`);
  return `${ctx.baseUrl}/project/${ctx.projectId}/scores/analytics?${params.toString()}`;
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const dayStart = utcDayStartMs();
  const traceIds = Array.from(
    { length: TRACE_COUNT },
    (_, index) => `${ctx.idPrefix}-t${String(index).padStart(2, "0")}`,
  );

  if (ctx.dryRun) {
    return {
      scenario: "score-distributions",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds,
      sessionIds: [],
      counts: {
        traces: TRACE_COUNT,
        scores: TRACE_COUNT * SERIES.length,
      },
      verified: {},
      links: [
        analyticsLink(ctx, "dist-wide"),
        analyticsLink(ctx, "dist-narrow"),
        analyticsLink(ctx, "dist-negative"),
        analyticsLink(ctx, "dist-near-zero"),
        analyticsLink(ctx, "dist-signed-span"),
        analyticsLink(ctx, "dist-wide", "dist-narrow"),
      ],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const traces: TraceRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];

  traceIds.forEach((traceId, index) => {
    const bin = binOfCopy(index);
    const timestamp =
      dayStart + (index + 1) * 60_000 + jitter(ctx.seed, index, 1000);
    traces.push(
      createTrace({
        id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        session_id: null,
        timestamp,
        name: "seed-score-distribution",
        user_id: `user-${ctx.idPrefix}`,
        tags: ["seed", "score-distributions"],
        metadata: { scenario: "score-distributions", bin: String(bin) },
        input: JSON.stringify({ bin }),
        output: "seeded",
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      }),
    );

    for (const series of SERIES) {
      scores.push(
        createTraceScore({
          id: `${traceId}-${series.key}`,
          project_id: ctx.projectId,
          trace_id: traceId,
          observation_id: null,
          environment: ctx.environment,
          name: series.name,
          value: valueFor(series.min, series.max, bin),
          data_type: "NUMERIC",
          source: "API",
          comment: null,
          metadata: { bin: String(bin) },
          timestamp,
        }),
      );
    }
  });

  ctx.log(
    `writing ${traces.length} traces and ${scores.length} numeric scores`,
  );
  for (const batch of chunk(traces, 500)) await createTracesCh(batch);
  for (const batch of chunk(scores, 1000)) await createScoresCh(batch);

  const prefix = `${escapeLike(ctx.idPrefix)}-%`;
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id LIKE {prefix: String}`,
      { projectId: ctx.projectId, prefix },
      "uniqExact(id)",
    ),
    scores: await countRows(
      "scores",
      `project_id = {projectId: String} AND id LIKE {prefix: String}`,
      { projectId: ctx.projectId, prefix },
      "uniqExact(id)",
    ),
  };

  if (verified.traces < traces.length || verified.scores < scores.length) {
    throw new SeedError(
      `Readback mismatch: expected ${traces.length} traces and ${scores.length} scores, found ${verified.traces} traces and ${verified.scores} scores`,
    );
  }

  const firstTimestamp = dayStart + 60_000;
  return {
    scenario: "score-distributions",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds,
    sessionIds: [],
    counts: { traces: traces.length, scores: scores.length },
    verified,
    links: [
      traceLink(ctx, traceIds[0] ?? "", firstTimestamp),
      analyticsLink(ctx, "dist-wide"),
      analyticsLink(ctx, "dist-narrow"),
      analyticsLink(ctx, "dist-negative"),
      analyticsLink(ctx, "dist-near-zero"),
      analyticsLink(ctx, "dist-signed-span"),
      analyticsLink(ctx, "dist-wide", "dist-narrow"),
    ],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const scoreDistributionsScenario: ScenarioDefinition = {
  name: "score-distributions",
  description:
    "Synthetic numeric scores for the distribution chart: a 0–1 spread, a 0.91–0.94 cluster, a negative range, a near-zero cluster, and a span across zero. Each series shares the same traces so two can be compared. Prints Scores analytics links.",
  supportsV4: false,
  flags: [],
  run,
};
