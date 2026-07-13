import { z } from "zod";
import {
  HOME_DASHBOARD_PRESET_IDS,
  type HomeDashboardPresetId,
  type FilterState,
} from "@langfuse/shared";
import {
  buildWidgetExport,
  parseImportedWidgetJson,
  parsePastedWidget,
  type WidgetExportSource,
  type WidgetImport,
} from "@/src/features/widgets/utils/import-export-utils";

/**
 * Dashboard JSON file-format version. `$langfuseDashboard: true` marks a JSON
 * payload as a Langfuse dashboard export; `version` is the version of that
 * envelope. A dashboard file inlines each referenced widget's portable
 * configuration (widgets are recreated on import — DB widget ids do not
 * travel across projects/instances).
 */
export const DASHBOARD_FILE_FORMAT_VERSION = 1;

export function isLangfuseDashboardPayload(parsed: unknown): boolean {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "$langfuseDashboard" in parsed &&
    (parsed as Record<string, unknown>).$langfuseDashboard === true
  );
}

/**
 * Preset cards (curated Home components) have no widget configuration — the
 * portable payload is just the preset id in its own envelope, so copy-paste
 * works uniformly across every tile on a dashboard.
 */
export const PRESET_FILE_FORMAT_VERSION = 1;

export function buildPresetExport(presetId: string) {
  return {
    $langfusePreset: true as const,
    version: PRESET_FILE_FORMAT_VERSION,
    presetId,
  };
}

export type PastedPresetParseResult =
  | { status: "not-preset" }
  | { status: "invalid"; reason: string }
  | { status: "preset"; presetId: HomeDashboardPresetId };

export function parsePastedPreset(text: string): PastedPresetParseResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    return { status: "not-preset" };
  }

  if (
    typeof parsedJson !== "object" ||
    parsedJson === null ||
    (parsedJson as Record<string, unknown>).$langfusePreset !== true
  ) {
    return { status: "not-preset" };
  }

  const payload = parsedJson as Record<string, unknown>;
  if (
    typeof payload.version === "number" &&
    payload.version > PRESET_FILE_FORMAT_VERSION
  ) {
    return {
      status: "invalid",
      reason: `This card uses format version ${payload.version}; this Langfuse version supports up to ${PRESET_FILE_FORMAT_VERSION}.`,
    };
  }

  if (
    typeof payload.presetId !== "string" ||
    !(HOME_DASHBOARD_PRESET_IDS as readonly string[]).includes(payload.presetId)
  ) {
    return {
      status: "invalid",
      reason: "This preset card is not available in this Langfuse version.",
    };
  }

  return {
    status: "preset",
    presetId: payload.presetId as HomeDashboardPresetId,
  };
}

/**
 * True when the text is a payload our paste surfaces can place on a
 * dashboard — a widget export or a preset-card export. Used to gate "Paste"
 * menu items via the clipboard probe.
 */
export function isPasteablePlacementPayload(
  text: string,
  params: { isBetaEnabled: boolean },
): boolean {
  if (parsePastedWidget(text, params).status === "widget") return true;
  return parsePastedPreset(text).status === "preset";
}

type PlacementPosition = {
  x: number;
  y: number;
  x_size: number;
  y_size: number;
};

const placementPositionSchema = {
  x: z.number().int().gte(0),
  y: z.number().int().gte(0),
  x_size: z.number().int().positive(),
  y_size: z.number().int().positive(),
};

const dashboardImportPlacementSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("widget"),
      ...placementPositionSchema,
      // Validated per widget via parseImportedWidgetJson for normalization
      // and precise failure reasons.
      widget: z.unknown(),
    })
    .loose(),
  z
    .object({
      type: z.literal("preset"),
      ...placementPositionSchema,
      presetId: z.string(),
    })
    .loose(),
]);

const dashboardImportSchema = z
  .object({
    $langfuseDashboard: z.literal(true),
    version: z.number().int().positive(),
    name: z.string(),
    description: z.string().optional(),
    widgets: z.array(dashboardImportPlacementSchema),
  })
  .loose();

export type DashboardExportPlacement =
  | ({ type: "widget"; widgetId: string } & PlacementPosition)
  | ({ type: "preset"; presetId: string } & PlacementPosition);

/**
 * The canonical dashboard file shape accepted by drag-drop import: dashboard
 * metadata plus each placement with its widget's portable configuration
 * inlined. There is deliberately no in-app dashboard download (widget-level
 * export covers sharing; Clone covers same-project duplication) — this
 * builder documents the format and backs the import round-trip tests.
 * Placements whose widget cannot be resolved are skipped and counted.
 */
