import { Fragment, useEffect, useRef, useState } from "react";

import {
  systemRoleAccessRights,
  type SystemRolePolicy,
} from "@langfuse/shared/rbac";
import { type SystemRole } from "@langfuse/shared/src/db";
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";

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

const entityLabels: Record<string, string> = {
  projects: "Project management",
  organization: "Organization",
  organizationMembers: "Organization members",
  langfuseCloudBilling: "Billing",
  orgAuditLogs: "Organization audit logs",
  projectAuditLogs: "Project audit logs",
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
  llmSchemas: "LLM schemas",
  llmTools: "LLM tools",
  playground: "Playground",
  comments: "Comments",
  promptExperiments: "Prompt experiments",
  TableViewPresets: "Table view presets",
  automations: "Automations",
  alerts: "Alerts",
  gateway: "AI Gateway",
  experiments: "Experiments",
  sessions: "Sessions",
  metrics: "Metrics",
  feedback: "Feedback",
};

/** RolePermissionList groups permissions by resource kind and entity. */
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

/** SectionHeader adds a shadow while pinned. */
const SectionHeader = ({ label }: { label: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let root: HTMLElement | null = el.parentElement;
    while (root && getComputedStyle(root).overflowY === "visible")
      root = root.parentElement;
    const observer = new IntersectionObserver(
      // Pinned headers clip by one pixel.
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

/** groupByEntity groups scope actions by entity and sorts each group. */
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
    title: entityLabels[entity] ?? entity,
    actions: [...actions].sort(compareActions),
  }));
};

/** compareActions puts unranked actions last, alphabetically. */
const compareActions = (a: string, b: string): number => {
  const rankA = actionOrder.indexOf(a);
  const rankB = actionOrder.indexOf(b);
  if (rankA === -1 && rankB === -1) return a.localeCompare(b);
  if (rankA === -1) return 1;
  if (rankB === -1) return -1;
  return rankA - rankB;
};

export const rolePermissionCountLabel = (role: SystemRole): string =>
  `${rolePermissionCount(role)} ${rolePermissionNoun(role)}`;

export const rolePermissionNoun = (role: SystemRole): string =>
  rolePermissionCount(role) === 1 ? "permission" : "permissions";

export const rolePermissionCount = (role: SystemRole): number =>
  systemRoleAccessRights[role].policies.reduce(
    (total, policy) => total + policy.actions.length,
    0,
  );

type ResourceKind = SystemRolePolicy["resourceKind"];

type EntityGroup = {
  entity: string;
  title: string;
  actions: string[];
};
