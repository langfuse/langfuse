import {
  type ExternalMediaStorageIntegration,
  type Prisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";

export function createExternalMediaStorageRepository(prisma: PrismaClient) {
  return {
    findByProjectId(projectId: string) {
      return prisma.externalMediaStorageIntegration.findUnique({
        where: { projectId },
      });
    },

    findEnabledByProjectAndBucket({
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
          enabled: true,
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

export type ExternalMediaStorageRepository = ReturnType<
  typeof createExternalMediaStorageRepository
>;

export type ExternalMediaStorageRecord = ExternalMediaStorageIntegration;
