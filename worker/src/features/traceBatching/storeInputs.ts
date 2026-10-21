import {
  instrumentAsync,
  logger,
  TRACE_BATCH_INPUT_MAX_CHARACTERS,
  traceException,
  type TraceBatchInputReference,
  type TraceBatchInputData,
  type TraceBatchInputStorage,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

/** Optional capture; storage failures must not stop in-memory Topics processing. */
export async function storeInputs(
  reference: TraceBatchInputReference,
  inputs: TraceBatchInputData,
  inputStorage: TraceBatchInputStorage,
): Promise<void> {
  if (env.LANGFUSE_TRACE_BATCH_TRANSCRIPT_STORAGE_ENABLED !== "true") return;

  await instrumentAsync({ name: "trace-batch-store-inputs" }, async (span) => {
    span.setAttributes({
      "langfuse.project.id": reference.projectId,
      "langfuse.trace.id": reference.traceId,
      "langfuse.trace_batch.revision": reference.revision,
    });
    try {
      const result = await inputStorage.put(reference, inputs);
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
    } catch (error) {
      // StorageService owns SDK retries and failure logs, including SlowDown warnings.
      span.setAttribute(
        "langfuse.trace_batch.input_storage.outcome",
        "upload_failed",
      );
      traceException(error, span);
    }
  });
}
