import { EvaluatorBlockReason, JobConfigState, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { invalidateProjectEvalConfigCaches } from "../evalJobConfigCache";

type BlockEvaluatorConfigsParams = {
  projectId: string;
  where: Prisma.JobConfigurationWhereInput;
  blockReason: EvaluatorBlockReason;
  blockMessage: string;
  blockedAt?: Date;
};

type BlockEvaluatorConfigsInTxParams = BlockEvaluatorConfigsParams & {
  tx: Prisma.TransactionClient;
};

export async function blockEvaluatorConfigsInTx({
  tx,
  projectId,
  where,
  blockReason,
  blockMessage,
  blockedAt = new Date(),
}: BlockEvaluatorConfigsInTxParams): Promise<{
  blockedJobConfigIds: string[];
}> {
  // Preserve the previous "no explicit scope means no-op" behavior.
  if (Object.keys(where).length === 0) {
    return { blockedJobConfigIds: [] };
  }

  const activeEvaluatorConfigs = await tx.jobConfiguration.findMany({
    where: {
      AND: [where, { projectId, status: JobConfigState.ACTIVE }],
    },
    select: {
      id: true,
    },
  });

  const blockedJobConfigIds = activeEvaluatorConfigs.map((config) => config.id);

  if (blockedJobConfigIds.length === 0) {
    return { blockedJobConfigIds: [] };
  }

  await tx.jobConfiguration.updateMany({
    where: {
      projectId,
      status: JobConfigState.ACTIVE,
      id: {
        in: blockedJobConfigIds,
      },
    },
    data: {
      blockedAt,
      blockReason,
      blockMessage,
    },
  });

  // Queued executions are cancelled when workers re-check executability on pickup.
  return { blockedJobConfigIds };
}

export async function blockEvaluatorConfigs(
  params: BlockEvaluatorConfigsParams,
): Promise<{ blockedJobConfigIds: string[] }> {
  const result = await prisma.$transaction((tx) =>
    blockEvaluatorConfigsInTx({
      tx,
      ...params,
    }),
  );

  if (result.blockedJobConfigIds.length > 0) {
    await invalidateProjectEvalConfigCaches(params.projectId);
  }

  return result;
}
