import { type ProjectRole } from "@langfuse/shared";

const scopes = [
  "apiKeys:read",
  "apiKeys:create",
  "apiKeys:delete",

  "objects:publish",
  "objects:bookmark",
  "objects:tag",

  "traces:delete",

  "scores:CUD",

  "scoreConfigs:CUD",
  "scoreConfigs:read",

  "project:update",
  "integrations:CRUD",

  "datasets:CUD",

  "prompts:CUD",
  "prompts:read",

  "models:CUD",

  "batchExport:create",

  "evalTemplate:create",
  "evalTemplate:read",
  "evalJob:read",
  "evalJob:CUD",
  "evalJobExecution:read",

  "llmApiKeys:read",
  "llmApiKeys:create",
  "llmApiKeys:delete",
] as const;

// type string of all Resource:Action, e.g. "members:read"
export type Scope = (typeof scopes)[number];

export const roleAccessRights: Record<ProjectRole, Scope[]> = {
  OWNER: [
    "apiKeys:read",
    "apiKeys:create",
    "apiKeys:delete",
    "integrations:CRUD",
    "objects:publish",
    "objects:bookmark",
    "objects:tag",
    "traces:delete",
    "scores:CUD",
    "scoreConfigs:CUD",
    "scoreConfigs:read",
    "project:update",
    "datasets:CUD",
    "prompts:CUD",
    "prompts:read",
    "models:CUD",
    "evalTemplate:create",
    "evalTemplate:read",
    "evalJob:CUD",
    "evalJob:read",
    "evalJobExecution:read",
    "llmApiKeys:read",
    "llmApiKeys:create",
    "llmApiKeys:delete",
    "batchExport:create",
  ],
  ADMIN: [
    "project:update",
    "apiKeys:read",
    "apiKeys:create",
    "apiKeys:delete",
    "integrations:CRUD",
    "objects:publish",
    "objects:bookmark",
    "objects:tag",
    "traces:delete",
    "scores:CUD",
    "scoreConfigs:CUD",
    "scoreConfigs:read",
    "datasets:CUD",
    "prompts:CUD",
    "prompts:read",
    "models:CUD",
    "evalTemplate:create",
    "evalTemplate:read",
    "evalJob:CUD",
    "evalJob:read",
    "evalJobExecution:read",
    "llmApiKeys:read",
    "llmApiKeys:create",
    "llmApiKeys:delete",
    "batchExport:create",
  ],
  MEMBER: [
    "apiKeys:read",
    "objects:publish",
    "objects:bookmark",
    "objects:tag",
    "scores:CUD",
    "scoreConfigs:CUD",
    "scoreConfigs:read",
    "datasets:CUD",
    "prompts:CUD",
    "prompts:read",
    "evalTemplate:create",
    "evalTemplate:read",
    "evalJob:read",
    "evalJob:CUD",
    "evalJobExecution:read",
    "llmApiKeys:read",
    "batchExport:create",
  ],
  VIEWER: [
    "prompts:read",
    "evalTemplate:read",
    "scoreConfigs:read",
    "evalJob:read",
    "evalJobExecution:read",
    "llmApiKeys:read",
  ],
};
