import {
  type ExternalMediaStorageIntegration,
  type Prisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";

export function createExternalMediaStorageRepository(prisma: PrismaClient) {
  return {
    async isFeatureEnabled(projectId: string) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          organization: {
            select: { featureFlagOrgDefaults: true },
          },
        },
      });

      return (
        project?.organization.featureFlagOrgDefaults.includes(
          "externalMediaStorage",
        ) ?? false
      );
    },

    findByProjectId(projectId: string) {
      return prisma.externalMediaStorageIntegration.findUnique({
        where: { projectId },
      });
    },

    findByProjectAndBucket({
      projectId,
      bucketName,
    }: {
      projectId: string;
      bucketName: string;
    }) {
      return prisma.externalMediaStorageIntegration.findFirst({
        where: {
          projectId,
          bucketName,
        },
      });
    },

    upsert({
      projectId,
      data,
    }: {
      projectId: string;
      data: Omit<
        Prisma.ExternalMediaStorageIntegrationUncheckedCreateInput,
        "projectId"
      >;
    }) {
      return prisma.externalMediaStorageIntegration.upsert({
        where: { projectId },
        create: { projectId, ...data },
        update: data,
      });
    },

    async deleteByProjectId(projectId: string) {
      await prisma.externalMediaStorageIntegration.delete({
        where: { projectId },
      });
    },
  };
}

export type ExternalMediaStorageRecord = ExternalMediaStorageIntegration;
