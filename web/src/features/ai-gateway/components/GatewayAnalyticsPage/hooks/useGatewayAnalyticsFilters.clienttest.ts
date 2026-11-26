import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGatewayAnalyticsFilters } from "./useGatewayAnalyticsFilters";

type QueryState = {
  users: (string | null)[];
  gatewayKeys: (string | null)[];
};

const queryMock = vi.hoisted(() => ({
  initial: { users: [], gatewayKeys: [] } as QueryState,
  lastSetQuery: null as Partial<QueryState> | null,
}));

vi.mock("use-query-params", () => ({
  ArrayParam: {},
  withDefault: (_param: unknown, defaultValue: unknown) => defaultValue,
  useQueryParams: () => {
    const [query, setQueryState] = useState<QueryState>(queryMock.initial);
    const setQuery = (next: Partial<QueryState>) => {
      queryMock.lastSetQuery = next;
      setQueryState((current) => ({ ...current, ...next }));
    };
    return [query, setQuery] as const;
  },
}));

const labels = {
  users: new Map([
    ["user-alice", "Alice"],
    ["user-bob", "Bob"],
    ["user-carol", "Carol"],
  ]),
  apiKeys: new Map([
    ["key-alice-1", "Alice key 1"],
    ["key-alice-2", "Alice key 2"],
    ["key-bob-1", "Bob key 1"],
    ["key-service-1", "Service key"],
  ]),
};

const apiKeyOwnerById = new Map<string, string | null>([
  ["key-alice-1", "user-alice"],
  ["key-alice-2", "user-alice"],
  ["key-bob-1", "user-bob"],
  ["key-service-1", null],
]);

describe("useGatewayAnalyticsFilters", () => {
  beforeEach(() => {
    queryMock.initial = { users: [], gatewayKeys: [] };
    queryMock.lastSetQuery = null;
  });

  it("lists all gateway keys when no user is selected and narrows options to selected users' keys", () => {
    const { result } = renderHook(() =>
      useGatewayAnalyticsFilters({
        labels,
        apiKeyOwnerById,
        canFilterByUser: true,
      }),
    );

    expect(result.current.apiKey.options.map((option) => option.value)).toEqual(
      ["key-alice-1", "key-alice-2", "key-bob-1", "key-service-1"],
    );

    act(() => result.current.user.onValueChange(["user-alice"]));
    expect(result.current.apiKey.options.map((option) => option.value)).toEqual(
      ["key-alice-1", "key-alice-2"],
    );

    act(() => result.current.user.onValueChange(["user-alice", "user-bob"]));
    expect(result.current.apiKey.options.map((option) => option.value)).toEqual(
      ["key-alice-1", "key-alice-2", "key-bob-1"],
    );

    // A user with no keys leaves no matching key options (and excludes service keys).
    act(() => result.current.user.onValueChange(["user-carol"]));
    expect(result.current.apiKey.options).toEqual([]);

    // Clearing the user filter restores all organization keys including service keys.
    act(() => result.current.user.onValueChange([]));
    expect(result.current.apiKey.options.map((option) => option.value)).toEqual(
      ["key-alice-1", "key-alice-2", "key-bob-1", "key-service-1"],
    );
  });

  it("drops gateway key selections that no longer match when the selected users change", () => {
    const { result } = renderHook(() =>
      useGatewayAnalyticsFilters({
        labels,
        apiKeyOwnerById,
        canFilterByUser: true,
      }),
    );

    act(() =>
      result.current.apiKey.onValueChange([
        "key-alice-1",
        "key-bob-1",
        "key-service-1",
      ]),
    );
    expect(result.current.apiKey.values).toEqual([
      "key-alice-1",
      "key-bob-1",
      "key-service-1",
    ]);

    act(() => result.current.user.onValueChange(["user-alice"]));

    expect(queryMock.lastSetQuery).toEqual({
      users: ["user-alice"],
      gatewayKeys: ["key-alice-1"],
    });
    expect(result.current.apiKey.values).toEqual(["key-alice-1"]);
    expect(result.current.filters).toEqual([
      {
        column: "aiGatewayKeyOwnerUserId",
        operator: "any of",
        value: ["user-alice"],
        type: "stringOptions",
      },
      {
        column: "aiGatewayKeyId",
        operator: "any of",
        value: ["key-alice-1"],
        type: "stringOptions",
      },
    ]);

    // Switching to another user drops every remaining mismatched key from URL and query filters.
    act(() => result.current.user.onValueChange(["user-bob"]));

    expect(queryMock.lastSetQuery).toEqual({
      users: ["user-bob"],
      gatewayKeys: [],
    });
    expect(result.current.apiKey.values).toEqual([]);
    expect(result.current.filters).toEqual([
      {
        column: "aiGatewayKeyOwnerUserId",
        operator: "any of",
        value: ["user-bob"],
        type: "stringOptions",
      },
    ]);
  });

  it("preserves custom unknown (e.g. deleted) gateway key IDs while dropping known mismatches", () => {
    queryMock.initial = {
      users: [],
      gatewayKeys: ["key-deleted-99", "key-bob-1"],
    };

    const { result } = renderHook(() =>
      useGatewayAnalyticsFilters({
        labels,
        apiKeyOwnerById,
        canFilterByUser: true,
      }),
    );

    act(() => result.current.user.onValueChange(["user-alice"]));

    expect(queryMock.lastSetQuery).toEqual({
      users: ["user-alice"],
      gatewayKeys: ["key-deleted-99"],
    });
    expect(result.current.apiKey.values).toEqual(["key-deleted-99"]);
  });

  it("ignores mismatched gateway keys already present in the URL and never resurrects them when users clear", () => {
    queryMock.initial = {
      users: ["user-alice"],
      gatewayKeys: ["key-bob-1"],
    };

    const { result } = renderHook(() =>
      useGatewayAnalyticsFilters({
        labels,
        apiKeyOwnerById,
        canFilterByUser: true,
      }),
    );

    expect(result.current.apiKey.values).toEqual([]);
    expect(result.current.filters).toEqual([
      {
        column: "aiGatewayKeyOwnerUserId",
        operator: "any of",
        value: ["user-alice"],
        type: "stringOptions",
      },
    ]);

    act(() => result.current.user.onValueChange([]));
    expect(queryMock.lastSetQuery).toEqual({ users: [], gatewayKeys: [] });
    expect(result.current.apiKey.values).toEqual([]);
  });
});
