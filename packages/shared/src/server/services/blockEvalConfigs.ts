import {
  JobConfigBlockReason,
  JobConfigState,
  JobExecutionStatus,
  Prisma,
} from "@prisma/client";
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

export type EvalConfigBlockState = {
  id: string;
  blockedAt: Date | null;
  blockReason: JobConfigBlockReason | null;
  blockMessage: string | null;
};

export async function fetchEvalConfigBlockStates({
  db = prisma,
  projectId,
  configIds,
}: {
  db?: Pick<Prisma.TransactionClient, "jobConfiguration">;
  projectId: string;
  configIds: string[];
}): Promise<EvalConfigBlockState[]> {
  if (configIds.length === 0) {
    return [];
  }

  return db.jobConfiguration.findMany({
    where: {
      projectId,
      id: {
        in: configIds,
      },
    },
    select: {
      id: true,
      blockedAt: true,
      blockReason: true,
      blockMessage: true,
    },
  });
}

export async function clearEvalConfigBlocksInTransaction({
  tx,
  projectId,
  configIds,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
  configIds: string[];
}): Promise<void> {
  if (configIds.length === 0) {
    return;
  }

  await tx.jobConfiguration.updateMany({
    where: {
      projectId,
      id: {
        in: configIds,
      },
    },
    data: {
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
    },
  });
}

export async function clearEvalConfigBlocks({
  projectId,
  configIds,
}: {
  projectId: string;
  configIds: string[];
}): Promise<void> {
  await prisma.$transaction((tx) =>
    clearEvalConfigBlocksInTransaction({
      tx,
      projectId,
      configIds,
    }),
  );
}

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
      projectId,
      status: JobConfigState.ACTIVE,
      ...where,
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

  await tx.jobExecution.updateMany({
    where: {
      projectId,
      jobConfigurationId: {
        in: blockedConfigIds,
      },
      status: {
        in: [JobExecutionStatus.PENDING, JobExecutionStatus.DELAYED],
      },
    },
    data: {
      status: JobExecutionStatus.CANCELLED,
      endTime: blockedAt,
    },
  });

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
