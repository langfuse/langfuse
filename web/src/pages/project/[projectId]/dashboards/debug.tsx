import type { GetServerSideProps } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { getServerAuthSession } from "@/src/server/auth";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import type { DashboardStructureProps } from "@/src/features/dashboard/debug/DashboardStructurePage";

export { default } from "@/src/features/dashboard/debug/DashboardStructurePage";

export const getServerSideProps: GetServerSideProps<
  DashboardStructureProps
> = async (context) => {
  if (env.NODE_ENV !== "development") return { notFound: true };
  const projectId = context.params?.projectId;
  if (typeof projectId !== "string") return { notFound: true };
  const session = await getServerAuthSession(context);
  if (!hasProjectAccess({ session, projectId, scope: "dashboards:read" }))
    return { notFound: true };

  const [dashboards, widgets, dashboardCount, widgetCount] = await Promise.all([
    prisma.dashboard.findMany({
      where: { OR: [{ projectId }, { projectId: null }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.dashboardWidget.findMany({
      where: { OR: [{ projectId }, { projectId: null }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.dashboard.count({
      where: { OR: [{ projectId }, { projectId: null }] },
    }),
    prisma.dashboardWidget.count({
      where: { OR: [{ projectId }, { projectId: null }] },
    }),
  ]);
  const dashboardId =
    typeof context.query.dashboardId === "string"
      ? context.query.dashboardId
      : null;
  const widgetId =
    typeof context.query.widgetId === "string" ? context.query.widgetId : null;
  const [dashboard, widget] = await Promise.all([
    dashboardId
      ? prisma.dashboard.findFirst({
          where: { id: dashboardId, OR: [{ projectId }, { projectId: null }] },
          select: {
            id: true,
            name: true,
            projectId: true,
            definition: true,
            filters: true,
            updatedAt: true,
          },
        })
      : null,
    widgetId
      ? prisma.dashboardWidget.findFirst({
          where: { id: widgetId, OR: [{ projectId }, { projectId: null }] },
          select: {
            id: true,
            name: true,
            projectId: true,
            description: true,
            view: true,
            metrics: true,
            dimensions: true,
            filters: true,
            chartType: true,
            chartConfig: true,
            minVersion: true,
            definition: true,
            revision: true,
            updatedAt: true,
          },
        })
      : null,
  ]);
  if ((dashboardId && !dashboard) || (widgetId && !widget))
    return { notFound: true };
  const definition = dashboard?.definition;
  const placements =
    definition &&
    typeof definition === "object" &&
    !Array.isArray(definition) &&
    Array.isArray(definition.widgets)
      ? definition.widgets
      : [];
  const placedWidgetIds = [
    ...new Set(
      placements.flatMap((placement) =>
        placement &&
        typeof placement === "object" &&
        !Array.isArray(placement) &&
        placement.type === "widget" &&
        typeof placement.widgetId === "string"
          ? [placement.widgetId]
          : [],
      ),
    ),
  ];
  return {
    props: {
      projectId,
      dashboards,
      widgets,
      dashboardCount,
      widgetCount,
      dashboardId,
      widgetId,
      dashboardJson: dashboard ? JSON.stringify(dashboard, null, 2) : null,
      widgetJson: widget ? JSON.stringify(widget, null, 2) : null,
      placedWidgetIds,
    },
  };
};
