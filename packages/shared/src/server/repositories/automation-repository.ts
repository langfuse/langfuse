import {
  Action,
  ActionExecutionStatus,
  JobConfigState,
  Prisma,
  prisma,
  Trigger,
} from "../../db";
import {
  TriggerEventSource,
  WebhookActionConfigWithSecrets,
  TriggerDomain,
  TriggerEventAction,
  ActionDomain,
  AutomationDomain,
  SafeWebhookActionConfig,
} from "../../domain/automations";
import { FilterState } from "../../types";
import { decryptSecretHeaders, mergeHeaders } from "../utils/headerUtils";

export const getActionByIdWithSecrets = async ({
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

  const config = actionConfig.config as WebhookActionConfigWithSecrets;

  // Decrypt secret headers for webhook execution using new structure
  const decryptedHeaders = config.requestHeaders
    ? decryptSecretHeaders(mergeHeaders(config.headers, config.requestHeaders))
    : config.headers
      ? Object.entries(config.headers).reduce(
          (acc, [key, value]) => {
            acc[key] = { secret: false, value };
            return acc;
          },
          {} as Record<string, { secret: boolean; value: string }>,
        )
      : {};

  return {
    ...actionConfig,
    config: {
      type: config.type,
      url: config.url,
      requestHeaders: decryptedHeaders,
      displayHeaders: getDisplayHeaders(config),
      apiVersion: config.apiVersion,
      displaySecretKey: config.displaySecretKey,
      secretKey: config.secretKey,
      lastFailingExecutionId: config.lastFailingExecutionId,
    },
  };
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

const getDisplayHeaders = (config: WebhookActionConfigWithSecrets) => {
  let displayHeaders = config.displayHeaders;
  if (!displayHeaders && config.headers) {
    // Convert legacy headers to displayHeaders format
    displayHeaders = Object.entries(config.headers).reduce(
      (acc, [key, value]) => {
        acc[key] = { secret: false, value };
        return acc;
      },
      {} as Record<string, { secret: boolean; value: string }>,
    );
  }
  return displayHeaders;
};

const convertActionToDomain = (action: Action): ActionDomain => {
  const config = action.config as WebhookActionConfigWithSecrets;

  return {
    ...action,
    config: {
      type: config.type,
      url: config.url,
      displayHeaders: getDisplayHeaders(config),
      apiVersion: config.apiVersion,
      displaySecretKey: config.displaySecretKey,
      lastFailingExecutionId: config.lastFailingExecutionId,
    } as SafeWebhookActionConfig,
  };
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
  const automation = await getAutomationById({
    automationId,
    projectId,
  });

  if (!automation) {
    return 0;
  }

  // Build where clause - if lastFailingExecutionId is set, only consider executions newer than it
  const whereClause: Prisma.AutomationExecutionWhereInput = {
    triggerId: automation.trigger.id,
    actionId: automation.action.id,
    projectId,
    status: {
      in: [ActionExecutionStatus.ERROR, ActionExecutionStatus.COMPLETED],
    },
  };

  // If there's a lastFailingExecutionId, we need to get executions that are newer than that execution
  if (automation.action.config.lastFailingExecutionId) {
    // First get the timestamp of the last failing execution
    const lastFailingExecution = await prisma.automationExecution.findUnique({
      where: {
        id: automation.action.config.lastFailingExecutionId,
      },
      select: {
        createdAt: true,
      },
    });

    if (lastFailingExecution) {
      whereClause.createdAt = {
        gt: lastFailingExecution.createdAt,
      };
    }
  }

  const executions = await prisma.automationExecution.findMany({
    where: whereClause,
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
