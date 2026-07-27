import { describe, expect, it } from "vitest";

import type { FilterState } from "@langfuse/shared";

import {
  planEventFacetQueries,
  resolveEventFacetColumnId,
  toRefiningFilter,
} from "@/src/features/events/lib/facet-query-plan";

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
// Display-name keyed conditions: the search bar's lowering and the embed-scope
// filters (user/session detail pages) produce these instead of column ids.
const ENV_PROD_BY_LABEL: FilterState[number] = {
  column: "Environment",
  type: "stringOptions",
  operator: "any of",
  value: ["production"],
};
const USER_SCOPE_BY_LABEL: FilterState[number] = {
  column: "User ID",
  type: "string",
  operator: "=",
  value: "user-1",
};

const EAGER = ["environment", "level", "name", "scores_avg"] as const;

describe("toRefiningFilter", () => {
  it("strips start-time conditions (id and display name) and keeps the rest", () => {
    expect(
      toRefiningFilter([
        START_TIME,
        { ...START_TIME, column: "Start Time" },
        LEVEL_ERROR,
      ]),
    ).toEqual([LEVEL_ERROR]);
  });
});

describe("resolveEventFacetColumnId", () => {
  it("maps display names to column ids and passes ids/unknowns through", () => {
    expect(resolveEventFacetColumnId("Environment")).toBe("environment");
    expect(resolveEventFacetColumnId("User ID")).toBe("userId");
    expect(resolveEventFacetColumnId("environment")).toBe("environment");
    expect(resolveEventFacetColumnId("not-a-column")).toBe("not-a-column");
  });
});

describe("planEventFacetQueries", () => {
  it("keeps everything in one unrefined bulk when no filter is active", () => {
    const plan = planEventFacetQueries({
      refiningFilter: [],
      eagerColumns: EAGER,
      lazyColumns: [],
    });
    expect(plan.bulk.columns).toEqual([...EAGER]);
    expect(plan.bulk.filter).toBeUndefined();
    expect(plan.perColumn).toEqual([]);
  });

  it("pulls a self-filtered facet out of the bulk and self-excludes it", () => {
    const plan = planEventFacetQueries({
      refiningFilter: [LEVEL_ERROR],
      eagerColumns: EAGER,
      lazyColumns: [],
    });
    // `level` would self-collapse under its own condition → own query...
    expect(plan.bulk.columns).not.toContain("level");
    expect(plan.bulk.columns).toContain("name");
    // ...while the remaining bulk facets are refined by it.
    expect(plan.bulk.filter).toEqual([LEVEL_ERROR]);
    expect(plan.perColumn).toEqual([{ column: "level", filter: undefined }]);
  });

  it("cross-refines self-excluded facets against each other", () => {
    const plan = planEventFacetQueries({
      refiningFilter: [ENV_PROD, LEVEL_ERROR],
      eagerColumns: EAGER,
      lazyColumns: [],
    });
    expect(plan.bulk.columns).toEqual(["name", "scores_avg"]);
    expect(plan.bulk.filter).toEqual([ENV_PROD, LEVEL_ERROR]);
    // environment sees level's condition but not its own — and vice versa.
    expect(plan.perColumn).toEqual([
      { column: "environment", filter: [LEVEL_ERROR] },
      { column: "level", filter: [ENV_PROD] },
    ]);
  });

  it("never evicts the score catalog from the bulk", () => {
    const plan = planEventFacetQueries({
      refiningFilter: [SCORE_QUALITY],
      eagerColumns: EAGER,
      lazyColumns: [],
    });
    // The server ignores the filter for the catalog; the score condition still
    // refines the value facets sharing the bulk.
    expect(plan.bulk.columns).toEqual([...EAGER]);
    expect(plan.bulk.filter).toEqual([SCORE_QUALITY]);
    expect(plan.perColumn).toEqual([]);
  });

  it("matches display-name keyed conditions to their facet ids", () => {
    const plan = planEventFacetQueries({
      refiningFilter: [ENV_PROD_BY_LABEL],
      eagerColumns: EAGER,
      lazyColumns: [],
    });
    expect(plan.bulk.columns).not.toContain("environment");
    expect(plan.perColumn).toEqual([
      { column: "environment", filter: undefined },
    ]);
  });

  it("refines every facet by an embed-scope condition without evicting the unrequested column", () => {
    // The user page scopes by `User ID` but omits the userId facet; the
    // condition refines all requested facets and evicts none of them.
    const plan = planEventFacetQueries({
      refiningFilter: [USER_SCOPE_BY_LABEL],
      eagerColumns: EAGER,
      lazyColumns: [],
    });
    expect(plan.bulk.columns).toEqual([...EAGER]);
    expect(plan.bulk.filter).toEqual([USER_SCOPE_BY_LABEL]);
    expect(plan.perColumn).toEqual([]);
  });

  it("gives lazy columns their own self-excluded queries alongside dirty eager facets", () => {
    const plan = planEventFacetQueries({
      refiningFilter: [ENV_PROD],
      eagerColumns: EAGER,
      lazyColumns: ["userId", "environment"],
    });
    // Deduped + sorted: the dirty eager facet and both lazy columns.
    expect(plan.perColumn).toEqual([
      { column: "environment", filter: undefined },
      { column: "userId", filter: [ENV_PROD] },
    ]);
  });

  it("supports request-all mode (columns undefined) for unfiltered callers", () => {
    const plan = planEventFacetQueries({
      refiningFilter: [],
      eagerColumns: undefined,
      lazyColumns: [],
    });
    expect(plan.bulk.columns).toBeUndefined();
    expect(plan.bulk.filter).toBeUndefined();
    expect(plan.perColumn).toEqual([]);
  });
});
