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
import {
  hasComparisonCapacity,
  queueRowVerification,
  type ShadowRowKey,
  storedStartTime,
} from "./verifyRows";

const SHADOW_RUN = "otel-rust-shadow";
const METRIC_PREFIX = "langfuse.ingestion.otel.shadow.";

type Sample = {
  input: Buffer;
  context: Omit<OtelProcessingContext, "now">;
  /** The time TypeScript gave spans without a start and end time. */
  fallbackTime: string;
  extractMedia: boolean;
  typeScriptPreparationMs?: number;
};

/** What one implementation did with a batch. */
type Recorded = {
  rows: ShadowRowKey[];
  /** Spans whose row could not be built or written. */
  failedRows: number;
  /** One key per evaluation write, built from ids only. */
  evalWrites: string[];
  /** Evaluation writes that were requested and then failed. */
  failedEvalWrites: number;
  /** Per observation snapshot, a digest of each top-level field. */
  snapshots: Map<string, Record<string, string>>;
  mediaUploads: number;
};

const newRecorded = (): Recorded => ({
  rows: [],
  failedRows: 0,
  evalWrites: [],
  failedEvalWrites: 0,
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
  recorded: Recorded;
  /** Where the Rust run stopped; absent when it completed. */
  failedAt?: "prepare" | "process";
  error?: string;
  prepareMs?: number;
  processMs?: number;
};

/**
 * The current one-minute window: Rust runs started, selected batches turned
 * away while the comparison was behind, and runs skipped while too many were
 * going.
 */
const admission = { started: 0, throttled: 0, skipped: 0, since: 0 };
const ADMISSION_WINDOW_MS = 60_000;

/**
 * Whether the Rust path also processes this batch. The rate selects a fixed
 * set of files, so a retry is selected again and a higher rate keeps the files
 * a lower rate selected. A selected batch is admitted only while the row
 * comparison has room, so the load the shadow adds follows what the
 * comparison keeps up with.
 */
export function admitOtelShadowBatch(
  projectId: string,
  fileKey: string,
): boolean {
  const rate = env.LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE;
  const selected =
    rate > 0 &&
    env.LANGFUSE_OTEL_DIRECT_IMPLEMENTATION === "ts" &&
    // The Rust run would send the batch to the masking callback a second time.
    !isIngestionMaskingEnabled() &&
    getDeterministicSamplingValue(
      `otel-native-shadow:${projectId}:${fileKey}`,
    ) < rate;
  if (!selected) return false;
  closeAdmissionWindow(Date.now());
  if (hasComparisonCapacity()) return true;
  refuse("throttled");
  return false;
}

/** Close a window that is a minute old, warning when it turned batches away. */
function closeAdmissionWindow(now: number): void {
  if (now - admission.since < ADMISSION_WINDOW_MS) return;
  const refused = admission.throttled + admission.skipped;
  if (refused > 0) {
    const configuredRate = env.LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE;
    logger.warn("OTEL shadow sampling is throttled", {
      configuredRate,
      effectiveRate:
        (configuredRate * admission.started) / (admission.started + refused),
      startedBatches: admission.started,
      throttledBatches: admission.throttled,
      skippedBatches: admission.skipped,
    });
  }
  admission.started = 0;
  admission.throttled = 0;
  admission.skipped = 0;
  admission.since = now;
}

/** Count a selected batch that gets no Rust run. */
function refuse(result: "throttled" | "skipped"): void {
  admission[result]++;
  recordIncrement(`${METRIC_PREFIX}batch`, 1, { result });
}

/**
 * Run the TypeScript direct step and return its result or error unchanged.
 * Afterwards, without holding the job, the Rust path processes the same input
 * and the two are compared. The Rust run writes rows to events_native_test and
 * performs no other write.
 */
export async function withOtelShadow(sample: Sample, direct: DirectStep) {
  const { step, recorded } = recordTypeScriptWrites(direct);
  const startedAt = performance.now();
  let error: string | undefined;
  try {
    return await processOtelEvents(step);
  } catch (failure) {
    error = errorClass(failure);
    throw failure;
  } finally {
    const processMs = performance.now() - startedAt;
    startRustComparison(sample, { recorded, error, processMs });
  }
}

/** The direct step, and a record that fills as its event and evaluation writes happen. */
function recordTypeScriptWrites(direct: DirectStep): {
  step: DirectStep;
  recorded: Recorded;
} {
  const recorded = newRecorded();
  const step: DirectStep = {
    ...direct,
    // The direct step skips a span whose row cannot be built or written, so
    // such a span is missing from this side for a reason Rust does not share.
    ingestionService: {
      createEventRecord: async (...args) => {
        try {
          return await direct.ingestionService.createEventRecord(...args);
        } catch (failure) {
          recorded.failedRows++;
          throw failure;
        }
      },
      writeEventRecord: async (...args) => {
        try {
          const row = await direct.ingestionService.writeEventRecord(...args);
          recorded.rows.push({
            traceId: row.trace_id,
            spanId: row.span_id,
            startTime: row.start_time,
          });
          return row;
        } catch (failure) {
          recorded.failedRows++;
          throw failure;
        }
      },
    },
    evalWrites: () => recordEvalWrites(recorded, direct.evalWrites()),
  };
  return { step, recorded };
}

/**
 * Record a key per evaluation write, then let `next` perform or skip it. A
 * write that fails is counted: the scheduler stops at it, so the writes that
 * follow are missing from this side for a reason the other side does not share.
 */
function recordEvalWrites(recorded: Recorded, next: EvalWrites): EvalWrites {
  const record = (key: string) => recorded.evalWrites.push(key);
  const counted = async <T>(write: () => Promise<T>): Promise<T> => {
    try {
      return await write();
    } catch (failure) {
      recorded.failedEvalWrites++;
      throw failure;
    }
  };
  return {
    upsertJobExecution: (params) => {
      record(`job:${params.id}`);
      return counted(() => next.upsertJobExecution(params));
    },
    uploadObservationToS3: (params) => {
      const observation = `${params.traceId}/${params.observationId}`;
      record(`snapshot:${observation}`);
      recorded.snapshots.set(observation, fieldDigests(params.data));
      return counted(() => next.uploadObservationToS3(params));
    },
    enqueueEvalJob: (params) => {
      record(`enqueue:${params.jobExecutionId}`);
      return counted(() => next.enqueueEvalJob(params));
    },
    recordTraceActivity: (projectId, activity) => {
      for (const { traceId, spanStartTimeISO, ruleIds } of activity)
        record(
          `activity:${traceId}@${spanStartTimeISO}:${[...ruleIds].sort().join(",")}`,
        );
      return counted(() => next.recordTraceActivity(projectId, activity));
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

/**
 * Rust runs start once their job has finished, so job concurrency does not
 * bound them. Each holds its input and a native batch until it settles; while
 * this many are going, a batch whose turn comes skips its run.
 */
const MAX_RUST_RUNS = 2;
let rustRuns = 0;

/** Start the Rust run and its comparison in the background, unless too many are going. */
function startRustComparison(sample: Sample, typeScript: TypeScriptRun): void {
  if (rustRuns >= MAX_RUST_RUNS) {
    refuse("skipped");
    return;
  }
  rustRuns++;
  admission.started++;
  runRust(sample)
    .then((rust) => report(sample, typeScript, rust))
    .finally(() => rustRuns--)
    .catch((failure) =>
      logger.warn("OTEL shadow comparison failed", {
        projectId: sample.context.projectId,
        fileKey: sample.context.fileKey,
        error: errorClass(failure),
      }),
    );
}

async function runRust(sample: Sample): Promise<RustRun> {
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
          const { writes, recorded } = shadowRustWrites(writer);
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
                // Rust gives spans without a start and end time this time,
                // so they get the start time TypeScript gave them.
                context: { ...sample.context, now: sample.fallbackTime },
                writes,
              });
            } finally {
              await batch.dispose();
            }
            return {
              recorded,
              prepareMs,
              processMs: performance.now() - startedAt - prepareMs,
            };
          } catch (error) {
            const rustError = errorClass(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: rustError });
            return { recorded, failedAt, error: rustError, prepareMs };
          }
        },
      ),
  );
}

