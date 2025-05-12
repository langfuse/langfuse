import {
  ActionConfigurationDomain,
  JobConfigState,
  JobExecution,
  JobExecutionStatus,
  TriggerConfigurationDomain,
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
import { getCachedTriggerConfigs } from "./cached-automation-repo";

export enum TriggerEventSource {
  ObservationCreated = "observation.created",
}

export class ActionCreationService {
  private projectId: string;
  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async triggerAction<T>(p: {
    eventSource: TriggerEventSource;
    event: T;
    checkTriggerAppliesToEvent: (
      trigger: TriggerConfigurationDomain,
    ) => Promise<boolean>;
    getExistingJobForTrigger: (
      trigger: TriggerConfigurationDomain,
    ) => Promise<JobExecution | null>;
    createEventId: () => string;
    convertEventToActionInput: (
      actionConfig: ActionConfigurationDomain,
    ) => Promise<any>;
  }) {
    const {
      eventSource,
      event,
      checkTriggerAppliesToEvent,
      getExistingJobForTrigger,
      createEventId,
      convertEventToActionInput,
    } = p;

    const triggerConfigurations = await getCachedTriggerConfigs({
      projectId: this.projectId,
      eventSource,
      status: JobConfigState.ACTIVE,
    });

    for (const trigger of triggerConfigurations) {
      if (await checkTriggerAppliesToEvent(trigger)) {
        // if job exists already, we do not create a new one
        const existingJob = await getExistingJobForTrigger(trigger);

        if (existingJob) {
          logger.info(
            `Job ${trigger.id} already exists, skipping creation`,
            existingJob,
          );
          continue;
        }

        // apply sampling. Only if the job is sampled, we create a job
        // user supplies a number between 0 and 1, which is the probability of sampling
        if (trigger.sampling.gt(0) && trigger.sampling.lt(1)) {
          const random = Math.random();
          if (random > trigger.sampling.toNumber()) {
            logger.debug(`Trigger ${trigger.id} was sampled out`);
            continue;
          }
        }

        await this.createAction(
          trigger,
          createEventId,
          convertEventToActionInput,
        );
      } else {
        logger.debug(`Trigger ${trigger.id} does not apply to event`);
        // if job exists already, we cancel the job
        const existingJob = await getExistingJobForTrigger(trigger);
        if (existingJob) {
          logger.debug(
            `Cancelling job ${trigger.id} because trigger does not apply`,
          );
          await prisma.jobExecution.update({
            where: { id: existingJob.id, projectId: this.projectId },
            data: { status: JobExecutionStatus.CANCELLED },
          });
        }
      }
    }
  }

  private async createAction<T>(
    trigger: TriggerConfigurationDomain,
    createEventId: () => string,
    convertEventToActionInput: (
      actionConfig: ActionConfigurationDomain,
    ) => Promise<any>,
  ) {
    const actionConfig = await getActionConfigById({
      projectId: this.projectId,
      actionId: trigger.actionId,
    });

    if (!actionConfig) {
      throw new Error(`Action ${trigger.actionId} not found`);
    }

    const actionInput = await convertEventToActionInput(actionConfig);

    // create new execution. The body is used by the websocket
    await prisma.actionExecution.create({
      data: {
        projectId: this.projectId,
        triggerId: trigger.id,
        actionId: actionConfig.id,
        status: JobExecutionStatus.PENDING,
        sourceId: createEventId(),
        input: actionInput,
      },
    });

    await WebhookQueue.getInstance()?.add(QueueName.WebhookQueue, {
      timestamp: new Date(),
      id: v4(),
      payload: actionInput,
      name: QueueJobs.WebhookJob,
    });
  }
}
