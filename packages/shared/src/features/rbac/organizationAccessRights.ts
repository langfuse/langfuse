import { type Role } from "../../db";

export const organizationScopes = [
  "projects:read",
  "projects:create",
  "projects:transfer_org",
  "organization:CRUD_apiKeys",
  "organization:update",
  "organization:delete",
  "gateway:manage",
  "gateway:invoke",
  "organizationMembers:read",
  "organizationMembers:CUD",
  "organizationMembers:manageOwnership",
  "langfuseCloudBilling:CRUD",
  "organizationUsage:read",
  "orgAuditLogs:read",
] as const;

// type string of all Resource:Action, e.g. "organizationMembers:read"
export type OrganizationScope = (typeof organizationScopes)[number];

export const organizationRoleAccessRights: Record<Role, OrganizationScope[]> = {
  OWNER: [
    "projects:create",
    "projects:transfer_org",
    "organization:CRUD_apiKeys",
    "organization:update",
    "organization:delete",
    "gateway:manage",
    "gateway:invoke",
    "organizationMembers:CUD",
    "organizationMembers:manageOwnership",
    "organizationMembers:read",
    "langfuseCloudBilling:CRUD",
    "organizationUsage:read",
    "orgAuditLogs:read",
    // used for api keys
    "projects:read",
  ],
  ADMIN: [
    "projects:create",
    "projects:transfer_org",
    "organization:update",
    "gateway:manage",
    "gateway:invoke",
    "organizationMembers:CUD",
    "organizationMembers:read",
    "organizationUsage:read",
    "orgAuditLogs:read",
    // used for api keys
    "projects:read",
  ],
  MEMBER: ["gateway:invoke", "organizationMembers:read"],
  VIEWER: [],
  NONE: [],
};

export const orgNoneRoleComment =
  "No access to organization resources by default. User needs to be granted project-level access via project roles.";
