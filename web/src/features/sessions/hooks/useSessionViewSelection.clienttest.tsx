import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  decodeFiltersGeneric,
  SessionViewInputSchema,
  sessionTraceFilterSchema,
} from "@langfuse/shared";
import { useSessionViewSelection } from "./useSessionViewSelection";
import { type RouterOutputs } from "@/src/utils/api";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  setQuery: vi.fn(),
  pinnedIds: ["messages", "saved"],
  viewExists: true,
  router: { asPath: "/project/project/sessions/session" },
  cachedViews: undefined as RouterOutputs["sessionViews"]["list"] | undefined,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "user" } },
  }),
}));
vi.mock("next/router", () => ({ useRouter: () => mocks.router }));
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
  projectId: "project",
  name: "Saved view",
  createdBy: "user",
  createdByUser: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  isPinnedByDefaultForProject: false,
  canEdit: true,
  filters: [],
  viewMode: "list" as const,
  unmatchedTraces: "hide" as const,
};
vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      sessionViews: {
        list: {
          setData: (
            _input: { projectId: string },
            update: (
              current: RouterOutputs["sessionViews"]["list"] | undefined,
            ) => RouterOutputs["sessionViews"]["list"] | undefined,
          ) => {
            mocks.cachedViews = update(mocks.cachedViews ?? [view]);
          },
        },
      },
    }),
    sessionViews: {
      list: {
        useQuery: () => ({
          data: mocks.viewExists ? (mocks.cachedViews ?? [view]) : [],
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
  sessionStorage.clear();
  window.history.replaceState(null, "");
  mocks.router.asPath = "/project/project/sessions/session";
  mocks.query = {};
  mocks.pinnedIds = ["messages", "saved"];
  mocks.viewExists = true;
  mocks.cachedViews = undefined;
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

it("keeps a duplicated view selected before the list refetch completes", () => {
  const { result, rerender } = setup();
  act(() => result.current.selectSaved({ ...view, id: "duplicate" }));
  expect(result.current.selectedId).toBe("duplicate");
  expect(result.current.isLoading).toBe(false);
  mocks.query = { sessionView: "list", tracesWithoutMatches: "hide" };
  rerender();
  expect(result.current.selectedId).toBe("duplicate");
  expect(result.current.configuration.viewMode).toBe("list");
});

it("keeps an edited view selected when its new URL settings arrive", () => {
  const { result, rerender } = setup();
  act(() => result.current.select("saved"));
  mocks.query = { sessionView: "list", tracesWithoutMatches: "hide" };
  rerender();
  act(() =>
    result.current.selectSaved({
      ...view,
      viewMode: "conversational",
      unmatchedTraces: "show",
    }),
  );
  expect(result.current.configuration.viewMode).toBe("conversational");
  mocks.query = {};
  rerender();
  expect(result.current.selectedId).toBe("saved");
  expect(result.current.configuration.viewMode).toBe("conversational");
  expect(result.current.configuration.unmatchedTraces).toBe("show");
  expect(result.current.draft).toBeNull();
});

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

it("keeps a newer draft when an earlier save completes", () => {
  const { result } = setup();
  act(() => result.current.customize(view));
  const submittedDraft = result.current.draft;
  const completeSave = result.current.saveDraft;
  const newerDraft = { ...view, viewMode: "conversational" as const };
  act(() => result.current.customize(newerDraft));
  mocks.setQuery.mockClear();
  act(() => completeSave(view, submittedDraft));
  expect(result.current.selectedId).toBe("unsaved");
  expect(result.current.draft).toEqual(newerDraft);
  expect(mocks.setQuery).not.toHaveBeenCalled();
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

it("restores Messages on Back across sessions without applying the later session's remembered view", () => {
  window.history.replaceState({ key: "session-a" }, "");
  mocks.router.asPath = "/project/project/sessions/a";
  const { result, rerender } = renderHook(
    ({ sessionId }) =>
      useSessionViewSelection({
        projectId: "project",
        sessionId,
        enabled: true,
      }),
    { initialProps: { sessionId: "a" } },
  );
  window.history.replaceState({ key: "session-b" }, "");
  mocks.router.asPath = "/project/project/sessions/b";
  rerender({ sessionId: "b" });
  act(() => result.current.select("saved"));
  expect(result.current.selectedId).toBe("saved");

  window.history.replaceState({ key: "session-a" }, "");
  mocks.router.asPath = "/project/project/sessions/a";
  mocks.setQuery.mockClear();
  rerender({ sessionId: "a" });
  expect(result.current.selectedId).toBe("messages");
  expect(mocks.setQuery).not.toHaveBeenCalled();
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
