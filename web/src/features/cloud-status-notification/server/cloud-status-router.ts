import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { CloudStatus } from "@/src/features/cloud-status-notification/types";
import { z } from "zod/v4";

// Cache the response for 1 minute
let statusCache: { status: CloudStatus | null; timestamp: number } | null =
  null;
const CACHE_TTL = 60 * 1000; // 1 minute in milliseconds

// incident.io widget API response schema
const IncidentIoWidgetResponse = z.object({
  ongoing_incidents: z.array(
    z.object({
      current_worst_impact: z.enum([
        "partial_outage",
        "degraded_performance",
        "full_outage",
      ]),
    }),
  ),
  in_progress_maintenances: z.array(z.object({})),
  scheduled_maintenances: z.array(z.object({})),
});

export const cloudStatusRouter = createTRPCRouter({
  getStatus: publicProcedure
    .output(
      z.object({
        status: CloudStatus,
      }),
    )
    .query(async () => {
      // Skip status check if not running on Langfuse Cloud
      if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
        return { status: null };
      }

      // Return cached result if it exists and is still valid
      if (statusCache && Date.now() - statusCache.timestamp < CACHE_TTL) {
        return {
          status: statusCache.status,
        };
      }

      try {
        // incident.io widget API for status.langfuse.com
        const response = await fetch(
          "https://status.langfuse.com/api/v1/summary",
        );

        if (!response.ok) {
          logger.error(
            `Failed to fetch status from incident.io: ${response.statusText}`,
          );
          statusCache = {
            status: null,
            timestamp: Date.now(),
          };
          return { status: null };
        }

        const data = await response.json();

        logger.info(`Data from incident.io: ${JSON.stringify(data)}`);
        const parsed = IncidentIoWidgetResponse.parse(data);

        // Determine status based on incidents and maintenances
        let newStatus: CloudStatus = "operational";

        // Check for ongoing incidents
        if (parsed.ongoing_incidents.length > 0) {
          const worstImpact = parsed.ongoing_incidents.reduce(
            (worst, incident) => {
              if (incident.current_worst_impact === "full_outage")
                return "full_outage";
              if (
                incident.current_worst_impact === "partial_outage" &&
                worst !== "full_outage"
              )
                return "partial_outage";
              if (worst === "degraded_performance") return worst;
              return incident.current_worst_impact;
            },
            "degraded_performance" as
              | "degraded_performance"
              | "partial_outage"
              | "full_outage",
          );

          if (worstImpact === "full_outage") {
            newStatus = "downtime";
          } else {
            newStatus = "degraded";
          }
        }
        // Check for in-progress or scheduled maintenances
        else if (
          parsed.in_progress_maintenances.length > 0 ||
          parsed.scheduled_maintenances.length > 0
        ) {
          newStatus = "maintenance";
        }

        statusCache = {
          status: newStatus,
          timestamp: Date.now(),
        };

        return {
          status: newStatus,
        };
      } catch (error) {
        logger.error(`Error fetching status from incident.io: ${error}`);
        // If there's an error, default to no incident to avoid showing false positives
        statusCache = {
          status: null,
          timestamp: Date.now(),
        };
        return { status: null };
      }
    }),
});
