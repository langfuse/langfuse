import { type Role } from "../../db";

export const organizationScopes = [
  "organizationSettings:read",
  "projects:read",
  "projects:create",
  "projects:transfer_org",
  "organization:CRUD_apiKeys",
  "organization:update",
  "organization:delete",
  "organizationLlmApiKeys:read",
  "organizationLlmApiKeys:CUD",
  "gateway:read",
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
    "organizationSettings:read",
    "projects:create",
    "projects:transfer_org",
    "organization:CRUD_apiKeys",
    "organization:update",
    "organization:delete",
    "organizationLlmApiKeys:read",
    "organizationLlmApiKeys:CUD",
    "gateway:read",
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
    "organizationSettings:read",
    "projects:create",
    "projects:transfer_org",
    "organization:update",
    "organizationLlmApiKeys:read",
    "organizationLlmApiKeys:CUD",
    "gateway:read",
    "gateway:manage",
    "gateway:invoke",
    "organizationMembers:CUD",
    "organizationMembers:read",
    "organizationUsage:read",
    "orgAuditLogs:read",
    // used for api keys
    "projects:read",
  ],
  MEMBER: [
    "organizationSettings:read",
    "gateway:read",
    "gateway:invoke",
    "organizationMembers:read",
  ],
  VIEWER: ["organizationSettings:read", "gateway:read"],
  NONE: ["organizationSettings:read"],
  AI_GATEWAY: ["gateway:read", "gateway:invoke"],
};

export const orgNoneRoleComment =
  "No access to organization resources by default. User needs to be granted project-level access via project roles.";
