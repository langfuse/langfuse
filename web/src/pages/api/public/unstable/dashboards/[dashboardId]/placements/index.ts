import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  DashboardIdQuery,
  PostDashboardPlacementBody,
  PostDashboardPlacementResponse,
} from "@/src/features/public-api/types/unstable-dashboards";
import { addPublicDashboardPlacement } from "@/src/features/dashboard/server/public-dashboard-service";

export default withUnstablePublicApiMiddlewares({
  POST: createUnstablePublicApiRoute({
    name: "Add Unstable Dashboard Placement",
    querySchema: DashboardIdQuery,
    bodySchema: PostDashboardPlacementBody,
    responseSchema: PostDashboardPlacementResponse,
    fn: ({ query, body, auth }) =>
      addPublicDashboardPlacement({
        projectId: auth.scope.projectId,
        dashboardId: query.dashboardId,
        placement: body,
        auditScope: auth.scope,
      }),
  }),
});
