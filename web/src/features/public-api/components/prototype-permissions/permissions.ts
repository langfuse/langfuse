// PROTOTYPE — throwaway. Permission catalog for the API-key permission-view
// variants, built from the real RBAC scope constants. Compound scopes are
// normalized for display: CRUD -> read + write, CUD -> write; standalone
// create/update/delete/publish/... stay as-is. Ingestion + gateway scopes the
// API-key presets need are added on top since member RBAC does not model them.
// Kept local so the sibling create-form prototype's catalog is untouched.

import { projectScopes } from "@langfuse/shared";

import { organizationRoleAccessRights } from "@/src/features/rbac/constants/organizationAccessRights";
import { type PresetKey } from "../prototype/permissionCatalog";

const resourceLabels: Record<string, string> = {
  projects: "Project management",
  organization: "Organization",
  organizationMembers: "Organization members",
  langfuseCloudBilling: "Billing",
  auditLogs: "Audit logs",
  projectMembers: "Project members",
  apiKeys: "API keys",
  objects: "Objects",
  traces: "Traces",
  media: "Media",
  scores: "Scores",
  scoreConfigs: "Score configs",
  annotationQueues: "Annotation queues",
  annotationQueueAssignments: "Annotation queue assignments",
  project: "Project",
  integrations: "Integrations",
  datasets: "Datasets",
  prompts: "Prompts",
  promptProtectedLabels: "Prompt protected labels",
  dashboards: "Dashboards",
  models: "Models",
  batchExports: "Batch exports",
  evaluator: "Evaluators",
  evaluationRule: "Evaluation rules",
  evalJobExecution: "Eval job execution",
  evalDefaultModel: "Eval default model",
  llmApiKeys: "LLM API keys",
  llmGatewayConfig: "LLM Gateway config",
  llmSchemas: "LLM schemas",
  llmTools: "LLM tools",
  playground: "Playground",
  comments: "Comments",
  promptExperiments: "Prompt experiments",
  TableViewPresets: "Table view presets",
  automations: "Automations",
  alerts: "Alerts",
};

const resourceDescriptions: Record<string, string> = {
  projects: "Create and transfer projects",
  organization: "Update or delete the organization",
  organizationMembers: "Invite and manage organization members",
  langfuseCloudBilling: "Manage billing and subscription",
  auditLogs: "View audit logs",
  projectMembers: "Invite and manage project members",
  apiKeys: "Manage API keys",
  objects: "Publish, bookmark, and tag traces and observations",
  traces: "Ingest and manage traces",
  media: "Upload and read media attachments",
  scores: "Submit and manage scores",
  scoreConfigs: "Manage score configurations",
  annotationQueues: "Manage annotation queues",
  annotationQueueAssignments: "Assign annotation queue items",
  project: "Update or delete the project",
  integrations: "Configure integrations",
  datasets: "Manage datasets and items",
  prompts: "Manage prompts and versions",
  promptProtectedLabels: "Manage protected prompt labels",
  dashboards: "Manage dashboards",
  models: "Manage model definitions and pricing",
  batchExports: "Create and read batch exports",
  evaluator: "Manage evaluators",
  evaluationRule: "Manage evaluation rules",
  evalJobExecution: "View evaluation job executions",
  evalDefaultModel: "Manage the default evaluation model",
  llmApiKeys: "Manage LLM API keys",
  llmGatewayConfig: "Read and write the LLM gateway configuration",
  llmSchemas: "Manage LLM schemas",
  llmTools: "Manage LLM tools",
  playground: "Run the playground",
  comments: "Manage comments",
  promptExperiments: "Manage prompt experiments",
  TableViewPresets: "Manage saved table views",
  automations: "Manage automations",
  alerts: "Manage alerts",
};

const actionPriority = [
  "read",
  "write",
  "create",
  "update",
  "delete",
  "publish",
  "bookmark",
  "tag",
  "execute",
  "transfer_org",
];

const organizationScopeList = Array.from(
  new Set(Object.values(organizationRoleAccessRights).flat()),
);

// Ingestion + gateway scopes an API key exercises; member RBAC has no scope for them.
const apiScopeList = [
  "traces:read",
  "traces:create",
  "media:read",
  "media:create",
  "llmGatewayConfig:read",
  "llmGatewayConfig:write",
];

