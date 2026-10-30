import {
  getCurrentSpan,
  logger,
  type EntityChangeEventType,
} from "@langfuse/shared/src/server";
import { skillVersionProcessor } from "./skillVersionProcessor";
import { promptVersionProcessor } from "./promptVersionProcessor";

/**
 * Generic entity change worker that delegates to specific entity handlers
 */
export const entityChangeWorker = async (
  event: EntityChangeEventType,
): Promise<void> => {
  try {
    if (logger.isLevelEnabled("debug")) {
      logger.debug(
        `Processing entity change event for entity ${event.entityType}`,
        { event: JSON.stringify(event, null, 2) },
      );
    }

    const span = getCurrentSpan();

    if (span) {
      span.setAttribute("entityType", event.entityType);
      span.setAttribute("projectId", event.projectId);
      if (event.entityType === "prompt-version") {
        span.setAttribute("promptId", event.promptId);
      } else {
        span.setAttribute("skillId", event.skillId);
      }
      span.setAttribute("action", event.action);
    }

    switch (event.entityType) {
      case "skill-version":
        return await skillVersionProcessor(event);
      case "prompt-version":
        return await promptVersionProcessor(event);
      default:
        throw new Error(
          `Unsupported entity type: ${(event as any).entityType}`,
        );
    }
  } catch (error) {
    logger.error(
      `Failed to process entity change event for entity ${event.entityType}: ${error}`,
    );
    throw error;
  }
};
