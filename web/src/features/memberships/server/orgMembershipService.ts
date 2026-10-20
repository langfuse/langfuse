import { ForbiddenError } from "@langfuse/shared";
import {
  type Prisma,
  Role,
  type OrganizationMembership,
} from "@langfuse/shared/src/db";
import { getSfdcService } from "@/src/ee/features/sfdc-sync/server";
import { auditLog } from "@/src/features/audit-logs/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { MembershipExistsError } from "./membershipErrors";
import {
  lockOrganizations,
  afterCommit,
  type MembershipTransaction,
} from "./membershipTransaction";
import {
  addOrgMember,
  loadActor,
  assertMayManageOrgMember,
  findUserOrThrow,
  findOrgMembership,
  auditActor,
  syncToSfdc,
  sfdcSetUserRole,
  type UpdatedMembership,
  type Actor,
} from "./helpers";

const lastOwnerMessage =
  "Cannot remove the last owner of an organization. Assign new owner or delete organization.";

const lastOwnerOfAnyMessage =
  "Cannot delete account. You are the last owner of one or more organizations. Please add another owner or delete the organizations first.";

/** createOrgMembership adds a user who is not yet a member of the org. */
export async function createOrgMembership(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  params: {
    orgId: string;
    userId: string;
    role: Role;
    invitedByUserId?: string;
  },
): Promise<OrganizationMembership> {
  const { orgId, userId, role } = params;
  await lockOrganizations(tx, [orgId]);
  const actor = await loadActor(tx, ctx, orgId);
  assertMayManageOrgMember(actor, { to: role });
  const user = await findUserOrThrow(tx, userId);
  if (await findOrgMembership(tx, orgId, userId)) {
    throw new MembershipExistsError(
      "User is already a member of this organization",
    );
  }
  return addOrgMember(tx, actor, {
    user,
    role,
    invitedByUserId: params.invitedByUserId,
  });
}

/** updateOrgMembership sets a user's org role, creating the membership within the seat limit when absent. */
export async function updateOrgMembership(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  params: { orgId: string; userId: string; role: Role },
): Promise<UpdatedMembership<OrganizationMembership>> {
  const { orgId, userId, role } = params;
  await lockOrganizations(tx, [orgId]);
  const actor = await loadActor(tx, ctx, orgId);
  const before = await findOrgMembership(tx, orgId, userId);
  if (!before) {
    assertMayManageOrgMember(actor, { to: role });
    const user = await findUserOrThrow(tx, userId);
    const after = await addOrgMember(tx, actor, { user, role });
    return { outcome: "created", before: null, after };
  }
  if (before.role === role) {
    assertMayManageOrgMember(actor, { from: role, to: role });
    return { outcome: "unchanged", before, after: before };
  }
  const after = await updateOrgRole(tx, actor, before, role);
  return { outcome: "updated", before, after };
}

/** deleteOrgMembership removes a user from an org, or returns null when they were not a member. */
export async function deleteOrgMembership(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  params: { orgId: string; userId: string },
): Promise<OrganizationMembership | null> {
  const { orgId, userId } = params;
  await lockOrganizations(tx, [orgId]);
  const actor = await loadActor(tx, ctx, orgId);
  const before = await findOrgMembership(tx, orgId, userId);
  if (!before) {
    assertMayManageOrgMember(actor, { targetUserId: userId });
    return null;
  }
  await removeOrgMembership(tx, actor, before);
  return before;
}

/** deleteOrgMemberships removes every org membership of a user, unless they are the last owner of any. */
export async function deleteOrgMemberships(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  params: { userId: string },
): Promise<void> {
  const { userId } = params;
  assertMayRemoveAllMemberships(ctx, userId);
  const orgIds = await findMemberOrgIds(tx, userId);
  await lockOrganizations(tx, orgIds);
  const memberships = await tx.organizationMembership.findMany({
    where: { userId, orgId: { in: orgIds } },
    include: { ProjectMemberships: true },
  });
  await assertNotLastOwnerOfAny(tx, memberships);
  for (const membership of memberships) {
    await deleteMembershipOfLeavingUser(tx, ctx, membership);
  }
}

