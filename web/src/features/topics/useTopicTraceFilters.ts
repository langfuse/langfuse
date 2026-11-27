import { useMemo } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { z } from "zod";
import useLocalStorage from "@/src/components/useLocalStorage";
import { decodeAndNormalizeFilters } from "@/src/features/filters/hooks/useSidebarFilterState";
import { createTopicTraceRegistry } from "./topic-trace-filters";
import { resolveTopicFacetId } from "./topic-facet-selection";

const columns = [
  ...createTopicTraceRegistry([], [], { traceFields: true }).columns,
];
const snapshotSchema = z.object({
  filter: z.string(),
  search: z.string().nullable(),
});
const snapshotsSchema = z.record(z.string(), snapshotSchema);
const emptySnapshot: FacetFilterSnapshot = { filter: "", search: null };
const emptySnapshots: Record<string, FacetFilterSnapshot> = {};

/**
 * `mapId` scopes the filters to one map: topic IDs belong to the map that created them.
 * `undefined` means the shown map is not known yet; filters read empty and writes are ignored.
 */
export function useTopicTraceFilters(
  projectId: string,
  facets: readonly { facetId: string }[],
  mapId: string | null | undefined,
) {
  const [facetId, setFacetId] = useQueryParam("topicFacet", StringParam);
  const selectedFacetId = resolveTopicFacetId(facets, facetId ?? undefined);
  const [stored, setStored] = useLocalStorage<unknown>(
    "topics-trace-filters-v1",
    emptySnapshots,
  );
  const parsed = snapshotsSchema.safeParse(stored);
  const snapshots = parsed.success ? parsed.data : emptySnapshots;
  const storageKey = JSON.stringify(
    mapId ? [projectId, mapId, selectedFacetId] : [projectId, selectedFacetId],
  );
  const snapshot =
    mapId === undefined
      ? emptySnapshot
      : (snapshots[storageKey] ?? emptySnapshot);
  const filters = useMemo(
    () => decodeAndNormalizeFilters(snapshot.filter, columns),
    [snapshot.filter],
  );

  function updateSnapshot(patch: Partial<FacetFilterSnapshot>) {
    if (!selectedFacetId || mapId === undefined) return;
    setStored((previous: unknown) => {
      const parsedPrevious = snapshotsSchema.safeParse(previous);
      const snapshots = parsedPrevious.success
        ? parsedPrevious.data
        : emptySnapshots;
      const current = snapshots[storageKey] ?? emptySnapshot;
      const next = { ...current, ...patch };
      if (next.filter === current.filter && next.search === current.search)
        return previous;
      return { ...snapshots, [storageKey]: next };
    });
  }

  function selectFacet(nextFacetId: string) {
    if (nextFacetId !== selectedFacetId) setFacetId(nextFacetId);
  }

  return {
    selectedFacetId,
    selectFacet,
    filters,
    setFilters: (filters: FilterState) =>
      updateSnapshot({ filter: encodeFiltersGeneric(filters) }),
    searchQuery: snapshot.search,
    setSearchQuery: (search: string | null) => updateSnapshot({ search }),
  };
}

type FacetFilterSnapshot = z.infer<typeof snapshotSchema>;
