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
import {
  getOrganizationPlanServerSide,
  hasEntitlementBasedOnPlan,
} from "@/src/features/entitlements/server";
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

/** createMembership adds a user to an org and optionally one of its projects, or invites an email that has no account yet. */
export async function createMembership(
  ctx: AuthorizationContext,
  params: ({ userId: string } | { email: string }) & {
    orgId: string;
    role: Role;
    project?: ProjectGrant;
    inviter?: Inviter;
    ifExists?: "error" | "ignore";
  },
): Promise<CreatedMembership> {
  const { orgId, role, project } = params;
  return inMembershipTransaction([orgId], async (tx, afterCommit) => {
    const actor = await loadActor(tx, ctx, orgId);
    assertMayAddMember(actor, { role, project });
    await assertProjectGrantInOrg(tx, orgId, project);
    await assertProjectRolesEntitled(tx, actor, project?.role);
    const user = await findInvitee(tx, params);
    if (!user) {
      return inviteEmail(tx, afterCommit, actor, {
        email: inviteeEmail(params),
        role,
        project,
        inviter: params.inviter,
      });
    }
    const existing = await findOrgMembership(tx, orgId, user.id);
    if (existing) {
      return addToExistingMember(tx, actor, {
        existing,
        role,
        project,
        ifExists: params.ifExists ?? "error",
      });
    }
    return addNewMember(tx, afterCommit, actor, {
      user,
      role,
      project,
      inviter: params.inviter,
    });
  });
}

/** updateMembership sets a user's org role, or their project role, creating the membership when they have none. */
export async function updateMembership(
  ctx: AuthorizationContext,
  params: { orgId: string; userId: string; role: Role },
): Promise<UpdatedMembership<OrganizationMembership>>;
export async function updateMembership(
  ctx: AuthorizationContext,
  params: { projectId: string; userId: string; role: Role },
): Promise<UpdatedMembership<ProjectMembership>>;
export async function updateMembership(
  ctx: AuthorizationContext,
  params: ({ orgId: string } | { projectId: string }) & {
    userId: string;
    role: Role;
  },
): Promise<
  | UpdatedMembership<OrganizationMembership>
  | UpdatedMembership<ProjectMembership>
> {
  if ("projectId" in params) return updateProjectMembership(ctx, params);
  return updateOrgMembership(ctx, params);
}

/** deleteMembership removes a user from an org with their project roles, drops one project role, or revokes an invitation. */
export async function deleteMembership(
  ctx: AuthorizationContext,
  params: { orgId: string; invitationId: string },
): Promise<MembershipInvitation>;
export async function deleteMembership(
  ctx: AuthorizationContext,
  params: { projectId: string; userId: string },
): Promise<ProjectMembership | null>;
export async function deleteMembership(
  ctx: AuthorizationContext,
  params: { orgId: string; userId: string },
): Promise<OrganizationMembership | null>;
export async function deleteMembership(
  ctx: AuthorizationContext,
  params:
    | { orgId: string; invitationId: string }
    | { projectId: string; userId: string }
    | { orgId: string; userId: string },
): Promise<
  MembershipInvitation | ProjectMembership | OrganizationMembership | null
> {
  if ("invitationId" in params) return revokeInvitation(ctx, params);
  if ("projectId" in params) return deleteProjectMembership(ctx, params);
  return deleteOrgMembership(ctx, params);
}

/** deleteMemberships removes every org membership of a user inside the caller's transaction, unless they are the last owner of any. */
export async function deleteMemberships(
  tx: Prisma.TransactionClient,
  ctx: AuthorizationContext,
  params: { userId: string },
): Promise<{ afterCommit: () => Promise<void> }> {
  const { userId } = params;
  assertMayRemoveAllMemberships(ctx, userId);
  const orgIds = await findMemberOrgIds(tx, userId);
  await lockOrganizations(tx, orgIds);
  const memberships = await tx.organizationMembership.findMany({
    where: { userId, orgId: { in: orgIds } },
    include: { ProjectMemberships: true },
  });
  await assertNotLastOwnerOfAny(tx, memberships);
  const effects: (() => Promise<unknown>)[] = [];
  for (const membership of memberships) {
    await deleteMembershipOfLeavingUser(
      tx,
      (effect) => effects.push(effect),
      ctx,
      membership,
    );
  }
  return { afterCommit: () => runAfterCommit(effects) };
}

