import { JobConfigBlockReason, JobConfigState, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { clearAllEvalConfigsCaches } from "../evalJobConfigCache";

type BlockEvalConfigsBaseParams = {
  projectId: string;
  where: Prisma.JobConfigurationWhereInput;
  blockReason: JobConfigBlockReason;
  blockMessage: string;
  blockedAt?: Date;
};

type BlockEvalConfigsTxParams = BlockEvalConfigsBaseParams & {
  tx: Prisma.TransactionClient;
};

export async function blockEvalConfigsInTransaction({
  tx,
  projectId,
  where,
  blockReason,
  blockMessage,
  blockedAt = new Date(),
}: BlockEvalConfigsTxParams): Promise<{ blockedConfigIds: string[] }> {
  // Preserve the previous "no explicit scope means no-op" behavior.
  if (Object.keys(where).length === 0) {
    return { blockedConfigIds: [] };
  }

  const activeConfigs = await tx.jobConfiguration.findMany({
    where: {
      AND: [where, { projectId, status: JobConfigState.ACTIVE }],
    },
    select: {
      id: true,
    },
  });

  const blockedConfigIds = activeConfigs.map((config) => config.id);

  if (blockedConfigIds.length === 0) {
    return { blockedConfigIds: [] };
  }

  await tx.jobConfiguration.updateMany({
    where: {
      projectId,
      status: JobConfigState.ACTIVE,
      id: {
        in: blockedConfigIds,
      },
    },
    data: {
      blockedAt,
      blockReason,
      blockMessage,
    },
  });

  // Queued executions are cancelled when workers re-check executability on pickup.
  return { blockedConfigIds };
}

export async function blockEvalConfigs(
  params: BlockEvalConfigsBaseParams,
): Promise<{ blockedConfigIds: string[] }> {
  const result = await prisma.$transaction((tx) =>
    blockEvalConfigsInTransaction({
      tx,
      ...params,
    }),
  );

  if (result.blockedConfigIds.length > 0) {
    await clearAllEvalConfigsCaches(params.projectId);
  }

  return result;
}
