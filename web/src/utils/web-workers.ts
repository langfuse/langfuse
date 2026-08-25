import { env } from "@/src/env.mjs";

/**
 * Whether `new Worker(new URL("…", import.meta.url))` can succeed in this
 * build.
 *
 * Browsers reject a cross-origin *classic* worker script outright with a
 * SecurityError, whatever CSP allows. Turbopack builds every worker's bootstrap
 * URL from the configured asset prefix and then forces the worker to be
 * classic — its worker factory constructs the URL as
 * `new URL(chunkBase + bootstrapChunk, location.origin)` and passes
 * `{ ...options, type: undefined }`, so `{ type: "module" }` at the call site
 * is discarded rather than honoured. Serving build output from a dedicated
 * asset host therefore makes worker construction throw, every time.
 *
 * There is no app-level fix: the chunk base is baked into the Turbopack runtime
 * chunk (`TURBOPACK_CHUNK_BASE_PATH`), Next exposes no per-worker override, and
 * webpack's `output.workerPublicPath` escape hatch is unreachable because
 * `next build` takes the Turbopack path. So callers check this first and fall
 * back to the main thread deliberately, instead of throwing on every attempt.
 */
export function canUseBundledWorker(): boolean {
  if (typeof window === "undefined" || !window.Worker) return false;

  const assetPrefix = env.NEXT_PUBLIC_ASSET_PREFIX;
  if (!assetPrefix) return true;

  return new URL(assetPrefix).origin === window.location.origin;
}
