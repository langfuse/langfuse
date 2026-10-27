import type { Prisma } from "@langfuse/shared/src/db";

/**
 * Detaches a project that is being deleted from the organization's gateway
 * config: the ingestion project is cleared and ingestion falls back to `NONE`
 * until an admin selects a new project. Returns the config before and after,
 * or `null` when the project was not the ingestion project.
 */
export async function releaseGatewayIngestionProject(
  tx: Prisma.TransactionClient,
  params: { organizationId: string; projectId: string },
) {
  const where = {
    organizationId: params.organizationId,
    defaultIngestionProjectId: params.projectId,
  };
  const before = await tx.gatewayConfig.findFirst({ where });
  if (!before) return null;

  // Filtered on the project so a concurrent switch to another project is kept.
  const { count } = await tx.gatewayConfig.updateMany({
    where,
    data: { defaultIngestionProjectId: null, ingestionMode: "NONE" },
  });
  if (count === 0) return null;

  const after = await tx.gatewayConfig.findUniqueOrThrow({
    where: { organizationId: params.organizationId },
  });
  return { before, after };
}
