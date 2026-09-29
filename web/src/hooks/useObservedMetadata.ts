// Bridge between a table and the observed-metadata store: the recorder samples
// the currently visible rows' metadata into the persisted per-project key map
// (once per fetch — the rows identity only changes when new data lands), and
// the readers project that map into the option-map entries both suggestion
// surfaces look up (fns/observedMetadata/metadataPaths.ts). Split in two
// because EventsTable derives its observed options before the table data hook
// runs, while the recorder needs the loaded rows.

import { useEffect, useMemo } from "react";
import {
  collectMetadataPathTypes,
  METADATA_SAMPLE_ROWS,
  observedMetadataOptions,
  type MetadataSuggestion,
  type StoredKeyInfo,
} from "@/src/fns/observedMetadata/metadataPaths";
import { useObservedMetadataStore } from "@/src/stores/observedMetadataStore";

/**
 * The project's persisted metadata key→info map (type + sample values), or
 * undefined when nothing has been observed yet. Stable identity between store
 * writes.
 */
export function useObservedMetadataPaths(
  projectId: string,
): Record<string, StoredKeyInfo> | undefined {
  return useObservedMetadataStore((s) => s.byProject[projectId]?.paths);
}

/**
 * A table's facet options with the project's observed-metadata suggestions
 * merged in: keys under `metadata`, each key's sample values under
 * `metadata.<key>`. The one-line opt-in for a sidebar whose `metadata` facet
 * filters OBSERVATION metadata — a surface whose column is a different entity
 * (session metadata) must not adopt it, its key space differs.
 */
export function useFacetOptionsWithObservedMetadata<
  T extends Record<string, unknown>,
>(projectId: string, options: T): T & Record<string, MetadataSuggestion[]> {
  const paths = useObservedMetadataPaths(projectId);
  return useMemo(
    () => ({ ...options, ...observedMetadataOptions(paths) }),
    [options, paths],
  );
}

/**
 * Analyze the visible rows' metadata (JSON-encoded string or null, per
 * `MetadataDomainClient`) and union the observed top-level keys into the
 * project's persisted map. Samples the same first rows as the AI-context
 * path; the store skips the write when nothing changed, so re-running on
 * each fetch settles immediately. Absent rows are a no-op, which is how a
 * table opts out.
 */
export function useObservedMetadataRecorder({
  projectId,
  rows,
}: {
  projectId: string;
  rows: ReadonlyArray<{ metadata?: unknown }> | undefined;
}): void {
  const recordPaths = useObservedMetadataStore((s) => s.actions.recordPaths);
  useEffect(() => {
    if (rows === undefined || rows.length === 0) return;
    const collected = collectMetadataPathTypes(
      rows.slice(0, METADATA_SAMPLE_ROWS).map((r) => r.metadata),
    );
    if (collected.size > 0) recordPaths(projectId, collected);
  }, [rows, projectId, recordPaths]);
}
