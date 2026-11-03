// @vitest-environment node

import {
  chartConditionExclusionReason,
  chartFacetExclusionReason,
  chartFilterExclusionReason,
  chartSearchFieldReason,
  classifyChartFilters,
  toChartFilters,
} from "./chartFilterCompatibility";
import { type FilterState } from "@langfuse/shared";

describe("chartFilterExclusionReason", () => {
  it("returns null for forwardable columns", () => {
    for (const col of [
      "environment",
      "type",
      "name",
      "level",
      "providedModelName",
      "userId",
      "sessionId",
      "traceName",
      "version",
      "release",
      "traceTags",
      "toolNames",
      "experimentId",
      "isRootObservation",
      "promptVersion",
      "metadata",
    ]) {
      expect(chartFilterExclusionReason(col)).toBeNull();
    }
  });

  it("groups measures, scores, and comments by reason", () => {
    expect(chartFilterExclusionReason("latency")).toMatch(/latency, cost/i);
    expect(chartFilterExclusionReason("cachedInputTokens")).toMatch(
      /latency, cost/i,
    );
    expect(chartFilterExclusionReason("cachedInputCost")).toMatch(
      /latency, cost/i,
    );
    expect(chartFilterExclusionReason("totalCost")).toMatch(/latency, cost/i);
    expect(chartFilterExclusionReason("scores_avg")).toMatch(/scores/i);
    expect(chartFilterExclusionReason("trace_score_categories")).toMatch(
      /scores/i,
    );
    expect(chartFilterExclusionReason("commentContent")).toMatch(/comments/i);
  });
});

describe("chartConditionExclusionReason", () => {
  it("forwards a keyed metadata filter", () => {
    expect(
      chartConditionExclusionReason({
        column: "metadata",
        type: "stringObject",
        key: "langfuse_user_email",
        operator: "does not contain",
        value: "@langfuse.com",
      }),
    ).toBeNull();
  });

  it("excludes a metadata condition that is not the keyed stringObject shape", () => {
    // The query builder accepts metadata only as a keyed stringObject;
    // forwarding another shape errors the whole chart, not just one filter.
    expect(
      chartConditionExclusionReason({
        column: "metadata",
        type: "null",
        operator: "is not null",
        value: "",
      }),
    ).not.toBeNull();
  });

  it("excludes a presence check on an otherwise forwardable column", () => {
    expect(
      chartConditionExclusionReason({
        column: "userId",
        type: "null",
        operator: "is not null",
        value: "",
      }),
    ).toMatch(/is set/i);
  });

  it("keeps the column reason for an unsupported column", () => {
    expect(
      chartConditionExclusionReason({
        column: "latency",
        type: "number",
        operator: ">",
        value: 2,
      }),
    ).toMatch(/latency, cost/i);
  });
});

describe("chartFacetExclusionReason", () => {
  const metadataFilter = (type: "stringObject" | "string"): FilterState =>
    type === "stringObject"
      ? [
          {
            column: "metadata",
            type: "stringObject",
            key: "tier",
            operator: "=",
            value: "gold",
          },
        ]
      : // the shape a hand-edited URL can still decode into
        [{ column: "metadata", type: "string", operator: "=", value: "gold" }];

  it("leaves a facet live when its conditions forward", () => {
    expect(
      chartFacetExclusionReason(metadataFilter("stringObject"), "metadata"),
    ).toBeNull();
  });

  it("blocks a facet holding a condition the chart drops", () => {
    // Column-level policy says metadata is fine; this condition is not, and the
    // facet must say so rather than look applied.
    expect(chartFilterExclusionReason("metadata")).toBeNull();
    expect(
      chartFacetExclusionReason(metadataFilter("string"), "metadata"),
    ).not.toBeNull();
  });

  it("blocks a facet holding a presence check", () => {
    expect(
      chartFacetExclusionReason(
        [
          {
            column: "userId",
            type: "null",
            operator: "is not null",
            value: "",
          },
        ],
        "userId",
      ),
    ).toMatch(/is set/i);
  });

  it("falls back to the column policy for a facet with no condition", () => {
    expect(chartFacetExclusionReason([], "metadata")).toBeNull();
    expect(chartFacetExclusionReason([], "latency")).toMatch(/latency, cost/i);
  });

  it("ignores conditions on other columns", () => {
    expect(
      chartFacetExclusionReason(
        [
          {
            column: "userId",
            type: "null",
            operator: "is not null",
            value: "",
          },
        ],
        "metadata",
      ),
    ).toBeNull();
  });
});

