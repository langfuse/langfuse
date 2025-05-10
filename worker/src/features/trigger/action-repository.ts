import { prisma } from "@langfuse/shared/src/db";
import { ActionConfigurationDomain } from "./triggerService";
import { WebhookInput } from "./webhooks";

export const getActionConfigById = async ({
  projectId,
  actionId,
}: {
  projectId: string;
  actionId: string;
}) => {
  const actionConfig = await prisma.actionConfiguration.findFirst({
    where: {
      id: actionId,
      projectId,
    },
  });

  if (!actionConfig) {
    return null;
  }

  const actionDomain: ActionConfigurationDomain = {
    ...actionConfig,
    config: JSON.parse(actionConfig.config as string) as WebhookInput,
  };

  return actionDomain;
};
