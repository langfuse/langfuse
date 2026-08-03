import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FTS_MATCH_OPERATOR,
  filterOperators,
} from "../../../interfaces/filters";

const randomState = vi.hoisted(() => ({ next: 1 }));

vi.mock("../../repositories", () => ({
  clickhouseCompliantRandomCharacters: () => `x${randomState.next++}`,
}));

import {
  ArrayOptionsFilter,
  BooleanFilter,
  BooleanObjectFilter,
  CategoryOptionsFilter,
  DateTimeFilter,
  encodeBooleanScoreEntry,
  FilterList,
  filtersRequireEventsFull,
  NullFilter,
  NumberFilter,
  NumberObjectFilter,
  StringFilter,
  StringObjectFilter,
  StringOptionsFilter,
} from "./clickhouse-filter";

describe("clickhouse filters", () => {
  beforeEach(() => {
    randomState.next = 1;
  });

  describe("StringFilter", () => {
    const queryByOperator = {
      "=": "o.name = {stringFilterx1: String}",
      contains: "position(o.name, {stringFilterx1: String}) > 0",
      "does not contain": "position(o.name, {stringFilterx1: String}) = 0",
      "starts with": "startsWith(o.name, {stringFilterx1: String})",
      "ends with": "endsWith(o.name, {stringFilterx1: String})",
    } satisfies Record<(typeof filterOperators.string)[number], string>;

    it.each(filterOperators.string)("lowers the %s operator", (operator) => {
      expect(
        new StringFilter({
          clickhouseTable: "observations",
          tablePrefix: "o",
          field: "name",
          operator,
          value: "needle",
        }).apply(),
      ).toEqual({
        query: queryByOperator[operator],
        params: { stringFilterx1: "needle" },
      });
    });

    it("keeps quotes, backslashes, and unicode escape text in bound params", () => {
      const value = String.raw`quote'\\slash\u1234`;
      const result = new StringFilter({
        clickhouseTable: "observations",
        field: "name",
        operator: "=",
        value,
      }).apply();

      expect(result.query).not.toContain(value);
      expect(result.params).toEqual({ stringFilterx1: value });
    });

    it.each(["=", "contains", "starts with", "ends with"] as const)(
      "treats empty string as null for %s",
      (operator) => {
        expect(
          new StringFilter({
            clickhouseTable: "observations",
            field: "name",
            operator,
            value: "",
            emptyEqualsNull: true,
          }).apply(),
        ).toEqual({
          query: "(name = '' OR name IS NULL)",
          params: {},
        });
      },
    );

    it("excludes empty and null values for does-not-contain", () => {
      expect(
        new StringFilter({
          clickhouseTable: "observations",
          field: "name",
          operator: "does not contain",
          value: "needle",
          emptyEqualsNull: true,
        }).apply(),
      ).toEqual({
        query: "(name != '' AND position(name, {stringFilterx1: String}) = 0)",
        params: { stringFilterx1: "needle" },
      });
    });

    it("uses the indexed literal-match predicate for events text", () => {
      const result = new StringFilter({
        clickhouseTable: "events_full",
        tablePrefix: "e",
        field: "input",
        operator: FTS_MATCH_OPERATOR,
        value: "hello world",
      }).apply();

      expect(result.query).toBe(
        "(position(lower(e.input), lower({stringFilterx1: String})) > 0 AND hasAllTokens(lower(e.input), arraySlice(arrayDistinct(tokens(lower({stringFilterx1: String}))), 1, 64)))",
      );
      expect(result.params).toEqual({ stringFilterx1: "hello world" });
    });

    it.each([
      ["observations", "input", "hello"],
      ["events_full", "name", "hello"],
      ["events_full", "input", "   "],
    ] as const)(
      "rejects matches for table %s, field %s, and value %j",
      (clickhouseTable, field, value) => {
        expect(() =>
          new StringFilter({
            clickhouseTable,
            field,
            operator: FTS_MATCH_OPERATOR,
            value,
          }).apply(),
        ).toThrow();
      },
    );
  });

  describe("scalar filters", () => {
    const numberOperators = [...filterOperators.number, "!="] as const;

    it.each(numberOperators)("lowers number operator %s", (operator) => {
      expect(
        new NumberFilter({
          clickhouseTable: "observations",
          tablePrefix: "o",
          field: "cost",
          operator,
          value: 12.5,
        }).apply(),
      ).toEqual({
        query: `o.cost ${operator} {numberFilterx1: Decimal64(12)}`,
        params: { numberFilterx1: "12.5" },
      });
    });

    it("supports a ClickHouse numeric type override", () => {
      expect(
        new NumberFilter({
          clickhouseTable: "events_full",
          field: "duration",
          operator: ">",
          value: 42,
          clickhouseTypeOverwrite: "UInt64",
        }).apply().query,
      ).toBe("duration > {numberFilterx1: UInt64}");
    });

    it.each(filterOperators.datetime)(
      "lowers datetime operator %s",
      (operator) => {
        expect(
          new DateTimeFilter({
            clickhouseTable: "events_full",
            tablePrefix: "e",
            field: "start_time",
            operator,
            value: new Date("2026-01-02T03:04:05.678Z"),
          }).apply(),
        ).toEqual({
          query: `e.start_time ${operator} {dateTimeFilterx1: DateTime64(3)}`,
          params: { dateTimeFilterx1: 1767323045678 },
        });
      },
    );

    it.each(filterOperators.boolean)(
      "lowers boolean operator %s",
      (operator) => {
        expect(
          new BooleanFilter({
            clickhouseTable: "events_full",
            tablePrefix: "e",
            field: "is_deleted",
            operator,
            value: true,
          }).apply(),
        ).toEqual({
          query: `e.is_deleted ${operator} {booleanFilterx1: Boolean}`,
          params: { booleanFilterx1: true },
        });
      },
    );
  });

  describe("option filters", () => {
    it.each([
      ["any of", "IN"],
      ["none of", "NOT IN"],
    ] as const)(
      "lowers string-options operator %s",
      (operator, sqlOperator) => {
        expect(
          new StringOptionsFilter({
            clickhouseTable: "events_full",
            tablePrefix: "e",
            field: "type",
            operator,
            values: ["SPAN", "GENERATION"],
          }).apply(),
        ).toEqual({
          query: `e.type ${sqlOperator} ({stringOptionsFilterx1: Array(String)})`,
          params: { stringOptionsFilterx1: ["SPAN", "GENERATION"] },
        });
      },
    );

    it.each([
      ["any of", "hasAny"],
      ["none of", "NOT hasAny"],
    ] as const)(
      "lowers category-options operator %s",
      (operator, functionName) => {
        expect(
          new CategoryOptionsFilter({
            clickhouseTable: "traces",
            tablePrefix: "t",
            field: "score_categories",
            key: "sentiment",
            operator,
            values: ["positive", "neutral"],
          }).apply(),
        ).toEqual({
          query: `${functionName}(t.score_categories, {categoryOptionsFilterx1: Array(String)})`,
          params: {
            categoryOptionsFilterx1: [
              "sentiment:positive",
              "sentiment:neutral",
            ],
          },
        });
      },
    );

    const arrayQueryByOperator = {
      "any of": "hasAny({arrayOptionsFilterx1: Array(String)}, o.tags) = True",
      "none of":
        "hasAny({arrayOptionsFilterx1: Array(String)}, o.tags) = False",
      "all of": "hasAll(o.tags, {arrayOptionsFilterx1: Array(String)}) = True",
    } satisfies Record<(typeof filterOperators.arrayOptions)[number], string>;

    it.each(filterOperators.arrayOptions)(
      "lowers array-options operator %s",
      (operator) => {
        expect(
          new ArrayOptionsFilter({
            clickhouseTable: "observations",
            tablePrefix: "o",
            field: "tags",
            operator,
            values: [],
          }).apply(),
        ).toEqual({
          query: arrayQueryByOperator[operator],
          params: { arrayOptionsFilterx1: [] },
        });
      },
    );

    it.each([
      [
        "any of",
        [""],
        "(name IN ({stringOptionsFilterx1: Array(String)}) OR name IS NULL)",
      ],
      [
        "none of",
        [""],
        "(name NOT IN ({stringOptionsFilterx1: Array(String)}) AND name IS NOT NULL)",
      ],
      [
        "none of",
        ["value"],
        "(name NOT IN ({stringOptionsFilterx1: Array(String)}) AND name != '')",
      ],
    ] as const)(
      "applies empty-equals-null semantics for %s with %j",
      (operator, values, query) => {
        expect(
          new StringOptionsFilter({
            clickhouseTable: "observations",
            field: "name",
            operator,
            values: [...values],
            emptyEqualsNull: true,
          }).apply(),
        ).toEqual({
          query,
          params: { stringOptionsFilterx1: [...values] },
        });
      },
    );
  });

  describe("object filters", () => {
    const stringObjectQueryByOperator = {
      "=": "o.metadata[{stringObjectKeyFilterx1: String}] = {stringObjectValueFilterx2: String}",
      contains:
        "position(o.metadata[{stringObjectKeyFilterx1: String}], {stringObjectValueFilterx2: String}) > 0",
      "does not contain":
        "position(o.metadata[{stringObjectKeyFilterx1: String}], {stringObjectValueFilterx2: String}) = 0",
      "starts with":
        "startsWith(o.metadata[{stringObjectKeyFilterx1: String}], {stringObjectValueFilterx2: String})",
      "ends with":
        "endsWith(o.metadata[{stringObjectKeyFilterx1: String}], {stringObjectValueFilterx2: String})",
    } satisfies Record<(typeof filterOperators.stringObject)[number], string>;

    it.each(filterOperators.stringObject)(
      "lowers map string-object operator %s",
      (operator) => {
        expect(
          new StringObjectFilter({
            clickhouseTable: "observations",
            tablePrefix: "o",
            field: "metadata",
            key: "environment",
            operator,
            value: "production",
          }).apply(),
        ).toEqual({
          query: stringObjectQueryByOperator[operator],
          params: {
            stringObjectKeyFilterx1: "environment",
            stringObjectValueFilterx2: "production",
          },
        });
      },
    );

    it("uses metadata name/value arrays and escaped ngram prefilter params for events", () => {
      const value = String.raw`50%_done\\next`;
      const result = new StringObjectFilter({
        clickhouseTable: "events_full",
        tablePrefix: "e",
        field: "metadata",
        key: "status",
        operator: "contains",
        value,
      }).apply();

      expect(result).toEqual({
        query:
          "has(e.metadata_names, {stringObjectKeyFilterx1: String}) AND like(arrayStringConcat(e.metadata_values), {stringObjectNgramFilterx3: String}) AND (position(e.metadata_values[indexOf(e.metadata_names, {stringObjectKeyFilterx1: String})], {stringObjectValueFilterx2: String}) > 0)",
        params: {
          stringObjectKeyFilterx1: "status",
          stringObjectValueFilterx2: value,
          stringObjectNgramFilterx3: String.raw`%50\%\_done\\\\next%`,
        },
      });
    });

    it("uses the indexed literal-match predicate for events metadata", () => {
      expect(
        new StringObjectFilter({
          clickhouseTable: "events_full",
          tablePrefix: "e",
          field: "metadata",
          key: "environment",
          operator: FTS_MATCH_OPERATOR,
          value: "prod east",
        }).apply(),
      ).toEqual({
        query:
          "has(e.metadata_names, {stringObjectKeyFilterx1: String}) AND hasAllTokens(e.metadata_values, arraySlice(arrayDistinct(tokens({stringObjectValueFilterx2: String})), 1, 64)) AND (position(e.metadata_values[indexOf(e.metadata_names, {stringObjectKeyFilterx1: String})], {stringObjectValueFilterx2: String}) > 0)",
        params: {
          stringObjectKeyFilterx1: "environment",
          stringObjectValueFilterx2: "prod east",
        },
      });
    });

    const numberObjectOperators = [
      ...filterOperators.numberObject,
      "!=",
    ] as const;

    it.each(numberObjectOperators)(
      "lowers number-object operator %s",
      (operator) => {
        expect(
          new NumberObjectFilter({
            clickhouseTable: "traces",
            tablePrefix: "t",
            field: "scores_avg",
            key: "quality",
            operator,
            value: 0.75,
          }).apply(),
        ).toEqual({
          query: `empty(arrayFilter(x -> (((x.1) = {numberObjectKeyFilterx1: String}) AND ((x.2) ${operator} {numberObjectValueFilterx2: Decimal64(12)})), t.scores_avg)) = 0`,
          params: {
            numberObjectKeyFilterx1: "quality",
            numberObjectValueFilterx2: 0.75,
          },
        });
      },
    );

    it.each(filterOperators.booleanObject)(
      "lowers boolean-object operator %s",
      (operator) => {
        expect(
          new BooleanObjectFilter({
            clickhouseTable: "traces",
            tablePrefix: "t",
            field: "score_booleans",
            key: "approved",
            operator,
            value: true,
          }).apply(),
        ).toEqual({
          query: `${operator === "<>" ? "NOT " : ""}has(t.score_booleans, {booleanObjectFilterx1: String})`,
          params: { booleanObjectFilterx1: "approved:true" },
        });
      },
    );

    it("encodes boolean score entries with canonical lowercase values", () => {
      expect(encodeBooleanScoreEntry("approved", true)).toBe("approved:true");
      expect(encodeBooleanScoreEntry("approved", false)).toBe("approved:false");
    });
  });

  describe("null and composition behavior", () => {
    it.each(filterOperators.null)("lowers null operator %s", (operator) => {
      expect(
        new NullFilter({
          clickhouseTable: "observations",
          tablePrefix: "o",
          field: "completion_start_time",
          operator,
        }).apply(),
      ).toEqual({
        query: `o.completion_start_time ${operator}`,
        params: {},
      });
    });

    it.each([
      ["is null", "(o.name = '' OR o.name IS NULL)"],
      ["is not null", "(o.name != '' AND o.name IS NOT NULL)"],
    ] as const)("equates empty string and null for %s", (operator, query) => {
      expect(
        new NullFilter({
          clickhouseTable: "observations",
          tablePrefix: "o",
          field: "name",
          operator,
          emptyEqualsNull: true,
        }).apply(),
      ).toEqual({ query, params: {} });
    });

    it("returns an empty predicate for an empty list", () => {
      expect(new FilterList().apply()).toEqual({ query: "", params: {} });
    });

    it("composes filters with AND and collision-free parameter names", () => {
      const result = new FilterList([
        new StringFilter({
          clickhouseTable: "events_full",
          field: "name",
          operator: "=",
          value: "first",
        }),
        new StringFilter({
          clickhouseTable: "events_full",
          field: "name",
          operator: "=",
          value: "second",
        }),
      ]).apply();

      expect(result).toEqual({
        query:
          "name = {stringFilterx1: String} AND name = {stringFilterx2: String}",
        params: {
          stringFilterx1: "first",
          stringFilterx2: "second",
        },
      });
    });
  });

  describe("filtersRequireEventsFull", () => {
    it("requires events_full for event input/output and metadata filters", () => {
      expect(
        filtersRequireEventsFull(
          new FilterList([
            new StringFilter({
              clickhouseTable: "events_core",
              field: "input",
              operator: "contains",
              value: "needle",
            }),
          ]),
        ),
      ).toBe(true);
      expect(
        filtersRequireEventsFull(
          new FilterList([
            new StringObjectFilter({
              clickhouseTable: "events_core",
              field: "metadata",
              key: "environment",
              operator: "=",
              value: "production",
            }),
          ]),
        ),
      ).toBe(true);
    });

    it("keeps core-safe and non-events filters on their original table", () => {
      expect(
        filtersRequireEventsFull(
          new FilterList([
            new StringFilter({
              clickhouseTable: "events_core",
              field: "name",
              operator: "=",
              value: "trace",
            }),
            new StringFilter({
              clickhouseTable: "observations",
              field: "input",
              operator: "contains",
              value: "needle",
            }),
          ]),
        ),
      ).toBe(false);
    });
  });
});