describe("toChartFilters", () => {
  it("keeps forwardable filters, renames traceTags -> tags, drops the rest", () => {
    const filters: FilterState = [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      { column: "userId", type: "string", operator: "=", value: "u1" },
      {
        column: "traceTags",
        type: "arrayOptions",
        operator: "all of",
        value: ["prod"],
      },
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
      {
        column: "metadata",
        type: "stringObject",
        key: "langfuse_user_email",
        operator: "does not contain",
        value: "@langfuse.com",
      },
      { column: "promptVersion", type: "number", operator: ">=", value: 2 },
      {
        column: "scores_avg",
        type: "numberObject",
        operator: ">",
        key: "accuracy",
        value: 0.5,
      },
      { column: "latency", type: "number", operator: ">", value: 2 },
      // a has:name presence check — dropped (null-type isn't applied to charts)
      { column: "name", type: "null", operator: "is not null", value: "" },
    ];
    const result = toChartFilters(filters);
    // scores + latency + the null-check dropped; traceTags -> tags
    expect(result.map((f) => f.column)).toEqual([
      "type",
      "userId",
      "tags",
      "isRootObservation",
      "metadata",
      "promptVersion",
    ]);
    // the rename keeps the rest of the filter intact
    const tags = result.find((f) => f.column === "tags");
    expect(tags).toMatchObject({ operator: "all of", value: ["prod"] });
    // metadata forwards with the key the query builder needs
    expect(result.find((f) => f.column === "metadata")).toMatchObject({
      type: "stringObject",
      key: "langfuse_user_email",
      operator: "does not contain",
      value: "@langfuse.com",
    });
  });
});

describe("chartSearchFieldReason", () => {
  it("returns null for forwardable grammar fields (incl. aliases)", () => {
    expect(chartSearchFieldReason("level")).toBeNull();
    expect(chartSearchFieldReason("env")).toBeNull(); // alias -> environment
    expect(chartSearchFieldReason("user")).toBeNull(); // alias -> userId
    expect(chartSearchFieldReason("tags")).toBeNull(); // alias -> traceTags
    expect(chartSearchFieldReason("model")).toBeNull(); // -> providedModelName
    expect(chartSearchFieldReason("promptVersion")).toBeNull();
    expect(chartSearchFieldReason("metadata.region")).toBeNull();
  });

  it("classifies unsupported grammar fields by group", () => {
    expect(chartSearchFieldReason("latency")).toMatch(/latency, cost/i);
    expect(chartSearchFieldReason("cost")).toMatch(/latency, cost/i); // -> totalCost
    expect(chartSearchFieldReason("scores.accuracy")).toMatch(/scores/i);
    expect(chartSearchFieldReason("traceScores.helpfulness")).toMatch(
      /scores/i,
    );
    // a search-bar startTime bound the chart can't honour
    expect(chartSearchFieldReason("startTime")).toMatch(/this field/i);
  });

  it.each(["content", "all", "in"])(
    "marks the %s text search as unapplied",
    (field) => {
      expect(chartSearchFieldReason(field)).toMatch(/search/i);
    },
  );

  it("returns null for unknown fields", () => {
    expect(chartSearchFieldReason("nonsense")).toBeNull();
  });

  it("deactivates the has: presence pseudo-field (null-checks aren't charted)", () => {
    expect(chartSearchFieldReason("has")).toMatch(/is set/i);
  });
});

describe("classifyChartFilters", () => {
  it("splits forwarded filters from excluded ones with reasons", () => {
    const filters: FilterState = [
      { column: "environment", type: "string", operator: "=", value: "prod" },
      { column: "latency", type: "number", operator: ">", value: 1 },
      {
        column: "scores_avg",
        type: "numberObject",
        operator: ">",
        key: "acc",
        value: 0.5,
      },
    ];
    const { forwarded, excluded } = classifyChartFilters(filters);
    expect(forwarded.map((f) => f.column)).toEqual(["environment"]);
    expect([...excluded.keys()].sort()).toEqual(["latency", "scores_avg"]);
    expect(excluded.get("latency")).toMatch(/latency, cost/i);
  });
});
