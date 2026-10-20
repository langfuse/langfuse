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
import {
  type AuthorizationContext,
  type SystemReason,
} from "@/src/features/auth/policy/types";
import { entitlementAccess } from "@/src/features/entitlements/constants/entitlements";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server";
import { authorize } from "@/src/features/rbac/authorize";
import { SeatLimitExceededError } from "./membershipErrors";

const systemActorUserIds: Record<SystemReason, string> = {
  bootstrap: "system:bootstrap",
  signupDefaults: "system:signup-defaults",
};

const lastOwnerMessage =
  "Cannot remove the last owner of an organization. Assign new owner or delete organization.";

const lastOwnerOfAnyMessage =
  "Cannot delete account. You are the last owner of one or more organizations. Please add another owner or delete the organizations first.";

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
    const user = await loadNewMember(tx, { orgId, userId, project });
    await assertSeatAvailable(tx, actor, orgId);
    const orgMembership = await insertOrgMembership(tx, afterCommit, actor, {
      user,
      role,
    });
    const projectMembership = await grantProjectRole(tx, actor, {
      orgMembership,
      project,
    });
    await queueInvitationEmail(tx, afterCommit, {
      notify: params.notify,
      to: user.email,
      orgId,
      userExists: true,
    });
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

/** removeOrgMember removes a member with their project memberships, or returns null when the user was not a member. */
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

/** applyOrgMembership drives a user's org membership to role, removing it for null and leaving an existing one as is with keepExistingRole. */
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
      return removeOrgMembershipIfPresent(tx, afterCommit, actor, {
        userId,
        before,
      });
    }
    if (!before) {
      return createOrgMembership(tx, afterCommit, actor, { userId, role });
    }
    if (params.keepExistingRole || before.role === role) {
      assertMayManageOrgMember(actor, { targetUserId: userId });
      return { outcome: "unchanged", before, after: before };
    }
    const after = await updateOrgRole(tx, afterCommit, actor, before, role);
    return { outcome: "updated", before, after };
  });
}

/** removeUserFromAllOrgs removes every org membership of a user ahead of account deletion, unless they are the last owner of any. */
export async function removeUserFromAllOrgs(
  ctx: AuthorizationContext,
  userId: string,
): Promise<void> {
  assertMayRemoveAllMemberships(ctx, userId);
  const orgIds = await findMemberOrgIds(userId);
  if (orgIds.length === 0) return;

  await inMembershipTransaction(orgIds, async (tx, afterCommit) => {
    const memberships = await tx.organizationMembership.findMany({
      where: { userId, orgId: { in: orgIds } },
      include: { ProjectMemberships: true },
    });
    await assertNotLastOwnerOfAny(tx, memberships);
    const { email } = await findUserOrThrow(tx, userId);
    for (const membership of memberships) {
      await deleteMembershipOfLeavingUser(tx, afterCommit, ctx, {
        membership,
        email,
      });
    }
  });
}

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
      orgMembershipRequired: true,
    });
    requireOrgMembership(orgMembership);
    assertMayManageProjectMember(actor, {
      projectId,
      from: effectiveProjectRole(before, orgMembership),
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

/** removeProjectRole drops a member's project role so they inherit their org role, or returns null when there was none. */
export async function removeProjectRole(
  ctx: AuthorizationContext,
  params: { orgId: string; projectId: string; userId: string },
): Promise<ProjectMembership | null> {
  const { orgId, projectId, userId } = params;
  return inMembershipTransaction([orgId], async (tx) => {
    const actor = await loadActor(tx, ctx, orgId);
    const target = await loadProjectTarget(tx, {
      orgId,
      projectId,
      userId,
      orgMembershipRequired: false,
    });
    return clearProjectRole(tx, actor, { projectId, ...target });
  });
}

/** applyProjectMembership drives a member's project role to role, back to inheriting for null, leaving an existing one as is with keepExistingRole. */
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
      orgMembershipRequired: role !== null,
    });
    if (role === null) {
      const removed = await clearProjectRole(tx, actor, {
        projectId,
        orgMembership,
        before,
      });
      return removalOutcome(removed);
    }
    requireOrgMembership(orgMembership);
    if (before && (params.keepExistingRole || before.role === role)) {
      assertMayManageProjectMember(actor, { projectId });
      return { outcome: "unchanged", before, after: before };
    }
    assertMayManageProjectMember(actor, {
      projectId,
      from: effectiveProjectRole(before, orgMembership),
      to: role,
    });
    const after = await upsertProjectMembership(tx, actor, {
      orgMembership,
      projectId,
      role,
      before,
    });
    return { outcome: upsertOutcome(before), before, after };
  });
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
    await assertProjectGrantInOrg(tx, orgId, project);
    await assertNoPendingInvitation(tx, orgId, email);
    await assertSeatAvailable(tx, actor, orgId);
    const invitation = await insertInvitation(tx, actor, {
      email,
      orgRole,
      project,
      invitedByUserId: params.invitedByUserId,
    });
    await queueInvitationEmail(tx, afterCommit, {
      notify: params.notify,
      to: email,
      orgId,
      userExists: false,
    });
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
    const invitation = await findInvitationOrThrow(tx, orgId, invitationId);
    assertMayRevokeInvitation(actor, invitation);
    await deleteInvitation(tx, actor, invitation);
    return invitation;
  });
}

