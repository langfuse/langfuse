import { type Role } from "@/src/features/rbac/constants/roles";

const scopes = [
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
export type Scope = (typeof scopes)[number];

export const roleAccessRights: Record<Role, Scope[]> = {
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
  VIEWER: ["projects:view", "organizationMembers:read"],
  NONE: [],
};
