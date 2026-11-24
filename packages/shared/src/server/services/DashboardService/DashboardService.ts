import { prisma, Prisma } from "../../../db";
import { isPrismaRecordNotFoundError } from "../../prismaErrors";
import { escapeSqlLikePattern } from "../../utils/sqlLike";
import {
  LangfuseConflictError,
  LangfuseNotFoundError,
  type OrderByState,
  singleFilter,
} from "../../../";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { env } from "../../../env";
import {
  CreateWidgetInput,
  WidgetDomain,
  WidgetListResponse,
  DashboardDomain,
  DashboardListResponse,
  DashboardDomainSchema,
  WidgetDomainSchema,
  DashboardDefinitionSchema,
  dashboardWidgetViewToQueryView,
} from "./types";
import { z } from "zod";
import {
  getDashboardBlocks,
  hasDashboardBlocks,
  updateClassicLayout,
  patchDashboardBlock,
} from "./dashboard-definition-storage";

import {
  getValidAggregationsForMeasureType,
  getViewDeclaration,
  getWidgetRequiredVersion,
  type WidgetQueryShape,
} from "../../../features/query";

/**
 * `minVersion` is the lowest query-engine version that can represent a widget
 * definition. It is derived from the definition, never requested by a caller.
 * Same-view updates retain an already-persisted floor and promote it when the
 * updated definition requires v2.
 */
export const resolveDashboardWidgetMinVersion = (
  shape: WidgetQueryShape,
  persistedMinVersion?: number,
) => {
  const maxVersion = env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy" ? 1 : 2;
  const requiredVersion = getWidgetRequiredVersion(shape);

  if (requiredVersion > maxVersion) {
    throw new InvalidRequestError(
      "This widget uses v2-only fields, but the current deployment only supports legacy widget queries",
    );
  }

  return Math.min(
    Math.max(persistedMinVersion ?? 1, requiredVersion),
    maxVersion,
  );
};

const toWidgetQueryShape = (input: CreateWidgetInput): WidgetQueryShape => ({
  view: dashboardWidgetViewToQueryView[input.view],
  dimensions: input.dimensions,
  measures: input.metrics,
  filters: input.filters,
});

const validateDashboardWidgetQuery = (
  input: CreateWidgetInput,
  minVersion: number,
) => {
  const view = dashboardWidgetViewToQueryView[input.view];
  const declaration = getViewDeclaration(view, minVersion >= 2 ? "v2" : "v1");

  for (const metric of input.metrics) {
    const measure = declaration.measures[metric.measure];
    if (!measure) continue;
    const validAggregations = getValidAggregationsForMeasureType(measure.type);
    if (!validAggregations.some((aggregation) => aggregation === metric.agg)) {
      throw new InvalidRequestError(
        `Aggregation "${metric.agg}" is not valid for measure "${metric.measure}" (type: ${measure.type}). Valid aggregations: ${validAggregations.join(", ")}`,
      );
    }
  }

  const hiddenDimensions = input.dimensions.filter(
    ({ field }) => declaration.dimensions[field]?.uiHidden,
  );
  if (hiddenDimensions.length > 0) {
    throw new InvalidRequestError(
      `Dimensions not available for widgets: ${hiddenDimensions.map(({ field }) => field).join(", ")}`,
    );
  }
};

/**
 * First free clone name: "ABC (Clone)", then "ABC (Clone 2)", "ABC (Clone 3)", …
 */
