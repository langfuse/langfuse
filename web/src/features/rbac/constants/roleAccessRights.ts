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

  "evalsTemplate:create",
  "evalsTemplate:read",
  "evalsConfig:create",
  "evalsConfig:read",
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
    "evalsTemplate:create",
    "evalsTemplate:read",
    "evalsConfig:create",
    "evalsConfig:read",
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
    "evalsTemplate:create",
    "evalsTemplate:read",
    "evalsConfig:create",
    "evalsConfig:read",
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
    "evalsTemplate:create",
    "evalsTemplate:read",
    "evalsConfig:read",
  ],
  VIEWER: ["prompts:read"],
};
