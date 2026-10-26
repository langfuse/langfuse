import { TRPCError } from "@trpc/server";

import {
  isPagerDutyActionConfig,
  type ActionCreate,
  type PagerDutyActionConfig,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

/** processPagerDutyActionConfig checks that the selected PagerDuty integration belongs to the project and returns the config to store. */
export async function processPagerDutyActionConfig({
  actionConfig,
  projectId,
}: {
  actionConfig: ActionCreate;
  projectId: string;
}): Promise<PagerDutyActionConfig> {
  if (!isPagerDutyActionConfig(actionConfig)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid PagerDuty action configuration",
    });
  }

  const integration = await prisma.pagerDutyIntegration.findFirst({
    where: { id: actionConfig.pagerDutyIntegrationId, projectId },
    select: { id: true },
  });
  if (!integration) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "PagerDuty service not found in this project",
    });
  }

  return {
    type: "PAGERDUTY",
    pagerDutyIntegrationId: integration.id,
  };
}