/** claimInvitations turns every pending invitation for the email into memberships, without authorization or the seat limit since the invitation holds both. */
export async function claimInvitations(params: {
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

/** findInvitee resolves the user to add by id, or by email when they may have no account yet. */
async function findInvitee(
  tx: Prisma.TransactionClient,
  params: { userId: string } | { email: string },
) {
  if ("userId" in params) return findUserOrThrow(tx, params.userId);
  return tx.user.findUnique({
    where: { email: params.email.toLowerCase() },
    select: { id: true, email: true },
  });
}

function inviteeEmail(params: { userId: string } | { email: string }) {
  if ("email" in params) return params.email.toLowerCase();
  throw new LangfuseNotFoundError("User not found");
}

/** inviteEmail creates an invitation for an email without an account, within the seat limit. */
async function inviteEmail(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  actor: Actor,
  params: {
    email: string;
    role: Role;
    project?: ProjectGrant;
    inviter?: Inviter;
  },
): Promise<CreatedMembership> {
  const { email, inviter } = params;
  await assertNoPendingInvitation(tx, actor.orgId, email);
  await assertSeatAvailable(tx, actor, actor.orgId);
  const invitation = await insertInvitation(tx, actor, {
    email,
    orgRole: params.role,
    project: params.project,
    invitedByUserId: inviter?.userId,
  });
  await queueInvitationEmail(tx, afterCommit, {
    inviter,
    to: email,
    orgId: actor.orgId,
    userExists: false,
  });
  return {
    outcome: "created",
    orgMembership: null,
    projectMembership: null,
    invitation,
  };
}

/** addToExistingMember adds only the project role to an org member, or leaves them as is with ifExists "ignore". */
async function addToExistingMember(
  tx: Prisma.TransactionClient,
  actor: Actor,
  params: {
    existing: OrganizationMembership;
    role: Role;
    project?: ProjectGrant;
    ifExists: "error" | "ignore";
  },
): Promise<CreatedMembership> {
  const { existing, project, ifExists } = params;
  const projectOnly = params.role === Role.NONE && project !== undefined;
  if (!projectOnly && ifExists === "error") {
    throw new InvalidRequestError(
      "User is already a member of this organization",
    );
  }
  const projectMembership = await addProjectRole(tx, actor, {
    orgMembership: existing,
    project,
    ifExists,
  });
  return {
    outcome: createdIf(projectMembership),
    orgMembership: existing,
    projectMembership,
    invitation: null,
  };
}

/** addProjectRole grants an org member a project role they do not hold yet, overriding the org role they inherit there. */
async function addProjectRole(
  tx: Prisma.TransactionClient,
  actor: Actor,
  params: {
    orgMembership: OrganizationMembership;
    project?: ProjectGrant;
    ifExists: "error" | "ignore";
  },
): Promise<ProjectMembership | null> {
  const { orgMembership, project } = params;
  if (!project) return null;
  const { projectId } = project;
  if (await findProjectMembership(tx, projectId, orgMembership.userId)) {
    if (params.ifExists === "ignore") return null;
    throw new InvalidRequestError("User is already a member of this project");
  }
  assertMayManageProjectMember(actor, {
    projectId,
    from: orgMembership.role,
    to: project.role,
  });
  return upsertProjectMembership(tx, actor, {
    orgMembership,
    projectId,
    role: project.role,
    before: null,
  });
}

function createdIf(written: unknown): "created" | "unchanged" {
  if (written) return "created";
  return "unchanged";
}

/** addNewMember adds a user who is not yet a member, within the seat limit. */
async function addNewMember(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  actor: Actor,
  params: {
    user: { id: string; email: string | null };
    role: Role;
    project?: ProjectGrant;
    inviter?: Inviter;
  },
): Promise<CreatedMembership> {
  const { user, role, project } = params;
  // a stray project membership can outlive another org's membership
  if (
    project &&
    (await findProjectMembership(tx, project.projectId, user.id))
  ) {
    throw new InvalidRequestError("User is already a member of this project");
  }
  await assertSeatAvailable(tx, actor, actor.orgId);
  const orgMembership = await insertOrgMembership(tx, afterCommit, actor, {
    user,
    role,
  });
  const projectMembership = await grantProjectRole(tx, actor, {
    orgMembership,
    project,
  });
  await queueInvitationEmail(tx, afterCommit, {
    inviter: params.inviter,
    to: user.email,
    orgId: actor.orgId,
    userExists: true,
  });
  return {
    outcome: "created",
    orgMembership,
    projectMembership,
    invitation: null,
  };
}

/** updateOrgMembership sets a user's org role, creating the membership within the seat limit when absent. */
async function updateOrgMembership(
  ctx: AuthorizationContext,
  params: { orgId: string; userId: string; role: Role },
): Promise<UpdatedMembership<OrganizationMembership>> {
  const { orgId, userId, role } = params;
  return inMembershipTransaction([orgId], async (tx, afterCommit) => {
    const actor = await loadActor(tx, ctx, orgId);
    const before = await findOrgMembership(tx, orgId, userId);
    if (!before) {
      const after = await createOrgMembership(tx, afterCommit, actor, {
        userId,
        role,
      });
      return { outcome: "created", before: null, after };
    }
    if (before.role === role) {
      assertMayManageOrgMember(actor, { from: role, to: role });
      return { outcome: "unchanged", before, after: before };
    }
    const after = await updateOrgRole(tx, afterCommit, actor, before, role);
    return { outcome: "updated", before, after };
  });
}

/** updateProjectMembership sets a member's project role, overriding the org role they inherit there. */
async function updateProjectMembership(
  ctx: AuthorizationContext,
  params: { projectId: string; userId: string; role: Role },
): Promise<UpdatedMembership<ProjectMembership>> {
  const { projectId, userId, role } = params;
  const orgId = await findVisibleProjectOrgId(ctx, projectId);
  return inMembershipTransaction([orgId], async (tx) => {
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
  });
}

function updatedIf(before: unknown): "created" | "updated" {
  if (before) return "updated";
  return "created";
}

/** deleteOrgMembership removes a user from an org, or returns null when they were not a member. */
async function deleteOrgMembership(
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
    await removeOrgMembership(tx, afterCommit, actor, before);
    return before;
  });
}

