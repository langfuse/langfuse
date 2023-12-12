import { type MembershipRole } from "@prisma/client";

const scopes = [
  "members:read",
  "members:create",
  "members:delete",

  "apiKeys:read",
  "apiKeys:create",
  "apiKeys:delete",

  "objects:publish",
  "objects:bookmark",

  "traces:delete",

  "scores:CUD",

  "project:delete",
  "project:update",
  "project:transfer",

  "datasets:CUD",
] as const;

// type string of all Resource:Action, e.g. "members:read"
export type Scope = (typeof scopes)[number];

export const roleAccessRights: Record<MembershipRole, Scope[]> = {
  OWNER: [
    "members:read",
    "members:create",
    "members:delete",
    "apiKeys:read",
    "apiKeys:create",
    "apiKeys:delete",
    "objects:publish",
    "objects:bookmark",
    "traces:delete",
    "scores:CUD",
    "project:delete",
    "project:update",
    "project:transfer",
    "datasets:CUD",
  ],
  ADMIN: [
    "project:update",
    "members:read",
    "members:create",
    "members:delete",
    "apiKeys:read",
    "apiKeys:create",
    "apiKeys:delete",
    "objects:publish",
    "objects:bookmark",
    "traces:delete",
    "scores:CUD",
    "datasets:CUD",
  ],
  MEMBER: [
    "members:read",
    "objects:publish",
    "objects:bookmark",
    "scores:CUD",
    "datasets:CUD",
  ],
  VIEWER: [],
};
