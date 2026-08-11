import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableDashboardWidgetsQuery,
  GetUnstableDashboardWidgetsResponse,
  PostUnstableDashboardWidgetBody,
  PostUnstableDashboardWidgetResponse,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import {
  createPublicDashboardWidget,
  listPublicDashboardWidgets,
} from "@/src/features/widgets/server/public-dashboard-widget-service";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "List Unstable Dashboard Widgets",
    querySchema: GetUnstableDashboardWidgetsQuery,
    responseSchema: GetUnstableDashboardWidgetsResponse,
    fn: ({ query, auth }) =>
      listPublicDashboardWidgets({ projectId: auth.scope.projectId, ...query }),
  }),
  POST: createUnstablePublicApiRoute({
    name: "Create Unstable Dashboard Widget",
    bodySchema: PostUnstableDashboardWidgetBody,
    responseSchema: PostUnstableDashboardWidgetResponse,
    fn: async ({ body, auth }) =>
      createPublicDashboardWidget({
        projectId: auth.scope.projectId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
