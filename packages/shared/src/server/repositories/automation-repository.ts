/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  Action,
  ActionExecutionStatus,
  JobConfigState,
  PagerDutyRegion,
  Prisma,
  prisma,
  Trigger,
} from "../../db";
import {
  TriggerEventSource,
  TriggerDomain,
  TriggerEventAction,
  ActionDomain,
  ActionTypes,
  AutomationDomain,
  ActionDomainWithSecrets,
  SafeActionConfig,
  isWebhookActionConfig,
  WebhookActionConfigWithSecrets,
  isSafeWebhookActionConfig,
  isSlackActionConfig,
  isGitHubDispatchActionConfig,
  convertToSafeWebhookConfig,
  convertToSafeGitHubDispatchConfig,
  SafeWebhookActionConfigSchema,
  SlackActionConfigSchema,
  SafeGitHubDispatchActionConfigSchema,
  isPagerDutyActionConfig,
  PagerDutyActionConfigSchema,
} from "../../domain/automations";
import { InternalServerError } from "../../errors";
import { FilterState } from "../../types";
import {
  createDisplayHeaders,
  decryptSecretHeaders,
  getLegacyOnlyHeaders,
} from "../utils/headerUtils";

export const getActionByIdWithSecrets = async ({
  projectId,
  actionId,
}: {
  projectId: string;
  actionId: string;
}): Promise<ActionDomainWithSecrets | null> => {
  // A PAGERDUTY action's routing key is joined in the same query.
  const [row] = await prisma.$queryRaw<ActionWithPagerDutyRow[]>`
    SELECT
      a.id,
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      a.project_id AS "projectId",
      a.type::text AS "type",
      a.config,
      p.routing_key AS "pagerDutyRoutingKey",
      p.region::text AS "pagerDutyRegion",
      pr.name AS "projectName"
    FROM actions a
    JOIN projects pr ON pr.id = a.project_id
    LEFT JOIN pagerduty_integrations p
      ON a.type = 'PAGERDUTY'
      AND p.id = a.config->>'pagerDutyIntegrationId'
      AND p.project_id = a.project_id
    WHERE a.id = ${actionId}
      AND a.project_id = ${projectId}
    LIMIT 1
  `;

  if (!row) {
    return null;
  }

  const { pagerDutyRoutingKey, pagerDutyRegion, projectName, ...actionConfig } =
    row;

  if (actionConfig.type === "PAGERDUTY") {
    return {
      ...actionConfig,
      config: actionConfig.config as ActionDomainWithSecrets["config"],
      pagerDutyIntegration: toPagerDutyIntegration({
        routingKey: pagerDutyRoutingKey,
        region: pagerDutyRegion,
        projectName,
      }),
    };
  }

  if (isWebhookActionConfig(actionConfig.config)) {
    const config = actionConfig.config; // Type guard ensures this is WebhookActionConfigWithSecrets

    // Legacy headers are plaintext but flagged secret, so they are merged in
    // after decryption.
    const decryptedHeaders = {
      ...getLegacyOnlyHeaders(config),
      ...decryptSecretHeaders(config.requestHeaders ?? {}),
    };

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
  }

  // SLACK and GITHUB_DISPATCH need no header decryption, so the stored config
  // is returned verbatim. Secrets are included by design here - callers that
  // hand configs to a client must use getActionById instead.
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

export type TriggerDomainWithActions = TriggerDomain & {
  actionIds: string[];
  automations: { id: string; actionId: string }[];
};

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
    automations: trigger.automations.map((automation) => ({
      id: automation.id,
      actionId: automation.action.id,
    })),
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

/**
 * Display headers are readable by every project role. Legacy plaintext
 * `headers` that `requestHeaders` does not override are always masked, even if
 * a stored `displayHeaders` entry lists them unmasked.
 */
const getDisplayHeaders = (config: WebhookActionConfigWithSecrets) => {
  const legacyHeaders = createDisplayHeaders(getLegacyOnlyHeaders(config));
  if (!config.displayHeaders && Object.keys(legacyHeaders).length === 0) {
    return config.displayHeaders;
  }
  return { ...config.displayHeaders, ...legacyHeaders };
};

/**
 * Fallback for a stored config that does not parse as its own action type:
 * projects it onto the keys its safe schema declares. Every secret is omitted
 * from those schemas, so no secret can survive the projection, while legacy or
 * hand-edited rows still read back instead of failing the whole request.
 */
const pickSafeConfigFields = (
  config: Action["config"],
  type: ActionTypes,
  safeKeys: string[],
): SafeActionConfig => {
  const storedFields =
    typeof config === "object" && config !== null && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};

  // The values are not schema-valid, hence the assertion. What it does not
  // paper over is the secret: only `safeKeys` can appear in the result.
  return {
    ...Object.fromEntries(
      safeKeys
        .filter((key) => key in storedFields)
        .map((key) => [key, storedFields[key]]),
    ),
    type,
  } as SafeActionConfig;
};

