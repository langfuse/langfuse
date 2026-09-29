import { Fragment, useEffect, useRef, useState } from "react";
import { type SystemRole } from "@langfuse/shared/src/db";
import {
  systemRoleAccessRights,
  type SystemRolePolicy,
} from "@langfuse/shared/rbac";

import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";

type ResourceKind = SystemRolePolicy["resourceKind"];

const resourceKindLabels: Record<ResourceKind, string> = {
  organization: "Organization",
  project: "Project",
};

const resourceKindOrder: ResourceKind[] = ["organization", "project"];

const actionOrder = [
  "read",
  "create",
  "update",
  "save",
  "delete",
  "CUD",
  "CRUD",
];

/** entityMeta maps a scope's entity (the part before the `:`) to its display title and description. Held UI-side; unmapped entities fall back to the raw entity name. */
const entityMeta: Record<string, { title: string; description: string }> = {
  projects: {
    title: "Project management",
    description: "Create and transfer projects",
  },
  organization: {
    title: "Organization",
    description: "Update or delete the organization",
  },
  organizationMembers: {
    title: "Organization members",
    description: "Invite and manage organization members",
  },
  langfuseCloudBilling: {
    title: "Billing",
    description: "Manage billing and subscription",
  },
  orgAuditLogs: {
    title: "Organization audit logs",
    description: "View organization audit logs",
  },
  projectAuditLogs: {
    title: "Project audit logs",
    description: "View project audit logs",
  },
  projectMembers: {
    title: "Project members",
    description: "Invite and manage project members",
  },
  apiKeys: { title: "API keys", description: "Manage API keys" },
  objects: {
    title: "Objects",
    description: "Publish, bookmark, and tag traces and observations",
  },
  traces: { title: "Traces", description: "Ingest and manage traces" },
  media: { title: "Media", description: "Upload and read media attachments" },
  scores: { title: "Scores", description: "Submit and manage scores" },
  scoreConfigs: {
    title: "Score configs",
    description: "Manage score configurations",
  },
  annotationQueues: {
    title: "Annotation queues",
    description: "Manage annotation queues",
  },
  annotationQueueAssignments: {
    title: "Annotation queue assignments",
    description: "Assign annotation queue items",
  },
  project: { title: "Project", description: "Update or delete the project" },
  integrations: {
    title: "Integrations",
    description: "Configure integrations",
  },
  datasets: { title: "Datasets", description: "Manage datasets and items" },
  prompts: { title: "Prompts", description: "Manage prompts and versions" },
  promptProtectedLabels: {
    title: "Prompt protected labels",
    description: "Manage protected prompt labels",
  },
  dashboards: { title: "Dashboards", description: "Manage dashboards" },
  models: {
    title: "Models",
    description: "Manage model definitions and pricing",
  },
  batchExports: {
    title: "Batch exports",
    description: "Create and read batch exports",
  },
  evaluator: { title: "Evaluators", description: "Manage evaluators" },
  evaluationRule: {
    title: "Evaluation rules",
    description: "Manage evaluation rules",
  },
  evalJobExecution: {
    title: "Eval job execution",
    description: "View evaluation job executions",
  },
  evalDefaultModel: {
    title: "Eval default model",
    description: "Manage the default evaluation model",
  },
  llmApiKeys: { title: "LLM API keys", description: "Manage LLM API keys" },
  llmSchemas: { title: "LLM schemas", description: "Manage LLM schemas" },
  llmTools: { title: "LLM tools", description: "Manage LLM tools" },
  playground: { title: "Playground", description: "Run the playground" },
  comments: { title: "Comments", description: "Manage comments" },
  promptExperiments: {
    title: "Prompt experiments",
    description: "Manage prompt experiments",
  },
  TableViewPresets: {
    title: "Table view presets",
    description: "Manage saved table views",
  },
  automations: { title: "Automations", description: "Manage automations" },
  alerts: { title: "Alerts", description: "Manage alerts" },
  gateway: {
    title: "AI Gateway",
    description: "Invoke the organization's AI Gateway",
  },
  experiments: { title: "Experiments", description: "Manage experiments" },
  sessions: { title: "Sessions", description: "Read and manage sessions" },
  metrics: { title: "Metrics", description: "Read metrics" },
  feedback: { title: "Feedback", description: "Submit product feedback" },
};

