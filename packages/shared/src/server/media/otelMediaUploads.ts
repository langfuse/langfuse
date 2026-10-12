import { env } from "../../env";
import { MediaUploadPool } from "./MediaUploadPool";

// Shared by early and late OTEL processing, including concurrent ingestion jobs.
// Build-time imports skip env validation and therefore may not have defaults.
export const otelMediaUploads = new MediaUploadPool(
  Number(env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY ?? 5),
  Number(env.LANGFUSE_OTEL_MEDIA_UPLOAD_MAX_BYTES ?? 128 * 1024 * 1024),
);

/** Map with bounded concurrency, preserving input order in the result. */
export async function mapMedia<T, R>(
  values: Iterable<T>,
  process: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  await forEachMedia(values, async (value) => {
    const position = index++;
    results[position] = await process(value);
  });
  return results;
}

/** Iterate lazily; drain active work before propagating an error. */
export async function forEachMedia<T>(
  values: Iterable<T>,
  process: (value: T) => Promise<unknown>,
): Promise<void> {
  const iterator = values[Symbol.iterator]();
  let failure: { error: unknown } | undefined;
  const concurrency = Number(env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY ?? 5);
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