function nextCloneName(sourceName: string, existingNames: string[]): string {
  const taken = new Set(existingNames);
  const base = `${sourceName} (Clone)`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${sourceName} (Clone ${n})`)) n++;
  return `${sourceName} (Clone ${n})`;
}

export class DashboardService {
  public static getDashboardBlocks = getDashboardBlocks;
  public static patchDashboardBlock = patchDashboardBlock;

  /**
   * Retrieves a list of dashboards for a given project.
   */
  public static async listDashboards(props: {
    projectId: string;
    limit?: number;
    page?: number;
    orderBy?: OrderByState;
    /** Include Langfuse-managed dashboards (projectId null). Defaults to true. */
    includeLangfuseOwned?: boolean;
  }): Promise<DashboardListResponse> {
    const {
      projectId,
      limit,
      page,
      orderBy,
      includeLangfuseOwned = true,
    } = props;

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const where = includeLangfuseOwned
      ? { OR: [{ projectId }, { projectId: null }] }
      : { projectId };

    const [dashboards, totalCount] = await Promise.all([
      prisma.dashboard.findMany({
        where,
        orderBy: orderBy
          ? [{ [orderBy.column]: orderBy.order.toLowerCase() }]
          : [{ updatedAt: "desc" }],
        skip,
        take,
      }),
      prisma.dashboard.count({
        where,
      }),
    ]);

    const domainDashboards = dashboards.map((dashboard) =>
      DashboardDomainSchema.parse({
        ...dashboard,
        owner: dashboard.projectId ? "PROJECT" : "LANGFUSE",
      }),
    );

    return {
      dashboards: domainDashboards,
      totalCount,
    };
  }

  /**
   * Creates a new dashboard.
   */
  public static async createDashboard(
    projectId: string,
    name: string,
    description: string,
    userId?: string,
    initialDefinition: z.infer<typeof DashboardDefinitionSchema> = {
      widgets: [],
    },
    filters?: z.infer<typeof singleFilter>[],
  ): Promise<DashboardDomain> {
    const newDashboard = await prisma.dashboard.create({
      data: {
        name,
        description,
        projectId,
        createdBy: userId,
        updatedBy: userId,
        definition: DashboardDefinitionSchema.parse(initialDefinition),
        ...(filters !== undefined && { filters }),
      },
    });

    return DashboardDomainSchema.parse({
      ...newDashboard,
      owner: newDashboard.projectId ? "PROJECT" : "LANGFUSE",
    });
  }

  public static async cloneDashboard({
    projectId,
    dashboardId,
    userId,
    definition,
    setAsHome,
  }: {
    projectId: string;
    dashboardId: string;
    userId: string;
    definition?: z.infer<typeof DashboardDefinitionSchema>;
    setAsHome?: boolean;
  }): Promise<DashboardDomain> {
    return prisma.$transaction(
      async (tx) => {
        const source = await tx.dashboard.findFirst({
          where: { id: dashboardId, OR: [{ projectId }, { projectId: null }] },
          select: {
            name: true,
            description: true,
            definition: true,
          },
        });
        if (!source)
          throw new LangfuseNotFoundError("Source dashboard not found");
        const names = await tx.dashboard.findMany({
          where: {
            projectId,
            name: { startsWith: `${escapeSqlLikePattern(source.name)} (Clone` },
          },
          select: { name: true },
        });
        const clone = await tx.dashboard.create({
          data: {
            name: nextCloneName(
              source.name,
              names.map(({ name }) => name),
            ),
            description: source.description,
            projectId,
            createdBy: userId,
            updatedBy: userId,
            definition: DashboardDefinitionSchema.parse(
              definition ?? source.definition,
            ),
          },
        });
        // Copy same-project content inside PostgreSQL, including unknown formats or
        // numbers that JavaScript cannot represent. Revisions belong to the clone.
        await tx.$executeRaw`
          UPDATE dashboards AS target SET definition = CASE
            WHEN source.definition->'version' = '"1"'::jsonb AND jsonb_typeof(source.definition->'blocks') = 'array'
            THEN jsonb_set(source.definition, '{blocks}', (
              SELECT COALESCE(jsonb_agg(CASE WHEN entry->>'kind' IN ('markdown', 'multiQuery')
                AND jsonb_typeof(entry->'revision') = 'number'
                THEN jsonb_set(entry, '{revision}', '1'::jsonb) ELSE entry END ORDER BY ord), '[]'::jsonb)
              FROM jsonb_array_elements(source.definition->'blocks') WITH ORDINALITY AS stored(entry, ord)
            )) ELSE source.definition END
          FROM dashboards AS source
          WHERE target.id = ${clone.id} AND target.project_id = ${projectId}
            AND source.id = ${dashboardId} AND source.project_id = ${projectId}
            AND (source.definition ? 'version' OR source.definition ? 'blocks')
        `;
        if (definition) {
          await updateClassicLayout(
            tx,
            projectId,
            clone.id,
            () => definition,
            userId,
          );
        }
        if (setAsHome) {
          await tx.project.update({
            where: { id: projectId },
            data: { homeDashboardId: clone.id },
          });
        }
        return DashboardDomainSchema.parse({ ...clone, owner: "PROJECT" });
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  /**
   * Updates a project-owned dashboard, translating Prisma's P2025 into a 404.
   */
  private static async updateDashboardRecord(
    dashboardId: string,
    projectId: string,
    data: Prisma.DashboardUncheckedUpdateInput,
  ): Promise<DashboardDomain> {
    try {
      const updatedDashboard = await prisma.dashboard.update({
        where: {
          id: dashboardId,
          projectId,
        },
        data,
      });

      return DashboardDomainSchema.parse({
        ...updatedDashboard,
        owner: updatedDashboard.projectId ? "PROJECT" : "LANGFUSE",
      });
    } catch (e) {
      // P2025 = row not found; also thrown for cross-project ids, so the 404
      // does not leak whether the dashboard exists in another project.
      if (isPrismaRecordNotFoundError(e)) {
        throw new LangfuseNotFoundError(
          `Dashboard ${dashboardId} not found in project ${projectId}`,
        );
      }
      throw e;
    }
  }

  /**
   * Updates a dashboard's definition.
   */
  public static async updateDashboardDefinition(
    dashboardId: string,
    projectId: string,
    definition: z.infer<typeof DashboardDefinitionSchema>,
    userId?: string,
  ): Promise<DashboardDomain> {
    return prisma.$transaction((tx) =>
      updateClassicLayout(tx, projectId, dashboardId, () => definition, userId),
    );
  }

  /**
   * Updates a dashboard's name and description.
   */
  public static async updateDashboard(
    dashboardId: string,
    projectId: string,
    name: string,
    description: string,
    userId?: string,
  ): Promise<DashboardDomain> {
    return this.updateDashboardRecord(dashboardId, projectId, {
      name,
      description,
      updatedBy: userId,
    });
  }

  /**
   * Updates a dashboard's filters.
   */
  public static async updateDashboardFilters(
    dashboardId: string,
    projectId: string,
    filters: z.infer<typeof singleFilter>[],
    userId?: string,
  ): Promise<DashboardDomain> {
    return this.updateDashboardRecord(dashboardId, projectId, {
      updatedBy: userId,
      filters,
    });
  }

  /**
   * Gets a dashboard by ID.
   */
  public static async getDashboard(
    dashboardId: string,
    projectId: string,
  ): Promise<(DashboardDomain & { hasDashboardBlocks: boolean }) | null> {
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        OR: [{ projectId }, { projectId: null }],
      },
    });

    if (!dashboard) {
      return null;
    }

    const classic = DashboardDomainSchema.parse({
      ...dashboard,
      owner: dashboard.projectId ? "PROJECT" : "LANGFUSE",
    });
    return {
      ...classic,
      hasDashboardBlocks:
        dashboard.projectId !== null &&
        hasDashboardBlocks(dashboard.definition, classic.definition),
    };
  }

  /**
   * Deletes a dashboard.
   */
  public static async deleteDashboard(
    dashboardId: string,
    projectId: string,
  ): Promise<void> {
    try {
      await prisma.dashboard.delete({
        where: {
          id: dashboardId,
          projectId,
        },
      });
    } catch (e) {
      // P2025 = row not found; also thrown for cross-project ids, so the 404
      // does not leak whether the dashboard exists in another project.
      if (isPrismaRecordNotFoundError(e)) {
        throw new LangfuseNotFoundError(
          `Dashboard ${dashboardId} not found in project ${projectId}`,
        );
      }
      throw e;
    }
  }

  /**
   * Retrieves a list of dashboard widgets for a given project.
   */
  public static async listWidgets(props: {
    projectId: string;
    limit?: number;
    page?: number;
    orderBy?: OrderByState;
  }): Promise<WidgetListResponse> {
    const { projectId, limit, page, orderBy } = props;

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const [widgets, totalCount] = await Promise.all([
      prisma.dashboardWidget.findMany({
        where: {
          projectId,
        },
        orderBy: orderBy
          ? [{ [orderBy.column]: orderBy.order.toLowerCase() }]
          : [{ updatedAt: "desc" }],
        skip,
        take,
      }),
      prisma.dashboardWidget.count({
        where: {
          projectId,
        },
      }),
    ]);

    const domainWidgets = widgets.map((widget) =>
      WidgetDomainSchema.parse({
        ...widget,
        owner: widget.projectId ? "PROJECT" : "LANGFUSE",
      }),
    );

    return {
      widgets: domainWidgets,
      totalCount,
    };
  }

  /**
   * Creates a new dashboard widget.
   */
  public static async createWidget(
    projectId: string,
    input: CreateWidgetInput,
    userId?: string,
  ): Promise<WidgetDomain> {
    const minVersion = resolveDashboardWidgetMinVersion(
      toWidgetQueryShape(input),
    );
    validateDashboardWidgetQuery(input, minVersion);
    const newWidget = await prisma.dashboardWidget.create({
      data: {
        name: input.name,
        description: input.description,
        projectId,
        view: input.view,
        dimensions: input.dimensions,
        metrics: input.metrics,
        filters: input.filters,
        chartType: input.chartType,
        chartConfig: input.chartConfig,
        minVersion,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return WidgetDomainSchema.parse({
      ...newWidget,
      owner: newWidget.projectId ? "PROJECT" : "LANGFUSE",
    });
  }

  /**
   * Gets a dashboard widget by ID. Look either in the current project or in the Langfuse managed widgets.
   */
  public static async getWidget(
    widgetId: string,
    projectId: string,
  ): Promise<WidgetDomain | null> {
    const widget = await prisma.dashboardWidget.findFirst({
      where: {
        id: widgetId,
        OR: [{ projectId }, { projectId: null }],
      },
    });

    if (!widget) {
      return null;
    }

    return WidgetDomainSchema.parse({
      ...widget,
      owner: widget.projectId ? "PROJECT" : "LANGFUSE",
    });
  }

  /**
   * Updates an existing dashboard widget.
   */
  public static async updateWidget(
    projectId: string,
    widgetId: string,
    input: CreateWidgetInput,
    userId?: string,
  ): Promise<WidgetDomain> {
    const existingWidget = await prisma.dashboardWidget.findFirst({
      where: { id: widgetId, projectId },
      select: { minVersion: true, view: true },
    });
    const persistedMinVersion =
      existingWidget && existingWidget.view === input.view
        ? existingWidget.minVersion
        : undefined;
    const minVersion = resolveDashboardWidgetMinVersion(
      toWidgetQueryShape(input),
      persistedMinVersion,
    );
    validateDashboardWidgetQuery(input, minVersion);
    const updatedWidget = await prisma.dashboardWidget.update({
      where: {
        id: widgetId,
        projectId,
      },
      data: {
        name: input.name,
        description: input.description,
        view: input.view,
        dimensions: input.dimensions,
        metrics: input.metrics,
        filters: input.filters,
        chartType: input.chartType,
        chartConfig: input.chartConfig,
        minVersion,
        updatedBy: userId,
      },
    });

    return WidgetDomainSchema.parse({
      ...updatedWidget,
      owner: updatedWidget.projectId ? "PROJECT" : "LANGFUSE",
    });
  }

  /**
   * Deletes a dashboard widget.
   * Throws LangfuseConflictError if the widget is still referenced in any
   * dashboard, and LangfuseNotFoundError if it does not exist in the project.
   */
  public static async deleteWidget(
    widgetId: string,
    projectId: string,
  ): Promise<void> {
    // First check if this widget is referenced in any dashboard definitions
    const referencingDashboards = await prisma.dashboard.findMany({
      where: {
        projectId,
        definition: {
          path: ["widgets"],
          array_contains: [{ widgetId }],
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (referencingDashboards.length > 0) {
      const dashboardNames = referencingDashboards
        .map((d) => `"${d.name}"`)
        .join(", ");

      throw new LangfuseConflictError(
        `Cannot delete widget because it is still used in the following dashboards: ${dashboardNames}. Please remove the widget from these dashboards first.`,
      );
    }

    try {
      await prisma.dashboardWidget.delete({
        where: {
          id: widgetId,
          projectId,
        },
      });
    } catch (e) {
      // P2025 = row not found; also thrown for cross-project ids, so the 404
      // does not leak whether the widget exists in another project.
      if (isPrismaRecordNotFoundError(e)) {
        throw new LangfuseNotFoundError(
          `Widget ${widgetId} not found in project ${projectId}`,
        );
      }
      throw e;
    }
  }

  /**
   * Copies a Langfuse-owned widget into the user project, rewires the specified dashboard placement to the new widget and returns the new widget id.
   */
  public static async copyWidgetToProject(props: {
    sourceWidgetId: string;
    projectId: string;
    dashboardId: string;
    placementId: string;
    userId?: string;
  }): Promise<string> {
    const { sourceWidgetId, projectId, dashboardId, placementId, userId } =
      props;

    const sourceWidget = await prisma.dashboardWidget.findFirst({
      where: {
        id: sourceWidgetId,
        projectId: null,
      },
    });

    if (!sourceWidget) {
      throw new LangfuseNotFoundError(
        `Source widget ${sourceWidgetId} not found`,
      );
    }
    const sourceWidgetDomain = WidgetDomainSchema.parse({
      ...sourceWidget,
      owner: "LANGFUSE",
    });
    const minVersion = resolveDashboardWidgetMinVersion(
      toWidgetQueryShape(sourceWidgetDomain),
      sourceWidgetDomain.minVersion,
    );
    validateDashboardWidgetQuery(sourceWidgetDomain, minVersion);
    // Duplicate widget and update dashboard definition atomically
    return prisma.$transaction(async (tx) => {
      // 1. create duplicate in project scope
      const newWidget = await tx.dashboardWidget.create({
        data: {
          name: sourceWidget.name,
          description: sourceWidget.description,
          view: sourceWidget.view,
          dimensions: sourceWidget.dimensions ?? [],
          metrics: sourceWidget.metrics ?? [],
          filters: sourceWidget.filters ?? [],
          chartType: sourceWidget.chartType,
          chartConfig: sourceWidget.chartConfig ?? {},
          minVersion,
          projectId, // project owned
          createdBy: userId,
          updatedBy: userId,
        },
      });

      await updateClassicLayout(
        tx,
        projectId,
        dashboardId,
        ({ widgets }) => ({
          widgets: widgets.map((placement) =>
            placement.type === "widget" && placement.id === placementId
              ? { ...placement, widgetId: newWidget.id }
              : placement,
          ),
        }),
        userId,
      );

      return newWidget.id;
    });
  }
}
