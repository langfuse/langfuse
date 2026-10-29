import { useMemo } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { z } from "zod";
import useLocalStorage from "@/src/components/useLocalStorage";
import { decodeAndNormalizeFilters } from "@/src/features/filters/hooks/useSidebarFilterState";
import { createTopicTraceRegistry } from "./topic-trace-filters";
import { resolveTopicFacetId } from "./topic-facet-selection";

const columns = [...createTopicTraceRegistry([]).columns];
const snapshotSchema = z.object({
  filter: z.string(),
  search: z.string().nullable(),
});
const snapshotsSchema = z.record(z.string(), snapshotSchema);
const emptySnapshot: FacetFilterSnapshot = { filter: "", search: null };
const emptySnapshots: Record<string, FacetFilterSnapshot> = {};

export function useTopicTraceFilters(
  projectId: string,
  facets: readonly { facetId: string }[],
) {
  const [facetId, setFacetId] = useQueryParam("topicFacet", StringParam);
  const selectedFacetId = resolveTopicFacetId(facets, facetId ?? undefined);
  const [stored, setStored] = useLocalStorage<unknown>(
    "topics-trace-filters-v1",
    emptySnapshots,
  );
  const parsed = snapshotsSchema.safeParse(stored);
  const snapshots = parsed.success ? parsed.data : emptySnapshots;
  const storageKey = JSON.stringify([projectId, selectedFacetId]);
  const snapshot = snapshots[storageKey] ?? emptySnapshot;
  const filters = useMemo(
    () => decodeAndNormalizeFilters(snapshot.filter, columns),
    [snapshot.filter],
  );

  function updateSnapshot(patch: Partial<FacetFilterSnapshot>) {
    if (!selectedFacetId) return;
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
