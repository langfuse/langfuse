import { useRef } from "react";
import { StringParam, useQueryParams } from "use-query-params";
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
  const [query, setQuery] = useQueryParams({
    topicFacet: StringParam,
    filter: StringParam,
    search: StringParam,
  });
  const selectedFacetId = resolveTopicFacetId(
    facets,
    query.topicFacet ?? undefined,
  );
  const [stored, setStored] = useLocalStorage<unknown>(
    "topics-trace-filters-v1",
    emptySnapshots,
  );
  const parsed = snapshotsSchema.safeParse(stored);
  const snapshots = parsed.success ? parsed.data : emptySnapshots;
  const storageKey = JSON.stringify([projectId, selectedFacetId]);
  const hasUrlState = query.filter != null || query.search != null;
  const snapshot = hasUrlState
    ? { filter: query.filter ?? "", search: query.search ?? null }
    : (snapshots[storageKey] ?? emptySnapshot);

  // Compose search/filter edits emitted in one event before the URL batch commits.
  // Query identity changes on navigation, including Back to an earlier URL.
  const pending = useRef<{
    query: typeof query;
    projectId: string;
    facetId: string | undefined;
    snapshot: FacetFilterSnapshot;
  } | null>(null);

  function currentSnapshot() {
    return pending.current?.query === query &&
      pending.current.projectId === projectId &&
      pending.current.facetId === selectedFacetId
      ? pending.current.snapshot
      : snapshot;
  }

  function persist(updates: Record<string, FacetFilterSnapshot>) {
    setStored((previous: unknown) => {
      const parsedPrevious = snapshotsSchema.safeParse(previous);
      return {
        ...(parsedPrevious.success ? parsedPrevious.data : {}),
        ...updates,
      };
    });
  }

  function applySnapshot(facetId: string, next: FacetFilterSnapshot) {
    pending.current = { query, projectId, facetId, snapshot: next };
    setQuery({
      topicFacet: facetId,
      // An explicit empty filter keeps cleared/shared URLs independent of local defaults.
      filter: next.filter,
      search: next.search ?? undefined,
    });
  }

  function updateSnapshot(patch: Partial<FacetFilterSnapshot>) {
    if (!selectedFacetId) return;
    const next = { ...currentSnapshot(), ...patch };
    persist({ [storageKey]: next });
    applySnapshot(selectedFacetId, next);
  }

  function selectFacet(nextFacetId: string) {
    if (nextFacetId === selectedFacetId) return;
    const nextKey = JSON.stringify([projectId, nextFacetId]);
    const next = snapshots[nextKey] ?? emptySnapshot;
    if (selectedFacetId) persist({ [storageKey]: currentSnapshot() });
    applySnapshot(nextFacetId, next);
  }

  return {
    selectedFacetId,
    selectFacet,
    filters: decodeAndNormalizeFilters(snapshot.filter, columns),
    setFilters: (filters: FilterState) =>
      updateSnapshot({ filter: encodeFiltersGeneric(filters) }),
    searchQuery: snapshot.search,
    setSearchQuery: (search: string | null) => updateSnapshot({ search }),
  };
}

type FacetFilterSnapshot = z.infer<typeof snapshotSchema>;
