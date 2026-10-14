import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/public-api/server/unstable-public-api-route";
import {
  DashboardPlacementQuery,
  DeleteDashboardPlacementResponse,
  PatchDashboardPlacementBody,
  PatchDashboardPlacementResponse,
} from "@/src/public-api/types/unstable-dashboards";
import {
  deletePublicDashboardPlacement,
  updatePublicDashboardPlacement,
} from "@/src/analytics/dashboards/server";

export default withUnstablePublicApiMiddlewares({
  PATCH: createUnstablePublicApiRoute({
    name: "Update Unstable Dashboard Placement",
    action: "dashboards:CUD",
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
    action: "dashboards:CUD",
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
