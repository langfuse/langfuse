import type { FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { toggleExampleFilters } from "./toggleExampleFilters";

const generationExample = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["GENERATION"],
  },
] satisfies FilterState;

describe("toggleExampleFilters", () => {
  it("removes an example that is already present while preserving other values", () => {
    const current = [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION", "SPAN"],
      },
    ] satisfies FilterState;

    expect(toggleExampleFilters(current, generationExample)).toEqual([
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["SPAN"],
      },
    ]);
  });

  it("adds the example when it is not present", () => {
    expect(toggleExampleFilters([], generationExample)).toEqual(
      generationExample,
    );
  });

  it("completes a partially present multi-filter example before removing it", () => {
    const example = [
      {
        column: "environment",
        type: "string",
        operator: "does not contain",
        value: "langfuse-",
      },
      {
        column: "experimentId",
        type: "null",
        operator: "is null",
        value: "",
      },
    ] satisfies FilterState;

    expect(toggleExampleFilters([example[0]], example)).toEqual(example);
    expect(toggleExampleFilters(example, example)).toEqual([]);
  });
});
