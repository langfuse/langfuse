import { WebhookInput } from "@langfuse/shared/src/server";
import {
  AutomationService,
  AutomationServiceDelegates,
  TriggerEventSource,
} from "../automations/automationService";
import { prisma } from "@langfuse/shared/src/db";
import { executeMemoryFilters } from "../automations/memory-filter";
import { promptsTableUiColumnDefinitions } from "@langfuse/shared";

export interface PromptChangeEvent {
  id: string;
  projectId: string;
  name: string;
  version: number;
  action: "create" | "update" | "delete";
  timestamp: Date;
  before?: unknown;
  after?: unknown;
}

export const promptChangeProcessor = async (event: PromptChangeEvent) => {
  const delegates: AutomationServiceDelegates<PromptChangeEvent> = {
    checkTriggerAppliesToEvent: async (trigger) => {
      return executeMemoryFilters({
        object: {
          id: event.id,
          project_id: event.projectId,
          name: event.name,
          version: event.version,
          action: event.action,
          timestamp: event.timestamp,
        },
        filters: trigger.filter,
        columnMappings: promptsTableUiColumnDefinitions,
      });
    },
    getExistingActionExecutionForTrigger: async (trigger) => {
      const actionExecution = await prisma.actionExecution.findFirst({
        where: {
          projectId: event.projectId,
          triggerId: trigger.id,
          sourceId: event.id,
        },
        select: {
          id: true,
          status: true,
        },
      });
      return actionExecution;
    },
    createEventId: () => {
      return event.id;
    },
    convertEventToActionInput: async (actionConfig, executionId) => {
      const webhookInputSchema: WebhookInput = {
        type: "prompt",
        promptId: event.id,
        projectId: event.projectId,
        promptName: event.name,
        version: event.version,
        action: event.action,
        timestamp: event.timestamp,
        actionId: actionConfig.id,
        triggerId: actionConfig.triggerIds[0],
        executionId,
      };
      return webhookInputSchema;
    },
  };

  const triggerService = new AutomationService<PromptChangeEvent>(
    event.projectId,
    delegates,
  );

  await triggerService.triggerAction({
    eventSource: TriggerEventSource.PromptChanged,
  });
};