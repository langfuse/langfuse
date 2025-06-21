import {
  Action,
  ActionExecutionStatus,
  JobConfigState,
  prisma,
  Trigger,
} from "../../db";
import {
  TriggerEventSource,
  WebhookActionConfig,
  ActionDomain,
  TriggerDomain,
  TriggerEventAction,
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
    eventActions: (trigger.eventActions || []) as TriggerEventAction[],
    filter: (trigger.filter || []) as FilterState,
    eventSource: trigger.eventSource as TriggerEventSource,
  };
};

const convertActionToDomain = (action: Action): MinimalActionDomain => {
  return {
    ...action,
    config: action.config as WebhookActionConfig,
  };
};

// Local type for getActiveAutomations return value to avoid leaking prisma types
export type ActiveAutomation = {
  name: string;
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
    orderBy: {
      createdAt: "desc",
    },
  });

  return automations.map((automation) => ({
    name: automation.name,
    trigger: convertTriggerToDomain(automation.trigger),
    action: convertActionToDomain(automation.action),
  }));
};

// Helper function to check consecutive failures from execution history
export const getConsecutiveFailures = async ({
  triggerId,
  actionId,
  projectId,
}: {
  triggerId: string;
  actionId: string;
  projectId: string;
}): Promise<number> => {
  const executions = await prisma.actionExecution.findMany({
    where: {
      triggerId,
      actionId,
      projectId,
      status: {
        in: [ActionExecutionStatus.ERROR, ActionExecutionStatus.COMPLETED],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    select: {
      status: true,
    },
  });

  let consecutiveFailures = 0;
  for (const execution of executions) {
    if (execution.status === ActionExecutionStatus.ERROR) {
      consecutiveFailures++;
    } else if (execution.status === ActionExecutionStatus.COMPLETED) {
      break; // Stop counting when we hit a successful execution
    }
    // Skip PENDING/CANCELLED executions in the count
  }

  return consecutiveFailures;
};
