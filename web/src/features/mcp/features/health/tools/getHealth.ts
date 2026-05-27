import { z } from "zod";
import { VERSION } from "@/src/constants";
import { prisma } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  logger,
  measureAndReturn,
  queryClickhouse,
  traceException,
} from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const HealthInputSchema = z.object({
  failIfDatabaseUnavailable: z.boolean().optional().default(false),
  failIfNoRecentEvents: z.boolean().optional().default(false),
});

const HealthResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
  })
  .strict();

export const [getHealthTool, handleGetHealth] = defineTool({
  name: "getHealth",
  description:
    "Check Langfuse API health. Optionally verify database availability and recent trace/observation ingestion.",
  baseSchema: HealthInputSchema,
  inputSchema: HealthInputSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.health.get",
      context,
      fn: async () => {
        const version = VERSION.replace("v", "");

        try {
          if (input.failIfDatabaseUnavailable) {
            await prisma.$queryRaw`SELECT 1;`;
          }
        } catch (error) {
          logger.error("Couldn't connect to database", error);
          traceException(error);
          return HealthResponseSchema.parse({
            status: "Database not available",
            version,
          });
        }

        try {
          if (input.failIfNoRecentEvents) {
            const now = new Date();
            const traces = await measureAndReturn({
              operationName: "healthCheckTraces",
              projectId: "__CROSS_PROJECT__",
              input: {
                now: convertDateToClickhouseDateTime(now),
              },
              fn: async (params: { now: string }) =>
                queryClickhouse<{ id: string }>({
                  query: `
                    SELECT id
                    FROM traces
                    WHERE timestamp <= {now: DateTime64(3)}
                    AND timestamp >= {now: DateTime64(3)} - INTERVAL 3 MINUTE
                    LIMIT 1
                  `,
                  params,
                  tags: {
                    feature: "health-check",
                    type: "trace",
                  },
                }),
            });
            const observations = await queryClickhouse<{ id: string }>({
              query: `
                SELECT id
                FROM observations
                WHERE start_time <= {now: DateTime64(3)}
                AND start_time >= {now: DateTime64(3)} - INTERVAL 3 MINUTE
                LIMIT 1
              `,
              params: {
                now: convertDateToClickhouseDateTime(now),
              },
              tags: {
                feature: "health-check",
                type: "observation",
              },
            });

            if (traces.length === 0 || observations.length === 0) {
              return HealthResponseSchema.parse({
                status: `No ${
                  traces.length === 0 ? "traces" : "observations"
                } within the last 3 minutes`,
                version,
              });
            }
          }
        } catch (error) {
          logger.error("Couldn't fetch recent events", error);
          traceException(error);
          return HealthResponseSchema.parse({
            status: "Couldn't fetch recent events",
            version,
          });
        }

        return HealthResponseSchema.parse({
          status: "OK",
          version,
        });
      },
    }),
  readOnlyHint: true,
});
