import { type Session } from "next-auth";
import { type z } from "zod";

import {
  ForbiddenError,
  InternalServerError,
  LangfuseNotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  type ApiKeyScope,
  type CloudConfigRateLimit,
  type Plan,
} from "@langfuse/shared";
import { OrganizationId } from "@langfuse/shared/rbac";

import { type Policy } from "@/src/features/rbac/types";

/** PrincipalOrganization carries an org's static caps and its ingestion-suspension liveness state, enforced at the seam not the PDP. */
export type PrincipalOrganization = {
  orgId: string;
  organizationCreatedAt: string;
  plan: Plan;
  rateLimitOverrides: z.infer<typeof CloudConfigRateLimit>;
  projectIds: string[];
  isIngestionSuspended: boolean;
  /** Absent on authz contexts cached before the field existed; no org could have opted in then. */
  accessAuditLogEnabled?: boolean;
};

/** Principal is an authorized admin, user, or api key, discriminated on kind. */
export type Principal = AdminPrincipal | UserPrincipal | ApiKeyPrincipal;

/** AdminPrincipal is the self-host admin key. */
type AdminPrincipal = { kind: "admin"; userId: string | null };

/** UserPrincipal is a signed-in user. */
type UserPrincipal = { kind: "user"; userId: string };

/** ApiKeyPrincipal is a project or organization api key. */
type ApiKeyPrincipal = {
  kind: "apiKey";
  apiKeyId: string;
  userId: string | null;
  isInAppAgentKey: boolean;
  publicKey: string;
  scope: ApiKeyScope;
  presentation: "publicKey" | "privateKey";
  organizations: PrincipalOrganization[];
  boundResource: BoundResource;
};

/** ProjectResource identifies a project by its globally-unique id. */
type ProjectResource = { projectId: string };

/** OrgResource identifies an org node. */
type OrgResource = { orgId: string };

/** Resource is the thing being checked: a bare project or an org node. */
export type Resource = ProjectResource | OrgResource;

/** BoundResource is what a credential is bound to: its organization, narrowed to one project when the credential is project-scoped. */
export type BoundResource = OrgResource & { projectId?: string };

/** AuthorizationContext is the PIP output and PDP input for one principal, carrying one policy set per principal it acts as. */
export type AuthorizationContext =
  | AdminAuthorizationContext
  | ApiKeyAuthorizationContext
  | UserAuthorizationContext;

/** AdminAuthorizationContext is the context of the self-host admin key. */
type AdminAuthorizationContext = {
  principal: AdminPrincipal;
  policies: Policy[][];
};

/** ApiKeyAuthorizationContext is the context of an api key. */
type ApiKeyAuthorizationContext = {
  principal: ApiKeyPrincipal;
  policies: Policy[][];
};

/** UserAuthorizationContext is the context of a signed-in session's user. */
type UserAuthorizationContext = {
  principal: UserPrincipal;
  user: NonNullable<Session["user"]>;
  policies: Policy[][];
};

/** isAdminContext narrows a context to the admin variant. */
export const isAdminContext = (
  ctx: AuthorizationContext,
): ctx is AdminAuthorizationContext => ctx.principal.kind === "admin";

/** isApiKeyContext narrows a context to the api-key variant. */
export const isApiKeyContext = (
  ctx: AuthorizationContext,
): ctx is ApiKeyAuthorizationContext => ctx.principal.kind === "apiKey";

/** toAuthorizationContext builds a session's user context, or null when the session has no user. */
export function toAuthorizationContext(
  session: Session | null,
): UserAuthorizationContext | null {
  if (!session?.user) return null;
  return {
    principal: { kind: "user", userId: session.user.id },
    user: session.user,
    policies: session.policies,
  };
}

/** getTenantForProject is the tenant owning projectId as the context sees it; admin policies sit in the wildcard tenant. */
export function getTenantForProject(
  ctx: AuthorizationContext,
  projectId: string,
): OrganizationId | undefined {
  if (isAdminContext(ctx)) return OrganizationId("*");
  if (isApiKeyContext(ctx)) return findApiKeyTenant(ctx.principal, projectId);
  return findUserTenant(ctx, projectId);
}

/** findApiKeyTenant is the key's organization listing projectId. */
function findApiKeyTenant(
  principal: ApiKeyPrincipal,
  projectId: string,
): OrganizationId | undefined {
  const org = principal.organizations.find((o) =>
    o.projectIds.includes(projectId),
  );
  return org && OrganizationId(org.orgId);
}

/** findUserTenant is the user's organization listing projectId. */
function findUserTenant(
  ctx: UserAuthorizationContext,
  projectId: string,
): OrganizationId | undefined {
  const org = ctx.user.organizations.find((o) =>
    o.projects.some((project) => project.id === projectId),
  );
  return org && OrganizationId(org.id);
}

/** Success is a successful outcome, disjoint from ErrorResult on `success`. */
export type Success = { success: true; error?: never };

/** ErrorResult is a failed outcome carrying the typed error. */
export type ErrorResult<E> = { success: false; error: E };

/** Decision is a PDP outcome: a boolean success, or a typed 403. */
export type Decision = Success | ErrorResult<ForbiddenError>;

/** unauthorizedError is a 401 ErrorResult carrying an optional message. */
export const unauthorizedError = (
  message?: string,
): ErrorResult<UnauthorizedError> => ({
  success: false,
  error: new UnauthorizedError(message),
});

/** forbiddenError is a 403 ErrorResult carrying an optional message. */
export const forbiddenError = (
  message?: string,
): ErrorResult<ForbiddenError> => ({
  success: false,
  error: new ForbiddenError(message),
});

/** notFoundError is a 404 ErrorResult carrying an optional message. */
export const notFoundError = (
  message?: string,
): ErrorResult<LangfuseNotFoundError> => ({
  success: false,
  error: new LangfuseNotFoundError(message),
});

/** internalServerError is a 500 ErrorResult carrying an optional message. */
export const internalServerError = (
  message?: string,
): ErrorResult<InternalServerError> => ({
  success: false,
  error: new InternalServerError(message),
});

/** serviceUnavailableError is a 503 ErrorResult carrying an optional message. */
export const serviceUnavailableError = (
  message?: string,
): ErrorResult<ServiceUnavailableError> => ({
  success: false,
  error: new ServiceUnavailableError(message),
});