/**
 * Reduces a stored action config to the fields that may leave the server.
 * `automations:read` is held by every project role, so anything returned here
 * is readable by VIEWERs. The switch is exhaustive over `ActionTypes`: a new
 * action type is a compile error until it has a sanitizer, rather than
 * inheriting a pass-through that ships its credentials to all readers.
 */
const convertToSafeActionConfig = (action: Action): SafeActionConfig => {
  const actionType: ActionTypes = action.type;

  switch (actionType) {
    case "WEBHOOK":
      if (isWebhookActionConfig(action.config)) {
        const config = action.config;
        config.displayHeaders = getDisplayHeaders(config);

        return convertToSafeWebhookConfig(config);
      }
      return pickSafeConfigFields(
        action.config,
        actionType,
        Object.keys(SafeWebhookActionConfigSchema.shape),
      );
    case "SLACK":
      // Slack configs hold no secrets, so the stored shape is already safe.
      if (isSlackActionConfig(action.config)) {
        return action.config;
      }
      return pickSafeConfigFields(
        action.config,
        actionType,
        Object.keys(SlackActionConfigSchema.shape),
      );
    case "GITHUB_DISPATCH":
      if (isGitHubDispatchActionConfig(action.config)) {
        return convertToSafeGitHubDispatchConfig(action.config);
      }
      return pickSafeConfigFields(
        action.config,
        actionType,
        Object.keys(SafeGitHubDispatchActionConfigSchema.shape),
      );
    case "PAGERDUTY":
      // The routing key lives on the PagerDuty integration, never in the config.
      if (isPagerDutyActionConfig(action.config)) {
        return {
          type: action.config.type,
          pagerDutyIntegrationId: action.config.pagerDutyIntegrationId,
        };
      }
      return pickSafeConfigFields(
        action.config,
        actionType,
        Object.keys(PagerDutyActionConfigSchema.shape),
      );
    default: {
      const unhandledActionType: never = actionType;
      throw new InternalServerError(
        `Action ${action.id} has unhandled action type ${unhandledActionType}`,
      );
    }
  }
};

export const convertActionToDomain = (action: Action): ActionDomain => ({
  ...action,
  config: convertToSafeActionConfig(action),
});

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
  eventSource,
}: {
  projectId: string;
  triggerId?: string;
  actionId?: string;
  eventSource?: TriggerEventSource;
}): Promise<AutomationDomain[]> => {
  const automations = await prisma.automation.findMany({
    where: {
      projectId,
      ...(triggerId ? { triggerId } : {}),
      ...(actionId ? { actionId } : {}),
      ...(eventSource ? { trigger: { eventSource } } : {}),
    },
    include: {
      action: true,
      trigger: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const domains = automations.map((automation) => ({
    id: automation.id,
    name: automation.name,
    trigger: convertTriggerToDomain(automation.trigger),
    action: convertActionToDomain(automation.action),
  }));

  return domains;
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
  if (
    isSafeWebhookActionConfig(automation.action.config) &&
    automation.action.config.lastFailingExecutionId
  ) {
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

/** toPagerDutyIntegration returns the joined routing key, or null when the integration was deleted. */
const toPagerDutyIntegration = ({
  routingKey,
  region,
  projectName,
}: {
  routingKey: string | null;
  region: PagerDutyRegion | null;
  projectName: string;
}): ActionDomainWithSecrets["pagerDutyIntegration"] => {
  if (!routingKey || !region) return null;
  return { routingKey, region, projectName };
};

/** ActionWithPagerDutyRow is an action row with its PAGERDUTY routing key joined in. */
type ActionWithPagerDutyRow = Action & {
  pagerDutyRoutingKey: string | null;
  pagerDutyRegion: PagerDutyRegion | null;
  projectName: string;
};