/** updateOrgRole authorizes, applies and audits an org role change, keeping at least one owner. */
async function updateOrgRole(
  tx: MembershipTransaction,
  actor: Actor,
  before: OrganizationMembership,
  role: Role,
): Promise<OrganizationMembership> {
  assertMayManageOrgMember(actor, {
    targetUserId: before.userId,
    from: before.role,
    to: role,
  });
  if (before.role === role) return before;
  if (before.role === Role.OWNER) {
    await assertOtherOwner(tx, before.orgId, before.id, lastOwnerMessage);
  }
  const after = await tx.organizationMembership.update({
    where: { id: before.id },
    data: { role },
  });
  await auditLog(
    {
      ...auditActor(actor),
      resourceType: "orgMembership",
      resourceId: before.id,
      action: "update",
      before,
      after,
    },
    tx,
  );
  const { email } = await findUserOrThrow(tx, before.userId);
  syncToSfdc(tx, actor, () =>
    sfdcSetUserRole({
      orgId: before.orgId,
      userId: before.userId,
      email,
      role,
    }),
  );
  return after;
}

/** assertOtherOwner requires an OWNER besides membershipId to remain. */
async function assertOtherOwner(
  tx: Prisma.TransactionClient,
  orgId: string,
  membershipId: string,
  message: string,
) {
  const otherOwners = await tx.organizationMembership.count({
    where: { orgId, role: Role.OWNER, id: { not: membershipId } },
  });
  if (otherOwners === 0) throw new ForbiddenError(message);
}

/** removeOrgMembership authorizes, deletes and audits an org membership along with the project memberships that cascade with it. */
async function removeOrgMembership(
  tx: MembershipTransaction,
  actor: Actor,
  membership: OrganizationMembership,
): Promise<void> {
  assertMayManageOrgMember(actor, {
    targetUserId: membership.userId,
    from: membership.role,
  });
  if (membership.role === Role.OWNER) {
    await assertOtherOwner(
      tx,
      membership.orgId,
      membership.id,
      lastOwnerMessage,
    );
  }
  const before = await withProjectMemberships(tx, membership);
  const { email } = await findUserOrThrow(tx, membership.userId);
  await tx.organizationMembership.delete({ where: { id: membership.id } });
  await auditLog(
    {
      ...auditActor(actor),
      resourceType: "orgMembership",
      resourceId: membership.id,
      action: "delete",
      before,
    },
    tx,
  );
  syncToSfdc(tx, actor, () =>
    sfdcRemoveUser({
      orgId: membership.orgId,
      userId: membership.userId,
      email,
    }),
  );
}

async function withProjectMemberships(
  tx: Prisma.TransactionClient,
  membership: OrganizationMembership,
) {
  return {
    ...membership,
    ProjectMemberships: await tx.projectMembership.findMany({
      where: { orgMembershipId: membership.id },
    }),
  };
}

async function sfdcRemoveUser(params: {
  orgId: string;
  userId: string;
  email: string | null;
}) {
  await getSfdcService()?.removeUser(params);
}

/** assertMayRemoveAllMemberships allows only the user themselves or a platform admin. */
function assertMayRemoveAllMemberships(
  ctx: AuthorizationContext,
  userId: string,
) {
  const { principal } = ctx;
  const isSelf = principal.kind === "user" && principal.userId === userId;
  if (!isSelf && principal.kind !== "admin") {
    throw new ForbiddenError("You can only remove your own memberships");
  }
}

async function findMemberOrgIds(tx: Prisma.TransactionClient, userId: string) {
  const memberships = await tx.organizationMembership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  return memberships.map((membership) => membership.orgId);
}

async function assertNotLastOwnerOfAny(
  tx: Prisma.TransactionClient,
  memberships: OrganizationMembership[],
) {
  for (const membership of memberships) {
    if (membership.role !== Role.OWNER) continue;
    await assertOtherOwner(
      tx,
      membership.orgId,
      membership.id,
      lastOwnerOfAnyMessage,
    );
  }
}

/** deleteMembershipOfLeavingUser deletes and audits one membership of a user deleting their account. */
async function deleteMembershipOfLeavingUser(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  membership: OrganizationMembership,
) {
  const actor = await loadActor(tx, ctx, membership.orgId);
  const { email } = await findUserOrThrow(tx, membership.userId);
  await tx.organizationMembership.delete({ where: { id: membership.id } });
  await auditLog(
    {
      ...auditActor(actor),
      resourceType: "orgMembership",
      resourceId: membership.id,
      action: "delete",
      before: membership,
    },
    tx,
  );
  // NONE roles hold no SFDC org-member bridge
  if (membership.role === Role.NONE) return;
  afterCommit(tx, () =>
    sfdcRemoveUser({
      orgId: membership.orgId,
      userId: membership.userId,
      email,
    }),
  );
}
