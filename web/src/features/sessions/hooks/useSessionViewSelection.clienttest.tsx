import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  decodeFiltersGeneric,
  SessionViewInputSchema,
  sessionTraceFilterSchema,
} from "@langfuse/shared";
import { useSessionViewSelection } from "./useSessionViewSelection";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  setQuery: vi.fn(),
  pinnedIds: ["messages", "saved"],
  viewExists: true,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "user" } },
  }),
}));
vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParams: () => [mocks.query, mocks.setQuery],
}));
vi.mock("@/src/components/useSessionStorage", async () => {
  const { useState } = await import("react");
  return {
    default: function useSessionStorage() {
      return useState({});
    },
  };
});
const view = {
  id: "saved",
  filters: [],
  viewMode: "list" as const,
  unmatchedTraces: "hide" as const,
  isSupported: true,
};
vi.mock("@/src/utils/api", () => ({
  api: {
    sessionViews: {
      list: {
        useQuery: () => ({
          data: mocks.viewExists ? [view] : [],
          isSuccess: true,
        }),
      },
      preferences: {
        useQuery: () => ({
          data: { pinnedViewIds: mocks.pinnedIds },
          isSuccess: true,
        }),
      },
    },
  },
}));

beforeEach(() => {
  mocks.query = {};
  mocks.pinnedIds = ["messages", "saved"];
  mocks.viewExists = true;
  mocks.setQuery.mockClear();
});

const setup = () =>
  renderHook(() =>
    useSessionViewSelection({
      projectId: "project",
      sessionId: "session",
      enabled: true,
    }),
  );

it.each(["messages", ""])(
  "switches away from an unpinned active view to %s without creating a draft",
  (nextId) => {
    const { result, rerender } = setup();
    act(() => result.current.select("saved"));
    expect(result.current.configuration.viewMode).toBe("list");
    act(() => result.current.select(nextId));
    mocks.pinnedIds = nextId ? [nextId] : [];
    rerender();
    expect(result.current.selectedId).toBe(nextId);
    expect(result.current.draft).toBeNull();
    expect(result.current.configuration.filters).toEqual([]);
  },
);

it("does not change selection when an inactive view is unpinned", () => {
  const { result, rerender } = setup();
  mocks.pinnedIds = ["messages"];
  rerender();
  expect(result.current.selectedId).toBe("messages");
  expect(result.current.draft).toBeNull();
});

it("retains only an explicitly created draft when switching tabs", () => {
  const { result } = setup();
  act(() => result.current.customize(view));
  act(() => result.current.select("messages"));
  expect(result.current.draft).toEqual(view);
  act(() => result.current.select("unsaved"));
  expect(result.current.selectedId).toBe("unsaved");
  expect(result.current.configuration).toEqual(view);
});

it("saving clears the draft even while URL state is stale", () => {
  const { result, rerender } = setup();
  act(() => result.current.customize(view));
  act(() => result.current.saveDraft(view));
  rerender();
  expect(result.current.selectedId).toBe("saved");
  expect(result.current.draft).toBeNull();
});

it("restores a matching saved view from shared-link configuration only once", () => {
  mocks.query = { sessionView: "list", tracesWithoutMatches: "hide" };
  const { result, rerender } = setup();
  expect(result.current.selectedId).toBe("saved");
  act(() => result.current.select("messages"));
  rerender();
  expect(result.current.selectedId).toBe("messages");
  expect(result.current.draft).toBeNull();
});

it("shows the empty state when no views are pinned", () => {
  mocks.pinnedIds = [];
  const { result } = setup();
  expect(result.current.selectedId).toBe("");
  expect(result.current.draft).toBeNull();
});

it.each([true, false])(
  "recovers after the selected view is deleted (Messages pinned: %s)",
  (messagesPinned) => {
    const { result, rerender } = setup();
    act(() => result.current.select("saved"));
    mocks.pinnedIds = messagesPinned ? ["messages"] : [];
    mocks.viewExists = false;
    rerender();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.selectedId).toBe(messagesPinned ? "messages" : "");
    expect(result.current.configuration.viewMode).toBe("conversational");
  },
);

it("restores selection and configuration on Back and Forward", () => {
  const { result, rerender } = setup();
  act(() => result.current.select("saved"));
  mocks.query = { sessionView: "list", tracesWithoutMatches: "hide" };
  rerender();
  expect(result.current.selectedId).toBe("saved");

  act(() => result.current.select("messages"));
  mocks.query = {};
  rerender();
  expect(result.current.selectedId).toBe("messages");

  mocks.query = { sessionView: "list", tracesWithoutMatches: "hide" };
  rerender();
  expect(result.current.selectedId).toBe("saved");
  expect(result.current.configuration.viewMode).toBe("list");
  expect(result.current.configuration.unmatchedTraces).toBe("hide");

  mocks.query = {};
  rerender();
  expect(result.current.selectedId).toBe("messages");
  expect(result.current.configuration.viewMode).toBe("conversational");
  expect(result.current.configuration.unmatchedTraces).toBe("show");
});

it("restores an unpinned shared-link view as a draft on navigation", () => {
  const { result, rerender } = setup();
  mocks.pinnedIds = ["messages"];
  mocks.query = { sessionView: "list", tracesWithoutMatches: "hide" };
  rerender();
  expect(result.current.selectedId).toBe("unsaved");
  expect(result.current.configuration.viewMode).toBe("list");
});

it.each(["any of", "none of"] as const)(
  "creates a saveable name-shortcut draft (%s) that survives URL restoration",
  (operator) => {
    const { result } = setup();
    act(() => result.current.select("saved"));
    act(() => result.current.filterObservationByName("generation", operator));
    expect(result.current.selectedId).toBe("unsaved");
    const configuration = result.current.configuration;
    expect(
      SessionViewInputSchema.safeParse({
        projectId: "project",
        name: "Filtered view",
        ...configuration,
      }).success,
    ).toBe(true);
    const url = mocks.setQuery.mock.lastCall?.[0];
    expect(
      sessionTraceFilterSchema.parse(decodeFiltersGeneric(url.traceFilter)),
    ).toEqual(configuration.filters);
    act(() => result.current.select("messages"));
    act(() => result.current.select("unsaved"));
    expect(result.current.configuration).toEqual(configuration);
  },
);
