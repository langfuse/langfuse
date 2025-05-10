import {
  ActionConfiguration,
  FilterState,
  JobConfigState,
  JobExecution,
  JobExecutionStatus,
} from "@langfuse/shared";
import { prisma, TriggerConfiguration } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { WebhookInput } from "./webhooks";

export enum TriggerEventSource {
  ObservationCreated = "observation.created",
}

export type TriggerConfigurationDomain = Omit<
  TriggerConfiguration,
  "filter" | "eventSource"
> & {
  filter: FilterState;
  eventSource: TriggerEventSource;
};

export type ActionConfigurationDomain = Omit<ActionConfiguration, "config"> & {
  config: WebhookInput;
};

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
    const triggers = await prisma.triggerConfiguration.findMany({
      where: {
        projectId: this.projectId,
        eventSource: eventSource,
        status: JobConfigState.ACTIVE,
      },
    });

    const triggerConfigurations = triggers.map((trigger) => ({
      ...trigger,
      filter: JSON.parse(trigger.filter as string) as FilterState,
      eventSource: trigger.eventSource as TriggerEventSource,
    }));

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
          event,
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
    event: T,
    trigger: TriggerConfigurationDomain,
    createEventId: () => string,
    convertEventToActionInput: (
      actionConfig: ActionConfigurationDomain,
    ) => Promise<any>,
  ) {
    const actionConfig = await prisma.actionConfiguration.findFirst({
      where: {
        id: trigger.actionId,
        projectId: this.projectId,
      },
    });

    if (!actionConfig) {
      throw new Error(`Action ${trigger.actionId} not found`);
    }

    const actionDomain: ActionConfigurationDomain = {
      ...actionConfig,
      config: JSON.parse(actionConfig.config as string) as WebhookInput,
    };

    const actionInput = await convertEventToActionInput(actionDomain);

    // create new execution. The body is used by the websocket
    const actionExecution = await prisma.actionExecution.create({
      data: {
        projectId: this.projectId,
        triggerId: trigger.id,
        actionId: actionConfig.id,
        status: JobExecutionStatus.PENDING,
        sourceId: createEventId(),
        input: actionInput,
      },
    });
  }
}
