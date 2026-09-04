import { describe, expect, it, vi } from "vitest";

vi.mock("../../repositories", () => ({
  clickhouseCompliantRandomCharacters: () => "test",
}));

import { type Filter, FilterList } from "./clickhouse-filter";
import {
  planScoreFilterPushdown,
  resolveScoreDataRequirement,
  type ScoreDataRequirement,
} from "./score-filter-pushdown";

type TestFilter = Filter & { key?: string };

const makeFilter = ({
  field,
  key,
  clickhouseTable = "scores",
}: {
  field: string;
  key?: string;
  clickhouseTable?: string;
}): TestFilter => ({
  clickhouseTable,
  field,
  key,
  operator: "=",
  apply: () => ({ query: "", params: {} }),
});

const plan = (
  filters: Filter[],
  scoreDataRequirement: ScoreDataRequirement = "filter-only",
) =>
  planScoreFilterPushdown({
    filters: new FilterList(filters),
    scoreDataRequirement,
  });

describe("planScoreFilterPushdown", () => {
  it("keeps the union of score names needed by filter-only consumers", () => {
    const pushdown = plan([
      makeFilter({ field: "s.scores_avg", key: "quality" }),
      makeFilter({ field: "s.score_categories", key: "sentiment" }),
      makeFilter({ field: "s.score_booleans", key: "approved" }),
      makeFilter({ field: "ts.scores_avg", key: "quality" }),
      makeFilter({ clickhouseTable: "traces", field: "name" }),
    ]);

    expect(pushdown).toEqual({
      query: "name IN ({stringOptionsFiltertest: Array(String)})",
      params: {
        stringOptionsFiltertest: ["quality", "sentiment", "approved"],
      },
    });
  });

  it("does not restrict consumers that require complete score data", () => {
    expect(
      plan([makeFilter({ field: "s.scores_avg", key: "quality" })], "complete"),
    ).toBeUndefined();
  });

  it("resolves reusable consumer guards", () => {
    expect(resolveScoreDataRequirement({})).toBe("filter-only");
    expect(resolveScoreDataRequirement({ selectsScoreData: true })).toBe(
      "complete",
    );
    expect(resolveScoreDataRequirement({ ordersByScoreData: true })).toBe(
      "complete",
    );
  });

  it("does not restrict when any score filter lacks a safe source predicate", () => {
    expect(
      plan([
        makeFilter({ field: "s.scores_avg", key: "quality" }),
        makeFilter({ field: "s.score_categories" }),
      ]),
    ).toBeUndefined();
    expect(plan([makeFilter({ field: "metadata", key: "customer" })])).toBe(
      undefined,
    );
  });
});
