import { type Role } from "@langfuse/shared/src/db";

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
  "langfuseCloudBilling:CRUD",
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
    "organizationMembers:read",
    "langfuseCloudBilling:CRUD",
    "orgAuditLogs:read",
  ],
  ADMIN: [
    "projects:create",
    "projects:transfer_org",
    "organization:update",
    "gateway:manage",
    "gateway:invoke",
    "organizationMembers:CUD",
    "organizationMembers:read",
    "orgAuditLogs:read",
  ],
  MEMBER: ["gateway:invoke", "organizationMembers:read"],
  VIEWER: [],
  NONE: [],
};

export const orgNoneRoleComment =
  "No access to organization resources by default. User needs to be granted project-level access via project roles.";
