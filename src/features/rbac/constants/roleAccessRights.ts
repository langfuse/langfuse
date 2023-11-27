import { type MembershipRole } from "@prisma/client";

const scopes = [
  "members:read",
  "members:create",
  "members:delete",

  "apiKeys:read",
  "apiKeys:create",
  "apiKeys:delete",

  "traces:publish",
  "traces:bookmark",
  "traces:delete",

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
    "traces:bookmark",
    "traces:delete",
    "scores:CUD",
    "project:delete",
    "project:transfer",
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
    "traces:bookmark",
    "traces:delete",
    "scores:CUD",
    "datasets:CUD",
  ],
  MEMBER: [
    "members:read",
    "traces:publish",
    "traces:bookmark",
    "scores:CUD",
    "datasets:CUD",
  ],
  VIEWER: [],
};
