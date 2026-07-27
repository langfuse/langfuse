import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FilterState } from "@langfuse/shared";

const mocks = vi.hoisted(() => ({
  bulkInputs: [] as any[],
  perColumnInputs: [] as any[],
}));

// Capture the exact tRPC inputs the hook builds for the bulk `useQuery` and each
// per-column `useQueries` entry, so we can assert the filtered-facet-count
// contract (LFE-14489) without a live server.
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

const START_TIME: FilterState[number] = {
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
const SCORE_QUALITY: FilterState[number] = {
  column: "scores_avg",
  type: "numberObject",
  key: "quality",
  operator: ">",
  value: 0.5,
};

function run(oldFilterState: FilterState) {
  renderHook(() =>
    useEventsFilterOptions({ projectId: "p", oldFilterState, lazy: true }),
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
    const { bulk, perColumn } = run([START_TIME]);
    expect(bulk.startTimeFilter).toEqual([START_TIME]);
    expect(bulk.filter).toBeUndefined();
    expect(bulk.columns).toContain("name");
    expect(bulk.columns).toContain("scores_avg");
    expect(perColumn).toHaveLength(0);
  });

  it("refines the bulk value facets by the active filter and pulls the filtered facet out to self-exclude it", () => {
    const { bulk, perColumn } = run([START_TIME, LEVEL_ERROR]);

    // `level` self-collapses under its own filter, so it leaves the bulk...
    expect(bulk.columns).not.toContain("level");
    expect(bulk.columns).toContain("name");
    // ...but every remaining value facet is refined by level=ERROR.
    expect(bulk.filter).toEqual([LEVEL_ERROR]);
    // start-time never travels as a refining filter.
    expect(bulk.filter).not.toContainEqual(START_TIME);

    // `level` gets its own query, refined by everything EXCEPT its own filter
    // (here: nothing), so its option list stays complete.
    const levelQuery = perColumn.find((q) => q.columns?.[0] === "level");
    expect(levelQuery).toBeDefined();
    expect(levelQuery.filter).toBeUndefined();
  });

  it("self-excludes each facet's own column while cross-refining the others", () => {
    const { bulk, perColumn } = run([START_TIME, ENV_PROD, LEVEL_ERROR]);

    expect(bulk.columns).not.toContain("environment");
    expect(bulk.columns).not.toContain("level");
    expect(bulk.filter).toEqual([ENV_PROD, LEVEL_ERROR]);

    const envQuery = perColumn.find((q) => q.columns?.[0] === "environment");
    const levelQuery = perColumn.find((q) => q.columns?.[0] === "level");
    // environment counts reflect level=ERROR but NOT environment itself.
    expect(envQuery.filter).toEqual([LEVEL_ERROR]);
    // level counts reflect environment=production but NOT level itself.
    expect(levelQuery.filter).toEqual([ENV_PROD]);
  });

  it("keeps the score catalog in the bulk and never self-excludes it", () => {
    const { bulk, perColumn } = run([START_TIME, SCORE_QUALITY]);

    // Score-catalog columns are project metadata the server never refines, so
    // they ride the bulk even while a score filter is active...
    expect(bulk.columns).toContain("scores_avg");
    // ...and the score filter still refines the value facets in the bulk.
    expect(bulk.filter).toEqual([SCORE_QUALITY]);
    expect(perColumn).toHaveLength(0);
  });
});
