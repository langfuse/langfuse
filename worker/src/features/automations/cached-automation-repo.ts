import { JobConfigState } from "@langfuse/shared/src/db";
import { TriggerEventSource } from "./automationService";
import { FilterState, TriggerDomain } from "@langfuse/shared";
import {
  redis,
  logger,
  recordIncrement,
  getTriggerConfigurations,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import Decimal from "decimal.js";

export const getCachedTriggers = async ({
  projectId,
  eventSource,
  status,
}: {
  projectId: string;
  eventSource: TriggerEventSource;
  status: JobConfigState;
}): Promise<Array<TriggerDomain>> => {
  // Try to get from Redis cache first
  if (redis && env.LANGFUSE_CACHE_AUTOMATIONS_ENABLED === "true") {
    try {
      const key = getRedisAutomationKey(projectId, eventSource);
      const cachedConfigsString = await redis.get(key);

      if (cachedConfigsString) {
        recordIncrement("langfuse.automations.cache_hit", 1);

        // The entire array is stored as a single JSON string, so parse once
        const parsedConfigs = JSON.parse(
          cachedConfigsString,
        ) as Array<TriggerDomain>;

        return parsedConfigs.map((trigger) => ({
          ...trigger,
          filter: trigger.filter as FilterState,
          // JSON.stringify serialises Decimal instances as strings – convert back
          sampling: new Decimal(trigger.sampling),
        })) as Array<TriggerDomain>;
      }
      recordIncrement("langfuse.automations.cache_miss", 1);
    } catch (error) {
      logger.error(
        `Error getting automation configs from Redis for project ${projectId}`,
        error,
      );
      // Continue with database lookup on error
    }
  }

  // Fetch from database
  const triggerConfigurations = await getTriggerConfigurations({
    projectId,
    eventSource,
    status,
  });

  // Store in Redis if available
  if (redis && env.LANGFUSE_CACHE_AUTOMATIONS_ENABLED === "true") {
    try {
      const key = getRedisAutomationKey(projectId, eventSource);
      await redis.set(
        key,
        JSON.stringify(triggerConfigurations),
        "EX",
        env.LANGFUSE_CACHE_AUTOMATIONS_TTL_SECONDS,
      );
    } catch (error) {
      logger.error(
        `Error caching automation configs for project ${projectId}`,
        error,
      );
      // Continue even if caching fails
    }
  }

  return triggerConfigurations;
};

const getRedisAutomationKey = (
  projectId: string,
  eventSource: TriggerEventSource,
): string => {
  return `automation-configs:${projectId}:${eventSource}`;
};