/** acceptInvitations turns every pending invitation for the email into memberships, without authorization or the seat limit since the invitation holds both. */
export async function acceptInvitations(params: {
  userId: string;
  email: string;
}): Promise<MembershipInvitation[]> {
  const { userId } = params;
  const email = params.email.toLowerCase();
  const orgIds = await findInvitedOrgIds(email);
  if (orgIds.length === 0) return [];

  return inMembershipTransaction(orgIds, async (tx, afterCommit) => {
    const invitations = await tx.membershipInvitation.findMany({
      where: { email, orgId: { in: orgIds } },
    });
    for (const invitation of invitations) {
      await acceptInvitation(tx, afterCommit, { userId, email, invitation });
    }
    await tx.membershipInvitation.deleteMany({
      where: { id: { in: invitations.map((invitation) => invitation.id) } },
    });
    return invitations;
  });
}

/** inMembershipTransaction runs fn under the orgs' membership locks, then the queued side effects after commit, logging their failures. */
async function inMembershipTransaction<T>(
  orgIds: string[],
  fn: (tx: Prisma.TransactionClient, afterCommit: AfterCommit) => Promise<T>,
): Promise<T> {
  const effects: (() => Promise<unknown>)[] = [];
  const result = await prisma.$transaction(async (tx) => {
    await lockOrganizations(tx, orgIds);
    return fn(tx, (effect) => effects.push(effect));
  });
  await runAfterCommit(effects);
  return result;
}

