import {
  instrumentAsync,
  logger,
  recordDistribution,
  recordIncrement,
  TRACE_BATCH_INPUT_MAX_CHARACTERS,
  traceException,
  type TraceBatchInputReference,
  type TraceBatchInputData,
  type TraceBatchInputStorage,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { isTraceDispatchEnabled } from "./traceBatchSampling";

/** Capture failures are outcomes; legacy Topics can continue using in-memory input. */
export async function storeInputs(
  reference: TraceBatchInputReference,
  inputs: TraceBatchInputData,
  inputStorage: TraceBatchInputStorage,
): Promise<"disabled" | "stored" | "too_large" | "upload_failed"> {
  const dispatchEnabled = isTraceDispatchEnabled();
  if (
    !dispatchEnabled &&
    env.LANGFUSE_TRACE_BATCH_TRANSCRIPT_STORAGE_ENABLED !== "true"
  )
    return "disabled";

  return instrumentAsync({ name: "trace-batch-store-inputs" }, async (span) => {
    const startedAt = performance.now();
    let outcome: "stored" | "too_large" | "upload_failed" = "upload_failed";
    span.setAttributes({
      "langfuse.project.id": reference.projectId,
      "langfuse.trace.id": reference.traceId,
      "langfuse.trace_batch.revision": reference.revision,
    });
    try {
      const result = await inputStorage.put(reference, inputs);
      outcome = result.outcome;
      span.setAttributes({
        "langfuse.trace_batch.input_storage.outcome": result.outcome,
        "langfuse.trace_batch.input_storage.json_characters": result.jsonLength,
      });
      if (result.outcome === "too_large")
        logger.info("Trace batch input storage skipped", {
          ...reference,
          reason: "input_too_large",
          jsonLength: result.jsonLength,
          limit: TRACE_BATCH_INPUT_MAX_CHARACTERS,
        });
      return outcome;
    } catch (error) {
      // StorageService owns SDK retries and failure logs, including SlowDown warnings.
      outcome = "upload_failed";
      span.setAttribute(
        "langfuse.trace_batch.input_storage.outcome",
        "upload_failed",
      );
      if (dispatchEnabled)
        logger.warn("Trace batch input upload failed", {
          ...reference,
          error: error instanceof Error ? error.message : String(error),
        });
      else traceException(error, span);
      return "upload_failed";
    } finally {
      if (dispatchEnabled) {
        recordIncrement("langfuse.trace_dispatch.input_storage", 1, {
          outcome,
        });
        recordDistribution(
          "langfuse.trace_dispatch.input_storage_duration_ms",
          performance.now() - startedAt,
          { outcome },
        );
      }
    }
  });
}
