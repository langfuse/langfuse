import { createHash } from "node:crypto";
import type { OtelProcessingContext } from "@langfuse/native";
import { context as otelContext, SpanStatusCode } from "@opentelemetry/api";
import { stableJsonStringify } from "@langfuse/shared";
import {
  getMediaId,
  instrumentAsync,
  logger,
  recordDistribution,
  recordIncrement,
  shadowRunContext,
} from "@langfuse/shared/src/server";
import { isIngestionMaskingEnabled } from "@langfuse/shared/src/server/ee/ingestionMasking";
import { env, v4WritesToLegacyTables } from "../../../env";
import { classifyJobFailure } from "../../../queues/jobFailureReason";
import {
  ClickhouseWriter,
  TableName,
} from "../../../services/ClickhouseWriter";
import { getDeterministicSamplingValue } from "../../evaluation/deterministicSampling";
import type { EvalWrites } from "../../evaluation/scheduleEvals";
import type { RustOtelWrites } from "../otelWrites";
import { prepareOtelBatch } from "../prepareOtelBatch";
import { processOtelEvents } from "../processOtelEvents";
import { processRustOtelEvents } from "../processRustOtelEvents";
import { queueRowVerification, type ShadowRowKey } from "./verifyRows";

const SHADOW_RUN = "otel-rust-shadow";
const METRIC_PREFIX = "langfuse.ingestion.otel.shadow.";
/**
 * Rust runs start once their job has finished, so job concurrency does not
 * bound them. Each holds its input and a native batch until it settles; while
 * this many are going, further sampled batches skip theirs.
 */
const MAX_RUST_RUNS = 2;
let rustRuns = 0;

type Sample = {
  input: Buffer;
  context: Omit<OtelProcessingContext, "now">;
  extractMedia: boolean;
  typeScriptPreparationMs?: number;
};

/** What one implementation did with a batch. */
type Recorded = {
  rows: ShadowRowKey[];
  /** One key per evaluation write, built from ids only. */
  evalWrites: string[];
  /** Per observation snapshot, a digest of each top-level field. */
  snapshots: Map<string, Record<string, string>>;
  mediaUploads: number;
};

const newRecorded = (): Recorded => ({
  rows: [],
  evalWrites: [],
  snapshots: new Map(),
  mediaUploads: 0,
});

type DirectStep = Parameters<typeof processOtelEvents>[0];

type TypeScriptRun = {
  recorded: Recorded;
  /** The failure class; absent when the direct step completed. */
  error?: string;
  processMs: number;
};

type RustRun = {
  /** Where the Rust run stopped; absent when it completed. */
  failedAt?: "prepare" | "process";
  error?: string;
  prepareMs?: number;
  processMs?: number;
};

/**
 * Whether the Rust path also processes this batch. The choice is fixed per
 * file, so a retry repeats it and a higher rate keeps the files a lower rate
 * chose.
 */
export function isOtelShadowSampled(
  projectId: string,
  fileKey: string,
): boolean {
  const rate = env.LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE;
  return (
    rate > 0 &&
    env.LANGFUSE_OTEL_DIRECT_IMPLEMENTATION === "ts" &&
    // The Rust run would send the batch to the masking callback a second time.
    !isIngestionMaskingEnabled() &&
    getDeterministicSamplingValue(
      `otel-native-shadow:${projectId}:${fileKey}`,
    ) < rate
  );
}

/**
 * Run the TypeScript direct step and return its result or error unchanged.
 * Afterwards, without holding the job, the Rust path processes the same input
 * and the two are compared. The Rust run writes rows to events_native_test and
 * performs no other write.
 */
export async function withOtelShadow(sample: Sample, direct: DirectStep) {
  const recorded = newRecorded();
  const startedAt = performance.now();
  let error: string | undefined;
  try {
    return await processOtelEvents(recordTypeScriptWrites(direct, recorded));
  } catch (failure) {
    error = errorClass(failure);
    throw failure;
  } finally {
    const processMs = performance.now() - startedAt;
    startRustComparison(sample, { recorded, error, processMs });
  }
}

/** The direct step with its event and evaluation writes recorded as they happen. */
function recordTypeScriptWrites(
  direct: DirectStep,
  recorded: Recorded,
): DirectStep {
  return {
    ...direct,
    ingestionService: {
      createEventRecord: (...args) =>
        direct.ingestionService.createEventRecord(...args),
      writeEventRecord: async (...args) => {
        const row = await direct.ingestionService.writeEventRecord(...args);
        recorded.rows.push({
          traceId: row.trace_id,
          spanId: row.span_id,
          startTime: row.start_time,
        });
        return row;
      },
    },
    evalWrites: () => recordEvalWrites(recorded, direct.evalWrites()),
  };
}

