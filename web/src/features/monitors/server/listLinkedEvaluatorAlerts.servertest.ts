import { describe, expect, it, vi } from "vitest";

import { listLinkedEvaluatorAlerts } from "./listLinkedEvaluatorAlerts";

const prismaWithFindMany = (rows: unknown[] = [], linkedIds: string[] = []) => {
  const findMany = vi.fn().mockResolvedValue(rows);
  const $queryRaw = vi.fn().mockResolvedValue(linkedIds.map((id) => ({ id })));
  return {
    findMany,
    $queryRaw,
    prisma: { monitor: { findMany }, $queryRaw } as unknown as Parameters<
      typeof listLinkedEvaluatorAlerts
    >[0],
  };
};

describe("listLinkedEvaluatorAlerts", () => {
  it("filters evaluator connections in the database", async () => {
    const { prisma, findMany, $queryRaw } = prismaWithFindMany(
      [],
      ["monitor-1"],
    );

    await listLinkedEvaluatorAlerts(prisma, {
      scope: "evaluator",
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project-1",
          id: { in: ["monitor-1"] },
        },
      }),
    );
    expect($queryRaw).toHaveBeenCalledOnce();
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
    const { prisma, findMany } = prismaWithFindMany(
      rows,
      rows.map((row) => row.id),
    );

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
        },
      }),
    );
  });
});
