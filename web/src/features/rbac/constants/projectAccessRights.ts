import { type Role } from "@langfuse/shared/src/db";

const projectScopes = [
  "projectMembers:read",
  "projectMembers:CUD",
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

  "project:read",
  "project:update",
  "project:delete",

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
export type ProjectScope = (typeof projectScopes)[number];

export const projectRoleAccessRights: Record<Role, ProjectScope[]> = {
  OWNER: [
    "project:read",
    "project:update",
    "project:delete",
    "projectMembers:read",
    "projectMembers:CUD",
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
  ADMIN: [
    "project:read",
    "project:update",
    "projectMembers:read",
    "projectMembers:CUD",
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
    "project:read",
    "projectMembers:read",
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
    "project:read",
    "prompts:read",
    "evalTemplate:read",
    "scoreConfigs:read",
    "evalJob:read",
    "evalJobExecution:read",
    "llmApiKeys:read",
  ],
  NONE: [],
};

export const projectNoneRoleComment =
  "Do not override the organization role for this project.";
