import {
  buildWidgetImportAllowedValues,
  parseAndNormalizeImportedWidget,
} from "./import-export-utils";

describe("parseAndNormalizeImportedWidget", () => {
  const baseWidget = {
    name: "Imported widget",
    description: "Round-trip export",
    view: "traces" as const,
    dimensions: [],
    metrics: [{ measure: "count", agg: "count" as const }],
    chartType: "NUMBER" as const,
    chartConfig: { type: "NUMBER" as const },
    minVersion: 1,
  };

  it("keeps recognized filter values", () => {
    const result = parseAndNormalizeImportedWidget({
      parsedJson: {
        ...baseWidget,
        filters: [
          {
            column: "environment",
            operator: "any of",
            value: ["prod"],
            type: "stringOptions",
          },
        ],
      },
      allowedValuesByColumn: new Map([["environment", new Set(["prod"])]]),
    });

    expect(result.widget.filters).toEqual([
      {
        column: "environment",
        operator: "any of",
        value: ["prod"],
        type: "stringOptions",
      },
    ]);
    expect(result.removedValues).toBe(false);
    expect(result.removedFilters).toBe(false);
  });

  it("keeps option filters when allowed values are still unavailable", () => {
    const result = parseAndNormalizeImportedWidget({
      parsedJson: {
        ...baseWidget,
        filters: [
          {
            column: "environment",
            operator: "any of",
            value: ["prod"],
            type: "stringOptions",
          },
        ],
      },
      allowedValuesByColumn: buildWidgetImportAllowedValues(
        {
          observationLevels: [],
        },
        {
          ...baseWidget,
          filters: [],
        },
      ),
    });

    expect(result.widget.filters).toEqual([
      {
        column: "environment",
        operator: "any of",
        value: ["prod"],
        type: "stringOptions",
      },
    ]);
    expect(result.removedValues).toBe(false);
    expect(result.removedFilters).toBe(false);
  });

  it("drops unavailable option values instead of rejecting the import", () => {
    const result = parseAndNormalizeImportedWidget({
      parsedJson: {
        ...baseWidget,
        filters: [
          {
            column: "environment",
            operator: "any of",
            value: ["prod"],
            type: "stringOptions",
          },
        ],
      },
      allowedValuesByColumn: new Map([["environment", new Set()]]),
    });

    expect(result.widget.filters).toEqual([]);
    expect(result.removedValues).toBe(true);
    expect(result.removedFilters).toBe(false);
  });
});
