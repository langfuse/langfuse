import {
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
      "traceTags",
      "toolNames",
      "experimentId",
    ]) {
      expect(chartFilterExclusionReason(col)).toBeNull();
    }
  });

  it("groups measures, scores, comments, and metadata by reason", () => {
    expect(chartFilterExclusionReason("latency")).toMatch(/latency, cost/i);
    expect(chartFilterExclusionReason("totalCost")).toMatch(/latency, cost/i);
    expect(chartFilterExclusionReason("scores_avg")).toMatch(/scores/i);
    expect(chartFilterExclusionReason("trace_score_categories")).toMatch(
      /scores/i,
    );
    // promptVersion is a numeric field but the observations dimension is a
    // string — forwarding it errors the query, so it is NOT forwardable.
    expect(chartFilterExclusionReason("promptVersion")).not.toBeNull();
    expect(chartFilterExclusionReason("commentContent")).toMatch(/comments/i);
    expect(chartFilterExclusionReason("metadata")).toMatch(/metadata/i);
  });

  it("falls back to a generic reason for other unsupported columns", () => {
    const reason = chartFilterExclusionReason("isRootObservation");
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/this field/i);
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
    expect(result.map((f) => f.column)).toEqual(["type", "userId", "tags"]);
    // the rename keeps the rest of the filter intact
    const tags = result.find((f) => f.column === "tags");
    expect(tags).toMatchObject({ operator: "all of", value: ["prod"] });
  });
});

describe("chartSearchFieldReason", () => {
  it("returns null for forwardable grammar fields (incl. aliases)", () => {
    expect(chartSearchFieldReason("level")).toBeNull();
    expect(chartSearchFieldReason("env")).toBeNull(); // alias -> environment
    expect(chartSearchFieldReason("user")).toBeNull(); // alias -> userId
    expect(chartSearchFieldReason("tags")).toBeNull(); // alias -> traceTags
    expect(chartSearchFieldReason("model")).toBeNull(); // -> providedModelName
  });

  it("classifies unsupported grammar fields by group", () => {
    expect(chartSearchFieldReason("latency")).toMatch(/latency, cost/i);
    expect(chartSearchFieldReason("cost")).toMatch(/latency, cost/i); // -> totalCost
    expect(chartSearchFieldReason("scores.accuracy")).toMatch(/scores/i);
    expect(chartSearchFieldReason("traceScores.helpfulness")).toMatch(
      /scores/i,
    );
    expect(chartSearchFieldReason("metadata.region")).toMatch(/metadata/i);
    // a search-bar startTime bound the chart can't honour
    expect(chartSearchFieldReason("startTime")).toMatch(/this field/i);
  });

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
