import { JobConfigState, prisma } from "../../db";
import {
  ActionConfigurationDomain,
  TriggerConfigurationDomain,
  TriggerEventSource,
  WebhookActionConfig,
} from "../../domain/automations";
import { FilterState } from "../../types";

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

export const getTriggerConfigurations = async ({
  projectId,
  eventSource,
  status,
}: {
  projectId: string;
  eventSource: TriggerEventSource;
  status: JobConfigState;
}): Promise<Array<TriggerConfigurationDomain>> => {
  const triggers = await prisma.triggerConfiguration.findMany({
    where: {
      projectId,
      eventSource,
      status,
    },
  });

  const triggerConfigurations = triggers.map((trigger) => ({
    ...trigger,
    filter: JSON.parse(trigger.filter as string) as FilterState,
    eventSource: trigger.eventSource as TriggerEventSource,
  }));

  return triggerConfigurations;
};
