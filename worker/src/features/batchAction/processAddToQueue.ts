import { logger, traceException } from "@langfuse/shared/src/server";
import { Prisma, prisma } from "@langfuse/shared/src/db";

export const processAddToQueue = async (
  projectId: string,
  traceIds: string[],
  targetId: string,
) => {
  logger.info(
    `Adding traces ${JSON.stringify(traceIds)} to annotation queue ${targetId} in project ${projectId}`,
  );
  try {
    // cannot use prisma `createMany` operation as we do not have unique constraint enforced on schema level
    // conflict must be handled on query level
    await prisma.$executeRaw`
    INSERT INTO annotation_queue_items (
      id, 
      project_id, 
      queue_id, 
      object_id, 
      object_type, 
      status, 
      created_at, 
      updated_at
    )
    VALUES ${Prisma.join(
      traceIds.map(
        (id) => Prisma.sql`(
          gen_random_uuid(), 
          ${projectId}, 
          ${targetId}, 
          ${id}, 
          'TRACE', 
          'PENDING'::annotation_queue_status, 
          NOW(), 
          NOW()
        )`,
      ),
      ",",
    )}
    ON CONFLICT (project_id, queue_id, object_id, object_type) DO NOTHING
    `;
  } catch (e) {
    logger.error(
      `Error adding traces ${JSON.stringify(traceIds)} to annotation queue ${targetId} in project ${projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
