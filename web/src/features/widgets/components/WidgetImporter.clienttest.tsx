import { describe, expect, it, vi } from "vitest";

import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

import { __test } from "./WidgetImporter";

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: vi.fn(),
}));
vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

const { buildImportOptionSets, runImport } = __test;

const baseWidget = {
  name: "Imported widget",
  description: "",
  view: "traces" as const,
  dimensions: [],
  metrics: [{ measure: "count", agg: "count" as const }],
  filters: [] as unknown[],
  chartType: "NUMBER" as const,
  chartConfig: { type: "NUMBER" as const },
  minVersion: 1,
};

const fileFor = (json: unknown): File =>
  ({ text: async () => JSON.stringify(json) }) as File;

describe("buildImportOptionSets", () => {
  it("gates to only observationLevels when the v1 queries are disabled (no data)", () => {
    const optionSets = buildImportOptionSets({
      environmentFilterOptionsData: undefined,
      traceFilterOptionsData: undefined,
      generationsFilterOptionsData: undefined,
    });

    expect(optionSets.environmentValues).toBeUndefined();
    expect(optionSets.traceNames).toBeUndefined();
    expect(optionSets.tags).toBeUndefined();
    expect(optionSets.toolNames).toBeUndefined();
    expect(optionSets.calledToolNames).toBeUndefined();
    expect(optionSets.modelNames).toBeUndefined();
    expect(optionSets.observationLevels.length).toBeGreaterThan(0);
  });
});

describe("runImport", () => {
  it("calls onImport with the snapshot on success", async () => {
    const onImport = vi.fn();

    await runImport({
      file: fileFor({ ...baseWidget, filters: [] }),
      optionSets: { observationLevels: [] },
      isBetaEnabled: false,
      onImport,
    });

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0].widgetName).toBe("Imported widget");
    expect(showSuccessToast).toHaveBeenCalledTimes(1);
  });

  it("skips onImport and surfaces the malformed toast on invalid input", async () => {
    const onImport = vi.fn();

    await runImport({
      file: { text: async () => "not json" } as File,
      optionSets: { observationLevels: [] },
      isBetaEnabled: false,
      onImport,
    });

    expect(onImport).not.toHaveBeenCalled();
    expect(showErrorToast).toHaveBeenCalledWith(
      "Malformed input",
      expect.any(String),
      "WARNING",
    );
  });

  it("fires the adjusted toast when values are pruned", async () => {
    const onImport = vi.fn();

    await runImport({
      file: fileFor({
        ...baseWidget,
        filters: [
          {
            column: "environment",
            operator: "any of",
            value: ["prod"],
            type: "stringOptions",
          },
        ],
      }),
      optionSets: { observationLevels: [], environmentValues: [] },
      isBetaEnabled: false,
      onImport,
    });

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(showErrorToast).toHaveBeenCalledWith(
      "Widget filters were adjusted",
      expect.any(String),
      "WARNING",
    );
  });
});
