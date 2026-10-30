import { getExperimentsFilterConfig } from "@/src/features/experiments/components/table/filter-config";
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

describe("folding the legacy dataset column", () => {
  const nameById = new Map([
    ["ds-legal", "legal-answer-quality"],
    ["ds-judge", "groundedness-judge-calibration"],
  ]);
  const migrate = (filters: FilterState, map = nameById) =>
    getExperimentsFilterConfig([], map).migrateFilterState!(filters);

  const legacy = (...ids: string[]): FilterState => [
    {
      type: "stringOptions",
      column: "experimentDatasetId",
      operator: "any of",
      value: ids,
    },
  ];

  it("moves the filter onto the canonical column as the dataset NAME", () => {
    // The facet's options and labels are keyed by name, so folding the id
    // through unchanged would show an opaque id with nothing checked.
    expect(migrate(legacy("ds-legal"))).toEqual([
      {
        type: "stringOptions",
        column: "experimentDatasetName",
        operator: "any of",
        value: ["legal-answer-quality"],
      },
    ]);
  });

  it("waits rather than folding while the id -> name map is empty", () => {
    // The legacy column is real, so leaving it alone keeps querying correctly.
    const filters = legacy("ds-legal");
    expect(migrate(filters, new Map())).toBe(filters);
  });

  it("leaves an id it cannot name alone", () => {
    // A deleted dataset must not become a name that matches nothing.
    const filters = legacy("ds-deleted");
    expect(migrate(filters)).toEqual(filters);
  });

  it("folds all values of an entry or none of them", () => {
    const filters = legacy("ds-legal", "ds-deleted");
    expect(migrate(filters)).toEqual(filters);
  });

  it("cannot leave two dataset filters behind", () => {
    const migrated = migrate([...legacy("ds-legal"), ...legacy("ds-judge")]);

    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({
      column: "experimentDatasetName",
      value: ["legal-answer-quality"],
    });
  });

  it("leaves a filter state without the legacy column untouched", () => {
    const filters: FilterState = [
      {
        type: "stringOptions",
        column: "experimentDatasetName",
        operator: "any of",
        value: ["legal-answer-quality"],
      },
    ];

    expect(migrate(filters)).toBe(filters);
  });
});
