import { Prisma, prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

export const backfillValidToForDatasetItems = async (
  lastProcessedProjectId: string,
  lastProcessedId: string,
  batchSize: number,
) => {
  const batchStart = Date.now();

  // Cursor condition for pagination
  const cursorCondition =
    lastProcessedProjectId === ""
      ? Prisma.sql``
      : Prisma.sql`
            AND (
              project_id > ${lastProcessedProjectId}
              OR (project_id = ${lastProcessedProjectId} AND id > ${lastProcessedId})
            )
          `;

  // 1. Get the next project_id to process
  const nextProject = await prisma.$queryRaw<
    Array<{ project_id: string }>
  >(Prisma.sql`
        SELECT DISTINCT project_id
        FROM dataset_items
        WHERE valid_to IS NULL
          ${cursorCondition}
        ORDER BY project_id ASC
        LIMIT 1
      `);

  if (nextProject.length === 0) {
    return {
      completed: true,
    };
  }

  const projectId = nextProject[0].project_id;

  // 2. Get batch of item IDs for this project
  const idCursor =
    lastProcessedProjectId === projectId && lastProcessedId !== ""
      ? Prisma.sql`AND id > ${lastProcessedId}`
      : Prisma.sql``;

  const itemIds = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT DISTINCT id
        FROM dataset_items
        WHERE project_id = ${projectId}
          AND valid_to IS NULL
          ${idCursor}
        ORDER BY id ASC
        LIMIT ${batchSize}
      `);

  if (itemIds.length === 0) {
    // Move to next project
    return {
      completed: false,
      lastProcessedProjectId: projectId,
      lastProcessedId: "",
    };
  }

  const idArray = itemIds.map((item) => item.id);

  // 3. Fetch ALL versions for these IDs in this project and compute LEAD
  const result = await prisma.$queryRaw<
    Array<{
      id: string;
      project_id: string;
      valid_from: Date;
      next_valid_from: Date | null;
    }>
  >(Prisma.sql`
    WITH all_versions_with_lead AS (
      SELECT
        id,
        project_id,
        valid_from,
        valid_to,
        LEAD(valid_from) OVER (PARTITION BY id ORDER BY valid_from ASC) as next_valid_from
      FROM dataset_items
      WHERE project_id = ${projectId}
        AND id = ANY(${idArray}::text[])
    )
    SELECT id, project_id, valid_from, next_valid_from
    FROM all_versions_with_lead
    WHERE valid_to IS NULL
  `);

  // 4. Update all rows that need valid_to set
  const rowsToUpdate = result.filter((row) => row.next_valid_from !== null);

  if (rowsToUpdate.length > 0) {
    // Batch update all rows in a single query
    await prisma.$executeRaw`
      UPDATE dataset_items
      SET valid_to = updates.next_valid_from
      FROM (
        VALUES
          ${Prisma.join(
            rowsToUpdate.map(
              (row) =>
                Prisma.sql`(${row.project_id}::text, ${row.id}::text, ${row.valid_from}::timestamp, ${row.next_valid_from}::timestamp)`,
            ),
          )}
      ) AS updates(project_id, id, valid_from, next_valid_from)
      WHERE dataset_items.project_id = ${projectId}
        AND dataset_items.id = updates.id
        AND dataset_items.valid_from = updates.valid_from
        AND dataset_items.valid_to IS NULL
    `;
  }

  logger.info(
    `Project ${projectId}: Processed ${itemIds.length} items (${rowsToUpdate.length} rows updated) in ${Date.now() - batchStart}ms`,
  );

  // Update cursor
  return {
    completed: false,
    lastProcessedProjectId: projectId,
    lastProcessedId: itemIds[itemIds.length - 1].id,
  };
};
