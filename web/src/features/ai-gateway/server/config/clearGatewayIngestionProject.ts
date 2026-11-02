import type { Prisma, PrismaClient } from "@langfuse/shared/src/db";
import { getCapturingGatewayIngestionModes } from "@/src/features/ai-gateway/fns/gatewayIngestionModePolicy";
import { auditLog, type AuditLogActor } from "@/src/features/audit-logs/server";

function ingestionProjectWhere(organizationId: string, projectId: string) {
  return {
    organizationId,
    defaultIngestionProjectId: projectId,
    // With ingestion NONE the project is only remembered, not written to.
    ingestionMode: { in: getCapturingGatewayIngestionModes() },
  };
}

/** isGatewayIngestionProject reports whether the gateway writes its traces into the project. */
export async function isGatewayIngestionProject(params: {
  prisma: PrismaClient;
  organizationId: string;
  projectId: string;
}) {
  const config = await params.prisma.gatewayConfig.findFirst({
    where: ingestionProjectWhere(params.organizationId, params.projectId),
    select: { organizationId: true },
  });
  return config !== null;
}

/**
 * clearGatewayIngestionProject unlinks a project from the gateway, which turns
 * the gateway off until another ingestion project is selected. It returns
 * whether it cleared the link; the caller must then invalidate the gateway
 * resolve cache once the transaction commits.
 */
export async function clearGatewayIngestionProject(params: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  projectId: string;
  actor: AuditLogActor;
}): Promise<boolean> {
  const where = ingestionProjectWhere(params.organizationId, params.projectId);
  const before = await params.tx.gatewayConfig.findFirst({ where });
  if (!before) return false;

  // Conditional so a concurrently selected replacement project is not cleared.
  const { count } = await params.tx.gatewayConfig.updateMany({
    where,
    data: { defaultIngestionProjectId: null },
  });
  if (count === 0) return false;
  const after = await params.tx.gatewayConfig.findUnique({
    where: { organizationId: params.organizationId },
  });
  await auditLog(
    {
      ...withoutProjectContext(params.actor),
      resourceType: "gatewayConfig",
      resourceId: params.organizationId,
      action: "update",
      before,
      after,
    },
    params.tx,
  );
  return true;
}

/** The gateway config is org-level; the org audit log only lists entries without a project. */
function withoutProjectContext(actor: AuditLogActor): AuditLogActor {
  if ("session" in actor) {
    return {
      session: {
        ...actor.session,
        projectId: undefined,
        projectRole: undefined,
      },
    };
  }
  return { ...actor, projectId: undefined };
}
