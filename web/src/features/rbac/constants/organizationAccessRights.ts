import { type Role } from "@langfuse/shared/src/db";

const organizationScopes = [
  "projects:create",
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
    "projects:create",
    "projects:transfer_organization",
    "organizations:update",
    "organizations:delete",
    "organizationMembers:CUD",
    "organizationMembers:read",
  ],
  ADMIN: [
    "projects:create",
    "projects:transfer_organization",
    "organizations:update",
    "organizationMembers:CUD",
    "organizationMembers:read",
  ],
  MEMBER: ["organizationMembers:read"],
  VIEWER: [],
  NONE: [],
};
