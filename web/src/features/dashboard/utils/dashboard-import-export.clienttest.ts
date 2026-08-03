import { HOME_DASHBOARD_PRESET_IDS } from "@langfuse/shared";
import {
  buildDashboardExport,
  buildPresetExport,
  DASHBOARD_FILE_FORMAT_VERSION,
  isPasteablePlacementPayload,
  parseDashboardImport,
  parsePastedPreset,
  PRESET_FILE_FORMAT_VERSION,
} from "./dashboard-import-export";
import {
  buildWidgetExport,
  type WidgetExportSource,
} from "@/src/features/widgets/utils/import-export-utils";

const baseWidget: WidgetExportSource = {
  name: "Trace count",
  description: "",
  view: "traces",
  dimensions: [],
  metrics: [{ measure: "count", agg: "count" }],
  filters: [],
  chartType: "NUMBER",
  chartConfig: { type: "NUMBER" },
  minVersion: 1,
};

const basePosition = { x: 0, y: 0, x_size: 6, y_size: 6 };

describe("buildDashboardExport", () => {
  it("wraps the definition in the dashboard envelope and inlines widgets", () => {
    const { exportPayload, skippedWidgetCount } = buildDashboardExport({
      name: "My dashboard",
      description: "desc",
      filters: [],
      placements: [
        { type: "widget", widgetId: "w1", ...basePosition },
        {
          type: "preset",
          presetId: HOME_DASHBOARD_PRESET_IDS[0],
          ...basePosition,
          x: 6,
        },
      ],
      widgetsById: new Map([["w1", baseWidget]]),
    });

    expect(exportPayload.$langfuseDashboard).toBe(true);
    expect(exportPayload.version).toBe(DASHBOARD_FILE_FORMAT_VERSION);
    expect(skippedWidgetCount).toBe(0);
    const widgets = exportPayload.widgets as Record<string, any>[];
    expect(widgets).toHaveLength(2);
    expect(widgets[0].widget.$langfuseWidget).toBe(true);
    expect(widgets[0].widget.name).toBe("Trace count");
    expect(widgets[1].presetId).toBe(HOME_DASHBOARD_PRESET_IDS[0]);
  });

  it("skips placements whose widget row cannot be resolved", () => {
    const { exportPayload, skippedWidgetCount } = buildDashboardExport({
      name: "My dashboard",
      description: "",
      filters: [],
      placements: [
        { type: "widget", widgetId: "gone", ...basePosition },
        { type: "widget", widgetId: "w1", ...basePosition },
      ],
      widgetsById: new Map([["w1", baseWidget]]),
    });

    expect(skippedWidgetCount).toBe(1);
    expect(exportPayload.widgets as unknown[]).toHaveLength(1);
  });
});

