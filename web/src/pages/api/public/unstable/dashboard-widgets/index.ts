import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  PostUnstableDashboardWidgetBody,
  PostUnstableDashboardWidgetResponse,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import { createPublicDashboardWidget } from "@/src/features/widgets/server/public-dashboard-widget-service";

export default withUnstablePublicApiMiddlewares({
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
