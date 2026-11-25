import { context, propagation, ROOT_CONTEXT } from "@opentelemetry/api";
import { prepareOtelJson, type OtelProcessingContext } from "@langfuse/native";
import {
  logger,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { getDeterministicSamplingValue } from "../../evaluation/deterministicSampling";
import { ClickhouseWriter } from "../../../services/ClickhouseWriter";
import { classifyJobFailure } from "../../../queues/jobFailureReason";
import { processRustOtelEvents } from "../processRustOtelEvents";
import { effectDifferences, ShadowScope } from "./context";
import { shadowJobId, shadowRowKey, shadowSourceFile } from "./rowKey";
import { enqueueShadowRows, flushShadowRows } from "./verifyRows";
import { closeShadowWriter, getShadowWriter } from "./writer";

// The shared logger includes OTEL baggage. Background replay has its own trace
// context so a replay error cannot mark the accepted ingestion job as failed.
const shadowContext = propagation.setBaggage(
  ROOT_CONTEXT,
  propagation.createBaggage({ otel_ingestion_mode: { value: "shadow" } }),
);
const prefix = "langfuse.ingestion.otel.shadow.";
const pending = new Set<Promise<void>>();
const reservations = new Map<ShadowScope, number>();
const maxInputBytes = 64 * 1024 * 1024;

type Batch = {
  context: OtelProcessingContext;
  extractMedia: boolean;
  mediaPath: "reference" | "early";
  writeMode: "events_only" | "dual";
  jobId?: string;
};
type Sample = NonNullable<ReturnType<typeof reserveSample>>;

export function sampleFile(rate: number, projectId: string, fileKey: string) {
  return (
    rate > 0 &&
    (rate === 1 ||
      getDeterministicSamplingValue(
        JSON.stringify(["otel-native-shadow", projectId, fileKey]),
      ) < rate)
  );
}

export function reserveSample(
  source: Uint8Array | string | (() => string),
  batch: Batch,
) {
  const capacity = () => {
    recordIncrement(prefix + "batch", 1, { outcome: "capacity" });
    return undefined;
  };
  if (reservations.size >= 4) return capacity();

  try {
    const started = performance.now();
    const input = typeof source === "function" ? source() : source;
    const size =
      typeof input === "string" ? Buffer.byteLength(input) : input.byteLength;
    const heldBytes = [...reservations.values()].reduce(
      (sum, value) => sum + value,
      0,
    );
    if (size > maxInputBytes - heldBytes) return capacity();

    const bytes = Buffer.from(input);
    const primary = new ShadowScope("primary");
    reservations.set(primary, size);
    return {
      ...batch,
      jobId: batch.jobId && shadowJobId(batch.jobId),
      bytes,
      started,
      primary,
      release: () => reservations.delete(primary),
    };
  } catch {
    recordIncrement(prefix + "batch", 1, { outcome: "input_error" });
  }
}

export type PrimaryStage =
  | "primary_parse"
  | "primary_convert"
  | "primary_process"
  | "primary_dispose";

export function submitSample(sample: Sample, failure?: PrimaryStage) {
  const task = context
    .with(shadowContext, () => compare(sample, failure))
    .catch((error: unknown) => {
      logger.warn("OTEL shadow comparison failed", {
        projectId: sample.context.projectId,
        jobId: sample.jobId,
        sourceFile: shadowSourceFile(
          sample.context.projectId,
          sample.context.fileKey,
        ),
        reason: shadowFailureReason(error),
      });
      recordIncrement(prefix + "batch", 1, { outcome: "error" });
    });
  pending.add(task);
  const cleanup = () => {
    sample.release();
    pending.delete(task);
  };
  task.then(cleanup, cleanup);
}

function finish(
  scope: ShadowScope,
  started: number,
  failure?: string,
  reason?: string,
) {
  const accepted = scope.rows.length > 0 ? "enqueued" : "empty";
  return {
    outcome: failure ? "exception" : accepted,
    stage: failure ?? "none",
    reason,
    processingMs: performance.now() - started,
    scope,
  };
}

async function compare(sample: Sample, failure?: PrimaryStage) {
  const primary = finish(sample.primary, sample.started, failure);
  const native = await runNative(sample);
  const differentEnqueues = enqueueShadowRows({
    projectId: sample.context.projectId,
    fileKey: sample.context.fileKey,
    jobId: sample.jobId,
    inputBytes: sample.bytes.length,
    primary: primary.scope.rows,
    shadow: native.scope.rows,
  });
  report(sample, primary, native, differentEnqueues);
}

// Native errors can include the span ID, field value or media reference in the
// message. Only stable codes and known failure categories go in the report.
const nativeErrorCodes = new Set([
  "ERR_NATIVE_PANIC",
  "ERR_OTEL_CLOSED",
  "ERR_OTEL_INTERNAL",
  "ERR_OTEL_INVALID_JSON",
  "ERR_OTEL_JSON_CONSUMED",
  "ERR_OTEL_MEDIA_DECODE",
  "ERR_OTEL_MEDIA_INDEX",
  "ERR_OTEL_PROCESSING",
]);

function shadowFailureReason(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "Native OTEL writer unavailable")
      return "native_writer_unavailable";
    if (
      "code" in error &&
      typeof error.code === "string" &&
      nativeErrorCodes.has(error.code)
    ) {
      if (
        error.code === "ERR_OTEL_PROCESSING" &&
        error.message.startsWith("cannot finalize OTEL event")
      )
        return "row_finalization";
      return error.code;
    }
  }
  return classifyJobFailure(error);
}

