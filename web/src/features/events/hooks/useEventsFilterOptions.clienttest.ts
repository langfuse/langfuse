import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QueryClient,
  QueryObserver,
  type QueryObserverOptions,
} from "@tanstack/react-query";

import type { FilterState, TimeFilter } from "@langfuse/shared";

const mocks = vi.hoisted(() => ({
  bulkInputs: [] as any[],
  perColumnInputs: [] as any[],
  perColumnData: {} as Record<string, Record<string, unknown>>,
  bulkData: {} as Record<string, unknown>,
  bulkClient: null as QueryClient | null,
  bulkObserver: null as QueryObserver<Record<string, unknown>> | null,
}));

// Capture the tRPC inputs the hook builds, to assert the plan is wired through
// to the server contract. Plan SEMANTICS live in the planner's own tests.
vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      filterOptions: {
        useQuery: (
          input: any,
          options: Omit<
            QueryObserverOptions<Record<string, unknown>>,
            "queryKey" | "queryFn"
          >,
        ) => {
          mocks.bulkInputs.push(input);
          if (mocks.bulkClient) {
            const queryOptions = {
              queryKey: ["events.filterOptions", input],
              queryFn: () => new Promise<Record<string, unknown>>(() => {}),
              ...options,
            };
            if (!mocks.bulkObserver) {
              mocks.bulkClient.setQueryData(
                queryOptions.queryKey,
                mocks.bulkData,
              );
              mocks.bulkObserver = new QueryObserver(
                mocks.bulkClient,
                queryOptions,
              );
              mocks.bulkObserver.subscribe(() => {});
            } else {
              mocks.bulkObserver.setOptions(queryOptions);
            }
            return mocks.bulkObserver.getCurrentResult();
          }
          return {
            data: mocks.bulkData,
            isFetching: false,
            isPlaceholderData: false,
            isError: false,
            isPending: false,
          };
        },
      },
    },
    useQueries: (
      build: (t: any) => unknown[],
      opts: { combine: (results: any[]) => unknown },
    ) => {
      const descriptors = build({
        events: {
          filterOptions: (input: any) => {
            mocks.perColumnInputs.push(input);
            return { input };
          },
        },
      });
      const results = descriptors.map((descriptor: any) => ({
        data: mocks.perColumnData[descriptor.input.columns[0]] ?? {},
        isFetching: false,
        isError: false,
      }));
      return opts.combine(results);
    },
  },
}));

import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";

const START_TIME: TimeFilter = {
  column: "startTime",
  type: "datetime",
  operator: ">=",
  value: new Date("2026-01-01T00:00:00.000Z"),
};
const LEVEL_ERROR: FilterState[number] = {
  column: "level",
  type: "stringOptions",
  operator: "any of",
  value: ["ERROR"],
};
const ENV_PROD: FilterState[number] = {
  column: "environment",
  type: "stringOptions",
  operator: "any of",
  value: ["production"],
};

function run(refiningFilter: FilterState) {
  renderHook(() =>
    useEventsFilterOptions({
      projectId: "p",
      startTimeFilter: [START_TIME],
      refiningFilter,
      lazy: true,
    }),
  );
  return {
    bulk: mocks.bulkInputs.at(-1),
    perColumn: mocks.perColumnInputs,
  };
}

