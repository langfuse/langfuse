import { type z } from "zod";

import {
  projectScopes,
  type CloudConfigRateLimit,
  type ForbiddenError,
  type Plan,
  type ProjectScope,
} from "@langfuse/shared";
import {
  organizationScopes,
  type OrganizationScope,
} from "@/src/features/rbac/constants/organizationAccessRights";

/** wildcard matches any resource in a policy. */
export const wildcard = "*" as const;

/** allProjectActions is the full project action vocabulary. */
export const allProjectActions: ProjectAction[] = [...projectScopes];

/** allOrganizationActions is the full organization action vocabulary. */
export const allOrganizationActions: OrganizationAction[] = [
  ...organizationScopes,
];

/** Wildcard is the type of the wildcard resource matcher literal. */
export type Wildcard = typeof wildcard;

/** ProjectAction is an action assignable to a project policy. */
export type ProjectAction = ProjectScope;

/** OrganizationAction is an action assignable to an organization policy. */
export type OrganizationAction = OrganizationScope;

/** Action is any checkable action. */
export type Action = ProjectAction | OrganizationAction;

/** PrincipalOrganization carries an org's static caps and its ingestion-suspension liveness state, enforced at the seam not the PDP. */
export type PrincipalOrganization = {
  orgId: string;
  plan: Plan;
  rateLimitConfig: z.infer<typeof CloudConfigRateLimit>;
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
      organizations: PrincipalOrganization[];
      boundResource?: Resource;
    };

/** Source describes where a policy came from: a role or an explicit grant. */
export type Source = { kind: "role"; id: string } | { kind: "grant" };

/** ProjectResource identifies a project by its globally-unique id. */
export type ProjectResource = { projectId: string };

/** OrgResource identifies an org node. */
export type OrgResource = { orgId: string };

/** Resource is the thing being checked: a bare project or an org node. */
export type Resource = ProjectResource | OrgResource;

/** BasePolicy carries the origin and effect every policy shares. */
export type BasePolicy = {
  source: Source;
  effect: "allow" | "deny";
};

/** OrganizationSystemPolicy is a resource-less org-level policy. */
export type OrganizationSystemPolicy = BasePolicy & {
  kind: "organization";
  actions: OrganizationAction[];
};

/** ProjectSystemPolicy is a resource-less project-level policy. */
export type ProjectSystemPolicy = BasePolicy & {
  kind: "project";
  actions: ProjectAction[];
};

/** SystemPolicy is a policy before its resource is bound. */
export type SystemPolicy = OrganizationSystemPolicy | ProjectSystemPolicy;

/** Policy is a SystemPolicy bound to the flat ids its kind targets, or the wildcard. */
export type Policy = SystemPolicy & { resources: string[] | Wildcard };

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
