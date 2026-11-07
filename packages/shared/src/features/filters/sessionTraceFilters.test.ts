import { describe, expect, it } from "vitest";
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
});