/** deleteProjectMembership drops a member's project role so the org role applies again, or returns null when there was none. */
async function deleteProjectMembership(
  ctx: AuthorizationContext,
  params: { projectId: string; userId: string },
): Promise<ProjectMembership | null> {
  const { projectId, userId } = params;
  const orgId = await findVisibleProjectOrgId(ctx, projectId);
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

/** findVisibleProjectOrgId resolves a live project's org, hiding projects of orgs the caller does not belong to. */
async function findVisibleProjectOrgId(
  ctx: AuthorizationContext,
  projectId: string,
): Promise<string> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { orgId: true },
  });
  if (!project || !belongsToOrg(ctx, project.orgId)) {
    throw new LangfuseNotFoundError("Project not found");
  }
  return project.orgId;
}

function belongsToOrg(ctx: AuthorizationContext, orgId: string) {
  const { principal } = ctx;
  if (principal.kind === "admin" || principal.kind === "system") return true;
  return principal.organizations.some((org) => org.orgId === orgId);
}

/** revokeInvitation deletes a pending invitation, freeing its seat. */
async function revokeInvitation(
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
  const plan = await getOrgPlan(tx, orgId);
  return entitlementAccess[plan].entitlementLimits["organization-member-count"];
}

async function getOrgPlan(tx: Prisma.TransactionClient, orgId: string) {
  const org = await tx.organization.findUnique({
    where: { id: orgId },
    select: { cloudConfig: true },
  });
  if (!org) throw new LangfuseNotFoundError("Organization not found");
  return getOrganizationPlanServerSide(
    CloudConfigSchema.safeParse(org.cloudConfig).data,
  );
}

/** assertProjectRolesEntitled requires the rbac-project-roles entitlement to grant a project role other than NONE, except for Langfuse's own flows and platform admins. */
async function assertProjectRolesEntitled(
  tx: Prisma.TransactionClient,
  actor: Actor,
  role: Role | undefined,
) {
  if (role === undefined || role === Role.NONE) return;
  if (isSystem(actor) || isPlatformAdmin(actor)) return;
  const plan = await getOrgPlan(tx, actor.orgId);
  if (!hasEntitlementBasedOnPlan({ plan, entitlement: "rbac-project-roles" })) {
    throw new ForbiddenError(
      "Organization does not have the required entitlement to set project roles",
    );
  }
}

function isPlatformAdmin(actor: Actor) {
  const { principal } = actor.ctx;
  return principal.kind === "admin" && principal.userId !== null;
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
    inviter?: Inviter;
    to: string | null;
    orgId: string;
    userExists: boolean;
  },
) {
  const { inviter, to, orgId, userExists } = params;
  if (!inviter) return;
  const orgName = await getOrgName(tx, orgId);
  afterCommit(() =>
    sendInvitationEmail({ inviter, to, orgId, orgName, userExists }),
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

async function sendInvitationEmail(params: {
  inviter: Inviter;
  to: string | null;
  orgId: string;
  orgName: string;
  userExists: boolean;
}) {
  if (!params.to) return;
  await sendMembershipInvitationEmail({
    inviterEmail: params.inviter.email,
    inviterName: params.inviter.name,
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

/** removeOrgMembership authorizes, deletes and audits an org membership along with the project memberships that cascade with it. */
async function removeOrgMembership(
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

/** createOrgMembership adds a user who is not yet a member, within the seat limit. */
async function createOrgMembership(
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
  actor: Actor,
  params: { userId: string; role: Role },
): Promise<OrganizationMembership> {
  const { userId, role } = params;
  assertMayAddMember(actor, { role });
  const user = await findUserOrThrow(tx, userId);
  await assertSeatAvailable(tx, actor, actor.orgId);
  return insertOrgMembership(tx, afterCommit, actor, { user, role });
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
  tx: Prisma.TransactionClient,
  afterCommit: AfterCommit,
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

/** CreatedMembership reports what createMembership wrote: a membership, an invitation, or nothing for an ignored existing member. */
export type CreatedMembership = {
  outcome: "created" | "unchanged";
  orgMembership: OrganizationMembership | null;
  projectMembership: ProjectMembership | null;
  invitation: MembershipInvitation | null;
};

/** UpdatedMembership reports what updateMembership changed, with the row before and after. */
export type UpdatedMembership<T> = {
  outcome: "created" | "updated" | "unchanged";
  before: T | null;
  after: T;
};

/** Inviter names who added a member, for the invitation email and record. */
export type Inviter = { userId: string; name: string; email: string };

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
