import {
  CloudConfigSchema,
  ForbiddenError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { OrganizationId, ProjectId } from "@langfuse/shared/rbac";
import {
  type Prisma,
  Role,
  type OrganizationMembership,
  type ProjectMembership,
} from "@langfuse/shared/src/db";
import { sendMembershipInvitationEmail } from "@langfuse/shared/src/server";
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
import {
  afterCommit,
  type MembershipTransaction,
} from "./membershipTransaction";

const systemActorUserIds: Record<SystemReason, string> = {
  bootstrap: "system:bootstrap",
  signupDefaults: "system:signup-defaults",
};

/** addOrgMember inserts an org membership within the seat limit and emails the user when someone invited them. */
export async function addOrgMember(
  tx: MembershipTransaction,
  actor: Actor,
  params: {
    user: { id: string; email: string | null };
    role: Role;
    invitedByUserId?: string;
  },
): Promise<OrganizationMembership> {
  const { user, role, invitedByUserId } = params;
  await assertSeatAvailable(tx, actor, actor.orgId);
  const orgMembership = await insertOrgMembership(tx, actor, { user, role });
  if (invitedByUserId) {
    await queueInvitationEmail(tx, {
      invitedByUserId,
      to: user.email,
      orgId: actor.orgId,
      userExists: true,
    });
  }
  return orgMembership;
}

/** findVisibleProjectOrgId resolves a live project's org, hiding projects of orgs the caller does not belong to. */
export async function findVisibleProjectOrgId(
  tx: Prisma.TransactionClient,
  ctx: AuthorizationContext,
  projectId: string,
): Promise<string> {
  const project = await tx.project.findFirst({
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

/** loadActor reads a session caller's own org role for the audit rows. */
export async function loadActor(
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

/** assertMayManageOrgMember authorizes an org role change from `from` to `to`, where absent means no membership. */
export function assertMayManageOrgMember(
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

export function mayManageOrgMembers(actor: Actor) {
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
export function assertMayManageProjectMember(
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

export function mayManageProjectMembers(actor: Actor, projectId: string) {
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

/** assertProjectInOrg rejects a project that is deleted or belongs to another organization. */
export async function assertProjectInOrg(
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

export async function findUserOrThrow(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) throw new LangfuseNotFoundError("User not found");
  return user;
}

export function findOrgMembership(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
) {
  return tx.organizationMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
}

export function findProjectMembership(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
) {
  return tx.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

/** assertSeatAvailable enforces the plan's seat limit over members and pending invitations, except for Langfuse's own flows. */
export async function assertSeatAvailable(
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
export async function assertProjectRolesEntitled(
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
  tx: MembershipTransaction,
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
  syncToSfdc(tx, actor, () =>
    sfdcSetUserRole({ orgId, userId: user.id, email: user.email, role }),
  );
  return created;
}

/** auditActor derives the audit actor from the principal. */
export function auditActor(actor: Actor, projectId?: string): AuditLogActor {
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
export function syncToSfdc(
  tx: MembershipTransaction,
  actor: Actor,
  sync: () => Promise<void>,
) {
  if (!isSystem(actor)) afterCommit(tx, sync);
}

export async function sfdcSetUserRole(params: {
  orgId: string;
  userId: string;
  email: string | null;
  role: Role;
}) {
  await getSfdcService()?.setUserRole(params);
}

/** upsertProjectMembership writes and audits a project role for an org member. */
export async function upsertProjectMembership(
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

/** queueInvitationEmail queues the invitee's email from the inviting user after commit. */
export async function queueInvitationEmail(
  tx: MembershipTransaction,
  params: {
    invitedByUserId: string;
    to: string | null;
    orgId: string;
    userExists: boolean;
  },
) {
  const { to, orgId, userExists } = params;
  const inviter = await tx.user.findUnique({
    where: { id: params.invitedByUserId },
    select: { name: true, email: true },
  });
  if (!inviter) throw new LangfuseNotFoundError("Inviting user not found");
  const orgName = await getOrgName(tx, orgId);
  afterCommit(tx, () =>
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
  inviter: { name: string | null; email: string | null };
  to: string | null;
  orgId: string;
  orgName: string;
  userExists: boolean;
}) {
  if (!params.to) return;
  await sendMembershipInvitationEmail({
    inviterEmail: params.inviter.email ?? "",
    inviterName: params.inviter.name ?? "",
    to: params.to,
    orgName: params.orgName,
    orgId: params.orgId,
    userExists: params.userExists,
    env,
  });
}

/** UpdatedMembership reports what updateMembership changed, with the row before and after. */
export type UpdatedMembership<T> = {
  outcome: "created" | "updated" | "unchanged";
  before: T | null;
  after: T;
};

/** ProjectGrant is a project role granted with an invitation. */
export type ProjectGrant = { projectId: string; role: Role };

/** Actor is the caller of one membership change within one org. */
export type Actor = {
  ctx: AuthorizationContext;
  orgId: string;
  /** orgRole is a session caller's own org role, OWNER for platform admins. */
  orgRole?: Role;
};
