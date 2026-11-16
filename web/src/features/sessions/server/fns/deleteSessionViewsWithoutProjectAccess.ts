import { hasProjectAccessByRole, type Prisma } from "@langfuse/shared";
import { resolveProjectRole } from "@langfuse/shared/src/server";

export async function deleteSessionViewsWithoutProjectAccess(
  tx: Prisma.TransactionClient,
  {
    userId,
    orgId,
    projectId,
  }: { userId: string; orgId: string; projectId?: string },
) {
  const membership = await tx.organizationMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: { ProjectMemberships: true },
  });
  const where = { createdBy: userId, project: { orgId }, projectId };
  if (!membership) {
    await tx.sessionView.deleteMany({ where });
    return;
  }
  const views = await tx.sessionView.findMany({
    where,
    distinct: ["projectId"],
    select: { projectId: true },
  });
  const inaccessibleProjectIds = views
    .filter((view) => {
      const role = resolveProjectRole({
        projectId: view.projectId,
        projectMemberships: membership.ProjectMemberships,
        orgMembershipRole: membership.role,
      });
      return !hasProjectAccessByRole({ role, scope: "project:read" });
    })
    .map((view) => view.projectId);
  if (inaccessibleProjectIds.length === 0) return;
  await tx.sessionView.deleteMany({
    where: { ...where, projectId: { in: inaccessibleProjectIds } },
  });
}
