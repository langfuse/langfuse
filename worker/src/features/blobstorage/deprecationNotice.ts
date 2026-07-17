// Deprecation notice written into the export destination for projects still on
// a legacy export source (LFE-10896): a plain-text file warning that the
// "Traces and observations (legacy)" sources are deprecated in favour of the
// enriched observations source. Written on every successful run for legacy
// projects; new / enriched-only (EVENTS) projects never receive it.

/** Fixed file name, overwritten each run so the notice is always current. */
export const BLOB_EXPORT_DEPRECATION_NOTICE_FILENAME = "DEPRECATION_NOTICE.txt";

/** `{prefix}{projectId}/DEPRECATION_NOTICE.txt` — fixed key, overwritten each run. */
export const buildBlobExportDeprecationNoticeKey = (params: {
  prefix?: string;
  projectId: string;
}): string =>
  `${params.prefix ?? ""}${params.projectId}/${BLOB_EXPORT_DEPRECATION_NOTICE_FILENAME}`;

// Migration guide for consumers of the export. Wording mirrors the public docs
// so the notice stays consistent with what customers read there.
const BLOB_EXPORT_DOCS_URL =
  "https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage";

/**
 * Plain-text notice describing the legacy-source deprecation from the
 * consumer's point of view. Intentionally free of internal implementation
 * details (env vars, flags, ticket IDs) — this file lands in the customer's
 * bucket.
 */
export const buildBlobExportDeprecationNotice = (): string =>
  [
    "DEPRECATION NOTICE",
    "==================",
    "",
    'This export includes the "Traces and observations (legacy)" data source. The',
    "legacy traces and observations tables are deprecated and will be removed in a",
    "future release.",
    "",
    'Please switch this integration to the "Enriched observations (recommended)"',
    "export source, which combines observations with their trace attributes in a",
    "single row and offers significantly better export performance. If this export",
    "currently produces both the legacy tables and enriched observations, move to",
    "the enriched-only source to stop writing the deprecated legacy tables.",
    "",
    "Migration guide:",
    BLOB_EXPORT_DOCS_URL,
    "",
  ].join("\n");
