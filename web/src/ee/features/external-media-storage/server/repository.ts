import {
  type ExternalMediaStorageIntegration,
  type Prisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";

const projectOrgId = {
  project: { select: { orgId: true } },
} satisfies Prisma.ExternalMediaStorageIntegrationInclude;

export function createExternalMediaStorageRepository(prisma: PrismaClient) {
  return {
    async findOrganizationByProjectId(projectId: string) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { organization: true },
      });
      return project?.organization ?? null;
    },

    findByProjectId(projectId: string) {
      return prisma.externalMediaStorageIntegration.findUnique({
        where: { projectId },
        include: projectOrgId,
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
        include: projectOrgId,
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

export type ExternalMediaStorageRecord = ExternalMediaStorageIntegration & {
  project: { orgId: string };
};
