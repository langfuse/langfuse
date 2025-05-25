import { Action, JobConfigState, prisma, Trigger } from "../../db";
import {
  TriggerEventSource,
  WebhookActionConfig,
  ActionDomain,
  TriggerDomain,
  AnnotationQueueActionConfig,
} from "../../domain/automations";
import { FilterState } from "../../types";

// Narrow versions of the domain types that exclude the relation ID arrays.
type MinimalActionDomain = Omit<ActionDomain, "triggerIds">;
type MinimalTriggerDomain = Omit<TriggerDomain, "actionIds">;

type ActionConfigWithTriggers = ActionDomain & { triggerIds: string[] };

export const getActionById = async ({
  projectId,
  actionId,
}: {
  projectId: string;
  actionId: string;
}): Promise<ActionConfigWithTriggers | null> => {
  const actionConfig = await prisma.action.findFirst({
    where: {
      id: actionId,
      projectId,
    },
    include: {
      triggers: true,
    },
  });

  if (!actionConfig) {
    return null;
  }

  const actionDomain = convertActionToDomain(actionConfig);

  return {
    ...actionDomain,
    triggerIds: actionConfig.triggers.map((trigger) => trigger.triggerId),
  };
};

type TriggerConfigWithActions = TriggerDomain & { actionIds: string[] };

export const getTriggerConfigurations = async ({
  projectId,
  eventSource,
  status,
}: {
  projectId: string;
  eventSource: TriggerEventSource;
  status: JobConfigState;
}): Promise<TriggerConfigWithActions[]> => {
  const triggers = await prisma.trigger.findMany({
    where: {
      projectId,
      eventSource,
      status,
    },
    include: {
      actions: true,
    },
  });

  const triggerConfigurations = triggers.map((trigger) => ({
    ...convertTriggerToDomain(trigger),
    actionIds: trigger.actions.map((action) => action.actionId),
  }));

  return triggerConfigurations;
};

const convertTriggerToDomain = (trigger: Trigger): MinimalTriggerDomain => {
  return {
    ...trigger,
    filter: trigger.filter as FilterState,
    eventSource: trigger.eventSource as TriggerEventSource,
  };
};

const convertActionToDomain = (action: Action): MinimalActionDomain => {
  return {
    ...action,
    config: action.config as WebhookActionConfig | AnnotationQueueActionConfig,
  };
};

// Local type for getActiveAutomations return value to avoid leaking prisma types
export type ActiveAutomation = {
  trigger: MinimalTriggerDomain;
  action: MinimalActionDomain;
};

export const getActiveAutomations = async ({
  projectId,
  triggerId,
  actionId,
}: {
  projectId: string;
  triggerId?: string;
  actionId?: string;
}): Promise<ActiveAutomation[]> => {
  const automations = await prisma.triggersOnActions.findMany({
    where: {
      projectId,
      ...(triggerId ? { triggerId } : {}),
      ...(actionId ? { actionId } : {}),
    },
    include: {
      action: true,
      trigger: true,
    },
  });

  return automations.map((automation) => ({
    trigger: convertTriggerToDomain(automation.trigger),
    action: convertActionToDomain(automation.action),
  }));
};
