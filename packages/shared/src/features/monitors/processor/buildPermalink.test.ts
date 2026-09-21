import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  decodeFiltersGeneric,
  encodeFiltersGeneric,
} from "../../filters/filterQueryEncoding";
import type { FilterState } from "../../../types";

const envMock = vi.hoisted(() => ({
  env: { NEXTAUTH_URL: undefined as string | undefined },
}));
vi.mock("../../../env", () => envMock);

import {
  buildDataWindowPermalink,
  buildPermalink,
  isBreaching,
} from "./processor";

describe("buildPermalink", () => {
  beforeEach(() => {
    envMock.env.NEXTAUTH_URL = undefined;
  });

  it("returns undefined when NEXTAUTH_URL is unset (self-hosted)", () => {
    expect(buildPermalink("proj_01", "mon_01")).toBeUndefined();
  });

  it("returns an absolute URL when NEXTAUTH_URL is set", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
    expect(buildPermalink("proj_01", "mon_01")).toBe(
      "https://cloud.langfuse.com/project/proj_01/alerts/mon_01",
    );
  });
});

describe("buildDataWindowPermalink", () => {
  const from = new Date("2026-05-18T11:55:30.000Z"); // 1779450930000
  const to = new Date("2026-05-18T12:00:30.000Z"); // 1779451230000

  beforeEach(() => {
    envMock.env.NEXTAUTH_URL = undefined;
  });

  it("returns undefined when NEXTAUTH_URL is unset (self-hosted)", () => {
    expect(
      buildDataWindowPermalink("proj_01", "observations", from, to),
    ).toBeUndefined();
  });

  it("links an observations monitor to the observations table windowed by dateRange", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
    expect(buildDataWindowPermalink("proj_01", "observations", from, to)).toBe(
      `https://cloud.langfuse.com/project/proj_01/observations?dateRange=${from.getTime()}-${to.getTime()}`,
    );
  });

  it.each([
    ["scores-numeric", ["NUMERIC", "BOOLEAN"]],
    ["scores-boolean", "BOOLEAN"],
    ["scores-categorical", "CATEGORICAL"],
  ] as const)(
    "links a %s monitor to the scores table windowed by dateRange",
    (view, dataType) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      const url = new URL(buildDataWindowPermalink("proj_01", view, from, to)!);
      expect(url.pathname).toBe("/project/proj_01/scores");
      expect(url.searchParams.get("dateRange")).toBe(
        `${from.getTime()}-${to.getTime()}`,
      );
      expect(url.searchParams.get("showAllEnvironments")).toBe("true");
      expect(decodeFiltersGeneric(url.searchParams.get("filter")!)).toEqual([
        expect.objectContaining({
          column: "dataType",
          value: dataType,
        }),
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
    const url = new URL(
      buildDataWindowPermalink("proj_01", "scores-numeric", from, to, filters)!,
    );
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
    "omits a link whose metadata key %s cannot survive table canonicalization",
    (key) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      expect(
        buildDataWindowPermalink("proj_01", "scores-numeric", from, to, [
          {
            column: "metadata",
            type: "stringObject",
            key,
            operator: "=",
            value: "value",
          },
        ]),
      ).toBeUndefined();
    },
  );

  it.each([
    ["=", false, 0],
    ["=", true, 1],
    ["<>", false, 1],
    ["<>", true, 0],
  ] as const)(
    "preserves boolean score %s %s through its numeric value",
    (operator, value, expectedValue) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      const url = new URL(
        buildDataWindowPermalink("proj_01", "scores-boolean", from, to, [
          { column: "booleanValue", type: "boolean", operator, value },
          {
            column: "isEvaluatorTest",
            type: "boolean",
            operator: "<>",
            value: true,
          },
        ])!,
      );
      expect(decodeFiltersGeneric(url.searchParams.get("filter")!)).toEqual(
        expect.arrayContaining([
          {
            column: "value",
            type: "number",
            operator: "=",
            value: expectedValue,
          },
          {
            column: "isEvaluatorTest",
            type: "boolean",
            operator: "=",
            value: false,
          },
        ]),
      );
    },
  );

  it.each(["observationName", "traceName", "userId", "tags", "configId"])(
    "omits the data link when %s cannot be reproduced by the scores table",
    (column) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      expect(
        buildDataWindowPermalink("proj_01", "scores-numeric", from, to, [
          { column, type: "string", operator: "=", value: "example" },
        ]),
      ).toBeUndefined();
    },
  );

  it("omits an oversized link without dropping predicates", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
    expect(
      buildDataWindowPermalink("proj_01", "scores-numeric", from, to, [
        {
          column: "name",
          type: "string",
          operator: "=",
          value: "a".repeat(3000),
        },
      ]),
    ).toBeUndefined();
  });

  it.each([
    { column: "observationId", type: "string", operator: "=", value: "" },
    { column: "booleanValue", type: "null", operator: "is null", value: "" },
  ] satisfies FilterState)(
    "omits a link when $column has different empty-value semantics",
    (filter) => {
      envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
      expect(
        buildDataWindowPermalink("proj_01", "scores-numeric", from, to, [
          filter,
        ]),
      ).toBeUndefined();
    },
  );

  it("strips a trailing slash on NEXTAUTH_URL", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com/";
    expect(buildDataWindowPermalink("proj_01", "observations", from, to)).toBe(
      `https://cloud.langfuse.com/project/proj_01/observations?dateRange=${from.getTime()}-${to.getTime()}`,
    );
  });
});

describe("isBreaching", () => {
  it.each(["ALERT", "WARNING"] as const)(
    "treats %s as a breach (gets a data-window link)",
    (severity) => {
      expect(isBreaching(severity)).toBe(true);
    },
  );

  it.each(["OK", "NO_DATA", "UNKNOWN", "PAUSED"] as const)(
    "treats %s as a non-breach (no data-window link)",
    (severity) => {
      expect(isBreaching(severity)).toBe(false);
    },
  );
});
