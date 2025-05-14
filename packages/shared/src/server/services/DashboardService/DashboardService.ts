import { prisma } from "../../../db";
import { LangfuseConflictError, type OrderByState } from "../../../";
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
import { z } from "zod";

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
          projectId,
        },
        orderBy: orderBy
          ? [{ [orderBy.column]: orderBy.order.toLowerCase() }]
          : [{ updatedAt: "desc" }],
        skip,
        take,
      }),
      prisma.dashboard.count({
        where: {
          projectId,
        },
      }),
    ]);

    const domainDashboards = dashboards.map((dashboard) =>
      DashboardDomainSchema.parse(dashboard),
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

    return DashboardDomainSchema.parse(newDashboard);
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

    return DashboardDomainSchema.parse(updatedDashboard);
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

    return DashboardDomainSchema.parse(updatedDashboard);
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
        projectId,
      },
    });

    if (!dashboard) {
      return null;
    }

    return DashboardDomainSchema.parse(dashboard);
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
      WidgetDomainSchema.parse(widget),
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
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return WidgetDomainSchema.parse(newWidget);
  }

  /**
   * Gets a dashboard widget by ID.
   */
  public static async getWidget(
    widgetId: string,
    projectId: string,
  ): Promise<WidgetDomain | null> {
    const widget = await prisma.dashboardWidget.findFirst({
      where: {
        id: widgetId,
        projectId,
      },
    });

    if (!widget) {
      return null;
    }

    return WidgetDomainSchema.parse(widget);
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
        updatedBy: userId,
      },
    });

    return WidgetDomainSchema.parse({
      id: widgetId,
      projectId,
      createdAt: updatedWidget.createdAt,
      updatedAt: updatedWidget.updatedAt,
      createdBy: updatedWidget.createdBy,
      updatedBy: updatedWidget.updatedBy,
      name: updatedWidget.name,
      description: updatedWidget.description,
      view: updatedWidget.view,
      dimensions: updatedWidget.dimensions as WidgetDomain["dimensions"],
      metrics: updatedWidget.metrics as WidgetDomain["metrics"],
      filters: updatedWidget.filters as WidgetDomain["filters"],
      chartType: updatedWidget.chartType,
      chartConfig: updatedWidget.chartConfig as WidgetDomain["chartConfig"],
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
}
