import { type Session } from "next-auth";

import { type Role } from "@langfuse/shared";
import {
  hasSystemRoleKind,
  organizationRoleAccessRights,
  OrganizationId,
  ProjectId,
  toSystemRole,
  type ResourceId,
  type RoleId,
} from "@langfuse/shared/rbac";

import {
  type SessionOrganization,
  type SessionProject,
} from "@/src/features/auth/lib/sessionAccessors";
import {
  type PrincipalOrganization,
  type PrincipalProject,
  type PrincipalUser,
} from "@/src/features/auth/policy/types";
import { type Flags } from "@/src/features/feature-flags/types";
import { rolesFor } from "./rolesFor";
import { type PolicySession } from "./sessionCallback";

export function hasSessionUser(session: MaybeSession): boolean {
  return Boolean(getPrincipalUser(session));
}

export function getSessionUserId(session: MaybeSession): string | undefined {
  return getPrincipalUser(session)?.id;
}

export function getSessionUserEmail(session: MaybeSession) {
  return getPrincipalUser(session)?.email;
}

export function getSessionUserName(session: MaybeSession) {
  return getPrincipalUser(session)?.name;
}

/** getSessionUserImage is the signed-in user's avatar url. */
export function getSessionUserImage(session: MaybeSession) {
  return getPrincipalUser(session)?.image;
}

/** getSessionUserFeatureFlags is the signed-in user's resolved feature flags. */
export function getSessionUserFeatureFlags(
  session: MaybeSession,
): Flags | undefined {
  return getPrincipalUser(session)?.featureFlags;
}

/** getSessionUserV4BetaEnabled reports whether the user reads through the v4 preview. */
export function getSessionUserV4BetaEnabled(session: MaybeSession) {
  return getPrincipalUser(session)?.v4BetaEnabled;
}

/** getSessionUserCanToggleV4 reports whether the user may switch the v4 preview. */
export function getSessionUserCanToggleV4(session: MaybeSession) {
  return getPrincipalUser(session)?.canToggleV4;
}

/** getSessionUserV4UpgradeUiAvailable reports whether the deployment shows the v4 migration UI. */
export function getSessionUserV4UpgradeUiAvailable(session: MaybeSession) {
  return getPrincipalUser(session)?.v4UpgradeUiAvailable;
}

export function getSessionUserCanCreateOrganizations(session: MaybeSession) {
  return getPrincipalUser(session)?.canCreateOrganizations;
}

export function getSessionUserHasPassword(session: MaybeSession) {
  return getPrincipalUser(session)?.hasPassword;
}

/** getSessionEnvironment is the deployment's client-visible configuration. */
export function getSessionEnvironment(
  session: MaybeSession,
): Session["environment"] | undefined {
  return session?.environment;
}

/** getSessionOrganizations lists the organizations the user can open. */
export function getSessionOrganizations(
  session: MaybeSession,
): SessionOrganization[] {
  return getPrincipalOrganizations(session).map(toSessionOrganization);
}

export function findSessionOrganization(
  session: MaybeSession,
  orgId: string | undefined,
): SessionOrganization | undefined {
  return getSessionOrganizations(session).find((org) => org.id === orgId);
}

export function findSessionProject(
  session: MaybeSession,
  projectId: string | undefined,
): SessionProject | undefined {
  return getSessionProjects(session).find(
    (project) => project.id === projectId,
  );
}

export function findSessionProjectOrganization(
  session: MaybeSession,
  projectId: string | undefined,
): SessionOrganization | undefined {
  return getSessionOrganizations(session).find((org) =>
    org.projects.some((project) => project.id === projectId),
  );
}

/** getSessionProjects lists the projects the user can open across organizations. */
export function getSessionProjects(session: MaybeSession): SessionProject[] {
  return getSessionOrganizations(session).flatMap((org) => org.projects);
}

export function getSessionOrganizationRole(
  session: MaybeSession,
  orgId: string | undefined,
): Role | undefined {
  const org = findPrincipalOrganization(session, orgId);
  if (!org) return undefined;
  return roleOn(session, org, OrganizationId(org.id));
}

/** getSessionProjectRole is the user's effective role in projectId. */
export function getSessionProjectRole(
  session: MaybeSession,
  projectId: string | undefined,
): Role | undefined {
  const org = findPrincipalProjectOrganization(session, projectId);
  if (!org || !projectId) return undefined;
  return roleOn(session, org, ProjectId(projectId));
}

/** findPrincipalProjectOrganization is the user's organization that lists projectId among its live projects. */
export function findPrincipalProjectOrganization(
  session: MaybeSession,
  projectId: string | undefined,
): PrincipalOrganization | undefined {
  return getPrincipalOrganizations(session).find((org) =>
    org.projects.some((project) => project.id === projectId),
  );
}

/** getPrincipalUser is the signed-in user the session's context resolved to. */
export function getPrincipalUser(
  session: MaybeSession,
): PrincipalUser | undefined {
  const principal = session?.authCtx?.principal;
  if (principal?.kind !== "user") return undefined;
  return principal.user;
}

/** getPrincipalOrganizations lists the organizations the session's context reaches. */
function getPrincipalOrganizations(
  session: MaybeSession,
): PrincipalOrganization[] {
  const principal = session?.authCtx?.principal;
  if (principal?.kind !== "user") return [];
  return principal.organizations;
}

function findPrincipalOrganization(
  session: MaybeSession,
  orgId: string | undefined,
): PrincipalOrganization | undefined {
  return getPrincipalOrganizations(session).find((org) => org.id === orgId);
}

/** roleOn is the user's first membership role governing resource in org. */
function roleOn(
  session: MaybeSession,
  org: PrincipalOrganization,
  resource: ResourceId,
): Role | undefined {
  if (!session?.authCtx) return undefined;
  return rolesFor(session.authCtx, OrganizationId(org.id), resource)
    .map(toMembershipRole)
    .find((role) => role !== undefined);
}

/** toMembershipRole maps a role id onto the membership role it names, if any. */
function toMembershipRole(roleId: RoleId): Role | undefined {
  if (!hasSystemRoleKind(roleId)) return undefined;
  const role = toSystemRole(roleId);
  if (!(role in organizationRoleAccessRights)) return undefined;
  return role as Role;
}

/** toSessionOrganization reads a principal org in the session organization shape. */
function toSessionOrganization(
  org: PrincipalOrganization,
): SessionOrganization {
  return {
    id: org.id,
    name: org.name,
    supportAccess: org.supportAccess,
    cloudConfig: org.cloudConfig,
    plan: org.plan,
    metadata: org.metadata,
    aiFeaturesEnabled: org.aiFeaturesEnabled,
    aiTelemetryEnabled: org.aiTelemetryEnabled,
    accessAuditLogEnabled: org.accessAuditLogEnabled,
    featureFlags: org.featureFlagDefaults,
    projects: org.projects.map(toSessionProject),
  };
}

/** toSessionProject reads a principal project in the session project shape. */
function toSessionProject(project: PrincipalProject): SessionProject {
  return {
    id: project.id,
    name: project.name,
    deletedAt: null,
    retentionDays: project.retentionDays,
    hasTraces: project.hasTraces,
    topicsEnabled: project.topicsEnabled,
    scoreEditsDisabled: project.scoreEditsDisabled,
    forceV3Experience: project.forceV3Experience,
    metadata: project.metadata,
    createdAt: project.createdAt,
  };
}

/** MaybeSession is a policy-engine session that may not have loaded or may have no user. */
export type MaybeSession = Partial<PolicySession> | null | undefined;