describe("useEventsFilterOptions filtered facet counts (LFE-14489)", () => {
  beforeEach(() => {
    mocks.bulkInputs = [];
    mocks.perColumnInputs = [];
    mocks.perColumnData = {};
    mocks.bulkData = {};
    mocks.bulkClient = null;
    mocks.bulkObserver = null;
  });

  afterEach(() => {
    mocks.bulkObserver?.destroy();
    mocks.bulkClient?.clear();
  });

  it("retains counts across column changes and only clears counts across scope changes", () => {
    const environment = [{ value: "production", count: 120 }];
    mocks.bulkData = {
      environment,
      approxTotalCount: 120,
      approxTotalCountIsPartial: true,
    };
    mocks.bulkClient = new QueryClient();
    const initial: Parameters<typeof useEventsFilterOptions>[0] = {
      projectId: "p",
      startTimeFilter: [START_TIME],
      includeApproxCount: true,
      lazy: true,
    };
    const { result, rerender } = renderHook(
      (props) => useEventsFilterOptions(props),
      { initialProps: initial },
    );
    expect(result.current.approxTotalCount).toBe(120);

    rerender({ ...initial, lazy: false, columns: ["environment", "name"] });
    expect(mocks.bulkObserver?.getCurrentResult().isPlaceholderData).toBe(true);
    expect(result.current.approxTotalCount).toBe(120);
    expect(result.current.isApproxTotalCountLoading).toBe(false);
    expect(result.current.approxTotalCountIsPartialScope).toBe(true);

    for (const change of [
      { refiningFilter: [LEVEL_ERROR] },
      { startTimeFilter: [{ ...START_TIME, value: new Date("2026-02-01") }] },
      { refiningFilter: [{ ...START_TIME, value: new Date("2026-02-01") }] },
      { projectId: "another-project" },
      { isRootObservation: true },
    ]) {
      rerender({ ...initial, ...change });
      expect(result.current.approxTotalCount).toBeNull();
      expect(result.current.isApproxTotalCountLoading).toBe(true);
      expect(result.current.approxTotalCountIsPartialScope).toBe(false);
      expect(result.current.filterOptions.environment).toEqual(environment);
    }

    const finalProps = { ...initial, isRootObservation: true, lazy: false };
    rerender(finalProps);
    expect(result.current.approxTotalCount).toBeNull();
    mocks.bulkClient.setQueryData(
      mocks.bulkObserver!.getCurrentQuery().queryKey,
      {
        approxTotalCount: 7,
        approxTotalCountIsPartial: false,
      },
    );
    rerender(finalProps);
    expect(result.current.approxTotalCount).toBe(7);
    expect(result.current.isApproxTotalCountLoading).toBe(false);
  });

  it("sends only the start-time scope and no refining filter when idle", () => {
    const { bulk, perColumn } = run([]);
    expect(bulk.startTimeFilter).toEqual([START_TIME]);
    expect(bulk.filter).toBeUndefined();
    expect(bulk.columns).toContain("name");
    expect(bulk.columns).toContain("scores_avg");
    expect(perColumn).toHaveLength(0);
  });

  it("re-routes user-authored start-time conditions into startTimeFilter", () => {
    // A search-bar `startTime:>…` narrows the rows; the server ignores it in
    // `filter`, so it must reach the queries via the authoritative channel.
    const userStartTime: FilterState[number] = {
      column: "startTime",
      type: "datetime",
      operator: ">",
      value: new Date("2026-02-01T00:00:00.000Z"),
    };
    const { bulk } = run([userStartTime, LEVEL_ERROR]);
    expect(bulk.startTimeFilter).toEqual([START_TIME, userStartTime]);
    expect(bulk.filter).toEqual([LEVEL_ERROR]);
  });

  it("executes the query plan: refined bulk + self-excluded per-column queries", () => {
    const { bulk, perColumn } = run([ENV_PROD, LEVEL_ERROR]);

    // The self-filtered facets leave the bulk; the rest refine by everything.
    expect(bulk.columns).not.toContain("environment");
    expect(bulk.columns).not.toContain("level");
    expect(bulk.columns).toContain("name");
    expect(bulk.filter).toEqual([ENV_PROD, LEVEL_ERROR]);

    // Each pulled-out facet gets its own query carrying the OTHER conditions,
    // and the shared start-time scope.
    const envQuery = perColumn.find((q) => q.columns?.[0] === "environment");
    const levelQuery = perColumn.find((q) => q.columns?.[0] === "level");
    expect(envQuery.filter).toEqual([LEVEL_ERROR]);
    expect(levelQuery.filter).toEqual([ENV_PROD]);
    expect(envQuery.startTimeFilter).toEqual([START_TIME]);
  });

  it("serves tag options alphabetically, whatever order the server sent (LFE-14382)", () => {
    mocks.perColumnData.traceTags = {
      traceTags: [{ value: "urgent" }, { value: "Billing" }, { value: "beta" }],
    };

    const { result } = renderHook(() =>
      useEventsFilterOptions({
        projectId: "p",
        startTimeFilter: [START_TIME],
        refiningFilter: [],
        lazy: true,
      }),
    );

    act(() => result.current.requestColumns(["traceTags"]));

    expect(result.current.filterOptions.traceTags).toEqual([
      { value: "beta" },
      { value: "Billing" },
      { value: "urgent" },
    ]);
  });

  it("loads release options when the Release facet is opened", () => {
    const releaseOptions = [{ value: "181", count: 2 }];
    mocks.perColumnData.release = { release: releaseOptions };

    const { result } = renderHook(() =>
      useEventsFilterOptions({
        projectId: "p",
        startTimeFilter: [START_TIME],
        refiningFilter: [],
        lazy: true,
      }),
    );

    act(() => result.current.requestColumns(["release"]));

    expect(mocks.perColumnInputs).toContainEqual(
      expect.objectContaining({ columns: ["release"] }),
    );
    expect(result.current.filterOptions).toMatchObject({
      release: releaseOptions,
    });
  });
});
