import { auditLog } from "@/src/features/audit-logs/server";
import {
  deletePagerDutyIntegration,
  PagerDutyIntegrationInUseError,
  updatePagerDutyIntegration,
} from "@/src/features/pagerduty/server/pagerDutyIntegrationService";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  DeletePagerDutyIntegrationV1Response,
  PagerDutyIntegrationIdQuery,
  PagerDutyIntegrationResponse,
  PatchPagerDutyIntegrationV1Body,
} from "@/src/features/public-api/types/pagerduty-integrations";

export default withMiddlewares({
  PATCH: createAuthedProjectAPIRoute({
    name: "Update PagerDuty Integration",
    action: "integrations:CRUD",
    querySchema: PagerDutyIntegrationIdQuery,
    bodySchema: PatchPagerDutyIntegrationV1Body,
    responseSchema: PagerDutyIntegrationResponse,
    fn: async ({ query, body, auth }) => {
      const { before, after } = await updatePagerDutyIntegration({
        projectId: auth.scope.projectId,
        id: query.id,
        ...body,
      });
      await auditLog({
        action: "update",
        resourceType: "pagerDutyIntegration",
        resourceId: after.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before,
        after,
      });
      return after;
    },
  }),

  DELETE: createAuthedProjectAPIRoute({
    name: "Delete PagerDuty Integration",
    action: "integrations:CRUD",
    querySchema: PagerDutyIntegrationIdQuery,
    responseSchema: DeletePagerDutyIntegrationV1Response,
    fn: async ({ query, auth, res }) => {
      try {
        const before = await deletePagerDutyIntegration({
          projectId: auth.scope.projectId,
          id: query.id,
        });
        await auditLog({
          action: "delete",
          resourceType: "pagerDutyIntegration",
          resourceId: before.id,
          projectId: auth.scope.projectId,
          orgId: auth.scope.orgId,
          apiKeyId: auth.scope.apiKeyId,
          before,
        });
        return {
          message: "PagerDuty integration successfully deleted" as const,
        };
      } catch (error) {
        if (!(error instanceof PagerDutyIntegrationInUseError)) throw error;
        res.status(409);
        return {
          message: error.message,
          error: "PagerDutyIntegrationInUse" as const,
          automations: error.automations,
        };
      }
    },
  }),
});
