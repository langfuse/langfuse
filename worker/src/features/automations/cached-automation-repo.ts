import { JobConfigState } from "@langfuse/shared/src/db";
import { TriggerEventSource } from "./triggerService";
import { TriggerConfigurationDomain } from "@langfuse/shared";
import {
  redis,
  logger,
  recordIncrement,
  getTriggerConfigurations,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

export const getCachedTriggerConfigs = async ({
  projectId,
  eventSource,
  status,
}: {
  projectId: string;
  eventSource: TriggerEventSource;
  status: JobConfigState;
}): Promise<Array<TriggerConfigurationDomain>> => {
  // Try to get from Redis cache first
  if (redis && env.LANGFUSE_CACHE_AUTOMATIONS_ENABLED === "true") {
    try {
      const key = getRedisAutomationKey(projectId, eventSource, status);
      const cachedConfigs = await redis.get(key);

      if (cachedConfigs) {
        recordIncrement("langfuse.automations.cache_hit", 1);
        return JSON.parse(cachedConfigs) as Array<TriggerConfigurationDomain>;
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
      const key = getRedisAutomationKey(projectId, eventSource, status);
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
  status: JobConfigState,
): string => {
  return `automation-configs:${projectId}:${eventSource}:${status}`;
};