/** Evaluation writes that store nothing and answer as the real ones do. */
const dryEvalWrites: EvalWrites = {
  upsertJobExecution: async ({ id }) => ({ id }),
  uploadObservationToS3: async () => "otel-shadow-dry-run",
  enqueueEvalJob: async () => {},
  recordTraceActivity: async () => {},
};

/**
 * The Rust run's writes, and a record that fills as they happen. Rows go to
 * the events_native_test writer; media and evaluation writes are counted and
 * answered without touching storage.
 */
function shadowRustWrites(
  writer: ReturnType<typeof ClickhouseWriter.getNativeTestInstance>,
): { writes: RustOtelWrites; recorded: Recorded } {
  const recorded = newRecorded();
  const writes: RustOtelWrites = {
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
  return { writes, recorded };
}

function report(
  sample: Sample,
  typeScript: TypeScriptRun,
  rust: RustRun,
): void {
  const { projectId, fileKey } = sample.context;
  const bothOk = typeScript.error === undefined && rust.failedAt === undefined;
  // A failed side stopped part-way, so its writes say nothing about parity.
  // The same holds for a span TypeScript skipped, and for evaluation writes
  // after one of TypeScript's failed.
  const rowsComparable = bothOk && typeScript.recorded.failedRows === 0;
  const evalComparable =
    rowsComparable && typeScript.recorded.failedEvalWrites === 0;
  const evalWrites = evalComparable
    ? compareEvalWrites(typeScript.recorded, rust.recorded)
    : { onlyTypeScript: [], onlyRust: [], snapshotFields: [] };
  const evalWritesMatch =
    evalWrites.onlyTypeScript.length + evalWrites.onlyRust.length === 0;
  const snapshotsMatch = evalWrites.snapshotFields.length === 0;
  // The stored rows are compared later, and rows of an earlier attempt can
  // stand in for one this attempt did not write. The keys cannot.
  const rowKeys = rowsComparable
    ? compareRowKeys(typeScript.recorded, rust.recorded)
    : { onlyTypeScript: [], onlyRust: [] };
  const rowKeysMatch =
    rowKeys.onlyTypeScript.length + rowKeys.onlyRust.length === 0;
  const parity = (comparable: boolean, same: boolean) => {
    if (!comparable) return "unchecked";
    return same ? "match" : "different";
  };
  const result = batchResult(
    typeScript.error === undefined,
    rust.failedAt === undefined,
  );
  const writeMode = v4WritesToLegacyTables(env) ? "dual" : "events_only";

  recordIncrement(`${METRIC_PREFIX}batch`, 1, {
    result,
    ts_error: typeScript.error ?? "none",
    rust_error: rust.error ?? "none",
    rust_stage: rust.failedAt ?? "none",
    row_keys: parity(rowsComparable, rowKeysMatch),
    eval_writes: parity(evalComparable, evalWritesMatch),
    eval_snapshots: parity(evalComparable, snapshotsMatch),
    write_mode: writeMode,
  });
  recordDurations(sample, typeScript, rust, writeMode);

  if (!bothOk || !rowKeysMatch || !evalWritesMatch || !snapshotsMatch) {
    logger.warn("OTEL shadow batch differs", {
      projectId,
      fileKey,
      result,
      typeScriptError: typeScript.error,
      rustError: rust.error,
      rustStage: rust.failedAt,
      typeScriptRows: typeScript.recorded.rows.length,
      rustRows: rust.recorded.rows.length,
      rowKeysOnlyTypeScript: logged(rowKeys.onlyTypeScript),
      rowKeysOnlyRust: logged(rowKeys.onlyRust),
      evalWritesOnlyTypeScript: logged(evalWrites.onlyTypeScript),
      evalWritesOnlyRust: logged(evalWrites.onlyRust),
      evalSnapshotFields: evalWrites.snapshotFields,
    });
  }
  if (bothOk) {
    queueRowVerification({
      projectId,
      fileKey,
      rows: typeScript.recorded.rows.concat(rust.recorded.rows),
    });
  }
}

function batchResult(typeScriptOk: boolean, rustOk: boolean): string {
  if (typeScriptOk && rustOk) return "both_ok";
  if (typeScriptOk) return "rust_failed";
  return rustOk ? "ts_failed" : "both_failed";
}

/** The rows only one side wrote in this attempt, by trace, span and stored start time. */
function compareRowKeys(typeScript: Recorded, rust: Recorded) {
  const keys = ({ rows }: Recorded) =>
    rows.map(
      ({ traceId, spanId, startTime }) =>
        `${traceId}/${spanId}@${storedStartTime(startTime) ?? startTime}`,
    );
  return {
    onlyTypeScript: unmatched(keys(typeScript), keys(rust)),
    onlyRust: unmatched(keys(rust), keys(typeScript)),
  };
}

/** How the evaluation writes of the two sides differ. */
function compareEvalWrites(typeScript: Recorded, rust: Recorded) {
  return {
    onlyTypeScript: unmatched(typeScript.evalWrites, rust.evalWrites),
    onlyRust: unmatched(rust.evalWrites, typeScript.evalWrites),
    snapshotFields: changedSnapshotFields(typeScript.snapshots, rust.snapshots),
  };
}

/** A few keys for a log line. Ids in JSON input can be any string, so each is cut. */
function logged(keys: string[]): string[] {
  return keys.slice(0, 5).map((key) => key.slice(0, 5_000));
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

function recordDurations(
  sample: Sample,
  typeScript: TypeScriptRun,
  rust: RustRun,
  writeMode: string,
): void {
  // Only TypeScript performs real uploads and evaluation writes, so durations
  // compare like for like on batches without any.
  const sideEffects =
    typeScript.recorded.evalWrites.length +
      rust.recorded.evalWrites.length +
      rust.recorded.mediaUploads >
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
  if (rust.failedAt === undefined) {
    record("rust", "prepare", rust.prepareMs);
    record("rust", "process", rust.processMs);
  }
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
