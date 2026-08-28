import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";

import { withDatasetNamesResolved } from "./datasetNameFilter";

const idByName = new Map([
  ["legal-answer-quality", "ds-legal"],
  ["groundedness-judge-calibration", "ds-ground"],
]);

const nameFilter = (values: string[]): FilterState => [
  {
    column: "experimentDatasetName",
    type: "stringOptions",
    operator: "any of",
    value: values,
  },
];

describe("withDatasetNamesResolved", () => {
  it("swaps names for ids and keeps the operator", () => {
    expect(
      withDatasetNamesResolved(nameFilter(["legal-answer-quality"]), idByName),
    ).toEqual([
      {
        column: "experimentDatasetId",
        type: "stringOptions",
        operator: "any of",
        value: ["ds-legal"],
      },
    ]);
  });

  it("leaves other filters and pre-existing id filters untouched", () => {
    const others: FilterState = [
      {
        column: "name",
        type: "string",
        operator: "contains",
        value: "sonnet",
      },
      // A saved view written before the switch already carries the id column.
      {
        column: "experimentDatasetId",
        type: "stringOptions",
        operator: "any of",
        value: ["ds-legal"],
      },
    ];
    expect(withDatasetNamesResolved(others, idByName)).toBe(others);
  });

  it("maps an unknown name to no id rather than dropping the filter", () => {
    // Dropping it would widen the query to every dataset; an unknown dataset
    // must return nothing.
    const [resolved] = withDatasetNamesResolved(
      nameFilter(["deleted-dataset"]),
      idByName,
    );
    expect(resolved).toMatchObject({
      column: "experimentDatasetId",
      value: ["deleted-dataset"],
    });
  });

  it("resolves each name in a multi-value selection", () => {
    expect(
      withDatasetNamesResolved(
        nameFilter(["legal-answer-quality", "groundedness-judge-calibration"]),
        idByName,
      )[0],
    ).toMatchObject({ value: ["ds-legal", "ds-ground"] });
  });
});
