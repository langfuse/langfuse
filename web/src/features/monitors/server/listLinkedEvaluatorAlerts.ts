import { metric as MetricSchema } from "@langfuse/shared";
import { findMonitorIdsLinkedToEvaluators } from "@langfuse/shared/monitors/server";
import type { Prisma, PrismaClient } from "@langfuse/shared/src/db";

const LINKED_ALERTS_PAGE_SIZE = 20;

/** Lists the first page of monitors connected to an evaluator alert scope. */
export async function listLinkedEvaluatorAlerts(
  prisma: PrismaClient,
  params:
    | { scope: "evaluator"; projectId: string; evaluatorId: string }
    | { scope: "allEvaluators"; projectId: string },
) {
  const evaluatorMonitorIds =
    params.scope === "evaluator"
      ? await findMonitorIdsLinkedToEvaluators(prisma, {
          projectId: params.projectId,
          evaluatorIds: [params.evaluatorId],
          limit: LINKED_ALERTS_PAGE_SIZE + 1,
        })
      : undefined;
  const where: Prisma.MonitorWhereInput =
    params.scope === "evaluator"
      ? {
          projectId: params.projectId,
          id: { in: evaluatorMonitorIds },
        }
      : {
          projectId: params.projectId,
          view: "OBSERVATIONS",
          AND: [
            { metric: { path: ["measure"], equals: "totalCost" } },
            { metric: { path: ["aggregation"], equals: "sum" } },
            {
              filters: {
                array_contains: [
                  {
                    column: "evaluatorId",
                    type: "string",
                    operator: "is not empty",
                    value: "",
                  },
                ],
              },
            },
            {
              filters: {
                array_contains: [
                  {
                    column: "isEvaluatorTest",
                    type: "boolean",
                    operator: "=",
                    value: false,
                  },
                ],
              },
            },
          ],
        };

  const monitors =
    evaluatorMonitorIds?.length === 0
      ? []
      : await prisma.monitor.findMany({
          where,
          select: {
            id: true,
            name: true,
            status: true,
            severity: true,
            metric: true,
            thresholdOperator: true,
            alertThreshold: true,
            alertedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: LINKED_ALERTS_PAGE_SIZE + 1,
        });

  return {
    data: monitors
      .slice(0, LINKED_ALERTS_PAGE_SIZE)
      .map(
        ({
          id,
          name,
          status,
          severity,
          metric,
          thresholdOperator,
          alertThreshold,
          alertedAt,
        }) => ({
          id,
          name,
          status,
          severity,
          metric: MetricSchema.parse(metric),
          thresholdOperator,
          alertThreshold: alertThreshold.toNumber(),
          alertedAt,
        }),
      ),
    hasMore: monitors.length > LINKED_ALERTS_PAGE_SIZE,
  };
}
