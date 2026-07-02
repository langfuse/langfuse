import { Prisma, prisma } from "../../db";
import { type BatchActionQuery } from "../../features/batchAction/types";
import { datasetsTableCols } from "../../tableDefinitions/datasetsTable";
import { tableColumnsToSqlFilterAndPrefix } from "../filterToPrisma";
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
  // Match the listing predicate (resolveSearchCondition) exactly: it ILIKEs the
  // raw query, only trimming to test emptiness. Trimming here too would delete a
  // broader set than the table shows for a whitespace-padded search.
  const searchFilter =
    query.searchQuery && query.searchQuery.trim() !== ""
      ? Prisma.sql`AND d.name ILIKE ${`%${query.searchQuery}%`}`
      : Prisma.empty;

  const pathFilter = query.pathPrefix
    ? Prisma.sql`AND d.name LIKE ${`${escapeSqlLikePattern(query.pathPrefix)}/%`} ESCAPE '\\'`
    : Prisma.empty;

  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    query.filter ?? [],
    datasetsTableCols,
    "datasets",
  );

  return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT d.id
    FROM datasets d
    WHERE d.project_id = ${projectId}
      AND d.created_at <= ${cutoffCreatedAt}
      ${searchFilter}
      ${pathFilter}
      ${filterCondition}
  `);
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
