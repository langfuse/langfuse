import { auditLog } from "@/src/features/audit-logs/server";
import {
  createPagerDutyIntegration,
  listPagerDutyIntegrations,
} from "@/src/features/pagerduty/server/pagerDutyIntegrationService";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetPagerDutyIntegrationsV1Response,
  PagerDutyIntegrationResponse,
  PostPagerDutyIntegrationV1Body,
} from "@/src/features/public-api/types/pagerduty-integrations";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get PagerDuty Integrations",
    action: "automations:read",
    responseSchema: GetPagerDutyIntegrationsV1Response,
    fn: async ({ auth }) => ({
      data: await listPagerDutyIntegrations(auth.scope.projectId),
    }),
  }),

  POST: createAuthedProjectAPIRoute({
    name: "Create PagerDuty Integration",
    action: "integrations:CRUD",
    bodySchema: PostPagerDutyIntegrationV1Body,
    responseSchema: PagerDutyIntegrationResponse,
    successStatusCode: 201,
    fn: async ({ body, auth }) => {
      const integration = await createPagerDutyIntegration({
        projectId: auth.scope.projectId,
        ...body,
      });
      await auditLog({
        action: "create",
        resourceType: "pagerDutyIntegration",
        resourceId: integration.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: integration,
      });
      return integration;
    },
  }),
});
