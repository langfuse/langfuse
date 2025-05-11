import { prisma } from "../../db";
import {
  ActionConfigurationDomain,
  WebhookActionConfig,
} from "../../domain/automations";

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
    config: JSON.parse(actionConfig.config as string) as WebhookActionConfig,
  };

  return actionDomain;
};