/** lockOrganizations takes each org's membership advisory lock. */
async function lockOrganizations(
  tx: Prisma.TransactionClient,
  orgIds: string[],
): Promise<void> {
  // sorted, so multi-org flows cannot deadlock
  for (const orgId of [...new Set(orgIds)].sort()) {
    await tx.$queryRaw(
      Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`org-membership:${orgId}`}))`,
    );
  }
}

async function runAfterCommit(effects: (() => Promise<unknown>)[]) {
  for (const effect of effects) {
    try {
      await effect();
    } catch (error) {
      logger.error("Membership side effect failed after commit", error);
    }
  }
}

/** loadActor reads a session caller's own org role for the audit rows. */
async function loadActor(
  tx: Prisma.TransactionClient,
  ctx: AuthorizationContext,
  orgId: string,
): Promise<Actor> {
  const { principal } = ctx;
  if (principal.kind === "admin" && principal.userId !== null) {
    return { ctx, orgId, orgRole: Role.OWNER };
  }
  if (principal.kind !== "user") return { ctx, orgId };
  const own = await findOrgMembership(tx, orgId, principal.userId);
  return { ctx, orgId, orgRole: own?.role ?? Role.NONE };
}

/** assertMayAddMember authorizes a new member or invitation at org level, or at project level when it only grants a project role. */
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
      to: project.role,
    });
  }
}

/** assertMayManageOrgMember authorizes an org role change from `from` to `to`, where absent means no membership. */
function assertMayManageOrgMember(
  actor: Actor,
  change: { targetUserId?: string; from?: Role; to?: Role },
) {
  if (isSystem(actor)) return;
  if (!isSelfRemoval(actor, change) && !mayManageOrgMembers(actor)) {
    throw new ForbiddenError(
      "You do not have access to manage organization members",
    );
  }
  if (change.from === Role.OWNER || change.to === Role.OWNER) {
    assertMayManageOrgOwnership(actor);
  }
}

function isSystem(actor: Actor) {
  return actor.ctx.principal.kind === "system";
}

function isSelfRemoval(
  actor: Actor,
  change: { targetUserId?: string; to?: Role },
) {
  const { principal } = actor.ctx;
  return (
    principal.kind === "user" &&
    principal.userId === change.targetUserId &&
    change.to === undefined
  );
}

function mayManageOrgMembers(actor: Actor) {
  const org = OrganizationId(actor.orgId);
  return authorize(actor.ctx, org, "organizationMembers:CUD", org).success;
}

function assertMayManageOrgOwnership(actor: Actor) {
  const decision = authorizeOrgOwnership(actor);
  if (!decision.success) throw decision.error;
}

function authorizeOrgOwnership(actor: Actor) {
  const org = OrganizationId(actor.orgId);
  return authorize(actor.ctx, org, "organizationMembers:manageOwnership", org);
}

/** assertMayManageProjectMember authorizes a change of the target's effective project role from `from` to `to`. */
function assertMayManageProjectMember(
  actor: Actor,
  change: { projectId: string; from?: Role; to?: Role },
) {
  if (isSystem(actor)) return;
  if (!mayManageProjectMembers(actor, change.projectId)) {
    throw new ForbiddenError("You do not have the required access rights");
  }
  if (change.from === Role.OWNER || change.to === Role.OWNER) {
    assertMayManageProjectOwnership(actor, change.projectId);
  }
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

function assertMayManageProjectOwnership(actor: Actor, projectId: string) {
  if (authorizeOrgOwnership(actor).success) return;
  const decision = authorize(
    actor.ctx,
    OrganizationId(actor.orgId),
    "projectMembers:manageOwnership",
    ProjectId(projectId),
  );
  if (!decision.success) throw decision.error;
}

/** loadNewMember resolves a user who may join the org: the project exists in it and they hold no membership yet. */
async function loadNewMember(
  tx: Prisma.TransactionClient,
  params: { orgId: string; userId: string; project?: ProjectGrant },
) {
  const { orgId, userId, project } = params;
  await assertProjectGrantInOrg(tx, orgId, project);
  const user = await findUserOrThrow(tx, userId);
  if (await findOrgMembership(tx, orgId, userId)) {
    throw new InvalidRequestError(
      "User is already a member of this organization",
    );
  }
  // a stray project membership can outlive another org's membership
  if (project && (await findProjectMembership(tx, project.projectId, userId))) {
    throw new InvalidRequestError("User is already a member of this project");
  }
  return user;
}

async function assertProjectGrantInOrg(
  tx: Prisma.TransactionClient,
  orgId: string,
  project: ProjectGrant | undefined,
) {
  if (project) await assertProjectInOrg(tx, orgId, project.projectId);
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

async function findUserOrThrow(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) throw new LangfuseNotFoundError("User not found");
  return user;
}

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

/** assertSeatAvailable enforces the plan's seat limit over members and pending invitations, except for Langfuse's own flows. */
async function assertSeatAvailable(
  tx: Prisma.TransactionClient,
  actor: Actor,
  orgId: string,
) {
  if (isSystem(actor)) return;
  const limit = await getSeatLimit(tx, orgId);
  if (limit === false) return;
  if ((await countSeatsInUse(tx, orgId)) >= limit) {
    throw new SeatLimitExceededError(limit);
  }
}

/** getSeatLimit reads the org's plan seat limit, or false when unlimited. */
async function getSeatLimit(tx: Prisma.TransactionClient, orgId: string) {
  const org = await tx.organization.findUnique({
    where: { id: orgId },
    select: { cloudConfig: true },
  });
  if (!org) throw new LangfuseNotFoundError("Organization not found");
  const plan = getOrganizationPlanServerSide(
    CloudConfigSchema.safeParse(org.cloudConfig).data,
  );
  return entitlementAccess[plan].entitlementLimits["organization-member-count"];
}

async function countSeatsInUse(tx: Prisma.TransactionClient, orgId: string) {
  const members = await tx.organizationMembership.count({ where: { orgId } });
  const invitations = await tx.membershipInvitation.count({ where: { orgId } });
  return members + invitations;
}

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

/** auditActor derives the audit actor from the principal. */
function auditActor(actor: Actor, projectId?: string): AuditLogActor {
  const { principal } = actor.ctx;
  const orgId = actor.orgId;
  switch (principal.kind) {
    case "user":
      return {
        userId: principal.userId,
        orgId,
        orgRole: actor.orgRole,
        projectId,
      };
    case "admin":
      return adminAuditActor(principal.userId, orgId, projectId);
    case "apiKey":
      return { apiKeyId: principal.apiKeyId, orgId, projectId };
    case "system":
      return {
        userId: systemActorUserIds[principal.reason],
        orgId,
        projectId,
      };
  }
}

/** adminAuditActor audits a platform admin as themselves and the admin key as the admin-api actor. */
function adminAuditActor(
  userId: string | null,
  orgId: string,
  projectId: string | undefined,
): AuditLogActor {
  if (userId) return { userId, orgId, orgRole: Role.OWNER, projectId };
  return { apiKeyId: "ADMIN_API_KEY", orgId, projectId };
}

/** syncToSfdc queues an SFDC sync after commit, skipping memberships Langfuse grants by default. */
function syncToSfdc(
  actor: Actor,
  afterCommit: AfterCommit,
  sync: () => Promise<void>,
) {
  if (!isSystem(actor)) afterCommit(sync);
}

async function sfdcSetUserRole(params: {
  orgId: string;
  userId: string;
  email: string | null;
  role: Role;
}) {
  await getSfdcService()?.setUserRole(params);
}

/** grantProjectRole writes the project role that comes with a new member, if any. */
async function grantProjectRole(
  tx: Prisma.TransactionClient,
  actor: Actor,
  params: { orgMembership: OrganizationMembership; project?: ProjectGrant },
): Promise<ProjectMembership | null> {
  const { orgMembership, project } = params;
  if (!project) return null;
  return upsertProjectMembership(tx, actor, {
    orgMembership,
    projectId: project.projectId,
    role: project.role,
    before: null,
  });
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
      action: upsertAction(before),
      before: before ?? undefined,
      after,
    },
    tx,
  );
  return after;
}

function upsertAction(before: unknown): "create" | "update" {
  if (before) return "update";
  return "create";
}

/** queueInvitationEmail queues the invitee's email after commit when an inviter is named. */
async function queueInvitationEmail(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  params: {
    notify?: InvitationNotice;
    to: string | null;
    orgId: string;
    userExists: boolean;
  },
) {
  const { notify, to, orgId, userExists } = params;
  if (!notify) return;
  const orgName = await getOrgName(tx, orgId);
  afterCommit(() =>
    sendInvitationEmail({ ...notify, to, orgId, orgName, userExists }),
  );
}

async function getOrgName(tx: Prisma.TransactionClient, orgId: string) {
  const org = await tx.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  if (!org) throw new LangfuseNotFoundError("Organization not found");
  return org.name;
}

async function sendInvitationEmail(
  params: InvitationNotice & {
    to: string | null;
    orgId: string;
    orgName: string;
    userExists: boolean;
  },
) {
  if (!params.to) return;
  await sendMembershipInvitationEmail({
    inviterEmail: params.inviterEmail,
    inviterName: params.inviterName,
    to: params.to,
    orgName: params.orgName,
    orgId: params.orgId,
    userExists: params.userExists,
    env,
  });
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

/** deleteOrgMembership authorizes, deletes and audits an org membership along with the project memberships that cascade with it. */
async function deleteOrgMembership(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
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
  syncToSfdc(actor, afterCommit, () =>
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

/** removeOrgMembershipIfPresent deletes the membership, reporting an absent one as unchanged. */
async function removeOrgMembershipIfPresent(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  actor: Actor,
  params: { userId: string; before: OrganizationMembership | null },
): Promise<MembershipOutcome<OrganizationMembership>> {
  const { userId, before } = params;
  if (!before) {
    assertMayManageOrgMember(actor, { targetUserId: userId });
    return { outcome: "unchanged", before: null, after: null };
  }
  await deleteOrgMembership(tx, afterCommit, actor, before);
  return { outcome: "removed", before, after: null };
}

/** createOrgMembership adds a user who is not yet a member, within the seat limit. */
async function createOrgMembership(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  actor: Actor,
  params: { userId: string; role: Role },
): Promise<MembershipOutcome<OrganizationMembership>> {
  const { userId, role } = params;
  assertMayAddMember(actor, { role });
  const user = await findUserOrThrow(tx, userId);
  await assertSeatAvailable(tx, actor, actor.orgId);
  const after = await insertOrgMembership(tx, afterCommit, actor, {
    user,
    role,
  });
  return { outcome: "created", before: null, after };
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

async function findMemberOrgIds(userId: string) {
  const memberships = await prisma.organizationMembership.findMany({
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
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  ctx: AuthorizationContext,
  params: { membership: OrganizationMembership; email: string | null },
) {
  const { membership, email } = params;
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
  // NONE roles hold no SFDC org-member bridge
  if (membership.role === Role.NONE) return;
  afterCommit(() =>
    sfdcRemoveUser({
      orgId: membership.orgId,
      userId: membership.userId,
      email,
    }),
  );
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
  await deleteProjectMembership(tx, actor, before);
  return before;
}

/** effectiveProjectRole is the target's project role, or the org role they inherit without one. */
function effectiveProjectRole(
  projectMembership: ProjectMembership | null,
  orgMembership: OrganizationMembership,
) {
  return projectMembership?.role ?? orgMembership.role;
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

function removalOutcome(
  removed: ProjectMembership | null,
): MembershipOutcome<ProjectMembership> {
  if (!removed) return { outcome: "unchanged", before: null, after: null };
  return { outcome: "removed", before: removed, after: null };
}

function upsertOutcome(
  before: ProjectMembership | null,
): "created" | "updated" {
  if (before) return "updated";
  return "created";
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

/** deleteInvitation deletes and audits an invitation. */
async function deleteInvitation(
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

async function findInvitedOrgIds(email: string) {
  const invitations = await prisma.membershipInvitation.findMany({
    where: { email },
    select: { orgId: true },
  });
  return invitations.map((invitation) => invitation.orgId);
}

/** acceptInvitation joins the invited org and project and audits it all as the accepting user. */
async function acceptInvitation(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  params: { userId: string; email: string; invitation: MembershipInvitation },
) {
  const { invitation } = params;
  const actor: AuditLogActor = {
    userId: params.userId,
    orgId: invitation.orgId,
    orgRole: invitation.orgRole,
  };
  const orgMembership = await joinInvitedOrg(tx, afterCommit, actor, params);
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
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
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
  afterCommit(() => sfdcSetUserRole({ orgId, userId, email, role }));
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

/** MembershipOutcome reports what a declarative apply changed. */
export type MembershipOutcome<T> = {
  outcome: "created" | "updated" | "removed" | "unchanged";
  before: T | null;
  after: T | null;
};

/** InvitationNotice names the inviter for the email sent after a member or invitation is added. */
export type InvitationNotice = { inviterName: string; inviterEmail: string };

/** ProjectGrant is a project role granted with an org membership or invitation. */
type ProjectGrant = { projectId: string; role: Role };

/** AfterCommit queues a side effect that runs once the transaction commits. */
type AfterCommit = (effect: () => Promise<unknown>) => void;

/** Actor is the caller of one membership change within one org. */
type Actor = {
  ctx: AuthorizationContext;
  orgId: string;
  /** orgRole is a session caller's own org role, OWNER for platform admins. */
  orgRole?: Role;
};
