import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "../../../db";
import { z } from "zod";
import {
  dashboardBlockContentSchema,
  DashboardDefinitionSchema,
  storedInlineDashboardWidgetSchema,
  type WidgetDefinition,
  type DashboardDefinition,
} from "../../../features/dashboards";
import { LangfuseConflictError } from "../../../errors/ConflictError";
import { LangfuseNotFoundError } from "../../../errors/NotFoundError";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
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
    definition: dashboardBlockContentSchema,
    dashboardId: z.string().optional(),
    replacePlacementId: z.string().optional(),
    replacePresetId: z.string().optional(),
    beforePlacementId: z.string().optional(),
    sourceBlockId: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.widgetId && input.expectedRevision === undefined)
      ctx.addIssue({
        code: "custom",
        message: "An existing widget requires its revision.",
      });
    if (
      (input.replacePlacementId ||
        input.beforePlacementId ||
        input.sourceBlockId) &&
      !input.dashboardId
    )
      ctx.addIssue({
        code: "custom",
        message: "Placement changes require a dashboard.",
      });
    if (input.widgetId && (input.replacePlacementId || input.sourceBlockId))
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
  const tab = config.version === 2 ? config.tabs[0] : config;
  const query = tab.queries[0];
  const queries =
    config.version === 2
      ? config.tabs.flatMap((item) => item.queries)
      : config.queries;
  const minVersion = Math.max(
    ...queries.map((source) => {
      const input = {
        name: config.title,
        description: config.description,
        view: queryViewToDashboardWidgetView[source.view],
        dimensions: source.dimensions,
        filters: source.filters,
        metrics: source.metrics.map((metric) => ({
          measure: metric.measure,
          agg: metric.aggregation,
        })),
        chartType: tab.display.chartType,
        chartConfig: ChartConfigSchema.parse({ type: tab.display.chartType }),
      };
      const required = resolveDashboardWidgetMinVersion({
        view: source.view,
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
    view: queryViewToDashboardWidgetView[query.view],
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
  const raw = row.definition as Record<string, Prisma.JsonValue>;
  if (raw.version !== undefined && raw.version !== "1")
    throw new LangfuseConflictError("This dashboard version cannot be edited.");
  return { raw, layout: DashboardDefinitionSchema.parse(raw) };
}

async function writeLayout(
  tx: Prisma.TransactionClient,
  projectId: string,
  dashboardId: string,
  layout: DashboardDefinition,
  retainedInlineOrdinals: number[],
  userId?: string,
) {
  const classic = Prisma.sql`${JSON.stringify(layout)}::jsonb`;
  // Keep opaque fields and untouched inline values inside PostgreSQL so numeric
  // precision is not reduced by a round trip through JavaScript numbers.
  const updated = retainedInlineOrdinals.length
    ? Prisma.sql`(SELECT definition || grid || jsonb_build_object('version', '1', 'blocks', (grid->'widgets') || COALESCE((
        SELECT jsonb_agg(entry ORDER BY ord)
        FROM jsonb_array_elements(definition->'blocks') WITH ORDINALITY AS stored(entry, ord)
        WHERE ord IN (${Prisma.join(retainedInlineOrdinals)})
      ), '[]'::jsonb)) FROM (SELECT ${classic} AS grid) AS layout)`
    : Prisma.sql`(definition - 'version' - 'blocks') || ${classic}`;
  await tx.$executeRaw`
    UPDATE dashboards SET definition = ${updated}, updated_at = CURRENT_TIMESTAMP,
      updated_by = COALESCE(${userId ?? null}, updated_by)
    WHERE id = ${dashboardId} AND project_id = ${projectId}
  `;
}

function inlineEntries(raw: Record<string, Prisma.JsonValue>) {
  if (raw.blocks === undefined) return [];
  if (!Array.isArray(raw.blocks))
    throw new InvalidRequestError("Unsupported dashboard layout.");
  return raw.blocks.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new InvalidRequestError("Unsupported dashboard entry.");
    if ("kind" in entry) return [{ value: entry, ordinal: index + 1 }];
    if (
      !DashboardDefinitionSchema.shape.widgets.element.safeParse(entry).success
    )
      throw new InvalidRequestError("Unsupported dashboard entry.");
    return [];
  });
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
  const y =
    before?.y ??
    layout.widgets.reduce(
      (max, item) => Math.max(max, item.y + item.y_size),
      0,
    );
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
    const remaining = dashboard ? inlineEntries(dashboard.raw) : [];
    const source = parsed.sourceBlockId
      ? remaining.find((entry) => entry.value.id === parsed.sourceBlockId)
      : undefined;
    if (parsed.sourceBlockId && !source)
      throw new LangfuseConflictError(
        "This dashboard widget was already converted or removed.",
      );
    const sourceBlock = source
      ? storedInlineDashboardWidgetSchema.parse(source.value)
      : undefined;
    if (sourceBlock && sourceBlock.revision !== parsed.expectedRevision)
      throw new LangfuseConflictError(
        "This widget changed. Reload it and try again.",
      );
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
        !dashboardBlockContentSchema.safeParse(existing.definition).success
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
      const replaceId =
        sourceBlock?.kind === "convertedPreset"
          ? sourceBlock.sourcePreset.placementId
          : parsed.replacePlacementId;
      const preset = replaceId
        ? dashboard.layout.widgets.find((item) => item.id === replaceId)
        : undefined;
      if (replaceId) {
        if (
          preset?.type !== "preset" ||
          (parsed.replacePresetId !== undefined &&
            preset.presetId !== parsed.replacePresetId) ||
          (sourceBlock?.kind === "convertedPreset" &&
            preset.presetId !== sourceBlock.sourcePreset.presetId)
        )
          throw new LangfuseConflictError(
            "The Home card has already been replaced.",
          );
      }
      const { placement, layout } = addPlacement(
        dashboard.layout,
        widget.id,
        replaceId,
        sourceBlock?.beforePlacementId ?? parsed.beforePlacementId,
        parsed.definition.kind === "markdown" ? 2 : 5,
      );
      placementId = placement.id;
      await writeLayout(
        tx,
        projectId,
        parsed.dashboardId,
        layout,
        remaining
          .filter((entry) => {
            if (entry === source) return false;
            const binding = entry.value.sourcePreset;
            return !(
              preset?.type === "preset" &&
              entry.value.kind === "convertedPreset" &&
              binding &&
              typeof binding === "object" &&
              !Array.isArray(binding) &&
              binding.placementId === preset.id &&
              binding.presetId === preset.presetId
            );
          })
          .map((entry) => entry.ordinal),
        userId,
      );
    }
    return {
      widget: WidgetDomainSchema.parse({ ...widget, owner: "PROJECT" }),
      placementId,
    };
  });
}