type EntityGroup = {
  entity: string;
  title: string;
  description: string;
  actions: string[];
};

/** groupByEntity splits each scope at the first `:` and groups the trailing actions under their entity, each group's actions ordered by compareActions. */
const groupByEntity = (scopes: string[]): EntityGroup[] => {
  const byEntity = new Map<string, string[]>();
  for (const scope of scopes) {
    const separator = scope.indexOf(":");
    const entity = separator === -1 ? scope : scope.slice(0, separator);
    const action = separator === -1 ? scope : scope.slice(separator + 1);
    const actions = byEntity.get(entity) ?? [];
    if (!actions.includes(action)) actions.push(action);
    byEntity.set(entity, actions);
  }
  return Array.from(byEntity.entries()).map(([entity, actions]) => ({
    entity,
    title: entityMeta[entity]?.title ?? entity,
    description: entityMeta[entity]?.description ?? "",
    actions: [...actions].sort(compareActions),
  }));
};

/** compareActions orders actions by actionOrder, sending unranked actions to the end sorted alphabetically. */
const compareActions = (a: string, b: string): number => {
  const rankA = actionOrder.indexOf(a);
  const rankB = actionOrder.indexOf(b);
  if (rankA === -1 && rankB === -1) return a.localeCompare(b);
  if (rankA === -1) return 1;
  if (rankB === -1) return -1;
  return rankA - rankB;
};

/** rolePermissionCount is the total number of actions a role grants across all its policies. */
export const rolePermissionCount = (role: SystemRole): number =>
  systemRoleAccessRights[role].policies.reduce(
    (total, policy) => total + policy.actions.length,
    0,
  );

/** rolePermissionNoun is the singular/plural noun for a role's permission count. */
export const rolePermissionNoun = (role: SystemRole): string =>
  rolePermissionCount(role) === 1 ? "permission" : "permissions";

/** rolePermissionCountLabel renders the permission count with its singular/plural noun. */
export const rolePermissionCountLabel = (role: SystemRole): string =>
  `${rolePermissionCount(role)} ${rolePermissionNoun(role)}`;

/** SectionHeader is a sticky section label that shows a bottom border only while pinned to the top of the scroll area. */
const SectionHeader = ({ label }: { label: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [stuck, setStuck] = useState(false);

  // Observe the header against its scroll container: pinned at top-[-1px] it
  // clips by 1px, so an intersection ratio below 1 means it is stuck.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let root: HTMLElement | null = el.parentElement;
    while (root && getComputedStyle(root).overflowY === "visible")
      root = root.parentElement;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(entry.intersectionRatio < 1),
      { root, threshold: [1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      className={cn(
        "bg-modal text-muted-foreground sticky -top-px z-10 col-span-2 block px-4 pt-4 pb-2 text-[0.65rem] font-bold tracking-wider uppercase",
        stuck && "shadow-[0_8px_8px_-4px_hsl(var(--modal))]",
      )}
    >
      {label}
    </span>
  );
};

/** RolePermissionList renders a role's granted scopes grouped by resource kind, then by entity with a title and description. */
export const RolePermissionList = ({ role }: { role: SystemRole }) => {
  const { policies } = systemRoleAccessRights[role];

  if (policies.length === 0)
    return (
      <p className="text-muted-foreground text-xs italic">
        No permissions granted.
      </p>
    );

  return (
    <div className="grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-2 pb-5">
      {resourceKindOrder.map((kind) => {
        const scopes = policies
          .filter((policy) => policy.resourceKind === kind)
          .flatMap((policy) => policy.actions);
        if (scopes.length === 0) return null;

        return (
          <Fragment key={kind}>
            <SectionHeader label={resourceKindLabels[kind]} />
            {groupByEntity(scopes).map((group) => (
              <div key={group.entity} className="contents">
                <span className="pl-4 text-xs leading-tight font-bold whitespace-nowrap">
                  {group.title}
                </span>
                <div className="flex flex-wrap gap-1 pr-4">
                  {group.actions.map((action) => (
                    <Badge
                      key={action}
                      variant="outline"
                      className="px-1.5 py-0 font-mono text-[0.65rem] font-normal"
                    >
                      {action}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </Fragment>
        );
      })}
    </div>
  );
};
