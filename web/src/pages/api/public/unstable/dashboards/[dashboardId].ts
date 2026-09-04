import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  DashboardIdQuery,
  DeleteUnstableDashboardResponse,
  GetUnstableDashboardResponse,
  PatchUnstableDashboardBody,
  PatchUnstableDashboardResponse,
} from "@/src/features/public-api/types/unstable-dashboards";
import {
  deletePublicDashboard,
  getPublicDashboard,
  updatePublicDashboard,
} from "@/src/features/dashboard/server/public-dashboard-service";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "Get Unstable Dashboard",
    querySchema: DashboardIdQuery,
    responseSchema: GetUnstableDashboardResponse,
    fn: ({ query, auth }) =>
      getPublicDashboard({
        projectId: auth.scope.projectId,
        dashboardId: query.dashboardId,
      }),
  }),
  PATCH: createUnstablePublicApiRoute({
    name: "Update Unstable Dashboard",
    querySchema: DashboardIdQuery,
    bodySchema: PatchUnstableDashboardBody,
    responseSchema: PatchUnstableDashboardResponse,
    fn: ({ query, body, auth }) =>
      updatePublicDashboard({
        projectId: auth.scope.projectId,
        dashboardId: query.dashboardId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
  DELETE: createUnstablePublicApiRoute({
    name: "Delete Unstable Dashboard",
    querySchema: DashboardIdQuery,
    responseSchema: DeleteUnstableDashboardResponse,
    fn: async ({ query, auth }) => {
      await deletePublicDashboard({
        projectId: auth.scope.projectId,
        dashboardId: query.dashboardId,
        auditScope: auth.scope,
      });
      return { message: "Dashboard successfully deleted" as const };
    },
  }),
});
