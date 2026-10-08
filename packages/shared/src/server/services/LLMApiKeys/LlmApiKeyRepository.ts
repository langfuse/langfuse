import { prisma } from "../../db";

export async function findProjectLlmApiKeyCandidates(params: {
  projectId: string;
  provider?: string;
}) {
  const providerWhere = params.provider ? { provider: params.provider } : {};
  const project = await prisma.project.findUnique({
    where: {
      id: params.projectId,
      deletedAt: null,
    },
    select: {
      LlmApiKeys: {
        where: providerWhere,
      },
      organization: {
        select: {
          organizationLlmApiKeys: {
            where: providerWhere,
          },
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  return {
    projectConnections: project.LlmApiKeys,
    organizationConnections: project.organization.organizationLlmApiKeys,
  };
}
