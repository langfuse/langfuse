import { type LlmApiKeys, type Prisma } from "@prisma/client";

export async function findCompatibleLlmApiKeysForProjects(params: {
  tx: Prisma.TransactionClient;
  projectIds: string[];
  provider: string;
  adapter: string;
  excludedLlmApiKeyId?: string;
}): Promise<Map<string, LlmApiKeys>> {
  const projectIds = [...new Set(params.projectIds)];
  if (projectIds.length === 0) return new Map();

  const projects = await params.tx.project.findMany({
    where: { id: { in: projectIds }, deletedAt: null },
    select: { id: true, orgId: true },
  });
  const organizationIds = [...new Set(projects.map(({ orgId }) => orgId))];
  const connections = await params.tx.llmApiKeys.findMany({
    where: {
      provider: params.provider,
      adapter: params.adapter,
      ...(params.excludedLlmApiKeyId
        ? { id: { not: params.excludedLlmApiKeyId } }
        : {}),
      OR: [
        { projectId: { in: projectIds } },
        { organizationId: { in: organizationIds } },
      ],
    },
  });

  const projectConnections = new Map(
    connections.flatMap((connection) =>
      connection.projectId ? [[connection.projectId, connection] as const] : [],
    ),
  );
  const organizationConnections = new Map(
    connections.flatMap((connection) =>
      connection.organizationId
        ? [[connection.organizationId, connection] as const]
        : [],
    ),
  );

  return new Map(
    projects.flatMap(({ id, orgId }) => {
      const connection =
        projectConnections.get(id) ?? organizationConnections.get(orgId);
      return connection ? [[id, connection] as const] : [];
    }),
  );
}
