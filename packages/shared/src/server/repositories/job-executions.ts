import { type PrismaClient } from "@prisma/client";
import type {
  EvaluatorExecutionCountsByEvaluatorId,
  EvaluatorExecutionStatusCount,
} from "../../features/evals/evalConfigBlocking";

type EvaluatorExecutionStatusCountRecord = EvaluatorExecutionStatusCount & {
  evaluatorId: string;
};

export const getEvaluatorExecutionStatusCounts = async ({
  prisma,
  projectId,
  evaluatorIds,
}: {
  prisma: PrismaClient;
  projectId: string;
  evaluatorIds: string[];
}): Promise<EvaluatorExecutionStatusCountRecord[]> => {
  if (evaluatorIds.length === 0) {
    return [];
  }

  const counts = await prisma.jobExecution.groupBy({
    where: {
      // We currently assume every job execution belongs to an evaluator job configuration.
      jobConfigurationId: { in: evaluatorIds },
      projectId,
    },
    by: ["status", "jobConfigurationId"],
    _count: true,
  });

  return counts.map((count) => ({
    evaluatorId: count.jobConfigurationId,
    status: count.status,
    count: count._count,
  }));
};

export const getEvaluatorExecutionStatusCountsByEvaluatorId = async ({
  prisma,
  projectId,
  evaluatorIds,
}: {
  prisma: PrismaClient;
  projectId: string;
  evaluatorIds: string[];
}): Promise<EvaluatorExecutionCountsByEvaluatorId> => {
  const counts = await getEvaluatorExecutionStatusCounts({
    prisma,
    projectId,
    evaluatorIds,
  });

  const countsByEvaluatorId = Object.fromEntries(
    evaluatorIds.map((evaluatorId) => [
      evaluatorId,
      [] as EvaluatorExecutionStatusCount[],
    ]),
  ) as EvaluatorExecutionCountsByEvaluatorId;

  for (const { evaluatorId, ...count } of counts) {
    countsByEvaluatorId[evaluatorId]?.push(count);
  }

  return countsByEvaluatorId;
};
