import { type MembershipRole } from "@prisma/client";

const scopes = [
  "members:read",
  "members:create",
  "members:delete",

  "apiKeys:read",
  "apiKeys:create",
  "apiKeys:delete",

  "traces:publish",
  "traces:delete",
  "traces:bookmark",

  "scores:CUD",

  "project:delete",
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
    "traces:publish",
    "traces:delete",
    "scores:CUD",
    "project:delete",
    "project:transfer",
    "datasets:CUD",
    "traces:bookmark",
  ],
  ADMIN: [
    "members:read",
    "members:create",
    "members:delete",
    "apiKeys:read",
    "apiKeys:create",
    "apiKeys:delete",
    "traces:publish",
    "traces:delete",
    "scores:CUD",
    "datasets:CUD",
    "traces:bookmark",
  ],
  MEMBER: ["members:read", "traces:publish", "scores:CUD", "datasets:CUD", "traces:bookmark"],
  VIEWER: [],
};
