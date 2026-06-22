import {
  buildWidgetImportAllowedValues,
  importWidgetFile,
  parseAndNormalizeImportedWidget,
  toImportedWidgetFormSnapshot,
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

  it("marks unsupported cross-view filters as removed", () => {
    const result = parseAndNormalizeImportedWidget({
      parsedJson: {
        ...baseWidget,
        filters: [
          {
            column: "level",
            operator: "any of",
            value: ["ERROR"],
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

    expect(result.widget.filters).toEqual([]);
    expect(result.removedFilters).toBe(true);
  });

  it("normalizes imported traces widgets with minVersion 2 back to v1", async () => {
    const result = await importWidgetFile({
      file: {
        text: async () =>
          JSON.stringify({
            ...baseWidget,
            filters: [],
            minVersion: 2,
          }),
      } as File,
      optionSets: {
        observationLevels: [],
      },
      isBetaEnabled: true,
    });

    expect(result.snapshot.selectedView).toBe("traces");
    expect(result.snapshot.widgetMinVersion).toBe(1);
  });
});

describe("toImportedWidgetFormSnapshot", () => {
  it("preserves the stringObject dimension key", () => {
    const snapshot = toImportedWidgetFormSnapshot({
      name: "Tokens by agent",
      description: "",
      view: "observations",
      dimensions: [{ field: "metadata", key: "agentName" }],
      metrics: [{ measure: "count", agg: "count" }],
      filters: [],
      chartType: "LINE_TIME_SERIES",
      chartConfig: { type: "LINE_TIME_SERIES" },
      minVersion: 2,
    });

    expect(snapshot.selectedDimension).toBe("metadata");
    expect(snapshot.selectedDimensionKey).toBe("agentName");
  });

  it("defaults the dimension key to empty when absent", () => {
    const snapshot = toImportedWidgetFormSnapshot({
      name: "Count by name",
      description: "",
      view: "observations",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "count", agg: "count" }],
      filters: [],
      chartType: "LINE_TIME_SERIES",
      chartConfig: { type: "LINE_TIME_SERIES" },
      minVersion: 2,
    });

    expect(snapshot.selectedDimension).toBe("name");
    expect(snapshot.selectedDimensionKey).toBe("");
  });
});
