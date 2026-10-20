import { ForbiddenError, LangfuseNotFoundError } from "@langfuse/shared";
import {
  type Prisma,
  Role,
  type OrganizationMembership,
  type ProjectMembership,
} from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { MembershipExistsError } from "./membershipErrors";
import {
  lockOrganizations,
  type MembershipTransaction,
} from "./membershipTransaction";
import {
  addOrgMember,
  findVisibleProjectOrgId,
  loadActor,
  assertMayManageProjectMember,
  assertProjectInOrg,
  findUserOrThrow,
  findOrgMembership,
  findProjectMembership,
  assertProjectRolesEntitled,
  auditActor,
  upsertProjectMembership,
  type UpdatedMembership,
  type Actor,
} from "./helpers";

/** createProjectMembership grants a project role the user does not hold yet, overriding the org role they inherit there. */
export async function createProjectMembership(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  params: {
    projectId: string;
    userId: string;
    role: Role;
    invitedByUserId?: string;
  },
): Promise<ProjectMembership> {
  const { projectId, userId, role } = params;
  const orgId = await findVisibleProjectOrgId(tx, ctx, projectId);
  await lockOrganizations(tx, [orgId]);
  const actor = await loadActor(tx, ctx, orgId);
  await assertProjectRolesEntitled(tx, actor, role);
  const user = await findUserOrThrow(tx, userId);
  // a stray project membership can outlive another org's membership
  if (await findProjectMembership(tx, projectId, userId)) {
    throw new MembershipExistsError("User is already a member of this project");
  }
  const existing = await findOrgMembership(tx, orgId, userId);
  assertMayManageProjectMember(actor, {
    projectId,
    from: existing?.role,
    to: role,
  });
  const orgMembership =
    existing ??
    (await addOrgMember(tx, actor, {
      user,
      role: Role.NONE,
      invitedByUserId: params.invitedByUserId,
    }));
  return upsertProjectMembership(tx, actor, {
    orgMembership,
    projectId,
    role,
    before: null,
  });
}

/** updateProjectMembership sets a member's project role, overriding the org role they inherit there. */
export async function updateProjectMembership(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  params: { projectId: string; userId: string; role: Role },
): Promise<UpdatedMembership<ProjectMembership>> {
  const { projectId, userId, role } = params;
  const orgId = await findVisibleProjectOrgId(tx, ctx, projectId);
  await lockOrganizations(tx, [orgId]);
  const actor = await loadActor(tx, ctx, orgId);
  await assertProjectRolesEntitled(tx, actor, role);
  const { orgMembership, before } = await loadProjectTarget(tx, {
    orgId,
    projectId,
    userId,
    orgMembershipRequired: true,
  });
  requireOrgMembership(orgMembership);
  if (before && before.role === role) {
    assertMayManageProjectMember(actor, { projectId, from: role, to: role });
    return { outcome: "unchanged", before, after: before };
  }
  assertMayManageProjectMember(actor, {
    projectId,
    from: before?.role ?? orgMembership.role,
    to: role,
  });
  const after = await upsertProjectMembership(tx, actor, {
    orgMembership,
    projectId,
    role,
    before,
  });
  return { outcome: updatedIf(before), before, after };
}

/** deleteProjectMembership drops a member's project role so the org role applies again, or returns null when there was none. */
export async function deleteProjectMembership(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  params: { projectId: string; userId: string },
): Promise<ProjectMembership | null> {
  const { projectId, userId } = params;
  const orgId = await findVisibleProjectOrgId(tx, ctx, projectId);
  await lockOrganizations(tx, [orgId]);
  const actor = await loadActor(tx, ctx, orgId);
  const target = await loadProjectTarget(tx, {
    orgId,
    projectId,
    userId,
    orgMembershipRequired: false,
  });
  return clearProjectRole(tx, actor, { projectId, ...target });
}

/** removeAllProjectMembers deletes a project's memberships inside the caller's transaction, for project transfer only. */
export async function removeAllProjectMembers(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { orgId: true },
  });
  if (project) await lockOrganizations(tx, [project.orgId]);
  await tx.projectMembership.deleteMany({ where: { projectId } });
}

function updatedIf(before: unknown): "created" | "updated" {
  if (before) return "updated";
  return "created";
}

/** loadProjectTarget resolves the project, the target's org membership, and their current project role. */
async function loadProjectTarget(
  tx: Prisma.TransactionClient,
  params: {
    orgId: string;
    projectId: string;
    userId: string;
    orgMembershipRequired: boolean;
  },
) {
  const { orgId, projectId, userId } = params;
  await assertProjectInOrg(tx, orgId, projectId);
  const orgMembership = await findOrgMembership(tx, orgId, userId);
  if (params.orgMembershipRequired) requireOrgMembership(orgMembership);
  const before = await findProjectMembership(tx, projectId, userId);
  assertProjectMembershipInOrg(before, orgMembership);
  return { orgMembership, before };
}

function requireOrgMembership(
  orgMembership: OrganizationMembership | null,
): asserts orgMembership is OrganizationMembership {
  if (!orgMembership) {
    throw new LangfuseNotFoundError(
      "User is not a member of this organization",
    );
  }
}

function assertProjectMembershipInOrg(
  projectMembership: ProjectMembership | null,
  orgMembership: OrganizationMembership | null,
) {
  if (
    projectMembership &&
    projectMembership.orgMembershipId !== orgMembership?.id
  ) {
    throw new ForbiddenError(
      "Project membership does not belong to this organization",
    );
  }
}

/** clearProjectRole authorizes and deletes a project role, returning the removed row or null. */
async function clearProjectRole(
  tx: Prisma.TransactionClient,
  actor: Actor,
  params: {
    projectId: string;
    orgMembership: OrganizationMembership | null;
    before: ProjectMembership | null;
  },
): Promise<ProjectMembership | null> {
  const { projectId, orgMembership, before } = params;
  if (!before) {
    assertMayManageProjectMember(actor, { projectId });
    return null;
  }
  assertMayManageProjectMember(actor, {
    projectId,
    from: before.role,
    to: orgMembership?.role,
  });
  await removeProjectRole(tx, actor, before);
  return before;
}

/** removeProjectRole deletes and audits a project role. */
async function removeProjectRole(
  tx: Prisma.TransactionClient,
  actor: Actor,
  before: ProjectMembership,
): Promise<void> {
  await tx.projectMembership.delete({
    where: {
      projectId_userId: { projectId: before.projectId, userId: before.userId },
    },
  });
  await auditLog(
    {
      ...auditActor(actor, before.projectId),
      resourceType: "projectMembership",
      resourceId: `${before.projectId}--${before.userId}`,
      action: "delete",
      before,
    },
    tx,
  );
}
