import {
  systemRoleAccessRights,
  type PrincipalId,
  type SystemRoleDefinition,
} from "@langfuse/shared/rbac";
import {
  prisma as defaultPrisma,
  type PrismaClient,
  type SystemRoleAssignment,
} from "@langfuse/shared/src/db";

/** SystemRoleAssignmentWithRole pairs an assignment with the definition of the role it names. */
export type SystemRoleAssignmentWithRole = SystemRoleAssignment & {
  role: SystemRoleDefinition;
};

/** getSystemRoles loads a principal's system-role assignments and attaches each row's role definition. */
export async function getSystemRoles(
  principalId: PrincipalId,
  prisma: PrismaClient = defaultPrisma,
): Promise<SystemRoleAssignmentWithRole[]> {
  const assignments = await prisma.systemRoleAssignment.findMany({
    where: { principalId },
  });
  return assignments.map((ra) => ({
    ...ra,
    role: systemRoleAccessRights[ra.systemRole],
  }));
}
