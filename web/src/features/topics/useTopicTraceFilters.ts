import { useMemo } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { z } from "zod";
import useLocalStorage from "@/src/components/useLocalStorage";
import { decodeAndNormalizeFilters } from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  createTopicTraceRegistry,
  rewriteTopicIdFiltersForFacet,
  type TopicFilterFacet,
} from "./topic-trace-filters";
import { resolveTopicFacetId } from "./topic-facet-selection";

const columns = [
  ...createTopicTraceRegistry([], [], {
    traceFields: true,
    crossFacetTopics: true,
  }).columns,
];
const snapshotSchema = z.object({
  filter: z.string(),
  search: z.string().nullable(),
});
const snapshotsSchema = z.record(z.string(), snapshotSchema);
const emptySnapshot: FacetFilterSnapshot = { filter: "", search: null };
const emptySnapshots: Record<string, FacetFilterSnapshot> = {};

type FilterableFacetInput = { facetId: string } | TopicFilterFacet;

function isTopicFilterFacet(
  facet: FilterableFacetInput | undefined,
): facet is TopicFilterFacet {
  return Boolean(
    facet &&
    "name" in facet &&
    typeof facet.name === "string" &&
    "topics" in facet &&
    Array.isArray(facet.topics),
  );
}

/**
 * `mapId` scopes the filters to one rule or snapshot map so active filters
 * persist as the user switches between facets of that map.
 * `undefined` means the shown map is not known yet; filters read empty and writes are ignored.
 */
export function useTopicTraceFilters(
  projectId: string,
  facets: readonly FilterableFacetInput[],
  mapId: string | null | undefined,
) {
  const [facetId, setFacetId] = useQueryParam("topicFacet", StringParam);
  const selectedFacetId = resolveTopicFacetId(facets, facetId ?? undefined);
  const [stored, setStored] = useLocalStorage<unknown>(
    "topics-trace-filters-v2",
    emptySnapshots,
  );
  const parsed = snapshotsSchema.safeParse(stored);
  const snapshots = parsed.success ? parsed.data : emptySnapshots;
  const storageKey = JSON.stringify(mapId ? [projectId, mapId] : [projectId]);
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
    if (nextFacetId === selectedFacetId) return;
    const currentFacet = facets.find(
      (facet) => facet.facetId === selectedFacetId,
    );
    if (
      isTopicFilterFacet(currentFacet) &&
      filters.some((filter) => filter.column === "topicId")
    ) {
      const rewritten = rewriteTopicIdFiltersForFacet(filters, currentFacet);
      updateSnapshot({ filter: encodeFiltersGeneric(rewritten) });
    }
    setFacetId(nextFacetId);
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
