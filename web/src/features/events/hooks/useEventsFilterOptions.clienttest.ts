import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FilterState, TimeFilter } from "@langfuse/shared";

const mocks = vi.hoisted(() => ({
  bulkInputs: [] as any[],
  perColumnInputs: [] as any[],
}));

// Capture the tRPC inputs the hook builds, to assert the plan is wired through
// to the server contract. Plan SEMANTICS live in the planner's own tests.
vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      filterOptions: {
        useQuery: (input: any) => {
          mocks.bulkInputs.push(input);
          return {
            data: {},
            isFetching: false,
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
      const results = descriptors.map(() => ({
        data: {},
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
});
