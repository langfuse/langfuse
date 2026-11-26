import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "../../../db";
import { z } from "zod";
import {
  widgetDefinitionSchema,
  widgetDefinitionSaveSchema,
  getWidgetQueryView,
  DashboardDefinitionSchema,
  type WidgetDefinition,
  type DashboardDefinition,
} from "../../../features/dashboards";
import { LangfuseConflictError } from "../../../errors/ConflictError";
import { LangfuseNotFoundError } from "../../../errors/NotFoundError";
import {
  resolveDashboardWidgetMinVersion,
  validateDashboardWidgetQuery,
} from "./DashboardService";
import {
  ChartConfigSchema,
  WidgetDomainSchema,
  queryViewToDashboardWidgetView,
} from "./types";

export const SaveWidgetDefinitionInput = z
  .object({
    widgetId: z.string().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    definition: widgetDefinitionSaveSchema,
    dashboardId: z.string().optional(),
    replacePlacementId: z.string().optional(),
    replacePresetId: z.string().optional(),
    beforePlacementId: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.widgetId && input.expectedRevision === undefined)
      ctx.addIssue({
        code: "custom",
        message: "An existing widget requires its revision.",
      });
    if (
      (input.replacePlacementId || input.beforePlacementId) &&
      !input.dashboardId
    )
      ctx.addIssue({
        code: "custom",
        message: "Placement changes require a dashboard.",
      });
    if (input.widgetId && input.replacePlacementId)
      ctx.addIssue({
        code: "custom",
        message: "A conversion creates a new widget.",
      });
  });

function projectedWidget(definition: WidgetDefinition) {
  if (definition.kind === "markdown")
    return {
      name: definition.config.title || "Text",
      description: "",
      view: queryViewToDashboardWidgetView.observations,
      dimensions: [],
      metrics: [],
      filters: [],
      chartType: "NUMBER" as const,
      chartConfig: { type: "NUMBER" as const },
      minVersion: 1,
    };
  const config = definition.config;
  const tab = config.tabs[0];
  const query = tab.queries[0];
  const queries = config.tabs.flatMap((item) =>
    item.queries.map((source) => ({ source, display: item.display })),
  );
  const minVersion = Math.max(
    ...queries.map(({ source, display }) => {
      const input = {
        name: config.title,
        description: config.description,
        view: queryViewToDashboardWidgetView[getWidgetQueryView(source.view)],
        dimensions: source.dimensions,
        filters: source.filters,
        metrics: source.metrics.map((metric) => ({
          measure: metric.measure,
          agg: metric.aggregation,
        })),
        chartType: display.chartType,
        chartConfig: ChartConfigSchema.parse({ type: display.chartType }),
      };
      const required = resolveDashboardWidgetMinVersion({
        view: getWidgetQueryView(source.view),
        dimensions: source.dimensions,
        measures: input.metrics,
        filters: source.filters,
      });
      validateDashboardWidgetQuery(input, required);
      return required;
    }),
  );
  return {
    name: config.title,
    description: config.description,
    view: queryViewToDashboardWidgetView[getWidgetQueryView(query.view)],
    dimensions: query.dimensions,
    metrics: query.metrics.map((metric) => ({
      measure: metric.measure,
      agg: metric.aggregation,
    })),
    filters: query.filters,
    chartType: tab.display.chartType,
    chartConfig: ChartConfigSchema.parse({
      type: tab.display.chartType,
      row_limit: tab.display.rowLimit,
      bins: tab.display.bins,
      defaultSort: tab.display.defaultSort,
      show_value_labels: tab.display.showValueLabels,
    }),
    minVersion,
  };
}

async function lockDashboard(
  tx: Prisma.TransactionClient,
  projectId: string,
  dashboardId: string,
) {
  const [row] = await tx.$queryRaw<{ definition: Prisma.JsonValue }[]>`
    SELECT definition FROM dashboards WHERE id=${dashboardId} AND project_id=${projectId} FOR UPDATE
  `;
  if (!row) throw new LangfuseNotFoundError("Dashboard not found");
  return DashboardDefinitionSchema.parse(row.definition);
}

