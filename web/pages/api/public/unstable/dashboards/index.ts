import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/public-api/server/unstable-public-api-route";
import {
  GetUnstableDashboardsQuery,
  GetUnstableDashboardsResponse,
  PostUnstableDashboardBody,
  PostUnstableDashboardResponse,
} from "@/src/public-api/types/unstable-dashboards";
import {
  createPublicDashboard,
  listPublicDashboards,
} from "@/src/analytics/dashboards/server";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "List Unstable Dashboards",
    action: "dashboards:read",
    querySchema: GetUnstableDashboardsQuery,
    responseSchema: GetUnstableDashboardsResponse,
    fn: ({ query, auth }) =>
      listPublicDashboards({ projectId: auth.scope.projectId, ...query }),
  }),
  POST: createUnstablePublicApiRoute({
    name: "Create Unstable Dashboard",
    action: "dashboards:CUD",
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
