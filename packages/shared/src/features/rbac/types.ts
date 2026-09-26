import { type SystemRole } from "../../db";

/** UserId is a user principal, tagged for disjoint principal ids. */
export type UserId = `user/${string}`;
export const UserId = (id: string): UserId => `user/${id}`;

/** ApiKeyId is an api-key principal, tagged for disjoint principal ids. */
export type ApiKeyId = `apiKey/${string}`;
export const ApiKeyId = (id: string): ApiKeyId => `apiKey/${id}`;

/** OrganizationId is an organization resource/owner/tenant, tagged. */
export type OrganizationId = `organization/${string}`;
export const OrganizationId = (id: string): OrganizationId =>
  `organization/${id}`;

/** ProjectId is a project resource/owner, tagged. */
export type ProjectId = `project/${string}`;
export const ProjectId = (id: string): ProjectId => `project/${id}`;

/** SystemRoleId is an in-code role, tagged by its `SystemRole` enum member. */
export type SystemRoleId = `system/${SystemRole}`;
export const SystemRoleId = (role: SystemRole): SystemRoleId =>
  `system/${role}`;

/** CustomRoleId is a DB-stored role, tagged; custom-role storage is a later ticket. */
export type CustomRoleId = `custom/${string}`;
export const CustomRoleId = (id: string): CustomRoleId => `custom/${id}`;

/** PrincipalId is who a role is assigned to. */
export type PrincipalId = UserId | ApiKeyId;

/** ResourceId is a thing access is checked against. */
export type ResourceId = OrganizationId | ProjectId;

/** OwnerId is the node a role assignment hangs off. */
export type OwnerId = OrganizationId | ProjectId;

/** TenantId scopes roles and assignments to one organization. */
export type TenantId = OrganizationId;

/** RoleId is either an in-code system role or a DB-stored custom role. */
export type RoleId = SystemRoleId | CustomRoleId;

/** untag strips the leading `kind/` prefix from a tagged id. */
export const untag = (tagged: `${string}/${string}`): string =>
  tagged.slice(tagged.indexOf("/") + 1);

/** hasProjectKind narrows an owner/resource id to a project. */
export const hasProjectKind = (id: OwnerId | ResourceId): id is ProjectId =>
  id.startsWith("project/");

/** hasOrganizationKind narrows an owner/resource id to an organization. */
export const hasOrganizationKind = (
  id: OwnerId | ResourceId,
): id is OrganizationId => id.startsWith("organization/");

/** hasSystemRoleKind narrows a role id to an in-code system role. */
export const hasSystemRoleKind = (id: RoleId): id is SystemRoleId =>
  id.startsWith("system/");

/** toSystemRole maps a system role id to its `SystemRole` enum member. */
export const toSystemRole = (id: SystemRoleId): SystemRole =>
  untag(id) as SystemRole;

/** RoleAssignment binds a role to a principal on an owner within a tenant. */
export type RoleAssignment = {
  id: string;
  tenantId: TenantId;
  ownerId: OwnerId;
  roleId: RoleId;
  principalId: PrincipalId;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};
