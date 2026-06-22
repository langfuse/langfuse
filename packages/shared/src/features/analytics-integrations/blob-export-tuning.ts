// Per-project blob-export tuning, persisted as a nullable JSON column
// (`BlobStorageIntegration.exportTuning`) and set via the DB directly for now
// (no UI/tRPC write path yet). Validated and resolved at job time.
//
// This module is client-safe (no logger / server imports) so a future settings
// UI can reuse the schema for write-validation. The worker logs the warnings
// returned by the resolver.
//
// Shared with LFE-10394 (upload tuning knobs: partSizeBytes / maxConcurrentParts
// / maxPartAttempts / skipEnrichment). Extend this schema rather than forking
// it. Unknown keys are stripped (zod default) so a key written by a newer
// writer is harmless to an older worker.
import { z } from "zod";

// Minimum ClickHouse version for safe raw passthrough. The passthrough relies on
// ClickHouse's mid-stream exception tagging (the `x-clickhouse-exception-tag`
// response header + end-of-stream marker) so the client errors the stream when a
// query fails after a 200 response. That mechanism only exists in ClickHouse
// >= 25.11. On older servers a query that fails mid-stream is NOT detected and
// the passthrough can silently upload a truncated/garbage object — so operators
// MUST NOT enable `rawPassthrough` on self-hosted ClickHouse below this version.
// Langfuse Cloud runs a newer ClickHouse, so this only affects self-hosters.
export const RAW_PASSTHROUGH_MIN_CLICKHOUSE_VERSION = "25.11";

export const BlobExportTuningSchema = z.object({
  // LFE-10402 raw-passthrough export path: stream ClickHouse JSONEachRow row text
  // straight to gzip → upload, skipping the per-row JS parse/enrich/serialize
  // pipeline. Only honored for JSONL exports of the observations / events
  // tables; ignored (with a warning) otherwise. Drops the model price columns.
  //
  // EXPERIMENTAL + self-hosting caveat: requires ClickHouse
  // >= RAW_PASSTHROUGH_MIN_CLICKHOUSE_VERSION (see above) for mid-stream failure
  // detection. Do not enable on older self-hosted ClickHouse.
  rawPassthrough: z.boolean().optional(),
  // LFE-10402 gzip tuning: zlib deflate level for compressed exports. Lower
  // levels trade output size for markedly less worker CPU (the gzip step is the
  // dominant remaining cost on large passthrough exports). Only honored when the
  // integration has compression enabled. zlib accepts 0 (store, no compression)
  // through 9 (max); absent / out-of-range falls back to the zlib default (6).
  gzipLevel: z.number().optional(),
});

export type BlobExportTuning = z.infer<typeof BlobExportTuningSchema>;

export type ResolvedBlobExportTuning = {
  rawPassthrough: boolean;
  // undefined => use the zlib default (6); a concrete 0-9 otherwise.
  gzipLevel: number | undefined;
};

/**
 * Resolve the persisted `exportTuning` JSON into concrete export settings.
 * Pure and total: never throws. A null / non-object / malformed column resolves
 * to the safe defaults (today's behaviour) and records a warning the caller can
 * log. Unknown keys are ignored.
 */
export function resolveBlobExportTuning(raw: unknown): {
  resolved: ResolvedBlobExportTuning;
  warnings: string[];
} {
  const defaults: ResolvedBlobExportTuning = {
    rawPassthrough: false,
    gzipLevel: undefined,
  };

  if (raw === null || raw === undefined) {
    return { resolved: defaults, warnings: [] };
  }

  const parsed = BlobExportTuningSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      resolved: defaults,
      warnings: [
        `Malformed exportTuning column, falling back to defaults: ${parsed.error.message}`,
      ],
    };
  }

  const warnings: string[] = [];

  // Clamp-to-default rather than fail: a bad gzipLevel must not also disable a
  // valid rawPassthrough. An out-of-range / non-integer level is dropped (zlib
  // default applies) with a warning the caller logs.
  let gzipLevel: number | undefined;
  const rawLevel = parsed.data.gzipLevel;
  if (rawLevel !== undefined) {
    if (Number.isInteger(rawLevel) && rawLevel >= 0 && rawLevel <= 9) {
      gzipLevel = rawLevel;
    } else {
      warnings.push(
        `Ignoring out-of-range gzipLevel ${rawLevel} (expected integer 0-9), using zlib default`,
      );
    }
  }

  return {
    resolved: {
      rawPassthrough: parsed.data.rawPassthrough ?? false,
      gzipLevel,
    },
    warnings,
  };
}
