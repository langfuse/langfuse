/**
 * Scan a pipeline's traces for trajectory drift, optionally writing the result
 * back to Langfuse as scores.
 *
 *   pnpm --filter worker run trajectory-drift-scan -- \
 *     --project <projectId> --pipeline docfraud-review --hours 24 \
 *     --public-key pk-lf-... --secret-key sk-lf-... --emit
 *
 * Baseline construction is leave-one-out: each run is scored against every
 * *other* run in the window. Two reasons that matters.
 *
 *  - Without it a run's own signature is always present in the baseline, so
 *    the UNSEEN_SIGNATURE rule could never fire and the detector would look
 *    far worse than it is.
 *  - The baseline is *not* cleaned of anomalies first. Production baselines
 *    contain whatever traffic actually happened, bad runs included, and a
 *    detector that only works against a hand-curated baseline is not a
 *    detector. Scoring against a contaminated baseline is the honest test.
 *
 * When --labels is given the script also reports precision and recall against
 * a ground-truth corpus. That file is read here and nowhere else: the detector
 * itself sees only the observation tree.
 */

import { randomUUID } from "crypto";
import { readFileSync } from "fs";

import {
  assessDrift,
  buildBaseline,
  getTrajectoryPipelines,
  getTrajectoryRuns,
  logger,
  type DriftAssessment,
  type TrajectoryFeatures,
} from "@langfuse/shared/src/server";

const SCORE_NAME = "trajectory-drift";

/** A run is reported as drifted at or above this score. */
const DRIFT_THRESHOLD = 0.3;

type Args = {
  projectId: string;
  pipeline?: string;
  hours: number;
  maxRuns: number;
  host: string;
  publicKey?: string;
  secretKey?: string;
  emit: boolean;
  labels?: string;
  threshold: number;
};

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const projectId = get("--project");
  if (!projectId) {
    throw new Error("--project <projectId> is required");
  }
  return {
    projectId,
    pipeline: get("--pipeline"),
    hours: Number(get("--hours") ?? 24),
    maxRuns: Number(get("--max-runs") ?? 5000),
    host: get("--host") ?? "http://localhost:3000",
    publicKey: get("--public-key"),
    secretKey: get("--secret-key"),
    emit: argv.includes("--emit"),
    labels: get("--labels"),
    threshold: Number(get("--threshold") ?? DRIFT_THRESHOLD),
  };
}

/**
 * Baseline over every run except `skipIndex`.
 *
 * Rebuilt per run rather than incrementally decremented: the sets involved
 * (signatures, steps, edges) do not subtract cleanly, and at the scale a
 * single scan covers the straightforward version is both fast enough and
 * obviously correct.
 */
function baselineExcluding(features: TrajectoryFeatures[], skipIndex: number) {
  return buildBaseline(features.filter((_, i) => i !== skipIndex));
}

