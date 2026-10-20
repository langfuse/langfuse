import {
  ForbiddenError,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import {
  type Prisma,
  Role,
  type MembershipInvitation,
  type OrganizationMembership,
} from "@langfuse/shared/src/db";
import { auditLog, type AuditLogActor } from "@/src/features/audit-logs/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import {
  lockOrganizations,
  afterCommit,
  type MembershipTransaction,
} from "./membershipTransaction";
import {
  loadActor,
  assertMayManageOrgMember,
  mayManageOrgMembers,
  assertMayManageProjectMember,
  mayManageProjectMembers,
  assertProjectInOrg,
  findOrgMembership,
  findProjectMembership,
  assertSeatAvailable,
  assertProjectRolesEntitled,
  auditActor,
  sfdcSetUserRole,
  queueInvitationEmail,
  type ProjectGrant,
  type Actor,
} from "./helpers";

/** createInvitation invites an email to an org, and optionally one of its projects, within the seat limit. */
export async function createInvitation(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  params: {
    orgId: string;
    email: string;
    orgRole: Role;
    projectId?: string;
    projectRole?: Role;
    invitedByUserId: string;
  },
): Promise<MembershipInvitation> {
  const { orgId, orgRole, invitedByUserId } = params;
  const email = params.email.toLowerCase();
  const project = projectGrant(params);
  await lockOrganizations(tx, [orgId]);
  const actor = await loadActor(tx, ctx, orgId);
  assertMayInvite(actor, { orgRole, project });
  if (project) await assertProjectInOrg(tx, orgId, project.projectId);
  await assertProjectRolesEntitled(tx, actor, project?.role);
  await assertNoPendingInvitation(tx, orgId, email);
  await assertSeatAvailable(tx, actor, orgId);
  const invitation = await insertInvitation(tx, actor, {
    email,
    orgRole,
    project,
    invitedByUserId,
  });
  await queueInvitationEmail(tx, {
    invitedByUserId,
    to: email,
    orgId,
    userExists: false,
  });
  return invitation;
}

/** deleteInvitation revokes a pending invitation, freeing its seat. */
export async function deleteInvitation(
  tx: MembershipTransaction,
  ctx: AuthorizationContext,
  params: { orgId: string; invitationId: string },
): Promise<MembershipInvitation> {
  const { orgId, invitationId } = params;
  await lockOrganizations(tx, [orgId]);
  const actor = await loadActor(tx, ctx, orgId);
  const invitation = await findInvitationOrThrow(tx, orgId, invitationId);
  assertMayRevokeInvitation(actor, invitation);
  await removeInvitation(tx, actor, invitation);
  return invitation;
}

/** claimInvitations turns every pending invitation for the email into memberships, without authorization or the seat limit since the invitation holds both. */
export async function claimInvitations(
  tx: MembershipTransaction,
  params: { userId: string; email: string },
): Promise<MembershipInvitation[]> {
  const { userId } = params;
  const email = params.email.toLowerCase();
  await lockOrganizations(tx, await findInvitedOrgIds(tx, email));
  const invitations = await tx.membershipInvitation.findMany({
    where: { email },
  });
  for (const invitation of invitations) {
    await acceptInvitation(tx, { userId, email, invitation });
  }
  await tx.membershipInvitation.deleteMany({
    where: { id: { in: invitations.map((invitation) => invitation.id) } },
  });
  return invitations;
}

/** projectGrant is the project role an invitation carries, if one was chosen. */
function projectGrant(params: {
  projectId?: string;
  projectRole?: Role;
}): ProjectGrant | undefined {
  const { projectId, projectRole } = params;
  if (!projectId || !projectRole) return undefined;
  return { projectId, role: projectRole };
}

/** assertMayInvite authorizes an invitation at org level, or at project level when it only grants a project role. */
function assertMayInvite(
  actor: Actor,
  grant: { orgRole: Role; project?: ProjectGrant },
) {
  const { project } = grant;
  if (!project || grant.orgRole !== Role.NONE) {
    assertMayManageOrgMember(actor, { to: grant.orgRole });
  }
  if (project) {
    assertMayManageProjectMember(actor, {
      projectId: project.projectId,
      to: project.role,
    });
  }
}

