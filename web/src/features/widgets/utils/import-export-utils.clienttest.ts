import {
  buildWidgetExport,
  buildWidgetImportAllowedValues,
  importWidgetFile,
  parseAndNormalizeImportedWidget,
  parsePastedWidget,
  WIDGET_FILE_FORMAT_VERSION,
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

  it("accepts an enveloped export file (round-trip)", async () => {
    const result = await importWidgetFile({
      file: {
        text: async () =>
          JSON.stringify(buildWidgetExport({ ...baseWidget, filters: [] })),
      } as File,
      optionSets: {
        observationLevels: [],
      },
      isBetaEnabled: false,
    });

    expect(result.snapshot.widgetName).toBe("Imported widget");
  });

  it("rejects an enveloped file with a newer format version", async () => {
    await expect(
      importWidgetFile({
        file: {
          text: async () =>
            JSON.stringify({
              ...buildWidgetExport({ ...baseWidget, filters: [] }),
              version: WIDGET_FILE_FORMAT_VERSION + 1,
            }),
        } as File,
        optionSets: {
          observationLevels: [],
        },
        isBetaEnabled: false,
      }),
    ).rejects.toThrow();
  });
});

describe("buildWidgetExport", () => {
  it("wraps the widget config in the Langfuse widget envelope", () => {
    const exported = buildWidgetExport({
      name: "My widget",
      description: "",
      view: "traces",
      dimensions: [],
      metrics: [{ measure: "count", agg: "count" }],
      filters: [],
      chartType: "NUMBER",
      chartConfig: { type: "NUMBER" },
      minVersion: 1,
    });

    expect(exported.$langfuseWidget).toBe(true);
    expect(exported.version).toBe(WIDGET_FILE_FORMAT_VERSION);
    expect(exported.name).toBe("My widget");
  });
});

describe("parsePastedWidget", () => {
  const baseWidget = {
    name: "Pasted widget",
    description: "",
    view: "traces" as const,
    dimensions: [],
    metrics: [{ measure: "count", agg: "count" as const }],
    filters: [],
    chartType: "NUMBER" as const,
    chartConfig: { type: "NUMBER" as const },
    minVersion: 1,
  };

  it("ignores non-JSON text", () => {
    expect(parsePastedWidget("hello world", { isBetaEnabled: false })).toEqual({
      status: "not-widget",
    });
  });

  it("ignores JSON without the widget envelope", () => {
    expect(
      parsePastedWidget(JSON.stringify(baseWidget), { isBetaEnabled: false }),
    ).toEqual({ status: "not-widget" });
  });

  it("parses an enveloped widget export", () => {
    const result = parsePastedWidget(
      JSON.stringify(buildWidgetExport(baseWidget)),
      { isBetaEnabled: false },
    );

    expect(result.status).toBe("widget");
    if (result.status === "widget") {
      expect(result.widget.name).toBe("Pasted widget");
      expect(result.widget.chartType).toBe("NUMBER");
    }
  });

  it("rejects a newer format version with a reason", () => {
    const result = parsePastedWidget(
      JSON.stringify({
        ...buildWidgetExport(baseWidget),
        version: WIDGET_FILE_FORMAT_VERSION + 1,
      }),
      { isBetaEnabled: false },
    );

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.reason).toContain("format version");
    }
  });

  it("rejects an enveloped payload with a malformed config", () => {
    const result = parsePastedWidget(
      JSON.stringify({
        ...buildWidgetExport(baseWidget),
        // chartConfig.type no longer matches chartType
        chartConfig: { type: "PIE" },
      }),
      { isBetaEnabled: false },
    );

    expect(result.status).toBe("invalid");
  });
});