const projectScopeList = [...projectScopes, ...apiScopeList];

/** permissionDomains lists the two permission domains in display order. */
export const permissionDomains: { key: PermissionDomain; label: string }[] = [
  { key: "organization", label: "Organization" },
  { key: "project", label: "Project" },
];

/** permissionCatalog is the org + project resource set with display-normalized actions. */
export const permissionCatalog: PermissionKind[] = [
  ...buildKinds("organization", organizationScopeList),
  ...buildKinds("project", projectScopeList),
];

/** rolePermissionGroups returns every resource + action a role grants, grouped by resource. */
export const rolePermissionGroups = (
  preset: PresetKey,
): RolePermissionGroup[] => {
  const granted = new Set(resolvePreset(preset));
  return permissionCatalog
    .map((kind) => ({
      ...kind,
      description: resourceDescriptions[kind.resource] ?? "",
      actions: kind.actions.filter((a) =>
        granted.has(permissionId(kind.domain, kind.resource, a)),
      ),
    }))
    .filter((g) => g.actions.length > 0);
};

/** rolePermissionCount returns how many individual permissions a role grants. */
export const rolePermissionCount = (preset: PresetKey): number =>
  rolePermissionGroups(preset).reduce((n, g) => n + g.actions.length, 0);

function buildKinds(
  domain: PermissionDomain,
  scopes: string[],
): PermissionKind[] {
  const byResource = new Map<string, string[]>();
  for (const scope of scopes) {
    const [rawResource, rawAction] = scope.split(":");
    const resource = rawAction === "CRUD_apiKeys" ? "apiKeys" : rawResource;
    const actions = byResource.get(resource) ?? [];
    for (const action of expandAction(rawAction))
      if (!actions.includes(action)) actions.push(action);
    byResource.set(resource, actions);
  }
  return Array.from(byResource.entries()).map(([resource, actions]) => ({
    domain,
    resource,
    label: resourceLabels[resource] ?? resource,
    actions: orderActions(actions),
  }));
}

/** expandAction normalizes a compound scope action into displayable actions. */
function expandAction(action: string): string[] {
  if (action === "CRUD" || action === "CRUD_apiKeys") return ["read", "write"];
  if (action === "CUD") return ["write"];
  return [action];
}

function orderActions(actions: string[]): string[] {
  return [...actions].sort((a, b) => actionRank(a) - actionRank(b));
}

function actionRank(action: string): number {
  const index = actionPriority.indexOf(action);
  return index === -1 ? actionPriority.length : index;
}

function permissionId(
  domain: PermissionDomain,
  resource: string,
  action: string,
): string {
  return `${domain}:${resource}:${action}`;
}

/** resolvePreset returns the permission ids a role preset grants. */
function resolvePreset(preset: PresetKey): string[] {
  switch (preset) {
    case "admin":
      return allPermissionIds();
    case "viewer":
      return readPermissionIds();
    case "llmGateway":
      return [
        "project:llmGatewayConfig:read",
        "project:llmGatewayConfig:write",
      ];
    case "otel":
      return [
        "project:traces:create",
        "project:media:read",
        "project:media:create",
        "project:scores:write",
      ];
    case "scores":
      return ["project:scores:write"];
    case "custom":
      return [];
  }
}

function allPermissionIds(): string[] {
  return permissionCatalog.flatMap((k) =>
    k.actions.map((a) => permissionId(k.domain, k.resource, a)),
  );
}

function readPermissionIds(): string[] {
  return permissionCatalog.flatMap((k) =>
    k.actions
      .filter((a) => a === "read")
      .map((a) => permissionId(k.domain, k.resource, a)),
  );
}

/** PermissionDomain is the top-level grouping a resource belongs to. */
export type PermissionDomain = "organization" | "project";

/** PermissionKind is one resource and the display actions it supports. */
export type PermissionKind = {
  domain: PermissionDomain;
  resource: string;
  label: string;
  actions: string[];
};

/** RolePermissionGroup is one resource's granted actions within a role. */
export type RolePermissionGroup = {
  domain: PermissionDomain;
  resource: string;
  label: string;
  description: string;
  actions: string[];
};
