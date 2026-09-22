// PROTOTYPE — throwaway. Data model for the new org API-key permission UI.

import {
  Eye,
  Network,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  type LucideIcon,
} from "lucide-react";

import { projectScopes } from "@langfuse/shared";

import { organizationRoleAccessRights } from "@/src/features/rbac/constants/organizationAccessRights";

export type PermissionDomain = "organization" | "project";

export type PermissionKind = {
  domain: PermissionDomain;
  resource: string;
  label: string;
  actions: string[];
};

const resourceLabels: Record<string, string> = {
  projects: "Project management",
  organization: "Organization",
  organizationMembers: "Organization members",
  langfuseCloudBilling: "Billing",
  auditLogs: "Audit logs",
  projectMembers: "Project members",
  apiKeys: "API keys",
  traces: "Traces",
  sessions: "Sessions",
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
  llmGatewayConfig: "LLM Gateway Config",
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
  traces: "Ingest and manage traces",
  sessions: "View and share sessions",
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

/** describeResource returns a short human description for a resource kind. */
export const describeResource = (resource: string): string =>
  resourceDescriptions[resource] ?? "";

/** permissionDomains lists the two permission domains in display order. */
export const permissionDomains: { key: PermissionDomain; label: string }[] = [
  { key: "organization", label: "Organization" },
  { key: "project", label: "Project" },
];

const actionPriority = [
  "read",
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

// objects:* actions redistributed onto the resource rows they apply to.
const projectScopeList = [
  ...projectScopes.filter((s) => !s.startsWith("objects:")),
  "traces:read",
  "traces:create",
  "traces:publish",
  "traces:bookmark",
  "traces:tag",
  "sessions:read",
  "sessions:publish",
  "sessions:bookmark",
  "prompts:tag",
  "llmGatewayConfig:read",
  "llmGatewayConfig:write",
];

/** permissionCatalog is the full org + project scope set, grouped by resource kind. */
export const permissionCatalog: PermissionKind[] = [
  ...buildKinds("organization", [
    ...organizationScopeList,
    "organization:read",
    "projects:read",
  ]),
  ...buildKinds("project", projectScopeList),
];

export type PresetKey =
  | "admin"
  | "viewer"
  | "llmGateway"
  | "otel"
  | "scores"
  | "custom";

export type Preset = {
  key: PresetKey;
  label: string;
  description: string;
};

/** presets lists the selectable role groups shown in the role picker. */
export const presets: Preset[] = [
  {
    key: "admin",
    label: "Admin",
    description: "All read and write privileges.",
  },
  { key: "viewer", label: "Viewer", description: "Read-only privileges." },
  {
    key: "llmGateway",
    label: "Langfuse LLM Gateway",
    description: "Read and write the LLM gateway configuration.",
  },
  {
    key: "otel",
    label: "Otel Client",
    description: "Create scores and traces from application telemetry.",
  },
  {
    key: "scores",
    label: "Scores Client",
    description: "Submit scores from a web application.",
  },
  {
    key: "custom",
    label: "Custom",
    description: "Grant custom permissions to your service account.",
  },
];

/** presetIcons maps each preset to its lucide icon. */
export const presetIcons: Record<PresetKey, LucideIcon> = {
  admin: ShieldCheck,
  viewer: Eye,
  llmGateway: Network,
  otel: Radio,
  scores: Star,
  custom: SlidersHorizontal,
};

export type ExpiryKey = "never" | "30d" | "60d" | "90d" | "1y" | "custom";

export type ExpiryOption = {
  key: ExpiryKey;
  label: string;
  days: number | null;
};

/** expiryOptions lists the selectable key-lifetime presets. */
export const expiryOptions: ExpiryOption[] = [
  { key: "never", label: "No expiration", days: null },
  { key: "30d", label: "30 days", days: 30 },
  { key: "60d", label: "60 days", days: 60 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "1y", label: "1 year", days: 365 },
  { key: "custom", label: "Custom date…", days: null },
];

export type ProjectOption = { id: string; name: string };

export type ApiKeyDraft = {
  name: string;
  description: string;
  allProjects: boolean;
  projectIds: string[];
  preset: PresetKey;
  customIds: string[];
  expiry: ExpiryKey;
  customExpiry: string;
};

export const emptyDraft: ApiKeyDraft = {
  name: "",
  description: "",
  allProjects: true,
  projectIds: [],
  preset: "admin",
  customIds: [],
  expiry: "never",
  customExpiry: "",
};

/** permissionId joins a domain, resource, and action into a stable id. */
export const permissionId = (
  domain: PermissionDomain,
  resource: string,
  action: string,
): string => `${domain}:${resource}:${action}`;

/** allPermissionIds returns every permission in the catalog. */
export const allPermissionIds = (): string[] =>
  permissionCatalog.flatMap((k) =>
    k.actions.map((a) => permissionId(k.domain, k.resource, a)),
  );

/** kindsForDomain returns the catalog kinds belonging to one domain. */
export const kindsForDomain = (domain: PermissionDomain): PermissionKind[] =>
  permissionCatalog.filter((k) => k.domain === domain);

/** resolvePreset returns the permission ids a preset grants. */
export const resolvePreset = (
  preset: PresetKey,
  customIds: string[],
): string[] => {
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
      return ["project:traces:create", "project:scores:create"];
    case "scores":
      return ["project:scores:create"];
    case "custom":
      return customIds;
  }
};

/** resolvedPermissionIds returns the permission ids the draft currently grants. */
export const resolvedPermissionIds = (draft: ApiKeyDraft): string[] =>
  resolvePreset(draft.preset, draft.customIds);

/** resolveExpiry returns the draft's expiry as an ISO date, or null when it never expires. */
export const resolveExpiry = (draft: ApiKeyDraft): string | null => {
  if (draft.expiry === "custom")
    return draft.customExpiry
      ? new Date(draft.customExpiry).toISOString()
      : null;
  const days = expiryOptions.find((o) => o.key === draft.expiry)?.days ?? null;
  if (days === null) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
};

/** groupByKind buckets a flat id list into the catalog kinds and actions it covers. */
export const groupByKind = (
  ids: string[],
): { kind: PermissionKind; actions: string[] }[] => {
  const set = new Set(ids);
  return permissionCatalog
    .map((kind) => ({
      kind,
      actions: kind.actions.filter((a) =>
        set.has(permissionId(kind.domain, kind.resource, a)),
      ),
    }))
    .filter((g) => g.actions.length > 0);
};

/** orderActions sorts actions so read always comes first, then by priority. */
export function orderActions(actions: string[]): string[] {
  return [...actions].sort((a, b) => actionRank(a) - actionRank(b));
}

function buildKinds(
  domain: PermissionDomain,
  scopes: string[],
): PermissionKind[] {
  const byResource = new Map<string, string[]>();
  for (const scope of scopes) {
    const [resource, action] = scope.split(":");
    for (const expanded of expandScope(resource, action)) {
      const actions = byResource.get(expanded.resource) ?? [];
      if (!actions.includes(expanded.action)) actions.push(expanded.action);
      byResource.set(expanded.resource, actions);
    }
  }
  return Array.from(byResource.entries()).map(([resource, actions]) => ({
    domain,
    resource,
    label: resourceLabels[resource] ?? resource,
    actions: orderActions(actions),
  }));
}

/** expandScope expands a compound scope action into granular resource-action pairs. */
function expandScope(
  resource: string,
  action: string,
): { resource: string; action: string }[] {
  const target = action === "CRUD_apiKeys" ? "apiKeys" : resource;
  if (action === "CRUD" || action === "CUD" || action === "CRUD_apiKeys")
    return ["read", "create", "update", "delete"].map((a) => ({
      resource: target,
      action: a,
    }));
  return [{ resource, action }];
}

function actionRank(action: string): number {
  const index = actionPriority.indexOf(action);
  return index === -1 ? actionPriority.length : index;
}

const readPermissionIds = (): string[] =>
  permissionCatalog.flatMap((k) =>
    k.actions
      .filter((a) => a === "read")
      .map((a) => permissionId(k.domain, k.resource, a)),
  );
