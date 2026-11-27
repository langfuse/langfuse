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
const LEGACY_V1_STORAGE_KEY = "topics-trace-filters-v1";

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

function readLegacyV1Snapshot(
  projectId: string,
  mapId: string | null,
  facetId: string | undefined,
): FacetFilterSnapshot | undefined {
  if (!facetId || typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(LEGACY_V1_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = snapshotsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;
    const legacyKey = JSON.stringify(
      mapId ? [projectId, mapId, facetId] : [projectId, facetId],
    );
    const entry = parsed.data[legacyKey];
    return entry ? { ...entry, facetId } : undefined;
  } catch {
    return undefined;
  }
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
  const storedSnapshot =
    mapId === undefined ? undefined : snapshots[storageKey];
  const needsLegacyFallback =
    mapId !== undefined && storedSnapshot === undefined;
  const legacySnapshot = useMemo(
    () =>
      needsLegacyFallback
        ? readLegacyV1Snapshot(projectId, mapId, selectedFacetId)
        : undefined,
    [needsLegacyFallback, projectId, mapId, selectedFacetId],
  );
  const fromLegacyV1 =
    storedSnapshot === undefined && legacySnapshot !== undefined;
  const snapshot = storedSnapshot ?? legacySnapshot ?? emptySnapshot;

  const fullFacets = useMemo(() => facets.filter(isTopicFilterFacet), [facets]);
  const filters = useMemo(() => {
    const decoded = decodeAndNormalizeFilters(snapshot.filter, columns);
    if (!decoded.some((filter) => filter.column === "topicId")) return decoded;
    const activeFacet = fullFacets.find(
      (facet) => facet.facetId === selectedFacetId,
    );
    if (fromLegacyV1) {
      return activeFacet
        ? rewriteTopicIdFiltersForFacet(decoded, activeFacet, fullFacets)
        : decoded;
    }
    if (snapshot.facetId && snapshot.facetId !== selectedFacetId) {
      const sourceFacet = fullFacets.find(
        (facet) => facet.facetId === snapshot.facetId,
      );
      return sourceFacet
        ? rewriteTopicIdFiltersForFacet(decoded, sourceFacet, fullFacets)
        : decoded.filter((filter) => filter.column !== "topicId");
    }
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
          ? rewriteTopicIdFiltersForFacet([filter], owner, fullFacets)
          : [filter];
      });
    }
    return decoded;
  }, [
    snapshot.filter,
    snapshot.facetId,
    fromLegacyV1,
    fullFacets,
    selectedFacetId,
  ]);

  function updateSnapshot(
    patch: Partial<FacetFilterSnapshot>,
    forceWrite = false,
  ) {
    if (!selectedFacetId || mapId === undefined) return;
    const fallbackCurrent: FacetFilterSnapshot = fromLegacyV1
      ? { filter: encodeFiltersGeneric(filters), search: snapshot.search }
      : emptySnapshot;
    setStored((previous: unknown) => {
      const parsedPrevious = snapshotsSchema.safeParse(previous);
      const snapshots = parsedPrevious.success
        ? parsedPrevious.data
        : emptySnapshots;
      const current = snapshots[storageKey] ?? fallbackCurrent;
      const next: FacetFilterSnapshot = { ...current, ...patch };
      if (next.facetId === undefined) delete next.facetId;
      if (
        !forceWrite &&
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
      const rewritten = rewriteTopicIdFiltersForFacet(
        filters,
        currentFacet,
        fullFacets,
      );
      updateSnapshot(
        {
          filter: encodeFiltersGeneric(rewritten),
          facetId: undefined,
        },
        true,
      );
    } else if (fromLegacyV1) {
      updateSnapshot(
        {
          filter: encodeFiltersGeneric(filters),
          search: snapshot.search,
          facetId: undefined,
        },
        true,
      );
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
