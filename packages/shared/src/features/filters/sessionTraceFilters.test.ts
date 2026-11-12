import { describe, expect, it } from "vitest";
import { SessionViewInputSchema } from "../../domain/session-views";
import { type FilterState } from "../../types";
import { normalizeLegacySessionPositionInTraceFilters } from "./sessionPositionInTrace";
import { sessionTraceFilterSchema } from "./sessionTraceFilters";

describe("session customization filters", () => {
  it.each(["name", "traceName", "type", "level", "environment"])(
    "accepts equality for %s",
    (column) => {
      expect(
        sessionTraceFilterSchema.safeParse([
          { column, type: "string", operator: "=", value: "example" },
        ]).success,
      ).toBe(true);
    },
  );

  it.each(["scores_avg", "trace_scores_avg"])("rejects %s", (column) => {
    expect(
      sessionTraceFilterSchema.safeParse([
        {
          column,
          type: "numberObject",
          key: "quality",
          operator: ">",
          value: 0.5,
        },
      ]).success,
    ).toBe(false);
  });

  it.each(["metadata", "userId", "commentContent"])(
    "rejects unsupported field %s",
    (column) => {
      expect(
        sessionTraceFilterSchema.safeParse([
          { column, type: "string", operator: "=", value: "example" },
        ]).success,
      ).toBe(false);
    },
  );

  it("rejects unsupported operators and position selection", () => {
    expect(
      sessionTraceFilterSchema.safeParse([
        { column: "type", type: "string", operator: "contains", value: "GEN" },
      ]).success,
    ).toBe(false);
    expect(
      sessionTraceFilterSchema.safeParse([
        {
          column: "positionInTrace",
          type: "positionInTrace",
          operator: "=",
          key: "last",
          value: 1,
        },
      ]).success,
    ).toBe(false);
  });

  it("accepts root-observation selection", () => {
    expect(
      sessionTraceFilterSchema.safeParse([
        {
          column: "isRootObservation",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ]).success,
    ).toBe(true);
  });

  it("normalizes legacy root positions while preserving other filters", () => {
    const filters: FilterState = [
      { column: "type", type: "string", operator: "=", value: "SPAN" },
      {
        column: "positionInTrace",
        type: "positionInTrace",
        operator: "=",
        key: "root",
        value: 1,
      },
    ];
    expect(normalizeLegacySessionPositionInTraceFilters(filters)).toEqual([
      filters[0],
      { ...filters[1], key: "first" },
    ]);
  });

  it("normalizes supported legacy display names without dropping filters", () => {
    expect(
      sessionTraceFilterSchema.parse([
        { column: "Type", type: "string", operator: "=", value: "SPAN" },
        {
          column: "Environment",
          type: "string",
          operator: "=",
          value: "production",
        },
      ]),
    ).toEqual([
      { column: "type", type: "string", operator: "=", value: "SPAN" },
      {
        column: "environment",
        type: "string",
        operator: "=",
        value: "production",
      },
    ]);
  });

  it("normalizes legacy aliases identically in saved views and URL filters", () => {
    const filters: FilterState = [
      { column: "rootType", type: "string", operator: "=", value: "SPAN" },
    ];
    const view = SessionViewInputSchema.parse({
      projectId: "project",
      name: "Legacy",
      filters,
      viewMode: "list",
      unmatchedTraces: "hide",
    });
    expect(view.filters).toEqual(sessionTraceFilterSchema.parse(filters));
    expect(view.filters).toEqual([
      { column: "type", type: "string", operator: "=", value: "SPAN" },
    ]);
  });

  it("rejects unsupported legacy filters at the saved-view input boundary", () => {
    expect(
      SessionViewInputSchema.safeParse({
        projectId: "project",
        name: "Legacy",
        filters: [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION", "SPAN"],
          },
        ],
        viewMode: "list",
        unmatchedTraces: "hide",
      }).success,
    ).toBe(false);
  });
});
