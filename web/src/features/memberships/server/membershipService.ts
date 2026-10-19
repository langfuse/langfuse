/**
 * The membership service owns every write to organization memberships, project
 * memberships and membership invitations. Transports (tRPC, the public and
 * admin APIs, SCIM, signup, bootstrap) keep authentication, rate limits, plan
 * gates and coarse scope checks; everything that decides whether a membership
 * may change lives here.
 *
 * Every mutation runs in one READ COMMITTED transaction that first takes the
 * organization's membership advisory lock, so the seat-limit count, the
 * last-owner check and the write cannot interleave with another membership
 * change of the same organization. Flows that touch several organizations lock
 * them in sorted id order. Only database work runs under the lock: audit rows
 * are written inside the transaction, while SFDC sync and invitation emails run
 * after commit and never fail the request.
 */
import {
  CloudConfigSchema,
  ForbiddenError,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { OrganizationId, ProjectId } from "@langfuse/shared/rbac";
import {
  prisma,
  Prisma,
  Role,
  type MembershipInvitation,
  type OrganizationMembership,
  type ProjectMembership,
} from "@langfuse/shared/src/db";
import {
  logger,
  sendMembershipInvitationEmail,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { getSfdcService } from "@/src/ee/features/sfdc-sync/server";
import { auditLog, type AuditLogActor } from "@/src/features/audit-logs/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { entitlementAccess } from "@/src/features/entitlements/constants/entitlements";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server";
import { authorize } from "@/src/features/rbac/authorize";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import { SeatLimitExceededError } from "./membershipErrors";

/** MembershipOutcome reports what a declarative apply changed, with the row before and after. */
export type MembershipOutcome<T> = {
  outcome: "created" | "updated" | "removed" | "unchanged";
  before: T | null;
  after: T | null;
};

/** InvitationNotice names the inviter for the email sent after a member or invitation is added. */
export type InvitationNotice = { inviterName: string; inviterEmail: string };

/** ProjectGrant is a project role granted alongside an organization membership or invitation. */
type ProjectGrant = { projectId: string; role: Role };

// ---------------------------------------------------------------------------
// Organization memberships
// ---------------------------------------------------------------------------

/** addOrgMember adds an existing user to an organization, optionally with a project role, within the seat limit. */
export async function addOrgMember(
  ctx: AuthorizationContext,
  params: {
    orgId: string;
    userId: string;
    role: Role;
    project?: ProjectGrant;
    notify?: InvitationNotice;
  },
): Promise<{
  orgMembership: OrganizationMembership;
  projectMembership: ProjectMembership | null;
}> {
  const { orgId, userId, role, project } = params;
  return inMembershipTransaction([orgId], async (tx, afterCommit) => {
    const actor = await loadActor(tx, ctx, orgId);
    assertMayAddMember(actor, { role, project });
    if (project) await assertProjectInOrg(tx, orgId, project.projectId);
    const user = await findUserOrThrow(tx, userId);
    const existing = await findOrgMembership(tx, orgId, userId);
    if (existing) {
      throw new InvalidRequestError(
        "User is already a member of this organization",
      );
    }
    // A project membership can outlive this org's membership (e.g. a stray
    // row referencing another org); reject before creating anything.
    if (project && (await findProjectMembership(tx, project.projectId, userId)))
      throw new InvalidRequestError("User is already a member of this project");
    await assertSeatAvailable(tx, actor, orgId);
    const orgMembership = await insertOrgMembership(tx, afterCommit, actor, {
      user,
      role,
    });
    const projectMembership = project
      ? await upsertProjectMembership(tx, actor, {
          orgMembership,
          projectId: project.projectId,
          role: project.role,
          before: null,
        })
      : null;
    if (params.notify) {
      const notify = params.notify;
      const orgName = await getOrgName(tx, orgId);
      afterCommit(() =>
        sendInvitationEmail({
          ...notify,
          to: user.email,
          orgId,
          orgName,
          userExists: true,
        }),
      );
    }
    return { orgMembership, projectMembership };
  });
}

/** changeOrgRole changes an existing member's organization role, keeping at least one owner. */
export async function changeOrgRole(
  ctx: AuthorizationContext,
  params: { orgId: string; userId: string; role: Role },
): Promise<{ before: OrganizationMembership; after: OrganizationMembership }> {
  const { orgId, userId, role } = params;
  return inMembershipTransaction([orgId], async (tx, afterCommit) => {
    const actor = await loadActor(tx, ctx, orgId);
    const before = await findOrgMembership(tx, orgId, userId);
    if (!before) {
      throw new LangfuseNotFoundError("Organization membership not found");
    }
    const after = await updateOrgRole(tx, afterCommit, actor, before, role);
    return { before, after };
  });
}

/** removeOrgMember removes a member and, by cascade, their project memberships; it returns null when the user was not a member. */
export async function removeOrgMember(
  ctx: AuthorizationContext,
  params: { orgId: string; userId: string },
): Promise<OrganizationMembership | null> {
  const { orgId, userId } = params;
  return inMembershipTransaction([orgId], async (tx, afterCommit) => {
    const actor = await loadActor(tx, ctx, orgId);
    const before = await findOrgMembership(tx, orgId, userId);
    if (!before) {
      assertMayManageOrgMember(actor, { targetUserId: userId });
      return null;
    }
    await deleteOrgMembership(tx, afterCommit, actor, before);
    return before;
  });
}

/**
 * applyOrgMembership drives a user's organization membership to the desired
 * role, or removes it when role is null. With keepExistingRole, an existing
 * membership is left as is and the role only applies when one is created.
 */
export async function applyOrgMembership(
  ctx: AuthorizationContext,
  params: {
    orgId: string;
    userId: string;
    role: Role | null;
    keepExistingRole?: boolean;
  },
): Promise<MembershipOutcome<OrganizationMembership>> {
  const { orgId, userId, role } = params;
  return inMembershipTransaction([orgId], async (tx, afterCommit) => {
    const actor = await loadActor(tx, ctx, orgId);
    const before = await findOrgMembership(tx, orgId, userId);
    if (role === null) {
      if (!before) {
        assertMayManageOrgMember(actor, { targetUserId: userId });
        return { outcome: "unchanged", before: null, after: null };
      }
      await deleteOrgMembership(tx, afterCommit, actor, before);
      return { outcome: "removed", before, after: null };
    }
    if (!before) {
      assertMayAddMember(actor, { role });
      const user = await findUserOrThrow(tx, userId);
      await assertSeatAvailable(tx, actor, orgId);
      const after = await insertOrgMembership(tx, afterCommit, actor, {
        user,
        role,
      });
      return { outcome: "created", before: null, after };
    }
    if (params.keepExistingRole || before.role === role) {
      assertMayManageOrgMember(actor, { targetUserId: userId });
      return { outcome: "unchanged", before, after: before };
    }
    const after = await updateOrgRole(tx, afterCommit, actor, before, role);
    return { outcome: "updated", before, after };
  });
}

/**
 * removeUserFromAllOrgs removes every organization membership of a user ahead
 * of deleting the account, refusing while they are the last owner of any
 * organization. Only the user themselves or a platform admin may do this; the
 * caller deletes the user afterwards.
 */
export async function removeUserFromAllOrgs(
  ctx: AuthorizationContext,
  userId: string,
): Promise<void> {
  const { principal } = ctx;
  const isSelf = principal.kind === "user" && principal.userId === userId;
  if (!isSelf && principal.kind !== "admin") {
    throw new ForbiddenError("You can only remove your own memberships");
  }
  const orgIds = (
    await prisma.organizationMembership.findMany({
      where: { userId },
      select: { orgId: true },
    })
  ).map((membership) => membership.orgId);
  if (orgIds.length === 0) return;

  await inMembershipTransaction(orgIds, async (tx, afterCommit) => {
    const memberships = await tx.organizationMembership.findMany({
      where: { userId, orgId: { in: orgIds } },
      include: { ProjectMemberships: true },
    });
    for (const membership of memberships) {
      if (membership.role === Role.OWNER) {
        await assertOtherOwner(
          tx,
          membership.orgId,
          membership.id,
          "Cannot delete account. You are the last owner of one or more organizations. Please add another owner or delete the organizations first.",
        );
      }
    }
    const email = (await findUserOrThrow(tx, userId)).email;
    for (const membership of memberships) {
      const actor = await loadActor(tx, ctx, membership.orgId);
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
      // NONE roles hold no SFDC org-member bridge, so there is nothing to remove.
      if (membership.role !== Role.NONE) {
        afterCommit(() =>
          sfdcRemoveUser({ orgId: membership.orgId, userId, email }),
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Project memberships
// ---------------------------------------------------------------------------

/** setProjectRole grants or changes a member's role on one project of their organization. */
export async function setProjectRole(
  ctx: AuthorizationContext,
  params: { orgId: string; projectId: string; userId: string; role: Role },
): Promise<{ before: ProjectMembership | null; after: ProjectMembership }> {
  const { orgId, projectId, userId, role } = params;
  return inMembershipTransaction([orgId], async (tx) => {
    const actor = await loadActor(tx, ctx, orgId);
    const { orgMembership, before } = await loadProjectTarget(tx, {
      orgId,
      projectId,
      userId,
    });
    assertMayManageProjectMember(actor, {
      projectId,
      targetOrgRole: orgMembership.role,
      from: before?.role,
      to: role,
    });
    const after = await upsertProjectMembership(tx, actor, {
      orgMembership,
      projectId,
      role,
      before,
    });
    return { before, after };
  });
}

/** removeProjectRole drops a member's project role so they inherit their organization role; it returns null when there was none. */
export async function removeProjectRole(
  ctx: AuthorizationContext,
  params: { orgId: string; projectId: string; userId: string },
): Promise<ProjectMembership | null> {
  const { orgId, projectId, userId } = params;
  return inMembershipTransaction([orgId], async (tx) => {
    const actor = await loadActor(tx, ctx, orgId);
    const { orgMembership, before } = await loadProjectTarget(tx, {
      orgId,
      projectId,
      userId,
      allowMissingOrgMembership: true,
    });
    assertMayManageProjectMember(actor, {
      projectId,
      targetOrgRole: orgMembership?.role,
      from: before?.role,
    });
    if (!before) return null;
    await deleteProjectMembership(tx, actor, before);
    return before;
  });
}

/**
 * applyProjectMembership drives a member's project role to the desired role,
 * or back to inheriting the organization role when role is null. With
 * keepExistingRole, an existing project role is left as is.
 */
export async function applyProjectMembership(
  ctx: AuthorizationContext,
  params: {
    orgId: string;
    projectId: string;
    userId: string;
    role: Role | null;
    keepExistingRole?: boolean;
  },
): Promise<MembershipOutcome<ProjectMembership>> {
  const { orgId, projectId, userId, role } = params;
  return inMembershipTransaction([orgId], async (tx) => {
    const actor = await loadActor(tx, ctx, orgId);
    const { orgMembership, before } = await loadProjectTarget(tx, {
      orgId,
      projectId,
      userId,
      allowMissingOrgMembership: role === null,
    });
    const unchanged =
      role === null
        ? !before
        : before !== null && (params.keepExistingRole || before.role === role);
    assertMayManageProjectMember(actor, {
      projectId,
      targetOrgRole: orgMembership?.role,
      from: before?.role,
      to: unchanged ? undefined : (role ?? undefined),
    });
    if (unchanged) return { outcome: "unchanged", before, after: before };
    if (role === null) {
      await deleteProjectMembership(tx, actor, before!);
      return { outcome: "removed", before, after: null };
    }
    const after = await upsertProjectMembership(tx, actor, {
      orgMembership: orgMembership!,
      projectId,
      role,
      before,
    });
    return { outcome: before ? "updated" : "created", before, after };
  });
}

/**
 * removeAllProjectMembers deletes every project membership of a project inside
 * the caller's transaction, for flows such as a project transfer that must
 * drop them atomically with other writes. It is not meant for transports.
 */
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

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/** createInvitation invites an email address that has no account yet, within the seat limit. */
export async function createInvitation(
  ctx: AuthorizationContext,
  params: {
    orgId: string;
    email: string;
    orgRole: Role;
    project?: ProjectGrant;
    invitedByUserId?: string;
    notify?: InvitationNotice;
  },
): Promise<MembershipInvitation> {
  const { orgId, orgRole, project } = params;
  const email = params.email.toLowerCase();
  return inMembershipTransaction([orgId], async (tx, afterCommit) => {
    const actor = await loadActor(tx, ctx, orgId);
    assertMayAddMember(actor, { role: orgRole, project });
    if (project) await assertProjectInOrg(tx, orgId, project.projectId);
    const pending = await tx.membershipInvitation.findUnique({
      where: { email_orgId: { email, orgId } },
    });
    if (pending) {
      throw new InvalidRequestError(
        "A pending membership invitation with this email and organization already exists",
      );
    }
    await assertSeatAvailable(tx, actor, orgId);
    const invitation = await tx.membershipInvitation.create({
      data: {
        orgId,
        email,
        orgRole,
        projectId: project?.projectId ?? null,
        projectRole: project?.role ?? null,
        invitedByUserId: params.invitedByUserId ?? null,
      },
    });
    await auditLog(
      {
        ...auditActor(actor),
        resourceType: "membershipInvitation",
        resourceId: invitation.id,
        action: "create",
        after: invitation,
      },
      tx,
    );
    if (params.notify) {
      const notify = params.notify;
      const orgName = await getOrgName(tx, orgId);
      afterCommit(() =>
        sendInvitationEmail({
          ...notify,
          to: email,
          orgId,
          orgName,
          userExists: false,
        }),
      );
    }
    return invitation;
  });
}

/** revokeInvitation deletes a pending invitation, freeing its seat. */
export async function revokeInvitation(
  ctx: AuthorizationContext,
  params: { orgId: string; invitationId: string },
): Promise<MembershipInvitation> {
  const { orgId, invitationId } = params;
  return inMembershipTransaction([orgId], async (tx) => {
    const actor = await loadActor(tx, ctx, orgId);
    const invitation = await tx.membershipInvitation.findFirst({
      where: { id: invitationId, orgId },
    });
    if (!invitation) throw new LangfuseNotFoundError("Invitation not found");
    const projectOnly =
      invitation.projectId !== null && invitation.orgRole === Role.NONE;
    if (
      !mayManageOrgMembers(actor) &&
      !(projectOnly && mayManageProjectMembers(actor, invitation.projectId!))
    ) {
      throw new ForbiddenError(
        "You do not have sufficient rights to delete this invitation.",
      );
    }
    await tx.membershipInvitation.delete({ where: { id: invitation.id } });
    await auditLog(
      {
        ...auditActor(actor),
        resourceType: "membershipInvitation",
        resourceId: invitation.id,
        action: "delete",
        before: invitation,
      },
      tx,
    );
    return invitation;
  });
}

/**
 * acceptInvitations turns every pending invitation for the user's email into
 * memberships and deletes the invitations, in one transaction. The invitation
 * is the authority and already holds its seat, so neither authorization nor
 * the seat limit applies; each change is audited as the accepting user.
 */
export async function acceptInvitations(params: {
  userId: string;
  email: string;
}): Promise<MembershipInvitation[]> {
  const { userId } = params;
  const email = params.email.toLowerCase();
  const orgIds = (
    await prisma.membershipInvitation.findMany({
      where: { email },
      select: { orgId: true },
    })
  ).map((invitation) => invitation.orgId);
  if (orgIds.length === 0) return [];

  return inMembershipTransaction(orgIds, async (tx, afterCommit) => {
    const invitations = await tx.membershipInvitation.findMany({
      where: { email, orgId: { in: orgIds } },
    });
    for (const invitation of invitations) {
      const actor: AuditLogActor = {
        userId,
        orgId: invitation.orgId,
        orgRole: invitation.orgRole,
      };
      let orgMembership = await findOrgMembership(tx, invitation.orgId, userId);
      if (!orgMembership) {
        orgMembership = await tx.organizationMembership.create({
          data: { orgId: invitation.orgId, userId, role: invitation.orgRole },
        });
        await auditLog(
          {
            ...actor,
            resourceType: "orgMembership",
            resourceId: orgMembership.id,
            action: "create",
            after: orgMembership,
          },
          tx,
        );
        const role = invitation.orgRole;
        afterCommit(() =>
          sfdcSetUserRole({ orgId: invitation.orgId, userId, email, role }),
        );
      }
      if (
        invitation.projectId &&
        invitation.projectRole &&
        !(await findProjectMembership(tx, invitation.projectId, userId))
      ) {
        const projectMembership = await tx.projectMembership.create({
          data: {
            orgMembershipId: orgMembership.id,
            projectId: invitation.projectId,
            userId,
            role: invitation.projectRole,
          },
        });
        await auditLog(
          {
            ...actor,
            projectId: invitation.projectId,
            resourceType: "projectMembership",
            resourceId: `${invitation.projectId}--${userId}`,
            action: "create",
            after: projectMembership,
          },
          tx,
        );
      }
      await auditLog(
        {
          ...actor,
          resourceType: "membershipInvitation",
          resourceId: invitation.id,
          action: "accept",
          before: invitation,
        },
        tx,
      );
    }
    await tx.membershipInvitation.deleteMany({
      where: { id: { in: invitations.map((invitation) => invitation.id) } },
    });
    return invitations;
  });
}

// ---------------------------------------------------------------------------
// Transactions and side effects
// ---------------------------------------------------------------------------

/** AfterCommit queues a side effect that runs once the transaction commits. */
type AfterCommit = (effect: () => Promise<unknown>) => void;

/** inMembershipTransaction runs fn under the membership locks of orgIds, then runs the queued side effects after commit, logging rather than throwing their failures. */
async function inMembershipTransaction<T>(
  orgIds: string[],
  fn: (tx: Prisma.TransactionClient, afterCommit: AfterCommit) => Promise<T>,
): Promise<T> {
  const effects: (() => Promise<unknown>)[] = [];
  const result = await prisma.$transaction(async (tx) => {
    await lockOrganizations(tx, orgIds);
    return fn(tx, (effect) => effects.push(effect));
  });
  for (const effect of effects) {
    try {
      await effect();
    } catch (error) {
      logger.error("Membership side effect failed after commit", error);
    }
  }
  return result;
}

/** lockOrganizations takes each organization's membership advisory lock, in sorted id order so multi-org flows cannot deadlock. */
async function lockOrganizations(
  tx: Prisma.TransactionClient,
  orgIds: string[],
): Promise<void> {
  for (const orgId of [...new Set(orgIds)].sort()) {
    await tx.$queryRaw(
      Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`org-membership:${orgId}`}))`,
    );
  }
}

/** sendInvitationEmail notifies an invitee that they were added to or invited into an organization. */
function sendInvitationEmail(
  params: InvitationNotice & {
    to: string | null;
    orgId: string;
    orgName: string;
    userExists: boolean;
  },
) {
  if (!params.to) return Promise.resolve();
  return sendMembershipInvitationEmail({
    inviterEmail: params.inviterEmail,
    inviterName: params.inviterName,
    to: params.to,
    orgName: params.orgName,
    orgId: params.orgId,
    userExists: params.userExists,
    env,
  });
}

/** syncToSfdc queues an SFDC sync after commit; memberships Langfuse grants by default (bootstrap, signup defaults such as the demo org) are not customer membership decisions and are not synced. */
function syncToSfdc(
  actor: Actor,
  afterCommit: AfterCommit,
  sync: () => Promise<void>,
) {
  if (!isSystem(actor)) afterCommit(sync);
}

/** sfdcSetUserRole links the user to the org in SFDC; a no-op off Cloud. */
async function sfdcSetUserRole(params: {
  orgId: string;
  userId: string;
  email: string | null;
  role: Role;
}) {
  await getSfdcService()?.setUserRole(params);
}

/** sfdcRemoveUser removes the user's org-member bridge in SFDC; a no-op off Cloud. */
async function sfdcRemoveUser(params: {
  orgId: string;
  userId: string;
  email: string | null;
}) {
  await getSfdcService()?.removeUser(params);
}

// ---------------------------------------------------------------------------
// Writes with their audit rows
// ---------------------------------------------------------------------------

/** insertOrgMembership creates and audits an org membership and queues its SFDC link. */
async function insertOrgMembership(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  actor: Actor,
  params: { user: { id: string; email: string | null }; role: Role },
): Promise<OrganizationMembership> {
  const { user, role } = params;
  const orgId = actor.orgId;
  const created = await tx.organizationMembership.create({
    data: { orgId, userId: user.id, role },
  });
  await auditLog(
    {
      ...auditActor(actor),
      resourceType: "orgMembership",
      resourceId: created.id,
      action: "create",
      after: created,
    },
    tx,
  );
  syncToSfdc(actor, afterCommit, () =>
    sfdcSetUserRole({ orgId, userId: user.id, email: user.email, role }),
  );
  return created;
}

/** updateOrgRole authorizes, applies and audits an org role change, keeping at least one owner. */
async function updateOrgRole(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
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
    await assertOtherOwner(tx, before.orgId, before.id);
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
  const email = (await findUserOrThrow(tx, before.userId)).email;
  syncToSfdc(actor, afterCommit, () =>
    sfdcSetUserRole({
      orgId: before.orgId,
      userId: before.userId,
      email,
      role,
    }),
  );
  return after;
}

/** deleteOrgMembership authorizes, deletes and audits an org membership; the audit row keeps the project memberships that cascade with it. */
async function deleteOrgMembership(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  actor: Actor,
  membership: OrganizationMembership,
): Promise<void> {
  const before = {
    ...membership,
    ProjectMemberships: await tx.projectMembership.findMany({
      where: { orgMembershipId: membership.id },
    }),
  };
  assertMayManageOrgMember(actor, {
    targetUserId: before.userId,
    from: before.role,
  });
  if (before.role === Role.OWNER) {
    await assertOtherOwner(tx, before.orgId, before.id);
  }
  const email = (await findUserOrThrow(tx, before.userId)).email;
  await tx.organizationMembership.delete({ where: { id: before.id } });
  await auditLog(
    {
      ...auditActor(actor),
      resourceType: "orgMembership",
      resourceId: before.id,
      action: "delete",
      before,
    },
    tx,
  );
  syncToSfdc(actor, afterCommit, () =>
    sfdcRemoveUser({ orgId: before.orgId, userId: before.userId, email }),
  );
}

/** upsertProjectMembership writes and audits a project role for an org member. */
async function upsertProjectMembership(
  tx: Prisma.TransactionClient,
  actor: Actor,
  params: {
    orgMembership: OrganizationMembership;
    projectId: string;
    role: Role;
    before: ProjectMembership | null;
  },
): Promise<ProjectMembership> {
  const { orgMembership, projectId, role, before } = params;
  const userId = orgMembership.userId;
  const after = await tx.projectMembership.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: { role },
    create: { projectId, userId, role, orgMembershipId: orgMembership.id },
  });
  await auditLog(
    {
      ...auditActor(actor, projectId),
      resourceType: "projectMembership",
      resourceId: `${projectId}--${userId}`,
      action: before ? "update" : "create",
      before: before ?? undefined,
      after,
    },
    tx,
  );
  return after;
}

/** deleteProjectMembership deletes and audits a project role. */
async function deleteProjectMembership(
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

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function findOrgMembership(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
) {
  return tx.organizationMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
}

function findProjectMembership(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
) {
  return tx.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

async function findUserOrThrow(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) throw new LangfuseNotFoundError("User not found");
  return user;
}

async function getOrgName(tx: Prisma.TransactionClient, orgId: string) {
  const org = await tx.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  if (!org) throw new LangfuseNotFoundError("Organization not found");
  return org.name;
}

/** assertProjectInOrg rejects a project that is deleted or belongs to another organization. */
async function assertProjectInOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
  projectId: string,
) {
  const project = await tx.project.findFirst({
    where: { id: projectId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw new LangfuseNotFoundError("Project not found");
}

/** loadProjectTarget resolves the project, the target's org membership, and their current project role. */
async function loadProjectTarget<AllowMissing extends boolean = false>(
  tx: Prisma.TransactionClient,
  params: {
    orgId: string;
    projectId: string;
    userId: string;
    allowMissingOrgMembership?: AllowMissing;
  },
): Promise<{
  orgMembership: AllowMissing extends true
    ? OrganizationMembership | null
    : OrganizationMembership;
  before: ProjectMembership | null;
}> {
  const { orgId, projectId, userId } = params;
  await assertProjectInOrg(tx, orgId, projectId);
  const orgMembership = await findOrgMembership(tx, orgId, userId);
  if (!orgMembership && !params.allowMissingOrgMembership) {
    throw new LangfuseNotFoundError(
      "User is not a member of this organization",
    );
  }
  const before = await findProjectMembership(tx, projectId, userId);
  if (before && before.orgMembershipId !== orgMembership?.id) {
    throw new ForbiddenError(
      "Project membership does not belong to this organization",
    );
  }
  return {
    orgMembership: orgMembership as OrganizationMembership,
    before,
  };
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/** Actor is the caller of one membership change within one organization; a user's own roles there are re-read under the lock to cap the roles they may grant. */
type Actor = {
  ctx: AuthorizationContext;
  orgId: string;
  /** The role ceiling of a session caller (OWNER for platform admins); null for callers without one. */
  ownOrgRole: Role | null;
  ownProjectRoles: Map<string, Role>;
};

async function loadActor(
  tx: Prisma.TransactionClient,
  ctx: AuthorizationContext,
  orgId: string,
): Promise<Actor> {
  const { principal } = ctx;
  if (principal.kind === "admin" && principal.userId !== null) {
    return { ctx, orgId, ownOrgRole: Role.OWNER, ownProjectRoles: new Map() };
  }
  if (principal.kind !== "user") {
    return { ctx, orgId, ownOrgRole: null, ownProjectRoles: new Map() };
  }
  const own = await tx.organizationMembership.findUnique({
    where: { orgId_userId: { orgId, userId: principal.userId } },
    include: { ProjectMemberships: true },
  });
  return {
    ctx,
    orgId,
    ownOrgRole: own?.role ?? Role.NONE,
    ownProjectRoles: new Map(
      (own?.ProjectMemberships ?? []).map((pm) => [pm.projectId, pm.role]),
    ),
  };
}

/** auditActor derives the audit actor from the principal: users as themselves, api keys by id, the admin key as the admin-api system actor, and Langfuse flows as their system id. */
function auditActor(actor: Actor, projectId?: string): AuditLogActor {
  const { principal } = actor.ctx;
  const orgId = actor.orgId;
  switch (principal.kind) {
    case "user":
      return {
        userId: principal.userId,
        orgId,
        orgRole: actor.ownOrgRole ?? undefined,
        projectId,
      };
    case "admin":
      return principal.userId
        ? { userId: principal.userId, orgId, orgRole: Role.OWNER, projectId }
        : { apiKeyId: "ADMIN_API_KEY", orgId, projectId };
    case "apiKey":
      return { apiKeyId: principal.apiKeyId, orgId, projectId };
    case "system":
      return {
        userId:
          principal.reason === "bootstrap"
            ? "system:bootstrap"
            : "system:signup-defaults",
        orgId,
        projectId,
      };
  }
}

function isSystem(actor: Actor) {
  return actor.ctx.principal.kind === "system";
}

function mayManageOrgMembers(actor: Actor) {
  const org = OrganizationId(actor.orgId);
  return authorize(actor.ctx, org, "organizationMembers:CUD", org).success;
}

function mayManageProjectMembers(actor: Actor, projectId: string) {
  return (
    mayManageOrgMembers(actor) ||
    authorize(
      actor.ctx,
      OrganizationId(actor.orgId),
      "projectMembers:CUD",
      ProjectId(projectId),
    ).success
  );
}

/**
 * assertMayManageOrgMember authorizes a change to the target's org role from
 * `from` to `to` (absent = no membership): organizationMembers:CUD, plus
 * manageOwnership when OWNER is involved. A user may always remove themselves,
 * and session callers may never grant or touch a role above their own.
 */
function assertMayManageOrgMember(
  actor: Actor,
  change: { targetUserId?: string; from?: Role; to?: Role },
) {
  if (isSystem(actor)) return;
  const { principal } = actor.ctx;
  const isSelfRemoval =
    principal.kind === "user" &&
    principal.userId === change.targetUserId &&
    change.to === undefined;
  if (!isSelfRemoval && !mayManageOrgMembers(actor)) {
    throw new ForbiddenError(
      "You do not have access to manage organization members",
    );
  }
  if (change.from === Role.OWNER || change.to === Role.OWNER) {
    const org = OrganizationId(actor.orgId);
    const decision = authorize(
      actor.ctx,
      org,
      "organizationMembers:manageOwnership",
      org,
    );
    if (!decision.success) throw decision.error;
  }
  assertRoleCeiling(actor, change.from);
  assertRoleCeiling(actor, change.to);
}

/**
 * assertMayManageProjectMember authorizes a change to the target's role on one
 * project: organizationMembers:CUD or projectMembers:CUD on the project. Session
 * callers are capped by their own org role (for the target's org role) and by
 * MAX(org role, project role) for the project roles; other callers need
 * projectMembers:manageOwnership when OWNER is involved.
 */
function assertMayManageProjectMember(
  actor: Actor,
  change: { projectId: string; targetOrgRole?: Role; from?: Role; to?: Role },
) {
  if (isSystem(actor)) return;
  if (!mayManageProjectMembers(actor, change.projectId)) {
    throw new ForbiddenError("You do not have the required access rights");
  }
  if (actor.ownOrgRole !== null) {
    assertRoleCeiling(actor, change.targetOrgRole);
    assertProjectRoleCeiling(actor, change.projectId, change.from);
    assertProjectRoleCeiling(actor, change.projectId, change.to);
    return;
  }
  if (change.from === Role.OWNER || change.to === Role.OWNER) {
    const decision = authorize(
      actor.ctx,
      OrganizationId(actor.orgId),
      "projectMembers:manageOwnership",
      ProjectId(change.projectId),
    );
    if (!decision.success) throw decision.error;
  }
}

/** assertMayAddMember authorizes a new member or invitation: org-level unless it only grants a project role (org role NONE), which project admins may do. */
function assertMayAddMember(
  actor: Actor,
  grant: { role: Role; project?: ProjectGrant },
) {
  if (isSystem(actor)) return;
  const { project } = grant;
  if (!project || grant.role !== Role.NONE) {
    assertMayManageOrgMember(actor, { to: grant.role });
  }
  if (project) {
    assertMayManageProjectMember(actor, {
      projectId: project.projectId,
      targetOrgRole: grant.role,
      to: project.role,
    });
  }
}

function assertRoleCeiling(actor: Actor, role: Role | undefined) {
  if (actor.ownOrgRole === null || role === undefined) return;
  if (orderedRoles[actor.ownOrgRole] < orderedRoles[role]) {
    throw new ForbiddenError(
      "You cannot grant/edit a role higher than your own",
    );
  }
}

function assertProjectRoleCeiling(
  actor: Actor,
  projectId: string,
  role: Role | undefined,
) {
  if (actor.ownOrgRole === null || role === undefined) return;
  const ownProjectRole = actor.ownProjectRoles.get(projectId);
  const own = Math.max(
    orderedRoles[actor.ownOrgRole],
    ownProjectRole ? orderedRoles[ownProjectRole] : 0,
  );
  if (own < orderedRoles[role]) {
    throw new ForbiddenError(
      "You cannot grant/edit a role higher than your own",
    );
  }
}

/** assertOtherOwner refuses to remove the last owner: another OWNER must remain besides membershipId. */
async function assertOtherOwner(
  tx: Prisma.TransactionClient,
  orgId: string,
  membershipId: string,
  message = "Cannot remove the last owner of an organization. Assign new owner or delete organization.",
) {
  const otherOwners = await tx.organizationMembership.count({
    where: { orgId, role: Role.OWNER, id: { not: membershipId } },
  });
  if (otherOwners === 0) throw new ForbiddenError(message);
}

/** assertSeatAvailable enforces the plan's seat limit, counting members and pending invitations; only Langfuse's own flows skip it. */
async function assertSeatAvailable(
  tx: Prisma.TransactionClient,
  actor: Actor,
  orgId: string,
) {
  if (isSystem(actor)) return;
  const org = await tx.organization.findUnique({
    where: { id: orgId },
    select: { cloudConfig: true },
  });
  if (!org) throw new LangfuseNotFoundError("Organization not found");
  const plan = getOrganizationPlanServerSide(
    CloudConfigSchema.safeParse(org.cloudConfig).data,
  );
  const limit =
    entitlementAccess[plan].entitlementLimits["organization-member-count"];
  if (limit === false) return;
  const members = await tx.organizationMembership.count({ where: { orgId } });
  const invitations = await tx.membershipInvitation.count({ where: { orgId } });
  if (members + invitations >= limit) throw new SeatLimitExceededError(limit);
}
