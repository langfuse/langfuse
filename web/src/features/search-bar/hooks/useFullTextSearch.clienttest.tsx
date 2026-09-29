import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PeekTableStateProvider,
  usePeekTableState,
} from "@/src/components/table/peek/contexts/PeekTableStateContext";
import { useFullTextSearch } from "./useFullTextSearch";

const h = vi.hoisted(() => ({
  scope: ["id", "input"],
  setScope: vi.fn(),
}));

vi.mock("use-query-params", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useQueryParam: (key: string) =>
    key === "searchType" ? [h.scope, h.setScope] : ["refund", vi.fn()],
}));

function setup(owner: string, allowed?: boolean) {
  const hook = renderHook(
    ({ allowed }: { allowed?: boolean }) => ({
      ...useFullTextSearch({ tableAllowsFullTextSearch: allowed }),
      peek: usePeekTableState(),
    }),
    {
      initialProps: { allowed },
      wrapper: owner === "peek" ? PeekTableStateProvider : undefined,
    },
  );
  act(() => {
    hook.result.current.peek?.setTableState((state) => ({
      ...state,
      search: { query: "refund", type: h.scope },
    }));
  });
  return hook;
}

describe.each(["URL", "peek"])("useFullTextSearch %s scope policy", (owner) => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.scope = ["id", "input"];
  });

  it("normalizes scope changes using the disabled full-text policy", () => {
    const { result } = setup(owner, false);
    act(() => result.current.setSearchType(["id", "output"]));

    if (owner === "peek") {
      expect(result.current.peek?.tableState.search).toEqual({
        query: "refund",
        type: ["id"],
      });
    } else {
      expect(h.setScope).toHaveBeenCalledWith(undefined);
    }
    expect(result.current.searchType).toEqual(["id"]);
    expect(result.current.searchQuery).toBe("refund");
  });

  it("removes unsupported scopes when instance config resolves after restoration", () => {
    const { result, rerender } = setup(owner);
    expect(result.current.searchType).toEqual(["id", "input"]);
    expect(h.setScope).not.toHaveBeenCalled();

    rerender({ allowed: false });

    expect(result.current.searchType).toEqual(["id"]);
    expect(result.current.searchQuery).toBe("refund");
  });

  it("preserves supported scopes when full-text search is enabled", () => {
    const { result } = setup(owner);
    expect(result.current.searchType).toEqual(["id", "input"]);
    act(() => result.current.setSearchType(["id", "content"]));

    if (owner === "peek") {
      expect(result.current.peek?.tableState.search).toEqual({
        query: "refund",
        type: ["id", "content"],
      });
    } else {
      expect(h.setScope).toHaveBeenCalledWith(["id", "content"]);
    }
  });
});

it("composes peek filter, sorting, and search updates in one event", () => {
  const { result } = setup("peek");
  act(() => {
    result.current.peek?.setTableState((state) => ({
      ...state,
      filters: [
        { column: "name", type: "string", operator: "=", value: "checkout" },
      ],
      sorting: { column: "timestamp", order: "ASC" },
    }));
    result.current.setSearchType(["id", "output"]);
    result.current.setSearchQuery("response");
  });
  expect(result.current.peek?.tableState).toEqual({
    filters: [
      { column: "name", type: "string", operator: "=", value: "checkout" },
    ],
    sorting: { column: "timestamp", order: "ASC" },
    pagination: { pageIndex: 0, pageSize: 50 },
    search: { query: "response", type: ["id", "output"] },
  });
});