async function emitScores(
  args: Args,
  scored: { traceId: string; assessment: DriftAssessment }[],
): Promise<void> {
  if (!args.publicKey || !args.secretKey) {
    throw new Error("--emit requires --public-key and --secret-key");
  }

  // Written through the public ingestion API rather than straight into
  // ClickHouse, so the scores go through exactly the same validation,
  // queueing and worker path as any SDK-produced score.
  const batch = scored.map(({ traceId, assessment }) => ({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: "score-create",
    body: {
      id: randomUUID(),
      traceId,
      name: SCORE_NAME,
      value: assessment.score,
      dataType: "NUMERIC",
      comment:
        assessment.reasons.length > 0
          ? assessment.reasons.map((r) => `${r.rule}: ${r.detail}`).join(" | ")
          : "no trajectory drift detected",
      metadata: {
        rules: assessment.reasons.map((r) => r.rule),
        evaluated: assessment.evaluated,
      },
    },
  }));

  const auth = Buffer.from(`${args.publicKey}:${args.secretKey}`).toString(
    "base64",
  );

  // Chunked: the ingestion endpoint caps request size, and a single scan can
  // easily produce thousands of scores.
  const chunkSize = 100;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    const response = await fetch(`${args.host}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ batch: chunk }),
    });
    if (!response.ok) {
      throw new Error(
        `ingestion failed (${response.status}): ${await response.text()}`,
      );
    }
  }
  logger.info(`emitted ${batch.length} ${SCORE_NAME} scores`);
}

/** Ground-truth records written by the docfraud corpus runner. */
type LabelRecord = { trace_id: string | null; failure_mode: string };

function readLabels(path: string): Map<string, string> {
  const labels = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as LabelRecord;
    if (record.trace_id) labels.set(record.trace_id, record.failure_mode);
  }
  return labels;
}

function reportAccuracy(
  scored: { traceId: string; assessment: DriftAssessment }[],
  labels: Map<string, string>,
  threshold: number,
): void {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const missedByMode = new Map<string, { caught: number; total: number }>();

  for (const { traceId, assessment } of scored) {
    const mode = labels.get(traceId);
    if (!mode) continue;
    const isAnomaly = mode !== "healthy";
    const flagged = assessment.score >= threshold;

    if (isAnomaly) {
      const stat = missedByMode.get(mode) ?? { caught: 0, total: 0 };
      stat.total++;
      if (flagged) stat.caught++;
      missedByMode.set(mode, stat);
    }

    if (isAnomaly && flagged) tp++;
    else if (!isAnomaly && flagged) fp++;
    else if (isAnomaly && !flagged) fn++;
    else tn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines = [
    "",
    `Detector accuracy at threshold ${threshold}`,
    "-".repeat(52),
    `true positives   ${tp}`,
    `false positives  ${fp}`,
    `false negatives  ${fn}`,
    `true negatives   ${tn}`,
    "",
    `precision        ${pct(precision)}`,
    `recall           ${pct(recall)}`,
    `F1               ${pct(f1)}`,
    "",
    "Recall by failure mode",
    "-".repeat(52),
  ];
  for (const [mode, stat] of [...missedByMode.entries()].sort()) {
    lines.push(
      `${mode.padEnd(24)}${String(stat.caught).padStart(4)}/${String(stat.total).padEnd(5)} ${pct(
        stat.total > 0 ? stat.caught / stat.total : 0,
      )}`,
    );
  }
  console.log(lines.join("\n"));
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const toTimestamp = new Date();
  const fromTimestamp = new Date(
    toTimestamp.getTime() - args.hours * 60 * 60 * 1000,
  );

  let pipeline = args.pipeline;
  if (!pipeline) {
    const pipelines = await getTrajectoryPipelines({
      projectId: args.projectId,
      fromTimestamp,
      toTimestamp,
      limit: 10,
    });
    if (pipelines.length === 0) {
      logger.warn("no pipelines found in the window");
      return;
    }
    pipeline = pipelines[0]!.name;
    logger.info(
      `no --pipeline given, using busiest: ${pipeline} (${pipelines[0]!.runs} runs)`,
    );
  }

  const runs = await getTrajectoryRuns({
    projectId: args.projectId,
    traceName: pipeline,
    fromTimestamp,
    toTimestamp,
    maxRuns: args.maxRuns,
  });
  logger.info(`loaded ${runs.length} runs of "${pipeline}"`);

  const features = runs.map((r) => r.features);
  const scored = runs.map((run, i) => ({
    traceId: run.traceId,
    assessment: assessDrift(run.features, baselineExcluding(features, i)),
  }));

  const drifted = scored.filter((s) => s.assessment.score >= args.threshold);
  const distinctPaths = new Set(features.map((f) => f.signature)).size;

  const summary = [
    "",
    `Pipeline         ${pipeline}`,
    `Runs             ${runs.length}`,
    `Distinct paths   ${distinctPaths}`,
    `Drifted (>=${args.threshold})  ${drifted.length} (${(
      (drifted.length / Math.max(runs.length, 1)) *
      100
    ).toFixed(1)}%)`,
  ];
  console.log(summary.join("\n"));

  if (args.labels) {
    reportAccuracy(scored, readLabels(args.labels), args.threshold);
  }

  if (args.emit) {
    await emitScores(args, scored);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error("trajectory drift scan failed", error);
      process.exit(1);
    });
}
