import { z } from "zod/v4";
import { prisma } from "@langfuse/shared/src/db";
import langfuseDashboards from "../constants/langfuse-dashboards.json";
import {
  logger,
  WidgetDomainSchema,
  DashboardDomainSchema,
} from "@langfuse/shared/src/server";

/**
 * JSON STRUCTURE & SCHEMAS
 * ------------------------
 * We expect the JSON to have the following top-level structure:
 * {
 *   widgets: Widget[],
 *   dashboards: Dashboard[]
 * }
 *
 * 1. A flat array of widgets which can be referenced by dashboards via `widgetId`.
 * 2. An array of dashboards that reference widgets via their definitions.
 *
 * All IDs and timestamps come from the JSON to guarantee deterministic results and stable diffs.
 */
const RawWidgetSchema = WidgetDomainSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
}).transform((raw) =>
  WidgetDomainSchema.parse({
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  }),
);

const RawDashboardSchema = DashboardDomainSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
}).transform((raw) =>
  DashboardDomainSchema.parse({
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  }),
);

const FileSchema = z.object({
  widgets: z.array(RawWidgetSchema),
  dashboards: z.array(RawDashboardSchema),
});

type ParsedWidgets = z.infer<typeof WidgetDomainSchema>[];
type ParsedDashboards = z.infer<typeof DashboardDomainSchema>[];

export const upsertLangfuseDashboards = async (force = false) => {
  const startTime = Date.now();
  try {
    logger.debug(`Starting upsert of Langfuse dashboards (force = ${force})`);

    const parsed = FileSchema.parse(langfuseDashboards);

    await upsertWidgets(parsed.widgets, force);
    await upsertDashboards(parsed.dashboards, force);

    logger.info(
      `Finished upserting Langfuse dashboards and widgets in ${Date.now() - startTime}ms`,
    );
  } catch (error) {
    logger.error(
      `Error upserting Langfuse dashboards after ${Date.now() - startTime}ms: ${
        error instanceof Error ? error.message : ""
      }`,
      { error },
    );
  }
};

async function upsertWidgets(widgets: ParsedWidgets, force: boolean) {
  // Build map of existing widgets by id (only projectId null)
  const existing = await prisma.dashboardWidget.findMany({
    where: {
      projectId: null,
      id: { in: widgets.map((w) => w.id) },
    },
    select: {
      id: true,
      updatedAt: true,
    },
  });
  const existingMap = new Map(existing.map((w) => [w.id, w.updatedAt]));

  const upsertPromises = widgets.map((widget) => {
    const existingUpdatedAt = existingMap.get(widget.id);
    if (
      !force &&
      existingUpdatedAt &&
      existingUpdatedAt.getTime() === widget.updatedAt.getTime()
    ) {
      logger.debug(`Widget ${widget.name} already up to date. Skipping.`);
      return Promise.resolve();
    }

    const baseWidget = {
      name: widget.name,
      description: widget.description,
      view: widget.view,
      dimensions: widget.dimensions,
      metrics: widget.metrics,
      filters: widget.filters,
      chartType: widget.chartType,
      chartConfig: widget.chartConfig,
      updatedAt: widget.updatedAt,
    };

    return prisma.dashboardWidget
      .upsert({
        where: { id: widget.id },
        update: {
          ...baseWidget,
        },
        create: {
          id: widget.id,
          projectId: null,
          createdAt: widget.createdAt,
          ...baseWidget,
        },
      })
      .then(() => logger.info(`Upserted widget ${widget.name} (${widget.id})`))
      .catch((error) => {
        logger.error(
          `Error upserting widget ${widget.name} (${widget.id}): ${error.message}`,
          { error },
        );
      });
  });

  await Promise.all(upsertPromises);
}

async function upsertDashboards(dashboards: ParsedDashboards, force: boolean) {
  const existing = await prisma.dashboard.findMany({
    where: {
      projectId: null,
      id: { in: dashboards.map((d) => d.id) },
    },
    select: {
      id: true,
      updatedAt: true,
    },
  });
  const existingMap = new Map(existing.map((d) => [d.id, d.updatedAt]));

  const promises = dashboards.map((dashboard) => {
    const existingUpdatedAt = existingMap.get(dashboard.id);
    if (
      !force &&
      existingUpdatedAt &&
      existingUpdatedAt.getTime() === dashboard.updatedAt.getTime()
    ) {
      logger.debug(`Dashboard ${dashboard.name} already up to date. Skipping.`);
      return Promise.resolve();
    }

    const baseDashboard = {
      name: dashboard.name,
      description: dashboard.description,
      definition: dashboard.definition,
      updatedAt: dashboard.updatedAt,
    };

    return prisma.dashboard
      .upsert({
        where: { id: dashboard.id },
        update: {
          ...baseDashboard,
        },
        create: {
          id: dashboard.id,
          projectId: null,
          createdAt: dashboard.createdAt,
          ...baseDashboard,
        },
      })
      .then(() =>
        logger.info(`Upserted dashboard ${dashboard.name} (${dashboard.id})`),
      )
      .catch((error) => {
        logger.error(
          `Error upserting dashboard ${dashboard.name} (${dashboard.id}): ${error.message}`,
          { error },
        );
      });
  });

  await Promise.all(promises);
}
