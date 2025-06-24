import { JobConfigState, JobExecutionStatus } from "@prisma/client";
import { logger } from "../logger";
import { prisma } from "../../db";
import { QueueJobs, QueueName } from "../queues";
import { v4 } from "uuid";
import { WebhookQueue } from "../redis/webhookQueue";
import { TriggerDomain, ActionDomain, TriggerEventSource } from "../../domain";
import {
  getActionById,
  getTriggerConfigurations,
  TriggerDomainWithActions,
} from "../repositories";

export interface AutomationServiceDelegates<T> {
  checkTriggerAppliesToEvent: (trigger: TriggerDomain) => Promise<boolean>;
  getExistingActionExecutionForTrigger: (
    trigger: TriggerDomain,
  ) => Promise<{ id: string; status: JobExecutionStatus } | null>;
  createEventId: () => string;
  convertEventToActionInput: (
    actionConfig: ActionDomain,
    trigger: TriggerDomain,
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

    logger.info("Getting trigger configurations", {
      projectId: this.projectId,
      eventSource,
      status: JobConfigState.ACTIVE,
    });

    const triggerConfigurations = await getTriggerConfigurations({
      projectId: this.projectId,
      eventSource,
      status: JobConfigState.ACTIVE,
    });

    logger.info(
      `Found ${triggerConfigurations.length} triggers for event source ${eventSource}`,
    );

    for (const trigger of triggerConfigurations) {
      logger.debug(
        `Checking trigger ${JSON.stringify(trigger)} for event source ${eventSource}`,
      );
      if (await checkTriggerAppliesToEvent(trigger)) {
        logger.info(
          `Trigger ${trigger.id} applies to event ${JSON.stringify(eventSource)}`,
        );

        const existingActionExecution =
          await getExistingActionExecutionForTrigger(trigger);

        if (existingActionExecution) {
          logger.info(
            `Action execution for trigger ${trigger.id} already exists, skipping creation`,
            existingActionExecution,
          );
          continue;
        }

        await this.executeAction(trigger);
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

  private async executeAction(trigger: TriggerDomainWithActions) {
    const { createEventId, convertEventToActionInput } = this.delegates;

    const actionConfig = await getActionById({
      projectId: this.projectId,
      actionId: trigger.actionIds[0],
    });

    if (!actionConfig) {
      throw new Error(`Action ${trigger.actionIds[0]} not found`);
    }

    logger.debug(
      `Action config ${JSON.stringify(actionConfig)} for trigger ${trigger.id}`,
    );

    const executionId = v4();
    const actionInput = await convertEventToActionInput(
      actionConfig,
      trigger,
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

    switch (actionConfig.type) {
      case "WEBHOOK":
        await WebhookQueue.getInstance()?.add(QueueName.WebhookQueue, {
          timestamp: new Date(),
          id: v4(),
          payload: actionInput,
          name: QueueJobs.WebhookJob,
        });
        break;

      default:
        const _exhaustiveCheck: never = actionConfig.type;
        throw new Error(`Unhandled action type: ${_exhaustiveCheck}`);
    }

    logger.debug(
      `Created action execution ${actionExecution.id} for trigger ${trigger.id} and action ${actionConfig.id}`,
    );
  }
}
