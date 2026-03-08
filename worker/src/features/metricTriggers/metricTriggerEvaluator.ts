import { randomUUID } from "crypto";
import {
  JobConfigState,
  TriggerEventSource,
  isMetricCondition,
  type MetricCondition,
  type MetricType,
  ActionExecutionStatus,
} from "@langfuse/shared";
import {
  logger,
  getActiveProjectsWithMetricTriggers,
  getTriggerConfigurations,
  updateTriggerLastTriggeredAt,
  getFailureRateForWindow,
  getP99LatencyForWindow,
  getTotalCostForWindow,
  getAvgScoreForWindow,
  getAutomationById,
  WebhookQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

export async function evaluateAllMetricTriggers(): Promise<void> {
  logger.info("[MetricTriggerEvaluator] Starting metric trigger evaluation");

  const projectIds = await getActiveProjectsWithMetricTriggers();

  if (projectIds.length === 0) {
    logger.debug("[MetricTriggerEvaluator] No active metric triggers found");
    return;
  }

  logger.info(
    `[MetricTriggerEvaluator] Evaluating metric triggers for ${projectIds.length} projects`,
  );

  for (const projectId of projectIds) {
    await evaluateMetricTriggersForProject({ projectId });
  }
}

async function evaluateMetricTriggersForProject({
  projectId,
}: {
  projectId: string;
}): Promise<void> {
  const triggers = await getTriggerConfigurations({
    projectId,
    eventSource: TriggerEventSource.TraceMetric,
    status: JobConfigState.ACTIVE,
  });

  for (const trigger of triggers) {
    if (!isMetricCondition(trigger.filter)) {
      logger.warn(
        `[MetricTriggerEvaluator] Trigger ${trigger.id} has invalid filter, skipping`,
      );
      continue;
    }

    await evaluateSingleTrigger({
      projectId,
      trigger,
      condition: trigger.filter,
    });
  }
}

async function evaluateSingleTrigger({
  projectId,
  trigger,
  condition,
}: {
  projectId: string;
  trigger: { id: string; lastTriggeredAt: Date | null; actionIds: string[] };
  condition: MetricCondition;
}): Promise<void> {
  const now = new Date();

  // Check cooldown
  if (trigger.lastTriggeredAt) {
    const msSinceLastTrigger =
      now.getTime() - trigger.lastTriggeredAt.getTime();
    const cooldownMs = condition.cooldownMinutes * 60 * 1000;
    if (msSinceLastTrigger < cooldownMs) {
      logger.debug(
        `[MetricTriggerEvaluator] Trigger ${trigger.id} is in cooldown, skipping`,
      );
      return;
    }
  }

  // Query ClickHouse for the metric value
  let metricValue: number;
  try {
    metricValue = await queryMetric({ projectId, condition });
  } catch (error) {
    logger.error(
      `[MetricTriggerEvaluator] Failed to query metric for trigger ${trigger.id}`,
      error,
    );
    return;
  }

  // Evaluate condition
  if (!compareMetric(metricValue, condition.operator, condition.threshold)) {
    logger.debug(
      `[MetricTriggerEvaluator] Trigger ${trigger.id} condition not met: ${condition.metric} = ${metricValue} ${condition.operator} ${condition.threshold}`,
    );
    return;
  }

  logger.info(
    `[MetricTriggerEvaluator] Trigger ${trigger.id} condition BREACHED: ${condition.metric} = ${metricValue} ${condition.operator} ${condition.threshold}`,
  );

  // Fire for each automation linked to this trigger
  for (const actionId of trigger.actionIds) {
    await fireAlert({
      projectId,
      triggerId: trigger.id,
      actionId,
      condition,
      metricValue,
      now,
    });
  }

  // Update lastTriggeredAt
  await updateTriggerLastTriggeredAt({
    triggerId: trigger.id,
    projectId,
    lastTriggeredAt: now,
  });
}

async function queryMetric({
  projectId,
  condition,
}: {
  projectId: string;
  condition: MetricCondition;
}): Promise<number> {
  const { metric, lookbackWindowMinutes, scoreName } = condition;

  switch (metric as MetricType) {
    case "failure_rate":
      return getFailureRateForWindow({ projectId, lookbackWindowMinutes });
    case "p99_latency_ms":
      return getP99LatencyForWindow({ projectId, lookbackWindowMinutes });
    case "total_cost_usd":
      return getTotalCostForWindow({ projectId, lookbackWindowMinutes });
    case "avg_score":
      if (!scoreName) {
        throw new Error(
          "scoreName is required for avg_score metric but was not provided",
        );
      }
      return getAvgScoreForWindow({
        projectId,
        lookbackWindowMinutes,
        scoreName,
      });
    default:
      throw new Error(`Unknown metric type: ${metric}`);
  }
}

// Exported for unit testing
export const compareMetricForTesting = compareMetric;

function compareMetric(
  value: number,
  operator: string,
  threshold: number,
): boolean {
  switch (operator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    default:
      return false;
  }
}

async function fireAlert({
  projectId,
  triggerId,
  actionId,
  condition,
  metricValue,
  now,
}: {
  projectId: string;
  triggerId: string;
  actionId: string;
  condition: MetricCondition;
  metricValue: number;
  now: Date;
}): Promise<void> {
  // Find the automation linking this trigger + action
  const automations = await prisma.automation.findMany({
    where: { projectId, triggerId, actionId },
    select: { id: true },
  });

  if (automations.length === 0) {
    logger.warn(
      `[MetricTriggerEvaluator] No automation found for trigger=${triggerId} action=${actionId}`,
    );
    return;
  }

  const automationId = automations[0].id;
  const executionId = randomUUID();

  // Create AutomationExecution record
  await prisma.automationExecution.create({
    data: {
      id: executionId,
      sourceId: triggerId, // metric triggers use triggerId as the source entity
      automationId,
      triggerId,
      actionId,
      projectId,
      status: ActionExecutionStatus.PENDING,
      input: {
        metric: condition.metric,
        value: metricValue,
        threshold: condition.threshold,
        operator: condition.operator,
        lookbackWindowMinutes: condition.lookbackWindowMinutes,
        triggeredAt: now.toISOString(),
      },
    },
  });

  // Enqueue webhook job
  const webhookQueue = WebhookQueue.getInstance();
  if (!webhookQueue) {
    logger.error(
      "[MetricTriggerEvaluator] WebhookQueue not available, cannot enqueue alert",
    );
    return;
  }

  await webhookQueue.add(QueueJobs.WebhookJob, {
    id: executionId,
    timestamp: now,
    name: QueueJobs.WebhookJob,
    payload: {
      projectId,
      automationId,
      executionId,
      payload: {
        type: "metric-alert",
        metric: condition.metric,
        value: metricValue,
        threshold: condition.threshold,
        operator: condition.operator,
        lookbackWindowMinutes: condition.lookbackWindowMinutes,
        triggeredAt: now.toISOString(),
      },
    },
  });

  logger.info(
    `[MetricTriggerEvaluator] Enqueued metric alert for automation ${automationId}, execution ${executionId}`,
  );
}
