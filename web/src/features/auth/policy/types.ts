import { type z } from "zod";

import {
  ForbiddenError,
  InternalServerError,
  LangfuseNotFoundError,
  projectScopes,
  ServiceUnavailableError,
  UnauthorizedError,
  type ApiKeyScope,
  type CloudConfigRateLimit,
  type Plan,
  type ProjectScope,
} from "@langfuse/shared";
import {
  type ResourceId,
  type RoleId,
  type TenantId,
} from "@langfuse/shared/rbac";
import {
  organizationScopes,
  type OrganizationScope,
} from "@/src/features/rbac/constants/organizationAccessRights";

/** allProjectActions is the full project action vocabulary. */
export const allProjectActions: ProjectAction[] = [...projectScopes];

/** allOrganizationActions is the full organization action vocabulary. */
export const allOrganizationActions: OrganizationAction[] = [
  ...organizationScopes,
];

/** organizationActionSet is allOrganizationActions indexed for membership tests. */
const organizationActionSet: ReadonlySet<string> = new Set(organizationScopes);

/** isOrgAction reports whether an action belongs to the disjoint org vocabulary. */
export const isOrgAction = (action: Action): action is OrganizationAction =>
  organizationActionSet.has(action);

/** Effect is whether a policy grants or denies its actions. */
export type Effect = "ALLOW" | "DENY";

/** ProjectAction is an action assignable to a project policy. */
export type ProjectAction = ProjectScope;

/** OrganizationAction is an action assignable to an organization policy. */
export type OrganizationAction = OrganizationScope;

/** Action is any checkable action. */
export type Action = ProjectAction | OrganizationAction;

/** PrincipalOrganization carries an org's static caps and its ingestion-suspension liveness state, enforced at the seam not the PDP. */
export type PrincipalOrganization = {
  orgId: string;
  organizationCreatedAt: string;
  plan: Plan;
  rateLimitOverrides: z.infer<typeof CloudConfigRateLimit>;
  projectIds: string[];
  isIngestionSuspended: boolean;
};

/** Principal is an authorized admin, user, or api key, discriminated on kind. */
export type Principal =
  | { kind: "admin"; userId: string | null }
  | { kind: "user"; userId: string; organizations: PrincipalOrganization[] }
  | {
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

/** SystemRolePolicy is a catalog policy before its resource is bound. */
export type SystemRolePolicy =
  | {
      resourceKind: "organization";
      actions: OrganizationAction[];
      effect: Effect;
    }
  | { resourceKind: "project"; actions: ProjectAction[]; effect: Effect };

/** Policy is a role's effect on a set of actions over tagged resources within one tenant. */
export type Policy = {
  id: string;
  tenantId: TenantId;
  roleId: RoleId;
  effect: Effect;
  actions: Action[];
  resources: ResourceId[];
};

/** AuthorizationContext is the PIP output and PDP input for one principal. */
export type AuthorizationContext = {
  principal: Principal;
  policies: Policy[];
};

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
