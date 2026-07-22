import { JobType, LangfuseNotFoundError } from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";

export async function deleteEvaluators({
  prisma,
  projectId,
  evaluatorIds,
}: {
  prisma: PrismaClient;
  projectId: string;
  evaluatorIds: string[];
}) {
  const uniqueEvaluatorIds = [...new Set(evaluatorIds)];

  return prisma.$transaction(async (tx) => {
    const matchingEvaluatorCount = await tx.jobConfiguration.count({
      where: {
        id: { in: uniqueEvaluatorIds },
        projectId,
        jobType: JobType.EVAL,
      },
    });
    if (matchingEvaluatorCount !== uniqueEvaluatorIds.length) {
      throw new LangfuseNotFoundError("One or more evaluators were not found");
    }

    await tx.jobConfiguration.deleteMany({
      where: {
        id: { in: uniqueEvaluatorIds },
        projectId,
        jobType: JobType.EVAL,
      },
    });

    return uniqueEvaluatorIds;
  });
}
