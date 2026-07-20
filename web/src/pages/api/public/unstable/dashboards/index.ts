import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableDashboardsQuery,
  GetUnstableDashboardsResponse,
  PostUnstableDashboardBody,
  PostUnstableDashboardResponse,
} from "@/src/features/public-api/types/unstable-dashboards";
import {
  createPublicDashboard,
  listPublicDashboards,
} from "@/src/features/dashboard/server/public-dashboard-service";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "List Unstable Dashboards",
    querySchema: GetUnstableDashboardsQuery,
    responseSchema: GetUnstableDashboardsResponse,
    fn: ({ query, auth }) =>
      listPublicDashboards({ projectId: auth.scope.projectId, ...query }),
  }),
  POST: createUnstablePublicApiRoute({
    name: "Create Unstable Dashboard",
    bodySchema: PostUnstableDashboardBody,
    responseSchema: PostUnstableDashboardResponse,
    fn: ({ body, auth }) =>
      createPublicDashboard({
        projectId: auth.scope.projectId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
