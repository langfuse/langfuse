import { describe, expect, it, vi } from "vitest";

import { listLinkedEvaluatorAlerts } from "./listLinkedEvaluatorAlerts";

const prismaWithFindMany = (rows: unknown[] = []) => {
  const findMany = vi.fn().mockResolvedValue(rows);
  return {
    findMany,
    prisma: { monitor: { findMany } } as unknown as Parameters<
      typeof listLinkedEvaluatorAlerts
    >[0],
  };
};

describe("listLinkedEvaluatorAlerts", () => {
  it("filters evaluator connections in the database", async () => {
    const { prisma, findMany } = prismaWithFindMany();

    await listLinkedEvaluatorAlerts(prisma, {
      scope: "evaluator",
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project-1",
          filters: {
            array_contains: [
              {
                column: "evaluatorId",
                type: "string",
                operator: "=",
                value: "evaluator-1",
              },
            ],
          },
        },
      }),
    );
  });

  it("returns at most 20 alerts and reports when more exist", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: `alert-${index}`,
      name: `Alert ${index}`,
      status: "ACTIVE",
      severity: "UNKNOWN",
      metric: { measure: "count", aggregation: "count" },
      thresholdOperator: "GT",
      alertThreshold: { toNumber: () => index },
      alertedAt: null,
    }));
    const { prisma, findMany } = prismaWithFindMany(rows);

    const result = await listLinkedEvaluatorAlerts(prisma, {
      scope: "evaluator",
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21 }),
    );
    expect(result.data).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  });

  it("filters aggregate evaluator cost alerts in the database", async () => {
    const { prisma, findMany } = prismaWithFindMany();

    await listLinkedEvaluatorAlerts(prisma, {
      scope: "allEvaluators",
      projectId: "project-1",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project-1",
          view: "OBSERVATIONS",
          AND: [
            { metric: { path: ["measure"], equals: "totalCost" } },
            { metric: { path: ["aggregation"], equals: "sum" } },
            {
              filters: {
                array_contains: [
                  {
                    column: "evaluatorId",
                    type: "stringOptions",
                    operator: "none of",
                    value: [""],
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
        },
      }),
    );
  });
});
