import { type OrganizationRole } from "@langfuse/shared";

const scopes = [
  "projects:view",
  "projects:create",
  "projects:update",
  "projects:delete",
  "projects:transfer_organization",
  "organizations:update",
  "organizations:delete",
  "members:read",
  "members:CUD",
] as const;

// type string of all Resource:Action, e.g. "members:read"
export type Scope = (typeof scopes)[number];

export const roleAccessRights: Record<OrganizationRole, Scope[]> = {
  OWNER: [
    "projects:view",
    "projects:create",
    "projects:update",
    "projects:delete",
    "projects:transfer_organization",
    "organizations:update",
    "organizations:delete",
    "members:CUD",
    "members:read",
  ],
  ADMIN: [
    "projects:view",
    "projects:create",
    "projects:update",
    "projects:delete",
    "projects:transfer_organization",
    "organizations:update",
    "members:CUD",
    "members:read",
  ],
  MEMBER: ["projects:view", "members:read"],
  VIEWER: ["projects:view", "members:read"],
  NONE: [],
};
