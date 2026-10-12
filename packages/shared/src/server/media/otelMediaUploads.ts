import { env } from "../../env";
import { MediaUploadPool } from "./MediaUploadPool";

// Shared by early-media ingestion jobs in this worker process.
// Build-time imports skip env validation and therefore may not have defaults.
export const otelMediaUploads = new MediaUploadPool(
  Number(env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY ?? 100),
  Number(env.LANGFUSE_OTEL_MEDIA_UPLOAD_MAX_BYTES ?? 128 * 1024 * 1024),
);

// Structured-value and URI traversals can nest; keep each dispatch level small
// even when many batches share a larger upload pool.
const MEDIA_DISPATCH_CONCURRENCY = 5;

/** Iterate lazily; drain active work before propagating an error. */
export async function forEachMedia<T>(
  values: Iterable<T>,
  process: (value: T) => Promise<unknown>,
): Promise<void> {
  const iterator = values[Symbol.iterator]();
  let failure: { error: unknown } | undefined;
  const concurrency = Math.min(
    MEDIA_DISPATCH_CONCURRENCY,
    Number(env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY ?? 100),
  );
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
        if (!failure) failure = { error };
      }
    }),
  );
  if (failure) throw failure.error;
}
