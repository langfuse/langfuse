import { type MembershipRole } from "@prisma/client";

const scopes = [
  "members:read",
  "members:create",
  "members:delete",

  "apiKeys:read",
  "apiKeys:create",
  "apiKeys:delete",

  "llmApiKeys:CUD",
  "llmApiKeys:read",

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

  "playground:CUD",
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
    "llmApiKeys:CUD",
    "llmApiKeys:read",
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
    "playground:CUD",
  ],
  ADMIN: [
    "project:update",
    "members:read",
    "members:create",
    "members:delete",
    "apiKeys:read",
    "apiKeys:create",
    "apiKeys:delete",
    "llmApiKeys:CUD",
    "llmApiKeys:read",
    "objects:publish",
    "objects:bookmark",
    "objects:tag",
    "traces:delete",
    "scores:CUD",
    "datasets:CUD",
    "prompts:CUD",
    "prompts:read",
    "playground:CUD",
  ],
  MEMBER: [
    "members:read",
    "llmApiKeys:read",
    "objects:publish",
    "objects:bookmark",
    "objects:tag",
    "scores:CUD",
    "datasets:CUD",
    "prompts:CUD",
    "prompts:read",
    "playground:CUD",
  ],
  VIEWER: ["prompts:read"],
};
