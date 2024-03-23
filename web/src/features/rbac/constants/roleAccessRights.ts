import { type MembershipRole } from "@langfuse/shared/src/db";

const scopes = [
  "members:read",
  "members:create",
  "members:delete",

  "apiKeys:read",
  "apiKeys:create",
  "apiKeys:delete",

  "objects:publish",
  "objects:bookmark",
  "objects:tag",

  "traces:delete",

  "scores:CUD",

  "project:delete",
  "project:update",
  "project:transfer",

  "datasets:CUD",

  "prompts:CUD",
  "prompts:read",

  "models:CUD",
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
    "objects:tag",
    "traces:delete",
    "scores:CUD",
    "project:delete",
    "project:update",
    "project:transfer",
    "datasets:CUD",
    "prompts:CUD",
    "prompts:read",
    "models:CUD",
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
    "objects:tag",
    "traces:delete",
    "scores:CUD",
    "datasets:CUD",
    "prompts:CUD",
    "prompts:read",
    "models:CUD",
  ],
  MEMBER: [
    "members:read",
    "objects:publish",
    "objects:bookmark",
    "objects:tag",
    "scores:CUD",
    "datasets:CUD",
    "prompts:CUD",
    "prompts:read",
  ],
  VIEWER: ["prompts:read"],
};
