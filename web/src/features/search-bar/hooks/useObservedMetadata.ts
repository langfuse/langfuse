// Bridge between the events table and the observed-metadata store: the
// recorder samples the currently visible rows' metadata into the persisted
// per-project key map (once per fetch — the rows identity only changes when
// new data lands), and the reader selects that project's map for merging into
// the bar's observed options (lib/metadata-paths.ts withMetadataPathOptions).
// Split in two because EventsTable derives its observed options before the
// table data hook runs, while the recorder needs the loaded rows.

import { useEffect } from "react";
import {
  collectMetadataPathTypes,
  METADATA_SAMPLE_ROWS,
  type StoredKeyInfo,
} from "../lib/metadata-paths";
import { useObservedMetadataStore } from "../store/observedMetadataStore";

/**
 * The project's persisted metadata key→info map (type + sample values), or
 * undefined when disabled or nothing has been observed yet. Stable identity
 * between store writes.
 */
export function useObservedMetadataPaths(
  projectId: string,
  enabled: boolean,
): Record<string, StoredKeyInfo> | undefined {
  return useObservedMetadataStore((s) =>
    enabled ? s.byProject[projectId]?.paths : undefined,
  );
}

/**
 * Analyze the visible rows' metadata (JSON-encoded string or null, per
 * `MetadataDomainClient`) and union the observed top-level keys into the
 * project's persisted map. Samples the same first rows as the AI-context
 * path; the store skips the write when nothing changed, so re-running on
 * each fetch settles immediately.
 */
export function useObservedMetadataRecorder({
  projectId,
  rows,
  enabled,
}: {
  projectId: string;
  rows: ReadonlyArray<{ metadata?: unknown }> | undefined;
  enabled: boolean;
}): void {
  const recordPaths = useObservedMetadataStore((s) => s.actions.recordPaths);
  useEffect(() => {
    if (!enabled || rows === undefined || rows.length === 0) return;
    const collected = collectMetadataPathTypes(
      rows.slice(0, METADATA_SAMPLE_ROWS).map((r) => r.metadata),
    );
    if (collected.size > 0) recordPaths(projectId, collected);
  }, [enabled, rows, projectId, recordPaths]);
}
