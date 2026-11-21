import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  decodeFiltersGeneric,
  encodeFiltersGeneric,
} from "../../filters/filterQueryEncoding";
import type { FilterState } from "../../../types";
import type { MonitorView } from "../types";

const envMock = vi.hoisted(() => ({
  env: { NEXTAUTH_URL: undefined as string | undefined },
}));
vi.mock("../../../env", () => envMock);

import { buildDataWindowPermalink } from "./buildDataWindowPermalink";

describe("buildDataWindowPermalink", () => {
  const from = new Date("2026-05-18T11:55:30.000Z"); // 1779450930000
  const to = new Date("2026-05-18T12:00:30.000Z"); // 1779451230000
  const link = (view: MonitorView, filters: FilterState = []) =>
    buildDataWindowPermalink({
      projectId: "proj_01",
      view,
      fromTimestamp: from,
      toTimestamp: to,
      filters,
    });

  beforeEach(() => {
    envMock.env.NEXTAUTH_URL = undefined;
  });

  it("returns undefined when NEXTAUTH_URL is unset (self-hosted)", () => {
    expect(link("observations")).toBeUndefined();
  });

  it("links an observations monitor to the observations table with its filters and all environments", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
    const filters: FilterState = [
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
      {
        column: "tags",
        type: "arrayOptions",
        operator: "any of",
        value: ["a"],
      },
      { column: "traceVersion", type: "string", operator: "=", value: "v1" },
      { column: "traceRelease", type: "string", operator: "=", value: "r1" },
      {
        column: "observationName",
        type: "string",
        operator: "=",
        value: "llm",
      },
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
    ];
    const url = new URL(link("observations", filters)!);
    expect(url.pathname).toBe("/project/proj_01/observations");
    expect(url.searchParams.get("dateRange")).toBe(
      `${from.getTime()}-${to.getTime()}`,
    );
    expect(url.searchParams.get("showAllEnvironments")).toBe("true");
    expect(
      decodeFiltersGeneric(url.searchParams.get("filter")!).map(
        (f) => f.column,
      ),
    ).toEqual([
      "environment",
      "traceTags",
      "version",
      "release",
      "name",
      "level",
    ]);

    const unfiltered = new URL(link("observations")!);
    expect(unfiltered.searchParams.get("filter")).toBe("");
  });

  it.each([
    ["scores-numeric", ["NUMERIC", "BOOLEAN"]],
    ["scores-boolean", ["BOOLEAN"]],
    ["scores-categorical", ["CATEGORICAL"]],
  ] as const)(
    "links a %s monitor to the scores table windowed by dateRange",
    (view, dataType) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      const url = new URL(link(view)!);
      expect(url.pathname).toBe("/project/proj_01/scores");
      expect(url.searchParams.get("dateRange")).toBe(
        `${from.getTime()}-${to.getTime()}`,
      );
      expect(url.searchParams.get("showAllEnvironments")).toBe("true");
      expect(decodeFiltersGeneric(url.searchParams.get("filter")!)).toEqual([
        {
          column: "dataType",
          type: "stringOptions",
          operator: "any of",
          value: dataType,
        },
      ]);
    },
  );

  it("round-trips score predicates and metadata keys through the table URL", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
    const filters: FilterState = [
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["Source verified; α, β | γ"],
      },
      { column: "value", type: "number", operator: "=", value: 0 },
      {
        column: "metadata",
        type: "stringObject",
        key: "deployment.region",
        operator: "=",
        value: "a&b",
      },
      {
        column: "environment",
        type: "stringOptions",
        operator: "none of",
        value: ["staging"],
      },
    ];
    const url = new URL(link("scores-numeric", filters)!);
    expect(
      decodeFiltersGeneric(url.searchParams.get("filter")!).slice(
        0,
        filters.length,
      ),
    ).toEqual(filters);
    expect(url.searchParams.get("showAllEnvironments")).toBe("true");
    const decoded = decodeFiltersGeneric(url.searchParams.get("filter")!);
    expect(decodeFiltersGeneric(encodeFiltersGeneric(decoded))).toEqual(
      decoded,
    );
  });

  it.each(["key;name", "key,name", "key%", "%41"])(
    "carries metadata key %s to the scores table",
    (key) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      const url = new URL(
        link("scores-numeric", [
          {
            column: "metadata",
            type: "stringObject",
            key,
            operator: "=",
            value: "value",
          },
        ])!,
      );
      expect(decodeFiltersGeneric(url.searchParams.get("filter")!)).toEqual([
        expect.objectContaining({ column: "metadata", key }),
        expect.anything(),
      ]);
    },
  );

  it.each([
    ["=", true, "any of"],
    ["<>", true, "none of"],
    ["=", false, "any of"],
    ["<>", false, "none of"],
  ] as const)(
    "carries boolean score %s %s to the Boolean Value facet",
    (operator, value, expectedOperator) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      const isEvaluatorTest = {
        column: "isEvaluatorTest",
        type: "boolean",
        operator: "<>",
        value: true,
      } as const;
      const url = new URL(
        link("scores-boolean", [
          { column: "booleanValue", type: "boolean", operator, value },
          isEvaluatorTest,
        ])!,
      );
      expect(decodeFiltersGeneric(url.searchParams.get("filter")!)).toEqual(
        expect.arrayContaining([
          {
            column: "booleanValue",
            type: "stringOptions",
            operator: expectedOperator,
            value: [String(value)],
          },
          isEvaluatorTest,
        ]),
      );
    },
  );

  it.each(["is null", "is not null"] as const)(
    "passes a booleanValue %s filter through to the scores table",
    (operator) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      const filter = {
        column: "booleanValue",
        type: "null",
        operator,
        value: "",
      } as const;
      const url = new URL(link("scores-boolean", [filter])!);
      expect(decodeFiltersGeneric(url.searchParams.get("filter")!)).toEqual(
        expect.arrayContaining([filter]),
      );
    },
  );

  it.each([
    { column: "traceName", type: "string", operator: "=", value: "example" },
    { column: "userId", type: "string", operator: "=", value: "example" },
    { column: "tags", type: "arrayOptions", operator: "any of", value: ["a"] },
    {
      column: "observationName",
      type: "string",
      operator: "=",
      value: "example",
    },
    { column: "traceRelease", type: "string", operator: "=", value: "r1" },
    { column: "traceVersion", type: "string", operator: "=", value: "v1" },
    { column: "observationId", type: "string", operator: "=", value: "" },
  ] satisfies FilterState)(
    "passes the $column filter through to the scores table",
    (filter) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      const url = new URL(link("scores-numeric", [filter])!);
      expect(decodeFiltersGeneric(url.searchParams.get("filter")!)).toEqual(
        expect.arrayContaining([filter]),
      );
    },
  );

  it.each(["observations", "scores-numeric"] as const)(
    "omits the %s data link when a filter value cannot be encoded",
    (view) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      expect(
        link(view, [
          { column: "name", type: "string", operator: "=", value: "\ud800" },
        ]),
      ).toBeUndefined();
    },
  );

  it("strips a trailing slash on NEXTAUTH_URL", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com/";
    expect(link("observations")).toBe(
      `https://cloud.langfuse.com/project/proj_01/observations?dateRange=${from.getTime()}-${to.getTime()}&filter=&showAllEnvironments=true`,
    );
  });
});
