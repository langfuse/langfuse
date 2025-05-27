import {
  ObservationRecordInsertType,
  WebhookInput,
} from "@langfuse/shared/src/server";

import {
  AutomationService,
  AutomationServiceDelegates,
  TriggerEventSource,
} from "../automations/automationService";
import { prisma } from "@langfuse/shared/src/db";
import { executeMemoryFilters } from "../automations/memory-filter";
import { observationsTableUiColumnDefinitions } from "@langfuse/shared";

export const observationUpsertProcessor = async (
  observation: ObservationRecordInsertType,
) => {
  const delegates: AutomationServiceDelegates<ObservationRecordInsertType> = {
    checkTriggerAppliesToEvent: async (trigger) => {
      if (!observation.trace_id || !observation.start_time) {
        return false;
      }
      return executeMemoryFilters({
        object: observation,
        filters: trigger.filter,
        columnMappings: observationsTableUiColumnDefinitions,
      });
    },
    getExistingActionExecutionForTrigger: async (trigger) => {
      const actionExecution = await prisma.actionExecution.findFirst({
        where: {
          projectId: observation.project_id,
          triggerId: trigger.id,
          sourceId: observation.id,
        },
        select: {
          id: true,
          status: true,
        },
      });
      return actionExecution;
    },
    createEventId: () => {
      return observation.id;
    },
    convertEventToActionInput: async (actionConfig, executionId) => {
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
        triggerId: actionConfig.triggerIds[0],
        executionId,
      };
      return webhookInputSchema;
    },
  };

  const triggerService = new AutomationService<ObservationRecordInsertType>(
    observation.project_id,
    delegates,
  );

  await triggerService.triggerAction({
    eventSource: TriggerEventSource.ObservationCreated,
  });
};
