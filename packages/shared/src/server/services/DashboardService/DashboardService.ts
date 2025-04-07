import { prisma } from "../../../db";
import { type OrderByState } from "../../../";
import { CreateWidgetInput, WidgetDomain, WidgetListResponse } from "./types";

export class DashboardService {
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

    const domainWidgets = widgets.map((widget) => ({
      id: widget.id,
      createdAt: widget.createdAt,
      updatedAt: widget.updatedAt,
      createdBy: widget.createdBy,
      updatedBy: widget.updatedBy,
      projectId: widget.projectId,
      name: widget.name,
      description: widget.description,
      view: widget.view,
      dimensions: widget.dimensions as unknown as WidgetDomain["dimensions"],
      metrics: widget.metrics as unknown as WidgetDomain["metrics"],
      filters: widget.filters as unknown as WidgetDomain["filters"],
      chartType: widget.chartType,
      chartConfig: widget.chartConfig as unknown as WidgetDomain["chartConfig"],
    }));

    return {
      widgets: domainWidgets,
      totalCount,
    };
  }

  /**
   * Creates a new dashboard widget.
   */
  public static async createWidget(
    input: CreateWidgetInput,
    userId?: string,
  ): Promise<WidgetDomain> {
    const newWidget = await prisma.dashboardWidget.create({
      data: {
        name: input.name,
        description: input.description,
        projectId: input.projectId,
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

    return {
      id: newWidget.id,
      createdAt: newWidget.createdAt,
      updatedAt: newWidget.updatedAt,
      createdBy: newWidget.createdBy,
      updatedBy: newWidget.updatedBy,
      projectId: newWidget.projectId,
      name: newWidget.name,
      description: newWidget.description,
      view: newWidget.view,
      dimensions: newWidget.dimensions as WidgetDomain["dimensions"],
      metrics: newWidget.metrics as WidgetDomain["metrics"],
      filters: newWidget.filters as WidgetDomain["filters"],
      chartType: newWidget.chartType,
      chartConfig: newWidget.chartConfig as WidgetDomain["chartConfig"],
    };
  }
}
