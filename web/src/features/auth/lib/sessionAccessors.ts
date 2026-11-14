import { type Session } from "next-auth";

import { type Role } from "@langfuse/shared";

import { type Flags } from "@/src/features/feature-flags/types";

/** hasSessionUser reports whether the session carries a signed-in user. */
export function hasSessionUser<T extends MaybeSession>(
  session: T,
): session is NonNullable<T> & AuthedSession {
  return Boolean(session?.user);
}

/** getSessionUserId is undefined when the session has not loaded or has no user. */
export function getSessionUserId(session: AuthedSession): string;
export function getSessionUserId(session: MaybeSession): string | undefined;
export function getSessionUserId(session: MaybeSession): string | undefined {
  return session?.user?.id;
}

/** getSessionUserEmail is null for users whose provider shares no email. */
export function getSessionUserEmail(session: MaybeSession) {
  return session?.user?.email;
}

/** getSessionUserName is null until the user or their provider sets a name. */
export function getSessionUserName(session: MaybeSession) {
  return session?.user?.name;
}

/** getSessionUserImage is the signed-in user's avatar url. */
export function getSessionUserImage(session: MaybeSession) {
  return session?.user?.image;
}

/** getSessionUserFeatureFlags is the signed-in user's resolved feature flags. */
export function getSessionUserFeatureFlags(session: AuthedSession): Flags;
export function getSessionUserFeatureFlags(
  session: MaybeSession,
): Flags | undefined;
export function getSessionUserFeatureFlags(
  session: MaybeSession,
): Flags | undefined {
  return session?.user?.featureFlags;
}

/** getSessionUserV4BetaEnabled reports whether the user reads through the v4 preview. */
export function getSessionUserV4BetaEnabled(session: MaybeSession) {
  return session?.user?.v4BetaEnabled;
}

/** getSessionUserCanToggleV4 reports whether the user may switch the v4 preview. */
export function getSessionUserCanToggleV4(session: MaybeSession) {
  return session?.user?.canToggleV4;
}

/** getSessionUserV4UpgradeUiAvailable reports whether the deployment shows the v4 migration UI. */
export function getSessionUserV4UpgradeUiAvailable(session: MaybeSession) {
  return session?.user?.v4UpgradeUiAvailable;
}

/** getSessionUserCanCreateOrganizations is false when the deployment restricts organization creation to listed users. */
export function getSessionUserCanCreateOrganizations(session: MaybeSession) {
  return session?.user?.canCreateOrganizations;
}

/** getSessionUserHasPassword is false for users who only sign in through SSO. */
export function getSessionUserHasPassword(session: MaybeSession) {
  return session?.user?.hasPassword;
}

/** getSessionEnvironment is the deployment's client-visible configuration. */
export function getSessionEnvironment(
  session: Pick<Session, "environment">,
): Session["environment"];
export function getSessionEnvironment(
  session: MaybeSession,
): Session["environment"] | undefined;
export function getSessionEnvironment(
  session: MaybeSession,
): Session["environment"] | undefined {
  return session?.environment;
}

/** getSessionOrganizations lists the organizations the user can open. */
export function getSessionOrganizations(
  session: MaybeSession,
): SessionOrganization[] {
  return session?.user?.organizations ?? [];
}

/** findSessionOrganization is undefined when the user cannot open orgId. */
export function findSessionOrganization(
  session: MaybeSession,
  orgId: string | undefined,
): SessionOrganization | undefined {
  return getSessionOrganizations(session).find((org) => org.id === orgId);
}

/** findSessionProject searches every organization and is undefined when the user cannot open projectId. */
export function findSessionProject(
  session: MaybeSession,
  projectId: string | undefined,
): SessionProject | undefined {
  return getSessionProjects(session).find(
    (project) => project.id === projectId,
  );
}

/** findSessionProjectOrganization is the user's organization that owns projectId. */
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

/** getSessionOrganizationRole is undefined when the user has no membership in orgId. */
export function getSessionOrganizationRole(
  session: MaybeSession,
  orgId: string | undefined,
): Role | undefined {
  return session?.user?.organizations.find((org) => org.id === orgId)?.role;
}

/** getSessionProjectRole is the user's effective role in projectId. */
export function getSessionProjectRole(
  session: MaybeSession,
  projectId: string | undefined,
): Role | undefined {
  return session?.user?.organizations
    .flatMap((org) => org.projects)
    .find((project) => project.id === projectId)?.role;
}

/** MaybeSession is a session, or the session part of a request context, that may not have loaded or may have no user. */
export type MaybeSession =
  | Partial<Pick<Session, "user" | "environment">>
  | null
  | undefined;

/** AuthedSession is a session whose user is known to be signed in. */
type AuthedSession = { user: NonNullable<Session["user"]> };

/** SessionUserOrganization is the session user's organization as stored on the session. */
type SessionUserOrganization = NonNullable<
  Session["user"]
>["organizations"][number];

/** SessionOrganization is an organization the user can open, without the user's role. */
export type SessionOrganization = Omit<
  SessionUserOrganization,
  "role" | "projects"
> & { projects: SessionProject[] };

/** SessionProject is a project the user can open, without the user's role. */
export type SessionProject = Omit<
  SessionUserOrganization["projects"][number],
  "role"
>;
