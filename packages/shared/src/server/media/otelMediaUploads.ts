import { env } from "../../env";
import { logger } from "../logger";
import { MediaUploadPool } from "./MediaUploadPool";

// Shared by early-media ingestion jobs in this worker process.
// Build-time imports skip env validation and therefore may not have defaults.
export const otelMediaUploads = new MediaUploadPool(
  Number(env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY ?? 100),
  Number(env.LANGFUSE_OTEL_MEDIA_UPLOAD_MAX_BYTES ?? 128 * 1024 * 1024),
);

// Structured-value and URI traversals can nest; keep each dispatch level small
// even when many batches share a larger upload pool.
export function mediaDispatchConcurrency(): number {
  return Math.min(5, Number(env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY ?? 100));
}

/** Iterate lazily; finish active work, log later failures, then rethrow the first. */
export async function forEachMedia<T>(
  values: Iterable<T>,
  process: (value: T) => Promise<unknown>,
): Promise<void> {
  const iterator = values[Symbol.iterator]();
  let failure: { error: unknown } | undefined;
  const concurrency = mediaDispatchConcurrency();
  const workers = Array.isArray(values)
    ? Math.min(values.length, concurrency)
    : concurrency;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      try {
        while (!failure) {
          const next = iterator.next();
          if (next.done) return;
          await process(next.value);
        }
      } catch (error) {
        if (!failure) {
          failure = { error };
        } else {
          logger.error("Additional OTEL media processing failure", { error });
        }
      }
    }),
  );
  if (failure) throw failure.error;
}