describe("parseDashboardImport", () => {
  const validExport = () =>
    buildDashboardExport({
      name: "Shared dashboard",
      description: "",
      filters: [],
      placements: [
        { type: "widget", widgetId: "w1", ...basePosition },
        {
          type: "preset",
          presetId: HOME_DASHBOARD_PRESET_IDS[0],
          ...basePosition,
          y: 6,
        },
      ],
      widgetsById: new Map([["w1", baseWidget]]),
    }).exportPayload;

  it("ignores payloads without the dashboard envelope", () => {
    expect(
      parseDashboardImport(JSON.stringify({ widgets: [] }), {
        isBetaEnabled: false,
      }),
    ).toEqual({ status: "not-dashboard" });
    expect(
      parseDashboardImport("plain text", { isBetaEnabled: false }),
    ).toEqual({ status: "not-dashboard" });
  });

  it("round-trips an exported dashboard", () => {
    const result = parseDashboardImport(JSON.stringify(validExport()), {
      isBetaEnabled: false,
    });

    expect(result.status).toBe("dashboard");
    if (result.status === "dashboard") {
      expect(result.dashboard.name).toBe("Shared dashboard");
      expect(result.dashboard.placements).toHaveLength(2);
      expect(result.dashboard.placements[0]).toMatchObject({
        type: "widget",
        x: 0,
        y: 0,
        x_size: 6,
        y_size: 6,
      });
      expect(result.dashboard.placements[1]).toMatchObject({
        type: "preset",
        presetId: HOME_DASHBOARD_PRESET_IDS[0],
      });
      expect(result.dashboard.skippedPresetCount).toBe(0);
    }
  });

  it("rejects a newer format version with a reason", () => {
    const result = parseDashboardImport(
      JSON.stringify({
        ...validExport(),
        version: DASHBOARD_FILE_FORMAT_VERSION + 1,
      }),
      { isBetaEnabled: false },
    );

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.reason).toContain("format version");
    }
  });

  it("skips unknown preset cards instead of failing", () => {
    const payload = validExport();
    (payload.widgets as Record<string, unknown>[]).push({
      type: "preset",
      presetId: "from-the-future",
      ...basePosition,
      y: 12,
    });

    const result = parseDashboardImport(JSON.stringify(payload), {
      isBetaEnabled: false,
    });

    expect(result.status).toBe("dashboard");
    if (result.status === "dashboard") {
      expect(result.dashboard.skippedPresetCount).toBe(1);
      expect(result.dashboard.placements).toHaveLength(2);
    }
  });

  it("rejects a dashboard containing a malformed widget, naming it", () => {
    const payload = validExport();
    const widgets = payload.widgets as Record<string, any>[];
    widgets[0].widget = { ...widgets[0].widget, chartConfig: { type: "PIE" } };

    const result = parseDashboardImport(JSON.stringify(payload), {
      isBetaEnabled: false,
    });

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.reason).toContain("Trace count");
    }
  });

  it("rejects a dashboard with no importable widgets", () => {
    const result = parseDashboardImport(
      JSON.stringify({
        $langfuseDashboard: true,
        version: 1,
        name: "Empty",
        widgets: [],
      }),
      { isBetaEnabled: false },
    );

    expect(result.status).toBe("invalid");
  });

  it("explains a dashboard whose only content is unknown preset cards", () => {
    const result = parseDashboardImport(
      JSON.stringify({
        $langfuseDashboard: true,
        version: 1,
        name: "Future presets",
        widgets: [
          {
            type: "preset",
            presetId: "from-the-future",
            ...basePosition,
          },
        ],
      }),
      { isBetaEnabled: false },
    );

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.reason).toContain("preset cards");
    }
  });
});

describe("parsePastedPreset", () => {
  it("round-trips a preset export", () => {
    const result = parsePastedPreset(
      JSON.stringify(buildPresetExport(HOME_DASHBOARD_PRESET_IDS[0])),
    );

    expect(result).toEqual({
      status: "preset",
      presetId: HOME_DASHBOARD_PRESET_IDS[0],
    });
  });

  it("ignores payloads without the preset envelope", () => {
    expect(parsePastedPreset("not json")).toEqual({ status: "not-preset" });
    expect(parsePastedPreset(JSON.stringify({ presetId: "x" }))).toEqual({
      status: "not-preset",
    });
  });

  it("rejects unknown preset ids and newer format versions", () => {
    expect(
      parsePastedPreset(JSON.stringify(buildPresetExport("from-the-future"))),
    ).toMatchObject({ status: "invalid" });
    expect(
      parsePastedPreset(
        JSON.stringify({
          ...buildPresetExport(HOME_DASHBOARD_PRESET_IDS[0]),
          version: PRESET_FILE_FORMAT_VERSION + 1,
        }),
      ),
    ).toMatchObject({ status: "invalid" });
  });
});

describe("isPasteablePlacementPayload", () => {
  it("accepts widget and preset payloads, rejects everything else", () => {
    expect(
      isPasteablePlacementPayload(
        JSON.stringify(buildWidgetExport(baseWidget)),
        {
          isBetaEnabled: false,
        },
      ),
    ).toBe(true);
    expect(
      isPasteablePlacementPayload(
        JSON.stringify(buildPresetExport(HOME_DASHBOARD_PRESET_IDS[0])),
        { isBetaEnabled: false },
      ),
    ).toBe(true);
    expect(
      isPasteablePlacementPayload('{"hello": "world"}', {
        isBetaEnabled: false,
      }),
    ).toBe(false);
  });
});
