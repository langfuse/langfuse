import { prisma } from "../../../db";
import {
  LangfuseConflictError,
  LangfuseNotFoundError,
  type OrderByState,
} from "../../../";
import {
  CreateWidgetInput,
  WidgetDomain,
  WidgetListResponse,
  DashboardDomain,
  DashboardListResponse,
  DashboardDomainSchema,
  WidgetDomainSchema,
  DashboardDefinitionSchema,
} from "./types";
import { z } from "zod/v4";
import { singleFilter } from "../../../";

export class DashboardService {
  /**
   * Retrieves a list of dashboards for a given project.
   */
  public static async listDashboards(props: {
    projectId: string;
    limit?: number;
    page?: number;
    orderBy?: OrderByState;
  }): Promise<DashboardListResponse> {
    const { projectId, limit, page, orderBy } = props;

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const [dashboards, totalCount] = await Promise.all([
      prisma.dashboard.findMany({
        where: {
          OR: [{ projectId }, { projectId: null }],
        },
        orderBy: orderBy
          ? [{ [orderBy.column]: orderBy.order.toLowerCase() }]
          : [{ updatedAt: "desc" }],
        skip,
        take,
      }),
      prisma.dashboard.count({
        where: {
          OR: [{ projectId }, { projectId: null }],
        },
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
  ): Promise<DashboardDomain> {
    const newDashboard = await prisma.dashboard.create({
      data: {
        name,
        description,
        projectId,
        createdBy: userId,
        updatedBy: userId,
        definition: initialDefinition,
      },
    });

    return DashboardDomainSchema.parse({
      ...newDashboard,
      owner: newDashboard.projectId ? "PROJECT" : "LANGFUSE",
    });
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
    const updatedDashboard = await prisma.dashboard.update({
      where: {
        id: dashboardId,
        projectId,
      },
      data: {
        updatedBy: userId,
        definition: {
          widgets: definition.widgets.map((widget) => ({
            type: "widget",
            id: widget.id,
            widgetId: widget.widgetId,
            x: widget.x,
            y: widget.y,
            x_size: widget.x_size,
            y_size: widget.y_size,
          })),
        },
      },
    });

    return DashboardDomainSchema.parse({
      ...updatedDashboard,
      owner: updatedDashboard.projectId ? "PROJECT" : "LANGFUSE",
    });
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
    const updatedDashboard = await prisma.dashboard.update({
      where: {
        id: dashboardId,
        projectId,
      },
      data: {
        name,
        description,
        updatedBy: userId,
      },
    });

    return DashboardDomainSchema.parse({
      ...updatedDashboard,
      owner: updatedDashboard.projectId ? "PROJECT" : "LANGFUSE",
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
    const updatedDashboard = await prisma.dashboard.update({
      where: {
        id: dashboardId,
        projectId,
      },
      data: {
        updatedBy: userId,
        filters,
      },
    });

    return DashboardDomainSchema.parse({
      ...updatedDashboard,
      owner: updatedDashboard.projectId ? "PROJECT" : "LANGFUSE",
    });
  }

  /**
   * Gets a dashboard by ID.
   */
  public static async getDashboard(
    dashboardId: string,
    projectId: string,
  ): Promise<DashboardDomain | null> {
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        OR: [{ projectId }, { projectId: null }],
      },
    });

    if (!dashboard) {
      return null;
    }

    return DashboardDomainSchema.parse({
      ...dashboard,
      owner: dashboard.projectId ? "PROJECT" : "LANGFUSE",
    });
  }

  /**
   * Deletes a dashboard.
   */
  public static async deleteDashboard(
    dashboardId: string,
    projectId: string,
  ): Promise<void> {
    await prisma.dashboard.delete({
      where: {
        id: dashboardId,
        projectId,
      },
    });
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
        minVersion: input.minVersion ?? 1,
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
        ...(input.minVersion !== undefined
          ? { minVersion: input.minVersion }
          : {}),
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
   * Throws an error if the widget is still referenced in any dashboard.
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

    // Delete the widget if it's not referenced
    await prisma.dashboardWidget.delete({
      where: {
        id: widgetId,
        projectId,
      },
    });
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
          minVersion: sourceWidget.minVersion,
          projectId, // project owned
          createdBy: userId,
          updatedBy: userId,
        },
      });

      // 2. fetch dashboard to change reference
      const dashboard = await tx.dashboard.findFirst({
        where: { id: dashboardId, projectId },
      });

      if (!dashboard) {
        throw new LangfuseNotFoundError(
          `Dashboard ${dashboardId} not found in project ${projectId}`,
        );
      }

      const definition = (dashboard.definition ?? {
        widgets: [],
      }) as z.infer<typeof DashboardDefinitionSchema>;
      const updatedWidgets = (definition.widgets || []).map((w: any) =>
        w.id === placementId ? { ...w, widgetId: newWidget.id } : w,
      );

      // 3. update dashboard with new widget reference
      await tx.dashboard.update({
        where: { id: dashboardId, projectId },
        data: {
          updatedBy: userId,
          definition: { widgets: updatedWidgets },
        },
      });

      return newWidget.id;
    });
  }
}