function addPlacement(
  layout: DashboardDefinition,
  widgetId: string,
  replaceId?: string,
  beforeId?: string,
  height = 5,
) {
  const existing = replaceId
    ? layout.widgets.find((item) => item.id === replaceId)
    : undefined;
  if (replaceId && !existing)
    throw new LangfuseConflictError(
      "The original dashboard placement no longer exists.",
    );
  const before = beforeId
    ? layout.widgets.find((item) => item.id === beforeId)
    : undefined;
  let y =
    before?.y ??
    layout.widgets.reduce(
      (max, item) => Math.max(max, item.y + item.y_size),
      0,
    );
  if (before) {
    // A full-width widget must precede every card spanning the insertion row.
    for (const item of [...layout.widgets].sort((a, b) => b.y - a.y)) {
      if (item.y < y && item.y + item.y_size > y) y = item.y;
    }
  }
  const placement = {
    type: "widget" as const,
    widgetId,
    id: existing?.id ?? randomUUID(),
    x: existing?.x ?? 0,
    y: existing?.y ?? y,
    x_size: existing?.x_size ?? 12,
    y_size: existing?.y_size ?? height,
  };
  if (existing)
    return {
      layout: {
        ...layout,
        widgets: layout.widgets.map((item) =>
          item.id === existing.id ? placement : item,
        ),
      },
      placement,
    };
  const widgets = before
    ? layout.widgets.map((item) =>
        item.y >= y ? { ...item, y: item.y + placement.y_size } : item,
      )
    : layout.widgets;
  return {
    layout: { ...layout, widgets: widgets.concat(placement) },
    placement,
  };
}

export async function saveWidgetDefinition(
  projectId: string,
  input: z.infer<typeof SaveWidgetDefinitionInput>,
  userId?: string,
) {
  const parsed = SaveWidgetDefinitionInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const dashboard = parsed.dashboardId
      ? await lockDashboard(tx, projectId, parsed.dashboardId)
      : undefined;
    const data = {
      ...projectedWidget(parsed.definition),
      definition: parsed.definition as Prisma.InputJsonValue,
      updatedBy: userId,
    };
    let widget;
    if (parsed.widgetId) {
      const existing = await tx.dashboardWidget.findFirst({
        where: { id: parsed.widgetId, projectId },
        select: { minVersion: true, definition: true, revision: true },
      });
      if (!existing)
        throw new LangfuseNotFoundError("Dashboard widget not found");
      if (existing.revision !== parsed.expectedRevision)
        throw new LangfuseConflictError(
          "This widget changed or is unavailable. Reload it and try again.",
        );
      if (
        existing.definition != null &&
        !widgetDefinitionSchema.safeParse(existing.definition).success
      )
        throw new LangfuseConflictError(
          "This widget definition cannot be edited by this version of Langfuse.",
        );
      data.minVersion = Math.max(data.minVersion, existing.minVersion);
      const result = await tx.dashboardWidget.updateMany({
        where: {
          id: parsed.widgetId,
          projectId,
          revision: parsed.expectedRevision,
        },
        data: { ...data, revision: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new LangfuseConflictError(
          "This widget changed or is unavailable. Reload it and try again.",
        );
      widget = await tx.dashboardWidget.findUniqueOrThrow({
        where: { id: parsed.widgetId, projectId },
      });
    } else {
      widget = await tx.dashboardWidget.create({
        data: { ...data, projectId, createdBy: userId, revision: 1 },
      });
    }
    let placementId: string | undefined;
    if (dashboard && parsed.dashboardId && !parsed.widgetId) {
      const replaceId = parsed.replacePlacementId;
      if (replaceId) {
        const preset = dashboard.widgets.find((item) => item.id === replaceId);
        if (
          preset?.type !== "preset" ||
          (parsed.replacePresetId !== undefined &&
            preset.presetId !== parsed.replacePresetId)
        )
          throw new LangfuseConflictError(
            "The Home card has already been replaced.",
          );
      }
      const { placement, layout } = addPlacement(
        dashboard,
        widget.id,
        replaceId,
        parsed.beforePlacementId,
        parsed.definition.kind === "markdown" ? 2 : 5,
      );
      placementId = placement.id;
      await tx.dashboard.update({
        where: { id: parsed.dashboardId, projectId },
        data: { definition: layout, updatedBy: userId },
      });
    }
    return {
      widget: WidgetDomainSchema.parse({ ...widget, owner: "PROJECT" }),
      placementId,
    };
  });
}
