import { type Role } from "@langfuse/shared/src/db";

const organizationScopes = [
  "projects:view", // todo: unused scope
  "projects:create",
  "projects:update",
  "projects:delete",
  "projects:transfer_organization",
  "organizations:update",
  "organizations:delete",
  "organizationMembers:read",
  "organizationMembers:CUD",
] as const;

// type string of all Resource:Action, e.g. "organizationMembers:read"
export type OrganizationScope = (typeof organizationScopes)[number];

export const organizationRoleAccessRights: Record<Role, OrganizationScope[]> = {
  OWNER: [
    "projects:view",
    "projects:create",
    "projects:update",
    "projects:delete",
    "projects:transfer_organization",
    "organizations:update",
    "organizations:delete",
    "organizationMembers:CUD",
    "organizationMembers:read",
  ],
  ADMIN: [
    "projects:view",
    "projects:create",
    "projects:update",
    "projects:delete",
    "projects:transfer_organization",
    "organizations:update",
    "organizationMembers:CUD",
    "organizationMembers:read",
  ],
  MEMBER: ["projects:view", "organizationMembers:read"],
  VIEWER: ["projects:view"],
  NONE: [],
};
