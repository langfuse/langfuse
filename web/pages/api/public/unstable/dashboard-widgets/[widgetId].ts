import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/public-api/server/unstable-public-api-route";
import {
  DashboardWidgetIdQuery,
  DeleteUnstableDashboardWidgetResponse,
  GetUnstableDashboardWidgetResponse,
  PatchUnstableDashboardWidgetBody,
  PatchUnstableDashboardWidgetResponse,
} from "@/src/public-api/types/unstable-dashboard-widgets";
import {
  deletePublicDashboardWidget,
  getPublicDashboardWidget,
  updatePublicDashboardWidget,
} from "@/src/analytics/visualization/server/public-dashboard-widget-service";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "Get Unstable Dashboard Widget",
    action: "dashboards:read",
    querySchema: DashboardWidgetIdQuery,
    responseSchema: GetUnstableDashboardWidgetResponse,
    fn: ({ query, auth }) =>
      getPublicDashboardWidget({
        projectId: auth.scope.projectId,
        widgetId: query.widgetId,
      }),
  }),
  PATCH: createUnstablePublicApiRoute({
    name: "Update Unstable Dashboard Widget",
    action: "dashboards:CUD",
    querySchema: DashboardWidgetIdQuery,
    bodySchema: PatchUnstableDashboardWidgetBody,
    responseSchema: PatchUnstableDashboardWidgetResponse,
    fn: ({ query, body, auth }) =>
      updatePublicDashboardWidget({
        projectId: auth.scope.projectId,
        widgetId: query.widgetId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
  DELETE: createUnstablePublicApiRoute({
    name: "Delete Unstable Dashboard Widget",
    action: "dashboards:CUD",
    querySchema: DashboardWidgetIdQuery,
    responseSchema: DeleteUnstableDashboardWidgetResponse,
    fn: async ({ query, auth }) => {
      await deletePublicDashboardWidget({
        projectId: auth.scope.projectId,
        widgetId: query.widgetId,
        auditScope: auth.scope,
      });
      return { message: "Dashboard widget successfully deleted" as const };
    },
  }),
});
