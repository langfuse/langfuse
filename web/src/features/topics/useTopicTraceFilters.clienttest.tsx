import { useState, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  QueryParamProvider,
  type QueryParamAdapterComponent,
} from "use-query-params";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { useTopicTraceFilters } from "./useTopicTraceFilters";

const topic: FilterState[number] = {
  column: "topicId",
  type: "stringOptions",
  operator: "any of",
  value: ["billing"],
};
const assignment: FilterState[number] = {
  column: "assignment",
  type: "stringOptions",
  operator: "any of",
  value: ["assigned"],
};
const facets = [{ facetId: "intent" }, { facetId: "sentiment" }];

function setup(
  initialSearch = "",
  projectId = "project",
  ...map: [mapId?: string | null]
) {
  // An explicit undefined means the shown map is not known yet; omitted means no map.
  const mapId = map.length > 0 ? map[0] : null;
  let search = initialSearch;
  let navigate: (search: string) => void = () => {};
  const Adapter: QueryParamAdapterComponent = ({ children }) => {
    const [location, setLocation] = useState({ search: initialSearch });
    search = location.search;
    navigate = (search) => setLocation({ search });
    return children({ location, replace: setLocation, push: setLocation });
  };
  const hook = renderHook(
    () => useTopicTraceFilters(projectId, facets, mapId),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryParamProvider
          adapter={Adapter}
          options={{ enableBatching: true }}
        >
          {children}
        </QueryParamProvider>
      ),
    },
  );
  return {
    ...hook,
    getSearch: () => search,
    back: () => navigate(initialSearch),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Topics facet-local filters", () => {
  it("remembers independent filters and search when switching facets and navigating Back", async () => {
    const { result, getSearch, back } = setup();
    act(() => {
      result.current.setFilters([topic]);
      result.current.setSearchQuery("invoice");
    });
    expect(result.current.filters).toEqual([topic]);
    expect(result.current.searchQuery).toBe("invoice");
    expect(getSearch()).toBe("");

    act(() => result.current.selectFacet("sentiment"));
    await waitFor(() =>
      expect(result.current.selectedFacetId).toBe("sentiment"),
    );
    expect(result.current.filters).toEqual([]);
    expect(result.current.searchQuery).toBeNull();
    act(() => {
      result.current.setFilters([assignment]);
      result.current.setSearchQuery("happy customer");
    });
    expect(result.current.filters).toEqual([assignment]);
    expect(result.current.searchQuery).toBe("happy customer");
    expect(new URLSearchParams(getSearch()).get("topicFacet")).toBe(
      "sentiment",
    );
    expect(new URLSearchParams(getSearch()).has("filter")).toBe(false);
    expect(new URLSearchParams(getSearch()).has("search")).toBe(false);

    act(back);
    await waitFor(() => expect(result.current.selectedFacetId).toBe("intent"));
    expect(result.current.filters).toEqual([topic]);
    expect(result.current.searchQuery).toBe("invoice");
    act(() => result.current.selectFacet("sentiment"));
    await waitFor(() =>
      expect(result.current.selectedFacetId).toBe("sentiment"),
    );
    expect(result.current.filters).toEqual([assignment]);
    expect(result.current.searchQuery).toBe("happy customer");
  });

  it("keeps a topic filter on the map it was picked on", () => {
    const first = setup("", "project", "map-a");
    act(() => first.result.current.setFilters([topic]));
    first.unmount();
    // Topic IDs belong to one map; another map of the same facet starts empty.
    const other = setup("", "project", "map-b");
    expect(other.result.current.filters).toEqual([]);
    other.unmount();
    expect(setup("", "project", "map-a").result.current.filters).toEqual([
      topic,
    ]);
  });

  it("reads empty filters and keeps no writes until the shown map is known", () => {
    const known = setup("", "project", "map-a");
    act(() => known.result.current.setFilters([topic]));
    known.unmount();
    const pending = setup("", "project", undefined);
    expect(pending.result.current.filters).toEqual([]);
    act(() => pending.result.current.setFilters([assignment]));
    expect(pending.result.current.filters).toEqual([]);
    pending.unmount();
    expect(setup("", "project", "map-a").result.current.filters).toEqual([
      topic,
    ]);
  });

  it("restores local state on a fresh visit, isolates projects and ignores URL filters", () => {
    const first = setup();
    act(() => {
      first.result.current.setFilters([topic]);
      first.result.current.setSearchQuery("invoice");
    });
    first.unmount();
    const restored = setup();
    expect(restored.result.current.filters).toEqual([topic]);
    expect(restored.result.current.searchQuery).toBe("invoice");
    restored.unmount();
    const otherProject = setup("", "other-project");
    expect(otherProject.result.current.filters).toEqual([]);
    expect(otherProject.result.current.searchQuery).toBeNull();
    otherProject.unmount();

    const url = `?${new URLSearchParams({
      topicFacet: "intent",
      filter: encodeFiltersGeneric([assignment]),
      search: "URL search",
    })}`;
    const withUrl = setup(url);
    expect(withUrl.result.current.filters).toEqual([topic]);
    expect(withUrl.result.current.searchQuery).toBe("invoice");
    act(() => {
      withUrl.result.current.setFilters([]);
      withUrl.result.current.setSearchQuery("local search");
    });
    expect(withUrl.getSearch()).toBe(url);
    expect(withUrl.result.current.filters).toEqual([]);
    expect(withUrl.result.current.searchQuery).toBe("local search");
  });

  it("persists clearing both fields in one event without resetting other facets", async () => {
    const first = setup();
    act(() => {
      first.result.current.setFilters([topic]);
      first.result.current.setSearchQuery("invoice");
    });
    act(() => first.result.current.selectFacet("sentiment"));
    await waitFor(() =>
      expect(first.result.current.selectedFacetId).toBe("sentiment"),
    );
    act(() => {
      first.result.current.setFilters([assignment]);
      first.result.current.setSearchQuery("happy");
    });
    act(() => {
      first.result.current.setFilters([]);
      first.result.current.setSearchQuery(null);
    });
    expect(first.result.current.filters).toEqual([]);
    expect(first.result.current.searchQuery).toBeNull();
    first.unmount();

    const cleared = setup("?topicFacet=sentiment");
    expect(cleared.result.current.filters).toEqual([]);
    expect(cleared.result.current.searchQuery).toBeNull();
    act(() => cleared.result.current.selectFacet("intent"));
    await waitFor(() =>
      expect(cleared.result.current.selectedFacetId).toBe("intent"),
    );
    expect(cleared.result.current.filters).toEqual([topic]);
    expect(cleared.result.current.searchQuery).toBe("invoice");
  });

  it("does not write storage or URL for unchanged filters", () => {
    const { result, getSearch } = setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    act(() => result.current.setFilters(result.current.filters));
    expect(setItem).not.toHaveBeenCalled();
    expect(getSearch()).toBe("");
  });

  it("ignores malformed cached state", () => {
    localStorage.setItem(
      "topics-trace-filters-v1",
      JSON.stringify({ broken: null }),
    );
    const { result } = setup();
    expect(result.current.filters).toEqual([]);
    expect(result.current.searchQuery).toBeNull();
  });
});
