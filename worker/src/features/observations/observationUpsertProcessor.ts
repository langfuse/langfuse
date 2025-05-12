import {
  ObservationRecordInsertType,
  WebhookInput,
} from "@langfuse/shared/src/server";

import {
  ActionCreationService,
  TriggerEventSource,
} from "../automations/triggerService";
import { prisma } from "@langfuse/shared/src/db";
import { executeMemoryFilters } from "../automations/memory-filter";

export const observationUpsertProcessor = async (
  observation: ObservationRecordInsertType,
) => {
  const triggerService = new ActionCreationService(observation.project_id);
  await triggerService.triggerAction({
    eventSource: TriggerEventSource.ObservationCreated,
    event: observation,
    checkTriggerAppliesToEvent: async (trigger) => {
      if (!observation.trace_id || !observation.start_time) {
        return false;
      }
      return executeMemoryFilters({
        object: observation,
        filters: trigger.filter,
        columnMappings: [],
      });
    },

    getExistingJobForTrigger: async (trigger) => {
      return await prisma.jobExecution.findFirst({
        where: {
          projectId: observation.project_id,
          jobConfigurationId: trigger.id,
          jobInputObservationId: observation.id,
        },
      });
    },
    createEventId: () => {
      return observation.id;
    },
    convertEventToActionInput: async (actionConfig) => {
      if (!observation.trace_id || !observation.start_time) {
        throw new Error(
          `Observation ${observation.id} has no trace_id or start_time for webhook.`,
        );
      }
      const webhookInputSchema: WebhookInput = {
        type: "observation",
        observationId: observation.id,
        projectId: observation.project_id,
        startTime: new Date(observation.start_time),
        traceId: observation.trace_id ?? "",
        observationType: observation.type as "SPAN" | "EVENT" | "GENERATION",
        actionId: actionConfig.id,
      };
      return webhookInputSchema;
    },
  });
};
