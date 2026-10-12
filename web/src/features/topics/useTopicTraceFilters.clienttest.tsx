import { useState, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  QueryParamProvider,
  type QueryParamAdapterComponent,
} from "use-query-params";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { useTopicTraceFilters } from "./useTopicTraceFilters";

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

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

const sharedSearch = `?${new URLSearchParams({
  topicFacet: "intent",
  filter: encodeFiltersGeneric([topic, assignment]),
  search: "refund policy",
})}`;
const facets = [{ facetId: "intent" }, { facetId: "sentiment" }];

function setup(initialSearch = sharedSearch, projectId = "project") {
  let search = initialSearch;
  let navigate: (search: string) => void = () => {};
  const Adapter: QueryParamAdapterComponent = ({ children }) => {
    const [location, setLocation] = useState({ search: initialSearch });
    search = location.search;
    navigate = (search) => setLocation({ search });
    return children({ location, replace: setLocation, push: setLocation });
  };
  const hook = renderHook(() => useTopicTraceFilters(projectId, facets), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryParamProvider adapter={Adapter} options={{ enableBatching: true }}>
        {children}
      </QueryParamProvider>
    ),
  });
  return {
    ...hook,
    getSearch: () => search,
    back: () => navigate(initialSearch),
  };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("Topics filter URL state", () => {
  it("remembers independent filters and search when switching facets", async () => {
    const { result, getSearch, back } = setup();
    expect(result.current.selectedFacetId).toBe("intent");
    expect(result.current.filters).toEqual([topic, assignment]);
    expect(result.current.searchQuery).toBe("refund policy");

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
    await waitFor(() =>
      expect(result.current.searchQuery).toBe("happy customer"),
    );
    act(() => result.current.selectFacet("intent"));
    await waitFor(() => expect(result.current.selectedFacetId).toBe("intent"));
    expect(result.current.filters).toEqual([topic, assignment]);
    expect(result.current.searchQuery).toBe("refund policy");
    act(() => result.current.selectFacet("sentiment"));
    await waitFor(() =>
      expect(result.current.selectedFacetId).toBe("sentiment"),
    );
    expect(result.current.filters).toEqual([assignment]);
    expect(result.current.searchQuery).toBe("happy customer");
    expect(new URLSearchParams(getSearch()).get("filter")).toBe(
      encodeFiltersGeneric([assignment]),
    );

    act(back);
    await waitFor(() => expect(result.current.selectedFacetId).toBe("intent"));
    expect(result.current.filters).toEqual([topic, assignment]);
  });

  it("applies and clears search and filters together without losing the facet", async () => {
    const { result, getSearch } = setup();
    act(() => {
      result.current.setFilters([topic]);
      result.current.setSearchQuery("invoice");
    });
    await waitFor(() =>
      expect(new URLSearchParams(getSearch()).get("search")).toBe("invoice"),
    );
    expect(result.current.filters).toEqual([topic]);
    expect(result.current.selectedFacetId).toBe("intent");

    act(() => {
      result.current.setFilters([]);
      result.current.setSearchQuery(null);
    });
    await waitFor(() => expect(result.current.searchQuery).toBeNull());
    expect(result.current.filters).toEqual([]);
    expect(result.current.selectedFacetId).toBe("intent");
    expect(new URLSearchParams(getSearch()).get("filter")).toBe("");
  });

  it("restores local state on a fresh visit, isolates projects, and honors explicit URLs", async () => {
    const first = setup("?");
    expect(first.result.current.selectedFacetId).toBe("intent");
    act(() => {
      first.result.current.setFilters([topic]);
      first.result.current.setSearchQuery("invoice");
    });
    await waitFor(() =>
      expect(first.result.current.searchQuery).toBe("invoice"),
    );
    first.unmount();

    const restored = setup("?");
    expect(restored.result.current.filters).toEqual([topic]);
    expect(restored.result.current.searchQuery).toBe("invoice");
    restored.unmount();

    const otherProject = setup("?", "other-project");
    expect(otherProject.result.current.filters).toEqual([]);
    expect(otherProject.result.current.searchQuery).toBeNull();
    otherProject.unmount();

    const shared = setup();
    expect(shared.result.current.filters).toEqual([topic, assignment]);
    expect(shared.result.current.searchQuery).toBe("refund policy");
    shared.unmount();

    const emptyLink = setup("?topicFacet=intent&filter=");
    expect(emptyLink.result.current.filters).toEqual([]);
    expect(emptyLink.result.current.searchQuery).toBeNull();
  });

  it("persists Clear all without resetting other facets", async () => {
    const first = setup();
    act(() => first.result.current.selectFacet("sentiment"));
    await waitFor(() =>
      expect(first.result.current.selectedFacetId).toBe("sentiment"),
    );
    act(() => {
      first.result.current.setFilters([assignment]);
      first.result.current.setSearchQuery("happy");
    });
    await waitFor(() => expect(first.result.current.searchQuery).toBe("happy"));
    act(() => {
      first.result.current.setFilters([]);
      first.result.current.setSearchQuery(null);
    });
    await waitFor(() => expect(first.result.current.searchQuery).toBeNull());
    first.unmount();

    const cleared = setup("?topicFacet=sentiment");
    expect(cleared.result.current.filters).toEqual([]);
    expect(cleared.result.current.searchQuery).toBeNull();
    act(() => cleared.result.current.selectFacet("intent"));
    await waitFor(() =>
      expect(cleared.result.current.selectedFacetId).toBe("intent"),
    );
    expect(cleared.result.current.filters).toEqual([topic, assignment]);
    expect(cleared.result.current.searchQuery).toBe("refund policy");
  });

  it("edits the restored URL after Back instead of reusing a pending edit", async () => {
    const { result, back } = setup();
    act(() => result.current.setFilters([]));
    await waitFor(() => expect(result.current.filters).toEqual([]));
    act(back);
    await waitFor(() =>
      expect(result.current.filters).toEqual([topic, assignment]),
    );
    act(() => result.current.setSearchQuery("updated search"));
    await waitFor(() =>
      expect(result.current.searchQuery).toBe("updated search"),
    );
    expect(result.current.filters).toEqual([topic, assignment]);
  });

  it("ignores malformed cached state", () => {
    localStorage.setItem(
      "topics-trace-filters-v1",
      JSON.stringify({ broken: null }),
    );
    const { result } = setup("?");
    expect(result.current.filters).toEqual([]);
    expect(result.current.searchQuery).toBeNull();
  });
});
