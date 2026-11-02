import type { Prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

/**
 * clearGatewayIngestionProject unlinks a project from the gateway, which turns
 * the gateway off until another ingestion project is selected. The caller must
 * invalidate the gateway resolve cache once the transaction commits.
 */
export async function clearGatewayIngestionProject(params: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  projectId: string;
  session: OrgAuthedContext["session"];
}) {
  const before = await params.tx.gatewayConfig.findFirst({
    where: {
      organizationId: params.organizationId,
      defaultIngestionProjectId: params.projectId,
    },
  });
  if (!before) return;

  const after = await params.tx.gatewayConfig.update({
    where: { organizationId: params.organizationId },
    data: { defaultIngestionProjectId: null },
  });
  await auditLog(
    {
      session: params.session,
      resourceType: "gatewayConfig",
      resourceId: params.organizationId,
      action: "update",
      before,
      after,
    },
    params.tx,
  );
}
