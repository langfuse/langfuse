import { Job } from "bullmq";
import {
  checkObservationExists,
  getObservationById,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";

import {
  ActionCreationService,
  TriggerEventSource,
} from "../trigger/triggerService";
import { prisma } from "@langfuse/shared/src/db";

export const observationUpsertProcessor = async (
  job: Job<TQueueJobTypes[QueueName.ObservationUpsert]>,
) => {
  const { id, projectId, startTime, traceId } = job.data.payload;

  const triggerService = new ActionCreationService(projectId);
  await triggerService.triggerAction({
    eventSource: TriggerEventSource.ObservationCreated,
    event: job.data.payload,
    checkTriggerAppliesToEvent: async (trigger) => {
      return await checkObservationExists({
        projectId,
        id,
        filter: [
          ...trigger.filter,
          {
            column: "traceId",
            operator: "=",
            value: traceId,
            type: "string",
          },
          {
            column: "startTime",
            operator: "=",
            value: startTime,
            type: "datetime",
          },
        ],
      });
    },
    getExistingJobForTrigger: async (trigger) => {
      return await prisma.jobExecution.findFirst({
        where: {
          projectId: projectId,
          jobConfigurationId: trigger.id,
          jobInputObservationId: id,
        },
      });
    },
    createEventId: () => {
      return id;
    },
    convertEventToActionInput: async (actionConfig) => {
      return {};
    },
  });
};
