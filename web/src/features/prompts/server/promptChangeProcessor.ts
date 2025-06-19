import { TriggerEventSource, type Prompt } from "@langfuse/shared";
import { AutomationService, logger } from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { anyPromptExists } from "@/src/features/prompts/server/repositories/promptRepository";

export type PromptActionType = "created" | "updated" | "deleted";

export interface PromptEvent {
  eventId: string;
  event: "prompt";
  action: PromptActionType;
  timestamp: Date;
  projectId: string;
  data: Prompt;
  trigger: {
    source: "api" | "ui";
    userId?: string;
    apiKeyId?: string;
  };
}

export const promptChangeEventSourcing = async (
  promptData: Prompt,
  action: PromptActionType,
  triggerContext?: {
    source: "api" | "ui";
    userId?: string;
    apiKeyId?: string;
  },
) => {
  try {
    logger.info("Processing prompt change", {
      promptData,
      action,
      triggerContext,
    });

    const promptEvent: PromptEvent = {
      eventId: `evt_${uuidv4()}`,
      event: "prompt",
      action: action,
      timestamp: new Date(),
      projectId: promptData.projectId,
      data: promptData,
      trigger: triggerContext || {
        source: "api",
      },
    };

    logger.info("Creating automation service", {
      projectId: promptData.projectId,
    });

    const automationService = new AutomationService(promptData.projectId, {
      checkTriggerAppliesToEvent: async (trigger) => {
        const actionFilter = trigger.filter.find(
          (filter) => filter.column === "action",
        );

        // If there's an action filter, check if it matches the event action
        if (actionFilter) {
          const filterValue = actionFilter.value as string;
          const operator = actionFilter.operator;

          // Check if the action matches based on the operator
          const matches =
            operator === "any of"
              ? filterValue.includes(promptEvent.action)
              : operator === "none of"
                ? !filterValue.includes(promptEvent.action)
                : false;

          if (!matches) {
            return false;
          }

          // Remove action filter since we've handled it
          trigger.filter = trigger.filter.filter(
            (filter) => filter.column !== "action",
          );
        }

        logger.info(
          `Checking if prompt exists for ${JSON.stringify(trigger)}`,
          {
            projectId: promptData.projectId,
            promptId: promptData.id,
            filter: trigger.filter,
          },
        );

        return await anyPromptExists({
          projectId: promptData.projectId,
          promptId: promptData.id,
          filter: trigger.filter,
        });
      },
      getExistingActionExecutionForTrigger: async (trigger) => {
        return null;
      },
      createEventId: () => {
        return `evt_${uuidv4()}`;
      },
      convertEventToActionInput: async (actionConfig, executionId) => {
        return {
          projectId: actionConfig.projectId,
          actionId: actionConfig.id,
          triggerId: actionConfig.triggerIds[0],
          executionId,
        };
      },
    });

    // Use the single prompt event source
    await automationService.triggerAction({
      eventSource: TriggerEventSource.Prompt,
    });

    logger.info("Prompt event processed", {
      eventId: promptEvent.eventId,
      event: promptEvent.event,
      action: promptEvent.action,
      promptId: promptData.id,
      projectId: promptData.projectId,
    });
  } catch (error) {
    logger.error("Error processing prompt change. Failing silently.", error);
    return;
  }
};
