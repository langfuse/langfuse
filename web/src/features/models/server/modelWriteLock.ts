import type { Prisma } from "@langfuse/shared/src/db";

export const lockModelWrite = async ({
  tx,
  projectId,
  modelName,
  modelId,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
  modelName: string;
  modelId?: string;
}) => {
  const lockKeys = [
    `model-name:${projectId}:${modelName}`,
    ...(modelId ? [`model-id:${modelId}`] : []),
  ].sort();

  for (const lockKey of lockKeys) {
    await tx.$queryRaw`
      SELECT 1 AS "acquired"
      FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;
  }
};