async function runNative(sample: Sample) {
  const scope = new ShadowScope("native", sample.primary.effects);
  const started = performance.now();
  let stage: string | undefined = "shadow_prepare";
  let reason: string | undefined;
  let batch: Awaited<ReturnType<typeof prepareOtelJson>> | undefined;
  try {
    batch = await prepareOtelJson(sample.bytes, sample.extractMedia);
    stage = "shadow_process";
    await processRustOtelEvents({
      batch,
      context: sample.context,
      getWriter: getShadowWriter,
      writes: scope,
    });
    stage = undefined;
  } catch (error) {
    reason = shadowFailureReason(error);
  } finally {
    try {
      await batch?.dispose();
    } catch (error) {
      if (stage) scope.fail("shadow_dispose");
      else {
        stage = "shadow_dispose";
        reason = shadowFailureReason(error);
      }
    }
  }
  return finish(scope, started, stage, reason);
}

type Result = ReturnType<typeof finish>;

function classification(
  primary: Result,
  native: Result,
  differentEnqueues: ReturnType<typeof enqueueShadowRows>,
) {
  if (primary.stage !== "none")
    return native.stage !== "none" ? "both_failed" : "primary_only_failure";
  if (native.stage !== "none") return "shadow_only_failure";
  if (primary.outcome !== native.outcome) return "different_outcome";
  if (primary.scope.rows.length !== native.scope.rows.length)
    return "different_enqueues";
  if (!differentEnqueues) return "enqueues_unchecked";
  return differentEnqueues.length ? "different_enqueues" : "match";
}

function report(
  sample: Sample,
  primary: Result,
  native: Result,
  differentEnqueues: ReturnType<typeof enqueueShadowRows>,
) {
  const comparison = classification(primary, native, differentEnqueues);
  const tags = {
    comparison,
    primary_outcome: primary.outcome,
    shadow_outcome: native.outcome,
    primary_error_stage: primary.stage,
    shadow_error_stage: native.stage,
    write_mode: sample.writeMode,
    primary_media_path: sample.mediaPath,
    primary_effects: primary.scope.attemptedPrimaryEffect ? "some" : "none",
    media_extraction: sample.extractMedia ? "enabled" : "disabled",
  };
  recordIncrement(prefix + "pair", 1, tags);

  for (const [implementation, result] of [
    ["ts", primary],
    ["rust", native],
  ] as const) {
    recordDistribution(
      prefix + "paired_processing_duration_ms",
      result.processingMs,
      { ...tags, implementation },
    );
  }

  const differences = effectDifferences(primary.scope);
  const primaryFailures = primary.scope.failures;
  const nativeFailures = native.scope.failures;
  const hasFailures =
    primary.stage !== "none" ||
    native.stage !== "none" ||
    Object.keys(primaryFailures).length > 0 ||
    Object.keys(nativeFailures).length > 0;
  if (
    differences.length === 0 &&
    !hasFailures &&
    (comparison === "match" || comparison === "enqueues_unchecked")
  )
    return;

  const rows =
    primary.scope.rows.length > 0 ? primary.scope.rows : native.scope.rows;
  logger.info("OTEL shadow batch differs or is incomplete", {
    ...tags,
    jobId: sample.jobId,
    projectId: sample.context.projectId,
    sourceFile: shadowSourceFile(
      sample.context.projectId,
      sample.context.fileKey,
    ),
    shadow_failure_reason: native.reason,
    primaryEnqueued: primary.scope.rows.length,
    shadowEnqueued: native.scope.rows.length,
    differentEnqueues,
    differences,
    primaryFailures,
    nativeFailures,
    batchRowKeys: rows
      .slice(0, 3)
      .map((row) => shadowRowKey(sample.context.projectId, row)),
  });
}

export async function shutdownOtelWriters() {
  await ClickhouseWriter.shutdownAll();
  await Promise.all(pending);
  await context.with(shadowContext, closeShadowWriter);
  await context.with(shadowContext, flushShadowRows);
}
