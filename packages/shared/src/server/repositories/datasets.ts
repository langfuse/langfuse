import { type Dataset, prisma, type Prisma } from "../../db";
import { type BatchActionQuery } from "../../features/batchAction/types";

type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;

function buildDatasetFolderWhere(folderPath: string): Prisma.DatasetWhereInput {
  return {
    OR: [{ name: folderPath }, { name: { startsWith: `${folderPath}/` } }],
  };
}

function buildDatasetBatchDeleteWhere({
  cutoffCreatedAt,
  projectId,
  query,
}: {
  cutoffCreatedAt: Date;
  projectId: string;
  query: BatchActionQuery;
}): Prisma.DatasetWhereInput {
  const where: Prisma.DatasetWhereInput = {
    projectId,
    createdAt: { lte: cutoffCreatedAt },
  };

  if (query.searchQuery?.trim()) {
    where.name = {
      contains: query.searchQuery.trim(),
      mode: "insensitive",
    };
  }

  if (query.pathPrefix) {
    where.AND = [buildDatasetFolderWhere(query.pathPrefix)];
  }

  return where;
}

export async function findDatasetsForDeletion({
  client = prisma,
  datasetIds,
  folderPaths,
  projectId,
}: {
  client?: PrismaClientOrTransaction;
  datasetIds: string[];
  folderPaths: string[];
  projectId: string;
}): Promise<Dataset[]> {
  const explicitDeleteWhere: Prisma.DatasetWhereInput[] = [
    ...(datasetIds.length > 0 ? [{ id: { in: datasetIds } }] : []),
    ...folderPaths.map(buildDatasetFolderWhere),
  ];

  if (explicitDeleteWhere.length === 0) return [];

  return client.dataset.findMany({
    where: {
      projectId,
      OR: explicitDeleteWhere,
    },
  });
}

export async function findDatasetIdsForBatchDeletion({
  cutoffCreatedAt,
  projectId,
  query,
}: {
  cutoffCreatedAt: Date;
  projectId: string;
  query: BatchActionQuery;
}): Promise<Array<{ id: string }>> {
  return prisma.dataset.findMany({
    where: buildDatasetBatchDeleteWhere({
      cutoffCreatedAt,
      projectId,
      query,
    }),
    select: { id: true },
  });
}

export async function findDatasetIdsByIds({
  datasetIds,
  projectId,
}: {
  datasetIds: string[];
  projectId: string;
}): Promise<Array<{ id: string }>> {
  if (datasetIds.length === 0) return [];

  return prisma.dataset.findMany({
    where: {
      projectId,
      id: { in: datasetIds },
    },
    select: { id: true },
  });
}

export async function deleteDatasetsByIds({
  client = prisma,
  datasetIds,
  projectId,
}: {
  client?: PrismaClientOrTransaction;
  datasetIds: string[];
  projectId: string;
}) {
  if (datasetIds.length === 0) return;

  await client.dataset.deleteMany({
    where: {
      projectId,
      id: { in: datasetIds },
    },
  });
}
