import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";

import { awaitsDatasetNames } from "./awaitsDatasetNames";

const nameFilter: FilterState = [
  {
    column: "experimentDatasetName",
    type: "stringOptions",
    operator: "any of",
    value: ["legal-answer-quality"],
  },
];

describe("awaitsDatasetNames", () => {
  it("waits while the names query is unsettled", () => {
    expect(
      awaitsDatasetNames(nameFilter, { isSuccess: false, isError: false }),
    ).toBe(true);
  });

  it("lets the query through once the names settle, empty or failed", () => {
    // Both states leave the name -> id map empty, which is why the gate cannot
    // be keyed on the map: either one would hold the table loading forever.
    expect(
      awaitsDatasetNames(nameFilter, { isSuccess: true, isError: false }),
    ).toBe(false);
    expect(
      awaitsDatasetNames(nameFilter, { isSuccess: false, isError: true }),
    ).toBe(false);
  });

  it("never waits without a dataset-name filter", () => {
    expect(awaitsDatasetNames([], { isSuccess: false, isError: false })).toBe(
      false,
    );
  });
});
