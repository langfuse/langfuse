import { type MembershipRole } from "@prisma/client";

const scopes = [
  "members:read",
  "members:create",
  "members:delete",

  "apiKeys:read",
  "apiKeys:create",
  "apiKeys:delete",

  "traces:publish",

  "scores:CUD",

  "project:delete",

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
    "traces:publish",
    "scores:CUD",
    "project:delete",
    "datasets:CUD",
  ],
  ADMIN: [
    "members:read",
    "members:create",
    "members:delete",
    "apiKeys:read",
    "apiKeys:create",
    "apiKeys:delete",
    "traces:publish",
    "scores:CUD",
    "project:delete",
  ],
  MEMBER: ["members:read", "traces:publish", "scores:CUD", "datasets:CUD"],
  VIEWER: [],
};
