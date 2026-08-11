import type { Prisma, PrismaClient } from "@langfuse/shared/src/db";

type PrismaTransaction = Prisma.TransactionClient;

export async function listEvaluatorRuleAssignments(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  evaluatorIds: string[];
  cursor?: string;
  limit: number;
}) {
  const assignments =
    await params.prisma.evaluationRuleEvaluatorAssignment.findMany({
      where: {
        projectId: params.projectId,
        evaluatorId: { in: params.evaluatorIds },
        ...(params.cursor ? { id: { gt: params.cursor } } : {}),
      },
      select: { id: true, evaluatorId: true, evaluationRuleId: true },
      orderBy: { id: "asc" },
      take: params.limit + 1,
    });
  const hasMore = assignments.length > params.limit;
  const data = assignments.slice(0, params.limit);

  return {
    data,
    nextCursor: hasMore ? data.at(-1)?.id : undefined,
  };
}

export async function countEvaluatorAssignments(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  evaluatorIds: string[];
}) {
  if (params.evaluatorIds.length === 0) return {};

  const counts = await params.prisma.evaluationRuleEvaluatorAssignment.groupBy({
    by: ["evaluatorId"],
    where: {
      projectId: params.projectId,
      evaluatorId: { in: params.evaluatorIds },
    },
    _count: { _all: true },
  });

  return Object.fromEntries(
    counts.map((count) => [count.evaluatorId, count._count._all]),
  );
}
