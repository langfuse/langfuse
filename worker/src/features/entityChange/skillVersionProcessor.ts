import {
  ActionExecutionStatus,
  InternalServerError,
  JobConfigState,
  TriggerEventSource,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  type EntityChangeEventType,
  getAutomations,
  getTriggerConfigurations,
  logger,
  matchesTriggerFilter,
  QueueJobs,
  QueueName,
  WebhookQueue,
} from "@langfuse/shared/src/server";
import { randomUUID } from "node:crypto";

type SkillVersionEvent = Extract<
  EntityChangeEventType,
  { entityType: "skill-version" }
>;

async function enqueueSkillAutomationAction(
  event: SkillVersionEvent,
  trigger: { id: string; actionIds: string[] },
): Promise<void> {
  if (trigger.actionIds.length !== 1) {
    throw new InternalServerError("Expected one action per skill automation");
  }
  const actionId = trigger.actionIds[0];
  const automations = await getAutomations({
    projectId: event.projectId,
    actionId,
  });
  if (automations.length !== 1) {
    throw new InternalServerError("Expected one automation per action");
  }
  const automationId = automations[0].id;
  const executionId = randomUUID();
  await prisma.automationExecution.create({
    data: {
      id: executionId,
      projectId: event.projectId,
      automationId,
      triggerId: trigger.id,
      actionId,
      status: ActionExecutionStatus.PENDING,
      sourceId: event.skillId,
      input: {
        type: "skill-version",
        skillName: event.skill.name,
        skillVersion: event.skill.version,
        skillId: event.skillId,
        automationId,
      },
    },
  });
  await WebhookQueue.getInstance()?.add(QueueName.WebhookQueue, {
    timestamp: new Date(),
    id: randomUUID(),
    name: QueueJobs.WebhookJob,
    payload: {
      projectId: event.projectId,
      automationId,
      executionId,
      payload: {
        type: "skill-version",
        action: event.action,
        skill: event.skill,
        ...(event.user ? { user: event.user } : {}),
      },
    },
  });
}

export async function skillVersionProcessor(
  event: SkillVersionEvent,
): Promise<void> {
  if (
    event.skill.projectId !== event.projectId ||
    event.skill.id !== event.skillId
  ) {
    throw new InternalServerError(
      "Skill event identity does not match its envelope",
    );
  }
  const triggers = await getTriggerConfigurations({
    projectId: event.projectId,
    eventSource: TriggerEventSource.Skill,
    status: JobConfigState.ACTIVE,
  });
  for (const trigger of triggers) {
    if (
      !matchesTriggerFilter(
        {
          Name: event.skill.name,
          Labels: event.skill.labels,
          Tags: event.skill.tags,
          action: event.action,
        },
        trigger,
      )
    )
      continue;
    try {
      await enqueueSkillAutomationAction(event, trigger);
    } catch (error) {
      logger.error(
        `Error processing trigger ${trigger.id} for skill ${event.skillId} in project ${event.projectId}`,
        error,
      );
    }
  }
}
