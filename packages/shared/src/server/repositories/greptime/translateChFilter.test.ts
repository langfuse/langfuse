import { describe, expect, it } from "vitest";

import {
  ArrayOptionsFilter as ChArrayOptionsFilter,
  BooleanFilter as ChBooleanFilter,
  CategoryOptionsFilter as ChCategoryOptionsFilter,
  DateTimeFilter as ChDateTimeFilter,
  FilterList as ChFilterList,
  NumberFilter as ChNumberFilter,
  NumberObjectFilter as ChNumberObjectFilter,
  StringFilter as ChStringFilter,
  StringObjectFilter as ChStringObjectFilter,
  StringOptionsFilter as ChStringOptionsFilter,
} from "../../queries";
import {
  ArrayOptionsFilter,
  BooleanFilter,
  CategoryOptionsFilter,
  DateTimeFilter,
  NumberFilter,
  NumberObjectFilter,
  ScoreNumberObjectFilter,
  StringFilter,
  StringObjectFilter,
  StringOptionsFilter,
} from "../../greptime/sql/greptime-filter";
import { chFilterToGreptime, translateChFilterList } from "./translateChFilter";

describe("chFilterToGreptime", () => {
  it("maps scalar/option/EAV classes 1:1", () => {
    expect(
      chFilterToGreptime(
        new ChStringFilter({
          clickhouseTable: "traces",
          field: "user_id",
          operator: "=",
          value: "u1",
          tablePrefix: "t",
        }),
      ),
    ).toBeInstanceOf(StringFilter);

    expect(
      chFilterToGreptime(
        new ChStringOptionsFilter({
          clickhouseTable: "traces",
          field: "environment",
          operator: "any of",
          values: ["default"],
          tablePrefix: "t",
        }),
      ),
    ).toBeInstanceOf(StringOptionsFilter);

    expect(
      chFilterToGreptime(
        new ChArrayOptionsFilter({
          clickhouseTable: "traces",
          field: "tags",
          operator: "all of",
          values: ["a"],
          tablePrefix: "t",
        }),
      ),
    ).toBeInstanceOf(ArrayOptionsFilter);

    expect(
      chFilterToGreptime(
        new ChDateTimeFilter({
          clickhouseTable: "traces",
          field: "timestamp",
          operator: ">=",
          value: new Date("2026-01-01T00:00:00.000Z"),
          tablePrefix: "t",
        }),
      ),
    ).toBeInstanceOf(DateTimeFilter);

    expect(
      chFilterToGreptime(
        new ChNumberFilter({
          clickhouseTable: "scores",
          field: "value",
          operator: ">=",
          value: 0.5,
        }),
      ),
    ).toBeInstanceOf(NumberFilter);

    expect(
      chFilterToGreptime(
        new ChBooleanFilter({
          clickhouseTable: "traces",
          field: "bookmarked",
          operator: "=",
          value: true,
          tablePrefix: "t",
        }),
      ),
    ).toBeInstanceOf(BooleanFilter);

    expect(
      chFilterToGreptime(
        new ChStringObjectFilter({
          clickhouseTable: "traces",
          field: "metadata",
          operator: "=",
          key: "env",
          value: "prod",
          tablePrefix: "t",
        }),
      ),
    ).toBeInstanceOf(StringObjectFilter);
  });

  it("maps a metadata numberObject to the EAV NumberObjectFilter", () => {
    const out = chFilterToGreptime(
      new ChNumberObjectFilter({
        clickhouseTable: "traces",
        field: "metadata",
        operator: ">=",
        key: "score",
        value: 1,
        tablePrefix: "t",
      }),
    );
    expect(out).toBeInstanceOf(NumberObjectFilter);
    // The EAV metadata EXISTS is project-scoped (tenant isolation).
    expect(out.apply().query).toContain("project_id");
  });

  it("routes a scores_avg numberObject to the grain-aware ScoreNumberObjectFilter", () => {
    const grain = {
      scoresColumn: "trace_id" as const,
      outerPrefix: "t",
      outerColumn: "id",
    };
    const out = chFilterToGreptime(
      new ChNumberObjectFilter({
        clickhouseTable: "traces",
        field: "scores_avg",
        operator: ">=",
        key: "quality",
        value: 0.8,
        tablePrefix: "t",
      }),
      { scoreGrain: grain },
    );
    expect(out).toBeInstanceOf(ScoreNumberObjectFilter);
    const q = out.apply().query;
    expect(q).toContain("FROM `scores`");
    expect(q).toContain("HAVING avg");
  });

  it("routes a score_categories filter to the grain-aware CategoryOptionsFilter", () => {
    const out = chFilterToGreptime(
      new ChCategoryOptionsFilter({
        clickhouseTable: "traces",
        field: "score_categories",
        operator: "any of",
        key: "sentiment",
        values: ["positive"],
        tablePrefix: "t",
      }),
      {
        scoreGrain: {
          scoresColumn: "trace_id",
          outerPrefix: "t",
          outerColumn: "id",
        },
      },
    );
    expect(out).toBeInstanceOf(CategoryOptionsFilter);
    expect(out.apply().query).toContain("CATEGORICAL");
  });

  it("throws loud on a rollup-score filter with no grain in context", () => {
    expect(() =>
      chFilterToGreptime(
        new ChCategoryOptionsFilter({
          clickhouseTable: "traces",
          field: "score_categories",
          operator: "any of",
          key: "sentiment",
          values: ["positive"],
          tablePrefix: "t",
        }),
      ),
    ).toThrow(/scoreGrain/);

    expect(() =>
      chFilterToGreptime(
        new ChNumberObjectFilter({
          clickhouseTable: "traces",
          field: "scores_avg",
          operator: ">=",
          key: "quality",
          value: 0.8,
          tablePrefix: "t",
        }),
      ),
    ).toThrow(/scoreGrain/);
  });

  it("translateChFilterList ANDs every translated filter and merges params", () => {
    const list = new ChFilterList([
      new ChStringFilter({
        clickhouseTable: "traces",
        field: "project_id",
        operator: "=",
        value: "p1",
        tablePrefix: "t",
      }),
      new ChStringFilter({
        clickhouseTable: "traces",
        field: "user_id",
        operator: "=",
        value: "u1",
        tablePrefix: "t",
      }),
    ]);
    const applied = translateChFilterList(list).apply();
    expect(applied.query.split(" AND ")).toHaveLength(2);
    expect(Object.keys(applied.params)).toHaveLength(2);
  });
});
