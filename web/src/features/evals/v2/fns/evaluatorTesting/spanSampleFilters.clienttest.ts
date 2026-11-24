import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";

import { observationTreeHints } from "./spanSampleFilters";

const filters = [
  {
    column: "environment",
    type: "stringOptions",
    operator: "any of",
    value: ["production"],
  },
  {
    column: "name",
    type: "string",
    operator: "contains",
    value: "order",
  },
] satisfies FilterState;

describe("observationTreeHints", () => {
  it("marks the tested span and other spans the filters match", () => {
    const hints = observationTreeHints(
      [
        { id: "tested", name: "get_order", environment: "production" },
        { id: "also", name: "list_orders", environment: "production" },
        { id: "other-env", name: "get_order", environment: "staging" },
        { id: "other-name", name: "draft", environment: "production" },
      ],
      filters,
      "tested",
    );

    expect(Object.fromEntries(hints)).toEqual({
      tested: "tested",
      also: "also",
    });
  });
});
