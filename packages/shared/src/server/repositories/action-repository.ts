import { JobConfigState, prisma } from "../../db";
import {
  ActionDomain,
  TriggerDomain,
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
  const actionConfig = await prisma.action.findFirst({
    where: {
      id: actionId,
      projectId,
    },
  });

  if (!actionConfig) {
    return null;
  }

  const actionDomain: ActionDomain = {
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
}): Promise<Array<TriggerDomain>> => {
  const triggers = await prisma.trigger.findMany({
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
