import {
  ActionDomain,
  JobConfigState,
  JobExecutionStatus,
  TriggerDomain,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  getActionConfigById,
  logger,
  QueueJobs,
  QueueName,
  WebhookQueue,
} from "@langfuse/shared/src/server";

import { v4 } from "uuid";
import { getCachedTriggers } from "./cached-automation-repo";

export enum TriggerEventSource {
  ObservationCreated = "observation.created",
}

export interface AutomationServiceDelegates<T> {
  checkTriggerAppliesToEvent: (trigger: TriggerDomain) => Promise<boolean>;
  getExistingActionExecutionForTrigger: (
    trigger: TriggerDomain,
  ) => Promise<{ id: string; status: JobExecutionStatus } | null>;
  createEventId: () => string;
  convertEventToActionInput: (
    actionConfig: ActionDomain,
    executionId: string,
  ) => Promise<any>;
}

export class AutomationService<T> {
  private projectId: string;
  private delegates: AutomationServiceDelegates<T>;

  constructor(projectId: string, delegates: AutomationServiceDelegates<T>) {
    this.projectId = projectId;
    this.delegates = delegates;
  }

  async triggerAction(p: { eventSource: TriggerEventSource }) {
    const { eventSource } = p;

    const { checkTriggerAppliesToEvent, getExistingActionExecutionForTrigger } =
      this.delegates;

    const triggerConfigurations = await getCachedTriggers({
      projectId: this.projectId,
      eventSource,
      status: JobConfigState.ACTIVE,
    });

    logger.debug(
      `Found ${triggerConfigurations.length} triggers for event source ${eventSource}`,
    );

    for (const trigger of triggerConfigurations) {
      logger.debug(
        `Checking trigger ${JSON.stringify(trigger)} for event source ${eventSource}`,
      );
      if (await checkTriggerAppliesToEvent(trigger)) {
        // if action execution exists already, we do not create a new one
        const existingActionExecution =
          await getExistingActionExecutionForTrigger(trigger);

        if (existingActionExecution) {
          logger.info(
            `Action execution for trigger ${trigger.id} already exists, skipping creation`,
            existingActionExecution,
          );
          continue;
        }

        // apply sampling. Only if the action is sampled, we create an action execution
        // user supplies a number between 0 and 1, which is the probability of sampling
        if (trigger.sampling.gt(0) && trigger.sampling.lt(1)) {
          const random = Math.random();
          if (random > trigger.sampling.toNumber()) {
            logger.debug(`Trigger ${trigger.id} was sampled out`);
            continue;
          }
        }

        await this.createAction(trigger);
      } else {
        logger.debug(`Trigger ${trigger.id} does not apply to event`);
        // if action execution exists already, we cancel it
        const existingActionExecution =
          await getExistingActionExecutionForTrigger(trigger);
        if (existingActionExecution) {
          logger.debug(
            `Cancelling action execution for trigger ${trigger.id} because trigger does not apply`,
          );
          await prisma.actionExecution.update({
            where: {
              id: existingActionExecution.id,
              projectId: this.projectId,
            },
            data: { status: JobExecutionStatus.CANCELLED },
          });
        }
      }
    }
  }

  private async createAction(trigger: TriggerDomain) {
    const { createEventId, convertEventToActionInput } = this.delegates;

    const actionConfig = await getActionConfigById({
      projectId: this.projectId,
      actionId: trigger.actionIds[0],
    });

    if (!actionConfig) {
      throw new Error(`Action ${trigger.actionIds[0]} not found`);
    }

    const executionId = v4();
    const actionInput = await convertEventToActionInput(
      actionConfig,
      executionId,
    );

    // create new execution. The body is used by the websocket
    const actionExecution = await prisma.actionExecution.create({
      data: {
        id: executionId,
        projectId: this.projectId,
        triggerId: trigger.id,
        actionId: actionConfig.id,
        status: JobExecutionStatus.PENDING,
        sourceId: createEventId(),
        input: actionInput,
      },
    });

    logger.debug(
      `Created action execution ${actionExecution.id} for trigger ${trigger.id} and action ${actionConfig.id}`,
    );

    await WebhookQueue.getInstance()?.add(QueueName.WebhookQueue, {
      timestamp: new Date(),
      id: v4(),
      payload: actionInput,
      name: QueueJobs.WebhookJob,
    });
  }
}