/** Start the Rust run and its comparison in the background, unless too many are going. */
function startRustComparison(sample: Sample, typeScript: TypeScriptRun): void {
  if (rustRuns >= MAX_RUST_RUNS) {
    recordIncrement(`${METRIC_PREFIX}batch`, 1, { result: "skipped" });
    return;
  }
  rustRuns++;
  const recorded = newRecorded();
  runRust(sample, recorded)
    .then((run) => report(sample, typeScript, recorded, run))
    .finally(() => rustRuns--)
    .catch((failure) =>
      logger.warn("OTEL shadow comparison failed", {
        projectId: sample.context.projectId,
        fileKey: sample.context.fileKey,
        error: errorClass(failure),
      }),
    );
}

/** Record a key per evaluation write, then let `next` perform or skip it. */
function recordEvalWrites(recorded: Recorded, next: EvalWrites): EvalWrites {
  const record = (key: string) => recorded.evalWrites.push(key);
  return {
    upsertJobExecution: (params) => {
      record(`job:${params.id}`);
      return next.upsertJobExecution(params);
    },
    uploadObservationToS3: (params) => {
      const observation = `${params.traceId}/${params.observationId}`;
      record(`snapshot:${observation}`);
      recorded.snapshots.set(observation, fieldDigests(params.data));
      return next.uploadObservationToS3(params);
    },
    enqueueEvalJob: (params) => {
      record(`enqueue:${params.jobExecutionId}`);
      return next.enqueueEvalJob(params);
    },
    recordTraceActivity: (projectId, activity) => {
      for (const { traceId, spanStartTimeISO, ruleIds } of activity)
        record(
          `activity:${traceId}@${spanStartTimeISO}:${[...ruleIds].sort().join(",")}`,
        );
      return next.recordTraceActivity(projectId, activity);
    },
  };
}

/** A digest per top-level field, so a difference can be named without its value. */
function fieldDigests(snapshot: object): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const [field, value] of Object.entries(snapshot)) {
    if (value === undefined) continue;
    try {
      digests[field] = createHash("sha256")
        .update(stableJsonStringify(value))
        .digest("base64url")
        .slice(0, 16);
    } catch {
      digests[field] = "undigestable";
    }
  }
  return digests;
}

/** Fields that differ between the two snapshots of the same observation. */
function changedSnapshotFields(
  a: Recorded["snapshots"],
  b: Recorded["snapshots"],
): string[] {
  const changed = new Set<string>();
  for (const [observation, ours] of a) {
    const theirs = b.get(observation);
    if (!theirs) continue;
    for (const field of Object.keys({ ...ours, ...theirs })) {
      if (ours[field] !== theirs[field]) changed.add(field);
    }
  }
  return [...changed].sort();
}

/** Evaluation writes that store nothing and answer as the real ones do. */
const dryEvalWrites: EvalWrites = {
  upsertJobExecution: async ({ id }) => ({ id }),
  uploadObservationToS3: async () => "otel-shadow-dry-run",
  enqueueEvalJob: async () => {},
  recordTraceActivity: async () => {},
};

/**
 * The Rust run's writes. Rows go to the events_native_test writer; media and
 * evaluation writes are counted and answered without touching storage.
 */
function shadowRustWrites(
  recorded: Recorded,
  writer: ReturnType<typeof ClickhouseWriter.getNativeTestInstance>,
): RustOtelWrites {
  return {
    uploadMedia: async ({ contentBytes, sha256Hash }) => {
      recorded.mediaUploads++;
      return {
        mediaId: getMediaId(
          sha256Hash ??
            createHash("sha256").update(contentBytes).digest("base64"),
        ),
        outcome: "uploaded",
      };
    },
    linkMedia: async () => {},
    evalWrites: () => recordEvalWrites(recorded, dryEvalWrites),
    writeEvent: ({ event, traceId, startTimeIso }) => {
      writer.addToQueue(TableName.EventsNativeTest, event);
      recorded.rows.push({
        traceId,
        spanId: event.ids.id,
        startTime: startTimeIso,
      });
    },
  };
}

async function runRust(sample: Sample, recorded: Recorded): Promise<RustRun> {
  // Taken before the first await: a run that outlives shutdown must not create
  // a new writer.
  const writer = ClickhouseWriter.getNativeTestInstance();
  return otelContext.with(
    shadowRunContext(SHADOW_RUN, otelContext.active()),
    () =>
      instrumentAsync(
        { name: SHADOW_RUN, startNewTrace: true },
        async (span): Promise<RustRun> => {
          span.setAttribute("fileKey", sample.context.fileKey);
          const startedAt = performance.now();
          let failedAt: RustRun["failedAt"] = "prepare";
          let prepareMs: number | undefined;
          try {
            const { batch } = await prepareOtelBatch({
              bytes: sample.input,
              projectId: sample.context.projectId,
              extractMedia: sample.extractMedia,
              retainNativeBatch: true,
            });
            if (!batch)
              throw new Error("Rust processing requires a native batch");
            prepareMs = performance.now() - startedAt;
            failedAt = "process";
            try {
              await processRustOtelEvents({
                batch,
                context: { ...sample.context, now: new Date().toISOString() },
                writes: shadowRustWrites(recorded, writer),
              });
            } finally {
              await batch.dispose();
            }
            return {
              prepareMs,
              processMs: performance.now() - startedAt - prepareMs,
            };
          } catch (error) {
            const rustError = errorClass(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: rustError });
            return { failedAt, error: rustError, prepareMs };
          }
        },
      ),
  );
}

