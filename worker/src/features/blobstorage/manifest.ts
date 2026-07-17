// Run-completion manifest for blob storage exports (LFE-10843): written as the
// last object of a successful run (the run's commit point), listing every file
// written, the export window, and per-file format.

/** Bump on breaking payload changes; additive fields do not require a bump. */
export const BLOB_EXPORT_MANIFEST_VERSION = 1;

export type BlobExportManifestFile = {
  /** Full object key including the integration prefix. */
  key: string;
  table: string;
  fileType: string;
  format: string;
  compressed: boolean;
  contentType: string;
  /** Post-gzip size for compressed formats. */
  sizeBytes: number;
  /** Null when not counted (parquet is a binary stream). */
  rowCount: number | null;
};

export type BlobExportManifest = {
  version: number;
  projectId: string;
  exportSource: string;
  /**
   * Export window, both bounds inclusive — a row at exactly maxTimestamp also
   * falls into the next run's window.
   */
  window: { minTimestamp: string; maxTimestamp: string };
  /** Equals window.maxTimestamp; also the manifest key stem. */
  maxTimestamp: string;
  createdAt: string;
  tables: string[];
  files: BlobExportManifestFile[];
};

/** Shared with table file names so a run's files and manifest sort together. */
export const formatBlobExportTimestamp = (date: Date): string =>
  date.toISOString().replace(/:/g, "-").substring(0, 19);

/** `{prefix}{projectId}/manifests/{maxTimestamp}.json` — prefix-filterable per run. */
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
