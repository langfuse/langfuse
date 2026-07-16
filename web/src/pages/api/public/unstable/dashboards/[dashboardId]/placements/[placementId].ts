import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  DashboardPlacementQuery,
  DeleteDashboardPlacementResponse,
  PatchDashboardPlacementBody,
  PatchDashboardPlacementResponse,
} from "@/src/features/public-api/types/unstable-dashboards";
import {
  deletePublicDashboardPlacement,
  updatePublicDashboardPlacement,
} from "@/src/features/dashboard/server/public-dashboard-service";

export default withUnstablePublicApiMiddlewares({
  PATCH: createUnstablePublicApiRoute({
    name: "Update Unstable Dashboard Placement",
    querySchema: DashboardPlacementQuery,
    bodySchema: PatchDashboardPlacementBody,
    responseSchema: PatchDashboardPlacementResponse,
    fn: ({ query, body, auth }) =>
      updatePublicDashboardPlacement({
        projectId: auth.scope.projectId,
        ...query,
        placement: body,
        auditScope: auth.scope,
      }),
  }),
  DELETE: createUnstablePublicApiRoute({
    name: "Delete Unstable Dashboard Placement",
    querySchema: DashboardPlacementQuery,
    responseSchema: DeleteDashboardPlacementResponse,
    fn: ({ query, auth }) =>
      deletePublicDashboardPlacement({
        projectId: auth.scope.projectId,
        ...query,
        auditScope: auth.scope,
      }),
  }),
});
