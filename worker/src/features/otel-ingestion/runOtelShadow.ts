import { prepareOtelJson, type OtelProcessingContext } from "@langfuse/native";
import {
  instrumentAsync,
  logger,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { processRustOtelEvents } from "./processRustOtelEvents";
import {
  classifyOtelShadowPair,
  type OtelShadowErrorStage,
  type OtelShadowOutcome,
  type reserveShadowInput,
} from "./otelShadowBatch";
import {
  createIntentCounts,
  compareIntentCounts,
  createOtelShadowCapture,
} from "./primaryOtelShadowCapture";
import { createNativeOtelShadowEffects } from "./nativeOtelShadowEffects";
import { ClickhouseWriter } from "../../services/ClickhouseWriter";
import {
  enqueueOtelShadowRows,
  type OtelShadowRowLocator,
} from "./otelShadowRowVerifier";
import type { OtelEffect } from "./otelEffectsCapture";

export { createOtelShadowCapture };

type ShadowBatch = {
  input: NonNullable<ReturnType<typeof reserveShadowInput>>;
  primary: ReturnType<typeof createOtelShadowCapture>;
  context: OtelProcessingContext;
  primaryMediaPath: "early" | "reference";
  extractMedia: boolean;
  writeMode: "events_only" | "dual";
  primaryDurationMs: number;
  primaryOutcome?: {
    outcome: "exception";
    errorStage: Exclude<
      OtelShadowErrorStage,
      | "none"
      | "primary_writer"
      | "shadow_prepare"
      | "shadow_process"
      | "shadow_writer"
    >;
  };
};

const MAX_FAILURE_METRICS_PER_SIDE = 16;

const pending = new Set<Promise<void>>();

export function submitOtelShadow(job: ShadowBatch): void {
  // Leave the queue job free to finish. The buffered writer can flush several
  // ingestion jobs together; each shadow waits for its own rows.
  const comparison = instrumentAsync(
    { name: "otel-native-shadow", startNewTrace: true },
    () => runAfterPrimaryInsert(job),
  )
    .catch((error: unknown) => {
      logger.warn("Native OTEL shadow comparison failed", {
        projectId: job.context.projectId,
        fileKey: job.context.fileKey,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      recordIncrement("langfuse.ingestion.otel.shadow.batch", 1, {
        outcome: "error",
      });
    })
    .finally(() => {
      job.input.release();
      pending.delete(comparison);
    });
  pending.add(comparison);
}

async function runAfterPrimaryInsert({
  input,
  primary,
  context,
  primaryMediaPath,
  extractMedia,
  writeMode,
  primaryDurationMs,
  primaryOutcome: primaryOutcomeOverride,
}: ShadowBatch) {
  // Seal even after a primary exception: earlier rows may still be in the writer.
  const primaryWriterWaitStarted = performance.now();
  const writerOutcome = await primary.waitForPrimaryInserts();
  const primaryWriterWaitDurationMs =
    performance.now() - primaryWriterWaitStarted;
  const primaryOutcome = primaryOutcomeOverride?.outcome ?? writerOutcome;
  const primaryErrorStage =
    primaryOutcomeOverride?.errorStage ??
    (writerOutcome === "dropped" ? "primary_writer" : "none");
  const started = performance.now();
  let shadowProcessingDurationMs: number | undefined;
  let shadowWriterWaitDurationMs: number | undefined;
  let shadowOutcome: OtelShadowOutcome = "exception";
  let shadowErrorStage: OtelShadowErrorStage = "none";
  const schedulingSource = primary.scheduling ? "primary" : "unavailable";
  let batch: Awaited<ReturnType<typeof prepareOtelJson>> | undefined;
  let native: ReturnType<typeof createIntentCounts> | undefined;
  const shadowRowLocators: OtelShadowRowLocator[] = [];
  try {
    try {
      batch = await prepareOtelJson(input.bytes, extractMedia);
    } catch (error) {
      shadowErrorStage = "shadow_prepare";
      logger.warn("Native OTEL shadow preparation failed", {
        projectId: context.projectId,
        fileKey: context.fileKey,
        errorType: getSafeErrorType(error),
      });
      return;
    }
    // A primary preparation failure can precede rule selection. Empty rules keep
    // Rust row processing observable without running a second config lookup.
    const scheduling = primary.scheduling;
    native = createIntentCounts();
    const inserts: Promise<boolean>[] = [];
    const effects = createNativeOtelShadowEffects({
      writer: {
        addToQueue(table, event, startTimeIso) {
          const ack = Promise.withResolvers<boolean>();
          inserts.push(ack.promise);
          try {
            ClickhouseWriter.getNativeTestInstance().addToQueue(table, event, {
              onTerminal: (outcome) => {
                if (outcome.status === "inserted") {
                  shadowRowLocators.push({
                    traceId: event.ids.trace_id,
                    spanId: event.ids.id,
                    startTime: startTimeIso,
                  });
                }
                ack.resolve(outcome.status === "inserted");
              },
            });
            native?.add(
              "event",
              JSON.stringify([event.ids.trace_id, event.ids.id]),
            );
          } catch (error) {
            ack.resolve(false);
            throw error;
          }
        },
      },
      capture: { capture: native.capture },
      replayUpload: primary.replayUpload,
      evalRules: scheduling?.evalRules ?? {
        observationRules: [],
        traceTranscriptRules: [],
      },
      traceDispatchSamplingRate: scheduling?.traceDispatchSamplingRate ?? 0,
      traceTranscriptRules:
        scheduling?.traceTranscriptRules ?? Promise.resolve([]),
    });
    const settleShadowWrites = async (): Promise<boolean[]> => {
      const shadowWriterWaitStartedAt = performance.now();
      try {
        return await Promise.all(inserts);
      } finally {
        shadowWriterWaitDurationMs =
          performance.now() - shadowWriterWaitStartedAt;
      }
    };
    try {
      await processRustOtelEvents({ batch, context, effects });
      shadowProcessingDurationMs = performance.now() - started;
    } catch (error) {
      shadowProcessingDurationMs = performance.now() - started;
      shadowErrorStage = "shadow_process";
      // A later processing failure can follow successful writer enqueues.
      // Retain this sample until every outstanding insert has settled.
      const acknowledged = (await settleShadowWrites()).filter(Boolean).length;
      logger.warn("Native OTEL shadow stopped after inserting rows", {
        projectId: context.projectId,
        fileKey: context.fileKey,
        acknowledged,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      recordIncrement("langfuse.ingestion.otel.shadow.batch", 1, {
        outcome: acknowledged === 0 ? "error" : "partial",
      });
      return;
    }
    const completed = await settleShadowWrites();
    if (completed.length === 0) {
      shadowOutcome = "empty";
      recordIncrement("langfuse.ingestion.otel.shadow.batch", 1, {
        outcome: "empty",
      });
      return;
    }
    if (completed.includes(false)) {
      shadowOutcome = "dropped";
      shadowErrorStage = "shadow_writer";
      recordIncrement("langfuse.ingestion.otel.shadow.batch", 1, {
        outcome: completed.includes(true) ? "partial" : "shadow_insert_failed",
      });
      return;
    }
    shadowOutcome = "inserted";
    if (primaryOutcome !== "inserted") {
      recordIncrement("langfuse.ingestion.otel.shadow.batch", 1, {
        outcome: primaryOutcome === "exception" ? "error" : primaryOutcome,
      });
      return;
    }
  } finally {
    if (native) {
      const bothInserted =
        primaryOutcome === "inserted" && shadowOutcome === "inserted";
      const complete =
        bothInserted &&
        schedulingSource === "primary" &&
        primary.intents.complete &&
        native.complete;
      const differences = compareIntentCounts(primary.intents, native);
      for (const { kind, missing, extra } of differences) {
        const tags = { kind, coverage: complete ? "complete" : "partial" };
        if (missing)
          recordIncrement(
            "langfuse.ingestion.otel.shadow.effect_difference",
            missing,
            { ...tags, direction: "missing" },
          );
        if (extra)
          recordIncrement(
            "langfuse.ingestion.otel.shadow.effect_difference",
            extra,
            { ...tags, direction: "extra" },
          );
      }
      if (differences.length) {
        logger.info("Native OTEL shadow effects differ", {
          projectId: context.projectId,
          fileKey: context.fileKey,
          complete,
          differences,
        });
      }
      if (bothInserted) {
        const outcome = differences.length ? "intents_differ" : "intents_match";
        recordIncrement("langfuse.ingestion.otel.shadow.batch", 1, {
          outcome: complete ? outcome : "inconclusive",
        });
      }
    }
    recordOtelShadowIntentFailures("primary", primary.intents.failures);
    if (native) recordOtelShadowIntentFailures("native", native.failures);
    if (primary.rowLocators.length || shadowRowLocators.length) {
      enqueueOtelShadowRows({
        projectId: context.projectId,
        fileKey: context.fileKey,
        inputBytes: input.bytes.byteLength,
        primary: primary.rowLocators,
        shadow: shadowRowLocators,
      });
    }
    await batch?.dispose();
    const shadowDurationMs = performance.now() - started;
    if (shadowProcessingDurationMs === undefined) {
      shadowProcessingDurationMs = performance.now() - started;
    }
    recordDistribution(
      "langfuse.ingestion.otel.shadow.duration_ms",
      shadowDurationMs,
    );
    const pairTags = {
      primary_outcome: primaryOutcome,
      shadow_outcome: shadowOutcome,
      comparison: classifyOtelShadowPair(primaryOutcome, shadowOutcome),
      primary_error_stage: primaryErrorStage,
      shadow_error_stage: shadowErrorStage,
      media_extraction: extractMedia ? "enabled" : "disabled",
      scheduling_source: schedulingSource,
      write_mode: writeMode,
      primary_media_path: primaryMediaPath,
    };
    recordIncrement("langfuse.ingestion.otel.shadow.pair", 1, pairTags);
    if (primaryOutcome !== shadowOutcome) {
      logger.info("OTEL shadow batch outcomes differ", {
        projectId: context.projectId,
        fileKey: context.fileKey,
        ...pairTags,
      });
    }
    recordDistribution(
      "langfuse.ingestion.otel.shadow.paired_processing_duration_ms",
      primaryDurationMs,
      { ...pairTags, implementation: "ts" },
    );
    recordDistribution(
      "langfuse.ingestion.otel.shadow.paired_processing_duration_ms",
      shadowProcessingDurationMs,
      { ...pairTags, implementation: "rust" },
    );
    if (primaryDurationMs > 0) {
      recordDistribution(
        "langfuse.ingestion.otel.shadow.processing_rust_to_ts_ratio",
        shadowProcessingDurationMs / primaryDurationMs,
        pairTags,
      );
    }
    recordDistribution(
      "langfuse.ingestion.otel.shadow.paired_writer_wait_duration_ms",
      primaryWriterWaitDurationMs,
      { ...pairTags, implementation: "ts" },
    );
    if (shadowWriterWaitDurationMs !== undefined) {
      recordDistribution(
        "langfuse.ingestion.otel.shadow.paired_writer_wait_duration_ms",
        shadowWriterWaitDurationMs,
        { ...pairTags, implementation: "rust" },
      );
    }
  }
}

function recordOtelShadowIntentFailures(
  side: "primary" | "native",
  failures: readonly OtelEffect[],
): void {
  const metric = `langfuse.ingestion.otel.shadow.${side}.intents.failures`;
  for (const failure of failures.slice(0, MAX_FAILURE_METRICS_PER_SIDE)) {
    if (failure.kind === "operation-failure") {
      recordIncrement(metric, 1, {
        mode: failure.mode,
        operation: failure.operation,
      });
    } else if (failure.kind === "capture-failure") {
      recordIncrement(metric, 1, {
        mode: failure.mode,
        operation: "capture",
        stage: failure.stage,
      });
    }
  }
  if (failures.length > MAX_FAILURE_METRICS_PER_SIDE) {
    recordIncrement(metric, failures.length - MAX_FAILURE_METRICS_PER_SIDE, {
      mode: "mixed",
      operation: "overflow",
    });
  }
}

function getSafeErrorType(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (typeof error === "object" && error !== null) return "object";
  return typeof error;
}

export async function drainOtelShadows(): Promise<void> {
  await Promise.all(pending);
}