/** Materialize supported inline content as ordinary widgets and preserve existing placements. */
export async function migrateInlineWidgets(
  projectId: string,
  dashboardId: string,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const { raw, layout: initialLayout } = await lockDashboard(
      tx,
      projectId,
      dashboardId,
    );
    let layout = initialLayout;
    const entries = inlineEntries(raw);
    const parsed = entries.map((entry) => {
      const block = storedInlineDashboardWidgetSchema.safeParse(entry.value);
      if (!block.success)
        throw new InvalidRequestError(
          "This dashboard contains a widget format this server cannot migrate.",
        );
      return block.data;
    });
    for (const block of parsed) {
      const definition = dashboardBlockContentSchema.parse({
        kind: block.kind === "convertedPreset" ? "multiQuery" : block.kind,
        config: block.config,
      });
      const widget = await tx.dashboardWidget.create({
        data: {
          ...projectedWidget(definition),
          definition: definition as Prisma.InputJsonValue,
          projectId,
          createdBy: userId,
          updatedBy: userId,
          revision: 1,
        },
      });
      const replaceId =
        block.kind === "convertedPreset"
          ? block.sourcePreset.placementId
          : undefined;
      if (replaceId) {
        const preset = layout.widgets.find((item) => item.id === replaceId);
        if (
          preset?.type !== "preset" ||
          (block.kind === "convertedPreset" &&
            preset.presetId !== block.sourcePreset.presetId)
        )
          throw new LangfuseConflictError(
            "The original Home card placement changed.",
          );
      }
      layout = addPlacement(
        layout,
        widget.id,
        replaceId,
        block.beforePlacementId ?? undefined,
        definition.kind === "markdown" ? 2 : 5,
      ).layout;
    }
    if (entries.length)
      await writeLayout(tx, projectId, dashboardId, layout, [], userId);
    return { migrated: entries.length };
  });
}
