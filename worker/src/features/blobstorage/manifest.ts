// LFE-10843: run-completion manifest for blob storage exports.
//
// An export run writes up to 4 table files (scores / traces / observations /
// observations_v2, depending on exportSource) with no per-run marker. Consumers
// subscribing to native object-created events (S3 Event Notifications, Azure
// Event Grid, B2, MinIO) can see each file land but cannot tell when a run is
// complete, since the file count varies by exportSource.
//
// The manifest is a structured JSON object (S3-Inventory / Cost-&-Usage-Report
// convention, not an empty _SUCCESS marker) written as the LAST object of a
// successful run — its presence is the run's commit point. It lists every file
// written, the export window, and per-file format so consumers can verify they
// can read the full run and react with a single prefix-filtered subscription on
// the `manifests/` key.

/**
 * Manifest schema version. Bump on any breaking change to the payload shape so
 * consumers can gate on it. Additive fields do not require a bump.
 */
export const BLOB_EXPORT_MANIFEST_VERSION = 1;

export type BlobExportManifestFile = {
  /** Full object key including the integration prefix. */
  key: string;
  /** ClickHouse source table: scores | traces | observations | observations_v2. */
  table: string;
  /** Effective file type: JSON | CSV | JSONL | PARQUET. */
  fileType: string;
  /** Serialization format including compression, e.g. jsonl-gzip, parquet. */
  format: string;
  compressed: boolean;
  contentType: string;
  /** Bytes uploaded (post-gzip size for compressed formats). */
  sizeBytes: number;
  /** Rows written, or null when not counted (parquet is a binary stream). */
  rowCount: number | null;
};

export type BlobExportManifest = {
  version: number;
  projectId: string;
  /** Integration export source, e.g. TRACES_OBSERVATIONS_EVENTS. */
  exportSource: string;
  /** Export window [minTimestamp, maxTimestamp) in ISO-8601. */
  window: { minTimestamp: string; maxTimestamp: string };
  /** Run commit timestamp (equals window.maxTimestamp); also the manifest key stem. */
  maxTimestamp: string;
  /** When the manifest was written (ISO-8601). */
  createdAt: string;
  /** Distinct tables included in this run, in write order. */
  tables: string[];
  files: BlobExportManifestFile[];
};

/**
 * Timestamp stem shared by table file names and the manifest key, so a manifest
 * and its run's files sort together. Colons are stripped for object-key safety.
 */
export const formatBlobExportTimestamp = (date: Date): string =>
  date.toISOString().replace(/:/g, "-").substring(0, 19);

/**
 * Manifest object key: `{prefix}{projectId}/manifests/{maxTimestamp}.json`.
 * Consumers set a native event subscription with a prefix filter on
 * `{prefix}{projectId}/manifests/` to receive one event per completed run.
 */
export const buildBlobExportManifestKey = (params: {
  prefix?: string;
  projectId: string;
  maxTimestamp: Date;
}): string =>
  `${params.prefix ?? ""}${params.projectId}/manifests/${formatBlobExportTimestamp(
    params.maxTimestamp,
  )}.json`;

export const buildBlobExportManifest = (params: {
  projectId: string;
  exportSource: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  createdAt: Date;
  files: BlobExportManifestFile[];
}): BlobExportManifest => ({
  version: BLOB_EXPORT_MANIFEST_VERSION,
  projectId: params.projectId,
  exportSource: params.exportSource,
  window: {
    minTimestamp: params.minTimestamp.toISOString(),
    maxTimestamp: params.maxTimestamp.toISOString(),
  },
  maxTimestamp: params.maxTimestamp.toISOString(),
  createdAt: params.createdAt.toISOString(),
  tables: [...new Set(params.files.map((f) => f.table))],
  files: params.files,
});