async function assertNoPendingInvitation(
  tx: Prisma.TransactionClient,
  orgId: string,
  email: string,
) {
  const pending = await tx.membershipInvitation.findUnique({
    where: { email_orgId: { email, orgId } },
  });
  if (pending) {
    throw new InvalidRequestError(
      "A pending membership invitation with this email and organization already exists",
    );
  }
}

/** insertInvitation creates and audits an invitation. */
async function insertInvitation(
  tx: Prisma.TransactionClient,
  actor: Actor,
  params: {
    email: string;
    orgRole: Role;
    project?: ProjectGrant;
    invitedByUserId?: string;
  },
): Promise<MembershipInvitation> {
  const { email, orgRole, project } = params;
  const invitation = await tx.membershipInvitation.create({
    data: {
      orgId: actor.orgId,
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
  return invitation;
}

async function findInvitationOrThrow(
  tx: Prisma.TransactionClient,
  orgId: string,
  invitationId: string,
) {
  const invitation = await tx.membershipInvitation.findFirst({
    where: { id: invitationId, orgId },
  });
  if (!invitation) throw new LangfuseNotFoundError("Invitation not found");
  return invitation;
}

/** assertMayRevokeInvitation allows org member managers, and project member managers for project-only invitations. */
function assertMayRevokeInvitation(
  actor: Actor,
  invitation: MembershipInvitation,
) {
  if (mayManageOrgMembers(actor)) return;
  if (
    invitation.projectId !== null &&
    invitation.orgRole === Role.NONE &&
    mayManageProjectMembers(actor, invitation.projectId)
  ) {
    return;
  }
  throw new ForbiddenError(
    "You do not have sufficient rights to delete this invitation.",
  );
}

/** removeInvitation deletes and audits an invitation. */
async function removeInvitation(
  tx: Prisma.TransactionClient,
  actor: Actor,
  invitation: MembershipInvitation,
) {
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
}

async function findInvitedOrgIds(tx: Prisma.TransactionClient, email: string) {
  const invitations = await tx.membershipInvitation.findMany({
    where: { email },
    select: { orgId: true },
  });
  return invitations.map((invitation) => invitation.orgId);
}

/** acceptInvitation joins the invited org and project and audits it all as the accepting user. */
async function acceptInvitation(
  tx: MembershipTransaction,
  params: { userId: string; email: string; invitation: MembershipInvitation },
) {
  const { invitation } = params;
  const actor: AuditLogActor = {
    userId: params.userId,
    orgId: invitation.orgId,
    orgRole: invitation.orgRole,
  };
  const orgMembership = await joinInvitedOrg(tx, actor, params);
  await joinInvitedProject(tx, actor, { orgMembership, invitation });
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

/** joinInvitedOrg creates the invited org membership unless the user already holds one. */
async function joinInvitedOrg(
  tx: MembershipTransaction,
  actor: AuditLogActor,
  params: { userId: string; email: string; invitation: MembershipInvitation },
): Promise<OrganizationMembership> {
  const { userId, email, invitation } = params;
  const { orgId, orgRole: role } = invitation;
  const existing = await findOrgMembership(tx, orgId, userId);
  if (existing) return existing;
  const created = await tx.organizationMembership.create({
    data: { orgId, userId, role },
  });
  await auditLog(
    {
      ...actor,
      resourceType: "orgMembership",
      resourceId: created.id,
      action: "create",
      after: created,
    },
    tx,
  );
  afterCommit(tx, () => sfdcSetUserRole({ orgId, userId, email, role }));
  return created;
}

/** joinInvitedProject creates the invited project role unless the user already holds one. */
async function joinInvitedProject(
  tx: Prisma.TransactionClient,
  actor: AuditLogActor,
  params: {
    orgMembership: OrganizationMembership;
    invitation: MembershipInvitation;
  },
) {
  const { orgMembership, invitation } = params;
  const { projectId, projectRole } = invitation;
  const userId = orgMembership.userId;
  if (!projectId || !projectRole) return;
  if (await findProjectMembership(tx, projectId, userId)) return;
  const created = await tx.projectMembership.create({
    data: {
      orgMembershipId: orgMembership.id,
      projectId,
      userId,
      role: projectRole,
    },
  });
  await auditLog(
    {
      ...actor,
      projectId,
      resourceType: "projectMembership",
      resourceId: `${projectId}--${userId}`,
      action: "create",
      after: created,
    },
    tx,
  );
}
