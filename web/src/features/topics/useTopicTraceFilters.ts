import { useMemo } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { z } from "zod";
import useLocalStorage from "@/src/components/useLocalStorage";
import { decodeAndNormalizeFilters } from "@/src/features/filters/hooks/useSidebarFilterState";
import { orderedFacetTopics } from "./facet-topics";
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
  /** Facet active when shorthand `topicId` filters were stored, for URL/history navigation. */
  facetId: z.string().optional(),
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

  const fullFacets = useMemo(() => facets.filter(isTopicFilterFacet), [facets]);
  const filters = useMemo(() => {
    const decoded = decodeAndNormalizeFilters(snapshot.filter, columns);
    if (!decoded.some((filter) => filter.column === "topicId")) return decoded;
    if (snapshot.facetId && snapshot.facetId !== selectedFacetId) {
      const sourceFacet = fullFacets.find(
        (facet) => facet.facetId === snapshot.facetId,
      );
      return sourceFacet
        ? rewriteTopicIdFiltersForFacet(decoded, sourceFacet)
        : decoded.filter((filter) => filter.column !== "topicId");
    }
    const activeFacet = fullFacets.find(
      (facet) => facet.facetId === selectedFacetId,
    );
    if (activeFacet && fullFacets.length > 1) {
      const activeTopicIds = new Set(
        orderedFacetTopics(activeFacet).map((topic) => topic.id),
      );
      return decoded.flatMap((filter) => {
        if (filter.column !== "topicId" || filter.type !== "stringOptions")
          return [filter];
        if (filter.value.every((id) => activeTopicIds.has(id))) return [filter];
        const owner = fullFacets.find(
          (facet) =>
            facet.facetId !== activeFacet.facetId &&
            filter.value.some((id) =>
              orderedFacetTopics(facet).some((topic) => topic.id === id),
            ),
        );
        return owner
          ? rewriteTopicIdFiltersForFacet([filter], owner)
          : [filter];
      });
    }
    return decoded;
  }, [snapshot.filter, snapshot.facetId, fullFacets, selectedFacetId]);

  function updateSnapshot(patch: Partial<FacetFilterSnapshot>) {
    if (!selectedFacetId || mapId === undefined) return;
    setStored((previous: unknown) => {
      const parsedPrevious = snapshotsSchema.safeParse(previous);
      const snapshots = parsedPrevious.success
        ? parsedPrevious.data
        : emptySnapshots;
      const current = snapshots[storageKey] ?? emptySnapshot;
      const next: FacetFilterSnapshot = { ...current, ...patch };
      if (next.facetId === undefined) delete next.facetId;
      if (
        next.filter === current.filter &&
        next.search === current.search &&
        next.facetId === current.facetId
      )
        return previous;
      return { ...snapshots, [storageKey]: next };
    });
  }

  function selectFacet(nextFacetId: string) {
    if (nextFacetId === selectedFacetId) return;
    const currentFacet = fullFacets.find(
      (facet) => facet.facetId === selectedFacetId,
    );
    if (currentFacet && filters.some((filter) => filter.column === "topicId")) {
      const rewritten = rewriteTopicIdFiltersForFacet(filters, currentFacet);
      updateSnapshot({
        filter: encodeFiltersGeneric(rewritten),
        facetId: undefined,
      });
    }
    setFacetId(nextFacetId);
  }

  return {
    selectedFacetId,
    selectFacet,
    filters,
    setFilters: (nextFilters: FilterState) =>
      updateSnapshot({
        filter: encodeFiltersGeneric(nextFilters),
        facetId: nextFilters.some((filter) => filter.column === "topicId")
          ? selectedFacetId
          : undefined,
      }),
    searchQuery: snapshot.search,
    setSearchQuery: (search: string | null) => updateSnapshot({ search }),
  };
}

type FacetFilterSnapshot = z.infer<typeof snapshotSchema>;