export function buildDashboardExport(params: {
  name: string;
  description: string;
  filters: FilterState;
  placements: DashboardExportPlacement[];
  widgetsById: Map<string, WidgetExportSource>;
}): { exportPayload: Record<string, unknown>; skippedWidgetCount: number } {
  let skippedWidgetCount = 0;
  const widgets: Record<string, unknown>[] = [];

  for (const placement of params.placements) {
    const position = {
      x: placement.x,
      y: placement.y,
      x_size: placement.x_size,
      y_size: placement.y_size,
    };
    if (placement.type === "preset") {
      widgets.push({
        type: "preset",
        presetId: placement.presetId,
        ...position,
      });
      continue;
    }
    const source = params.widgetsById.get(placement.widgetId);
    if (!source) {
      skippedWidgetCount += 1;
      continue;
    }
    widgets.push({
      type: "widget",
      ...position,
      widget: buildWidgetExport(source),
    });
  }

  return {
    exportPayload: {
      $langfuseDashboard: true,
      version: DASHBOARD_FILE_FORMAT_VERSION,
      name: params.name,
      description: params.description,
      filters: params.filters,
      widgets,
    },
    skippedWidgetCount,
  };
}

export type ParsedDashboardImportPlacement =
  | ({ type: "widget"; widget: WidgetImport } & PlacementPosition)
  | ({ type: "preset"; presetId: HomeDashboardPresetId } & PlacementPosition);

export type ParsedDashboardImport = {
  name: string;
  placements: ParsedDashboardImportPlacement[];
  /** Presets in the file this Langfuse version does not know — dropped. */
  skippedPresetCount: number;
  /** True when any widget lost filters during column normalization. */
  removedFilters: boolean;
};

export type DashboardImportParseResult =
  | { status: "not-dashboard" }
  | { status: "invalid"; reason: string }
  | { status: "dashboard"; dashboard: ParsedDashboardImport };

/**
 * Parses dropped text into a dashboard import. Payloads without the Langfuse
 * dashboard envelope are "not-dashboard" (callers may fall back to the widget
 * parser); enveloped payloads that fail validation are "invalid" with a
 * user-facing reason.
 */
export function parseDashboardImport(
  text: string,
  params: { isBetaEnabled: boolean },
): DashboardImportParseResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    return { status: "not-dashboard" };
  }

  if (!isLangfuseDashboardPayload(parsedJson)) {
    return { status: "not-dashboard" };
  }

  const declaredVersion = (parsedJson as Record<string, unknown>).version;
  if (
    typeof declaredVersion === "number" &&
    declaredVersion > DASHBOARD_FILE_FORMAT_VERSION
  ) {
    return {
      status: "invalid",
      reason: `This dashboard uses format version ${declaredVersion}; this Langfuse version supports up to ${DASHBOARD_FILE_FORMAT_VERSION}.`,
    };
  }

  const parsed = dashboardImportSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      status: "invalid",
      reason: "The dashboard configuration is malformed or not supported.",
    };
  }

  const placements: ParsedDashboardImportPlacement[] = [];
  let skippedPresetCount = 0;
  let removedFilters = false;

  for (const [index, placement] of parsed.data.widgets.entries()) {
    const position = {
      x: placement.x,
      y: placement.y,
      x_size: placement.x_size,
      y_size: placement.y_size,
    };

    if (placement.type === "preset") {
      if (
        (HOME_DASHBOARD_PRESET_IDS as readonly string[]).includes(
          placement.presetId,
        )
      ) {
        placements.push({
          type: "preset",
          presetId: placement.presetId as HomeDashboardPresetId,
          ...position,
        });
      } else {
        skippedPresetCount += 1;
      }
      continue;
    }

    try {
      const result = parseImportedWidgetJson({
        parsedJson: placement.widget,
        isBetaEnabled: params.isBetaEnabled,
      });
      removedFilters = removedFilters || result.removedFilters;
      placements.push({ type: "widget", widget: result.widget, ...position });
    } catch {
      const widgetName =
        typeof placement.widget === "object" &&
        placement.widget !== null &&
        "name" in placement.widget &&
        typeof placement.widget.name === "string"
          ? `"${placement.widget.name}"`
          : `#${index + 1}`;
      return {
        status: "invalid",
        reason: `Widget ${widgetName} in the dashboard file is malformed or not supported.`,
      };
    }
  }

  if (placements.length === 0) {
    return {
      status: "invalid",
      reason:
        skippedPresetCount > 0
          ? "The dashboard file only contains preset cards that are not available in this Langfuse version."
          : "The dashboard file contains no importable widgets.",
    };
  }

  return {
    status: "dashboard",
    dashboard: {
      name: parsed.data.name,
      placements,
      skippedPresetCount,
      removedFilters,
    },
  };
}
