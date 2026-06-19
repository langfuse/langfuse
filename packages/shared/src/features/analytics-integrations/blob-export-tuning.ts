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

export const BlobExportTuningSchema = z.object({
  // LFE-10402 raw-passthrough export path: stream ClickHouse JSONEachRow bytes
  // straight to gzip → upload, skipping the per-row JS parse/enrich/serialize
  // pipeline. Only honored for JSONL exports of the observations / events
  // tables; ignored (with a warning) otherwise. Drops the model price columns.
  rawPassthrough: z.boolean().optional(),
});

export type BlobExportTuning = z.infer<typeof BlobExportTuningSchema>;

export type ResolvedBlobExportTuning = {
  rawPassthrough: boolean;
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
  const defaults: ResolvedBlobExportTuning = { rawPassthrough: false };

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

  return {
    resolved: { rawPassthrough: parsed.data.rawPassthrough ?? false },
    warnings: [],
  };
}
