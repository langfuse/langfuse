import { recordIncrement } from "@langfuse/shared/src/server";

export const EXPORT_VOLUME_METRIC = "langfuse.export.serialized_bytes";

export type ExportIntegration =
  | "blob_storage"
  | "posthog"
  | "mixpanel"
  | "llmaj";

type ExportVolume = {
  integration: ExportIntegration;
  // On-wire egress bytes shipped this run: gzipped for blob/posthog/mixpanel,
  // uncompressed for llmaj (LLM requests aren't gzipped).
  bytes: number;
  // Only tagged for blob_storage (per-project egress cost attribution); the
  // API-based integrations (posthog/mixpanel/llmaj) omit it to keep custom
  // metric cardinality down.
  projectId: string;
  // Egress-cost classification; blob only (S3 / S3_COMPATIBLE / AZURE_*).
  destinationType?: string;
  // Blob-only dimensions: export format, table, and codepath.
  source?: string;
  table?: string;
  path?: string;
};

/**
 * Single metric for total outbound export volume, so egress can be summed
 * across integrations and split by `integration` / `destination_type` for
 * cost. Undefined tags are omitted so each integration sets only the
 * dimensions it has. `projectId` is tagged for blob_storage only.
 */
export const recordExportVolume = ({
  integration,
  bytes,
  projectId,
  destinationType,
  source,
  table,
  path,
}: ExportVolume): void => {
  const tags: Record<string, string> = { integration };
  if (integration === "blob_storage") tags.projectId = projectId;
  if (destinationType !== undefined) tags.destination_type = destinationType;
  if (source !== undefined) tags.source = source;
  if (table !== undefined) tags.table = table;
  if (path !== undefined) tags.path = path;
  recordIncrement(EXPORT_VOLUME_METRIC, bytes, tags);
};