function batchResult(typeScriptOk: boolean, rustOk: boolean): string {
  if (typeScriptOk && rustOk) return "both_ok";
  if (typeScriptOk) return "rust_failed";
  return rustOk ? "ts_failed" : "both_failed";
}

/** How the evaluation writes of the two sides differ. */
function compareEvalWrites(typeScript: Recorded, rust: Recorded) {
  return {
    onlyTypeScript: unmatched(typeScript.evalWrites, rust.evalWrites),
    onlyRust: unmatched(rust.evalWrites, typeScript.evalWrites),
    snapshotFields: changedSnapshotFields(typeScript.snapshots, rust.snapshots),
  };
}

function recordDurations(
  sample: Sample,
  typeScript: TypeScriptRun,
  rust: Recorded,
  run: RustRun,
  writeMode: string,
): void {
  // Only TypeScript performs real uploads and evaluation writes, so durations
  // compare like for like on batches without any.
  const sideEffects =
    typeScript.recorded.evalWrites.length +
      rust.evalWrites.length +
      rust.mediaUploads >
    0
      ? "some"
      : "none";
  const record = (
    implementation: "ts" | "rust",
    phase: "prepare" | "process",
    ms: number | undefined,
  ) => {
    if (ms === undefined) return;
    recordDistribution(`${METRIC_PREFIX}duration_ms`, ms, {
      implementation,
      phase,
      side_effects: sideEffects,
      write_mode: writeMode,
    });
  };
  if (typeScript.error === undefined) {
    record("ts", "prepare", sample.typeScriptPreparationMs);
    record("ts", "process", typeScript.processMs);
  }
  if (run.failedAt === undefined) {
    record("rust", "prepare", run.prepareMs);
    record("rust", "process", run.processMs);
  }
}

function report(
  sample: Sample,
  typeScript: TypeScriptRun,
  rust: Recorded,
  run: RustRun,
): void {
  const { projectId, fileKey } = sample.context;
  const bothOk = typeScript.error === undefined && run.failedAt === undefined;
  // A failed side stopped part-way, so its writes say nothing about parity.
  const evalWrites = bothOk
    ? compareEvalWrites(typeScript.recorded, rust)
    : { onlyTypeScript: [], onlyRust: [], snapshotFields: [] };
  const evalWritesMatch =
    evalWrites.onlyTypeScript.length + evalWrites.onlyRust.length === 0;
  const snapshotsMatch = evalWrites.snapshotFields.length === 0;
  const parity = (same: boolean) => {
    if (!bothOk) return "unchecked";
    return same ? "match" : "different";
  };
  const result = batchResult(
    typeScript.error === undefined,
    run.failedAt === undefined,
  );
  const writeMode = v4WritesToLegacyTables(env) ? "dual" : "events_only";

  recordIncrement(`${METRIC_PREFIX}batch`, 1, {
    result,
    ts_error: typeScript.error ?? "none",
    rust_error: run.error ?? "none",
    rust_stage: run.failedAt ?? "none",
    eval_writes: parity(evalWritesMatch),
    eval_snapshots: parity(snapshotsMatch),
    write_mode: writeMode,
  });
  recordDurations(sample, typeScript, rust, run, writeMode);

  if (!bothOk || !evalWritesMatch || !snapshotsMatch) {
    logger.warn("OTEL shadow batch differs", {
      projectId,
      fileKey,
      result,
      typeScriptError: typeScript.error,
      rustError: run.error,
      rustStage: run.failedAt,
      typeScriptRows: typeScript.recorded.rows.length,
      rustRows: rust.rows.length,
      evalWritesOnlyTypeScript: evalWrites.onlyTypeScript.slice(0, 5),
      evalWritesOnlyRust: evalWrites.onlyRust.slice(0, 5),
      evalSnapshotFields: evalWrites.snapshotFields,
    });
  }
  if (bothOk) {
    queueRowVerification({
      projectId,
      fileKey,
      rows: typeScript.recorded.rows.concat(rust.rows),
    });
  }
}

/** Keys of `a` that `b` lacks, counting repeats. */
function unmatched(a: string[], b: string[]): string[] {
  const remaining = new Map<string, number>();
  for (const key of b) remaining.set(key, (remaining.get(key) ?? 0) + 1);
  return a.filter((key) => {
    const left = remaining.get(key) ?? 0;
    if (left > 0) remaining.set(key, left - 1);
    return left === 0;
  });
}

/**
 * A failure's class for metrics and logs: the native error code when there is
 * one. Never the message, which can quote customer data.
 */
function errorClass(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^ERR_[A-Z_]+$/.test(code)
    ? code
    : classifyJobFailure(error);
}
