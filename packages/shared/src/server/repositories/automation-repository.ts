import {
  Action,
  ActionExecutionStatus,
  JobConfigState,
  prisma,
  Trigger,
} from "../../db";
import {
  TriggerEventSource,
  TriggerDomain,
  TriggerEventAction,
  ActionDomain,
  AutomationDomain,
  ActionDomainWithSecrets,
  SafeActionConfig,
  isWebhookActionConfig,
} from "../../domain/automations";
import { FilterState } from "../../types";
import { decryptSecretHeaders, mergeHeaders } from "../utils/headerUtils";

export const getActionByIdWithSecrets = async ({
  projectId,
  actionId,
}: {
  projectId: string;
  actionId: string;
}): Promise<ActionDomainWithSecrets | null> => {
  const actionConfig = await prisma.action.findFirst({
    where: {
      id: actionId,
      projectId,
    },
  });

  if (!actionConfig) {
    return null;
  }

  if (isWebhookActionConfig(actionConfig.config)) {
    const config = actionConfig.config; // Type guard ensures this is WebhookActionConfigWithSecrets

    // Decrypt secret headers for webhook execution using new structure
    const decryptedHeaders = config.requestHeaders
      ? decryptSecretHeaders(
          mergeHeaders(config.headers, config.requestHeaders),
        )
      : Object.entries(config.headers || {}).reduce(
          (acc, [key, value]) => {
            acc[key] = { secret: false, value };
            return acc;
          },
          {} as Record<string, { secret: boolean; value: string }>,
        );

    return {
      ...actionConfig,
      config: {
        type: config.type,
        url: config.url,
        requestHeaders: decryptedHeaders,
        displayHeaders: config.displayHeaders,
        apiVersion: config.apiVersion,
        displaySecretKey: config.displaySecretKey,
        secretKey: config.secretKey,
      },
    };
  }

  // For SLACK and others, return as stored (already safe)
  return actionConfig as ActionDomainWithSecrets;
};

export const getActionById = async ({
  projectId,
  actionId,
}: {
  projectId: string;
  actionId: string;
}): Promise<ActionDomain | null> => {
  const actionConfig = await prisma.action.findFirst({
    where: {
      id: actionId,
      projectId,
    },
  });

  if (!actionConfig) {
    return null;
  }

  const actionDomain = convertActionToDomain(actionConfig);

  return actionDomain;
};

export type TriggerDomainWithActions = TriggerDomain & { actionIds: string[] };

export const getTriggerConfigurations = async ({
  projectId,
  eventSource,
  status,
}: {
  projectId: string;
  eventSource: TriggerEventSource;
  status: JobConfigState;
}): Promise<TriggerDomainWithActions[]> => {
  const triggers = await prisma.trigger.findMany({
    where: {
      projectId,
      eventSource,
      status,
    },
    include: {
      automations: {
        include: {
          action: true,
        },
      },
    },
  });

  const triggerConfigurations = triggers.map((trigger) => ({
    ...convertTriggerToDomain(trigger),
    actionIds: trigger.automations.map((automation) => automation.action.id),
  }));

  return triggerConfigurations;
};

const convertTriggerToDomain = (trigger: Trigger): TriggerDomain => {
  return {
    ...trigger,
    eventActions: (trigger.eventActions || []) as TriggerEventAction[],
    filter: (trigger.filter || []) as FilterState,
    eventSource: trigger.eventSource as TriggerEventSource,
  };
};

const convertActionToDomain = (action: Action): ActionDomain => {
  if (isWebhookActionConfig(action.config)) {
    const config = action.config; // Type guard ensures this is WebhookActionConfigWithSecrets

    // Handle legacy headers - convert them to displayHeaders format if displayHeaders is undefined
    let displayHeaders = config.displayHeaders;
    if (!displayHeaders && config.headers) {
      displayHeaders = Object.entries(config.headers).reduce(
        (acc, [key, value]) => {
          acc[key] = { secret: false, value };
          return acc;
        },
        {} as Record<string, { secret: boolean; value: string }>,
      );
    }

    return {
      ...action,
      config: {
        type: config.type,
        url: config.url,
        displayHeaders,
        apiVersion: config.apiVersion,
        displaySecretKey: config.displaySecretKey,
      },
    };
  }

  // For SLACK (or future types) return config as-is
  return {
    ...action,
    config: action.config as SafeActionConfig,
  } as ActionDomain;
};

export const getAutomationById = async ({
  projectId,
  automationId,
}: {
  projectId: string;
  automationId: string;
}): Promise<AutomationDomain | null> => {
  const automation = await prisma.automation.findFirst({
    where: {
      id: automationId,
      projectId,
    },
    include: {
      action: true,
      trigger: true,
    },
  });

  if (!automation) {
    return null;
  }

  return {
    id: automation.id,
    name: automation.name,
    trigger: convertTriggerToDomain(automation.trigger),
    action: convertActionToDomain(automation.action),
  };
};

export const getAutomations = async ({
  projectId,
  triggerId,
  actionId,
}: {
  projectId: string;
  triggerId?: string;
  actionId?: string;
}): Promise<AutomationDomain[]> => {
  const automations = await prisma.automation.findMany({
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
    id: automation.id,
    name: automation.name,
    trigger: convertTriggerToDomain(automation.trigger),
    action: convertActionToDomain(automation.action),
  }));
};

export const getConsecutiveAutomationFailures = async ({
  automationId,
  projectId,
}: {
  automationId: string;
  projectId: string;
}): Promise<number> => {
  // First get the automation to extract triggerId and actionId
  const automation = await prisma.automation.findFirst({
    where: {
      id: automationId,
      projectId,
    },
  });

  if (!automation) {
    return 0;
  }

  const { triggerId, actionId } = automation;
  const executions = await prisma.automationExecution.findMany({
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
