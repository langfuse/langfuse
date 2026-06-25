import { prisma, type Prisma } from "../../db";
import { type BatchActionQuery } from "../../features/batchAction/types";
import { escapeSqlLikePattern } from "../utils/sqlLike";

type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;

// A folder is strictly a name prefix. A standalone dataset whose name equals the
// folder path is rendered as its own row and must be deleted via its id only —
// matching `name = folderPath` here would silently delete that sibling dataset.
function buildDatasetFolderWhere(folderPath: string): Prisma.DatasetWhereInput {
  return { name: { startsWith: `${escapeSqlLikePattern(folderPath)}/` } };
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
}) {
  if (datasetIds.length === 0 && folderPaths.length === 0) return [];

  const explicitDeleteWhere: Prisma.DatasetWhereInput[] = [
    { id: { in: datasetIds } },
    ...folderPaths.map(buildDatasetFolderWhere),
  ];

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
  const where: Prisma.DatasetWhereInput = {
    projectId,
    createdAt: { lte: cutoffCreatedAt },
  };

  // Match the listing predicate (resolveSearchCondition) exactly: it ILIKEs the
  // raw query, only trimming to test emptiness. Trimming here too would delete a
  // broader set than the table shows for a whitespace-padded search.
  if (query.searchQuery && query.searchQuery.trim() !== "") {
    where.name = {
      contains: query.searchQuery,
      mode: "insensitive",
    };
  }

  if (query.pathPrefix) {
    where.AND = [buildDatasetFolderWhere(query.pathPrefix)];
  }

  return prisma.dataset.findMany({
    where,
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
