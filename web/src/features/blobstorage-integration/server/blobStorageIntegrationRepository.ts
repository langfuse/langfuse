import { BlobStorageIntegrationType } from "@langfuse/shared";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";

const EXTERNAL_MEDIA_CANDIDATE_LIMIT = 10;
const S3_INTEGRATION_TYPES = [
  BlobStorageIntegrationType.S3,
  BlobStorageIntegrationType.S3_COMPATIBLE,
];

export async function findMatchingExternalMediaIntegration({
  prisma,
  projectId,
  bucketName,
  key,
}: {
  prisma: PrismaClient;
  projectId: string;
  bucketName: string;
  key: string;
}) {
  const candidateIds = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT
        id,
        RTRIM(BTRIM(media_prefix), '/') AS normalized_media_prefix
      FROM blob_storage_integrations
      WHERE project_id = ${projectId}
        AND bucket_name = ${bucketName}
        AND media_storage_enabled = true
        AND type::text IN (
          ${BlobStorageIntegrationType.S3},
          ${BlobStorageIntegrationType.S3_COMPATIBLE}
        )
    )
    SELECT id
    FROM candidates
    WHERE normalized_media_prefix IS NULL
      OR normalized_media_prefix = ''
      OR LEFT(
        ${key},
        LENGTH(normalized_media_prefix) + 1
      ) = normalized_media_prefix || '/'
    ORDER BY
      LENGTH(COALESCE(normalized_media_prefix, '')) DESC,
      id ASC
    LIMIT ${EXTERNAL_MEDIA_CANDIDATE_LIMIT}
  `);
  const selectedId = candidateIds[0]?.id;

  return selectedId
    ? prisma.blobStorageIntegration.findFirst({
        where: {
          id: selectedId,
          projectId,
          bucketName,
          mediaStorageEnabled: true,
          type: { in: S3_INTEGRATION_TYPES },
        },
      })
    : null;
}

export async function findMediaEnabledS3IntegrationById({
  prisma,
  projectId,
  integrationId,
}: {
  prisma: PrismaClient;
  projectId: string;
  integrationId: string;
}) {
  return prisma.blobStorageIntegration.findFirst({
    where: {
      id: integrationId,
      projectId,
      mediaStorageEnabled: true,
      type: { in: S3_INTEGRATION_TYPES },
    },
  });
}
