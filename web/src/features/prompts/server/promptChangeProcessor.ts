import {
  type TriggerEventAction,
  TriggerEventSource,
  type Prompt,
} from "@langfuse/shared";
import {
  AutomationService,
  logger,
  type WebhookInput,
} from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";
import { anyPromptExists } from "@/src/features/prompts/server/repositories/promptRepository";

export const promptChangeEventSourcing = async (
  promptData: Prompt,
  action: TriggerEventAction,
) => {
  try {
    logger.info("Processing prompt change", {
      promptData,
      action,
    });

    logger.info("Creating automation service", {
      projectId: promptData.projectId,
    });

    const eventId = `evt_${uuidv4()}`;

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
              ? filterValue.includes(action)
              : operator === "none of"
                ? !filterValue.includes(action)
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
      convertEventToActionInput: async (actionConfig, trigger, executionId) => {
        const queueInput: WebhookInput = {
          projectId: actionConfig.projectId,
          actionId: actionConfig.id,
          triggerId: trigger.id,
          executionId,
          eventId: eventId,
          payload: {
            promptName: promptData.name,
            promptVersion: promptData.version,
            action: action,
            type: "prompt",
          },
        };
        return queueInput;
      },
    });

    // Use the single prompt event source
    await automationService.triggerAction({
      eventSource: TriggerEventSource.Prompt,
    });
  } catch (error) {
    logger.error("Error processing prompt change. Failing silently.", error);
    return;
  }
};
