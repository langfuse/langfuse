import { describe, expect, it } from "vitest";
import type { FilterState } from "../../types";
import { getObservationIoParserFilterValidationErrors } from "./validateParserFilters";

describe("getObservationIoParserFilterValidationErrors", () => {
  it("accepts supported event-local filters", () => {
    const filters: FilterState = [
      {
        type: "stringOptions",
        column: "type",
        operator: "any of",
        value: ["GENERATION"],
      },
      {
        type: "arrayOptions",
        column: "traceTags",
        operator: "any of",
        value: ["prod"],
      },
      {
        type: "number",
        column: "totalTokens",
        operator: ">",
        value: 100,
      },
    ];

    expect(getObservationIoParserFilterValidationErrors(filters)).toEqual([]);
  });

  it("rejects input, output, metadata, score, comment, and position filters", () => {
    const filters: FilterState = [
      {
        type: "string",
        column: "input",
        operator: "contains",
        value: "prompt",
      },
      {
        type: "stringObject",
        column: "metadata",
        key: "foo",
        operator: "=",
        value: "bar",
      },
      {
        type: "numberObject",
        column: "scores",
        key: "accuracy",
        operator: ">",
        value: 0.9,
      },
      {
        type: "positionInTrace",
        column: "position",
        operator: "=",
        key: "root",
      },
      {
        type: "string",
        column: "commentContent",
        operator: "contains",
        value: "todo",
      },
    ];

    const errors = getObservationIoParserFilterValidationErrors(filters);

    expect(errors.map((error) => error.column)).toEqual([
      "input",
      "metadata",
      "scores",
      "position",
      "commentContent",
    ]);
  });
});
