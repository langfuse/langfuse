import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { CloudStatus } from "@/src/features/cloud-status-notification/types";
import { z } from "zod/v4";

// Cache the response for 1 minute
let statusCache: { status: CloudStatus | null; timestamp: number } | null =
  null;
const CACHE_TTL = 60 * 1000; // 1 minute in milliseconds

export const cloudStatusRouter = createTRPCRouter({
  getStatus: publicProcedure
    .output(
      z.object({
        status: CloudStatus,
      }),
    )
    .query(async () => {
      // Skip status check if not running on Langfuse Cloud or API key not provided
      if (
        !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
        !env.BETTERSTACK_UPTIME_API_KEY ||
        !env.BETTERSTACK_UPTIME_STATUS_PAGE_ID
      ) {
        return { status: null };
      }

      // Return cached result if it exists and is still valid
      if (statusCache && Date.now() - statusCache.timestamp < CACHE_TTL) {
        return {
          status: statusCache.status,
        };
      }

      try {
        // BetterStack API for status page - using the page_id for status.langfuse.com
        const response = await fetch(
          `https://uptime.betterstack.com/api/v2/status-pages/${env.BETTERSTACK_UPTIME_STATUS_PAGE_ID}`,
          {
            headers: {
              Authorization: `Bearer ${env.BETTERSTACK_UPTIME_API_KEY}`,
            },
          },
        );

        if (!response.ok) {
          logger.error(
            `Failed to fetch status from BetterStack: ${response.statusText}`,
          );
          statusCache = {
            status: null,
            timestamp: Date.now(),
          };
          return { status: null };
        }

        const data = await response.json();

        const newStatus = CloudStatus.parse(
          data.data.attributes.aggregate_state.toLowerCase(),
        );

        statusCache = {
          status: newStatus,
          timestamp: Date.now(),
        };

        return {
          status: newStatus,
        };
      } catch (error) {
        logger.error(`Error fetching status from BetterStack: ${error}`);
        // If there's an error, default to no incident to avoid showing false positives
        statusCache = {
          status: null,
          timestamp: Date.now(),
        };
        return { status: null };
      }
    }),
});
