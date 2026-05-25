import { useMemo } from "react";
import Link from "next/link";
import { Webhook as WebhookIcon, Github, Plus, Slack } from "lucide-react";

import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { cn } from "@/src/utils/tailwind";
import {
  ActionTypeSchema,
  type ActionTypes,
  type AutomationDomain,
  type FilterState,
  TriggerEventSource,
} from "@langfuse/shared";
import {
  type MonitorNoData,
  type MonitorSeverity,
} from "@langfuse/shared/monitors";

/** severityLabel maps each monitor severity to its short badge label. */
const severityLabel: Record<MonitorSeverity, string> = {
  UNKNOWN: "UNKNOWN",
  NO_DATA: "NO-DATA",
  PAUSED: "PAUSED",
  OK: "OK",
  WARNING: "WARN",
  ALERT: "ALERT",
};

/** severityClassName maps each monitor severity to its badge tailwind classes. */
const severityClassName: Record<MonitorSeverity, string> = {
  UNKNOWN: "bg-muted text-muted-foreground",
  NO_DATA: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  PAUSED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  OK: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  WARNING:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
  ALERT: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
};

/** actionLabel maps each automation action type to its display name. */
const actionLabel: Record<ActionTypes, string> = {
  WEBHOOK: "Webhook",
  SLACK: "Slack",
  GITHUB_DISPATCH: "GitHub Dispatch",
};

/** MonitorAutomationsPanel lists automations that would fire for the draft monitor and offers a CTA to add more. */
export const MonitorAutomationsPanel = ({
  projectId,
  monitorId,
  name,
  tags,
  warningThreshold,
  noDataMode,
}: {
  projectId: string;
  monitorId?: string;
  name: string;
  tags: string[];
  warningThreshold: number | null;
  noDataMode: MonitorNoData["mode"];
}) => {
  /** severities is the set of severities the draft monitor can emit given its warning/no-data config. */
  const severities = useMemo(
    () => emittableSeverities(warningThreshold, noDataMode),
    [warningThreshold, noDataMode],
  );

  /** automations holds all monitor-source automations matching the draft's id/name/tags. */
  const automations = useGetAutomations(projectId, monitorId, name, tags);

  /** matched pairs each automation with the emittable severities its trigger filter would accept. */
  const matched = useSeverityFilter(automations.data, severities);

  /** preset is the FilterState seeded into the create-automation deep link for this draft. */
  const preset = useMemo(
    () => buildFilterPreset({ monitorId, name, tags }),
    [monitorId, name, tags],
  );

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        {matched.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-muted-foreground text-center text-base">
              Set up Slack, Webhook, and Github Action Notifications
            </p>
            <AddAutomationDropdown projectId={projectId} preset={preset} />
          </div>
        ) : (
          <>
            <ul className="space-y-1">
              {matched.map(({ automation, matchedSeverities }) => {
                const badges: MonitorSeverity[] = Array.from(matchedSeverities);
                return (
                  <li key={automation.id}>
                    <Link
                      href={`/project/${projectId}/automations?view=list&automationId=${automation.id}`}
                      className="hover:bg-muted/60 flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                    >
                      <ActionIcon
                        type={automation.action.type as ActionTypes}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      <span className="truncate">{automation.name}</span>
                      <span className="ml-auto flex gap-1">
                        {badges.map((b) => (
                          <span
                            key={b}
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              severityClassName[b],
                            )}
                          >
                            {severityLabel[b]}
                          </span>
                        ))}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <AddAutomationDropdown
              projectId={projectId}
              preset={preset}
              fullWidth
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

/** ActionIcon renders the lucide icon for a given automation action type. */
const ActionIcon = ({
  type,
  className,
}: {
  type: ActionTypes;
  className?: string;
}) => {
  switch (type) {
    case "WEBHOOK":
      return <WebhookIcon className={className} />;
    case "SLACK":
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- see import note.
      return <Slack className={className} />;
    case "GITHUB_DISPATCH":
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- see import note.
      return <Github className={className} />;
  }
};

/** AddAutomationDropdown renders the "+ Automation" CTA used in both the empty state and the populated-list footer. */
const AddAutomationDropdown = ({
  projectId,
  preset,
  fullWidth,
}: {
  projectId: string;
  preset: FilterState;
  fullWidth?: boolean;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="outline"
        size="lg"
        className={fullWidth ? "w-full" : undefined}
      >
        <Plus className="mr-2 h-4 w-4" />
        Automation
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48">
      <DropdownMenuItem asChild>
        <Link href={automationCreateHref(projectId, preset)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          New automation
        </Link>
      </DropdownMenuItem>
      {ActionTypeSchema.options.map((t) => (
        <DropdownMenuItem key={t} asChild>
          <Link href={automationCreateHref(projectId, preset, t)}>
            <ActionIcon type={t} className="mr-2 h-3.5 w-3.5" />
            {actionLabel[t]}
          </Link>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

/** emittableSeverities derives which severities the draft monitor can emit, given warning + no-data config. */
const emittableSeverities = (
  warningThreshold: number | null,
  noDataMode: MonitorNoData["mode"],
): MonitorSeverity[] => {
  const out: MonitorSeverity[] = ["ALERT", "OK"];
  if (warningThreshold !== null) out.push("WARNING");
  if (noDataMode === "NOTIFY") out.push("NO_DATA");
  return out;
};

/** triggerSeverityClause finds a `severity` stringOptions clause on a trigger filter, if present. */
const triggerSeverityClause = (
  filter: FilterState,
): MonitorSeverity[] | null => {
  for (const cond of filter) {
    if (
      cond.column === "severity" &&
      cond.type === "stringOptions" &&
      cond.operator === "any of"
    ) {
      return cond.value as MonitorSeverity[];
    }
  }
  return null;
};

/** buildFilterPreset emits the FilterState a monitor-source trigger needs to match the draft (id + name + tags). */
const buildFilterPreset = (input: {
  monitorId?: string;
  name: string;
  tags: string[];
}): FilterState => {
  const filters: FilterState = [];
  if (input.monitorId) {
    filters.push({
      column: "monitorId",
      type: "stringOptions",
      operator: "any of",
      value: [input.monitorId],
    });
  }
  if (input.name.trim().length > 0) {
    filters.push({
      column: "monitorName",
      type: "string",
      operator: "=",
      value: input.name,
    });
  }
  if (input.tags.length > 0) {
    filters.push({
      column: "tags",
      type: "arrayOptions",
      operator: "all of",
      value: input.tags,
    });
  }
  return filters;
};

/** automationCreateHref builds the deep-link to the automations create form, optionally preselecting an actionType. */
const automationCreateHref = (
  projectId: string,
  preset: FilterState,
  actionType?: ActionTypes,
): string => {
  const params = new URLSearchParams({
    view: "create",
    source: TriggerEventSource.Monitor,
    filterPreset: JSON.stringify(preset),
  });
  if (actionType) params.set("actionType", actionType);
  return `/project/${projectId}/automations?${params.toString()}`;
};

/** useSeverityFilter pairs each automation with the emittable severities its trigger filter would accept, dropping any that match none. */
const useSeverityFilter = (
  automations: AutomationDomain[] | undefined,
  severities: MonitorSeverity[],
): {
  automation: AutomationDomain;
  matchedSeverities: Set<MonitorSeverity>;
}[] => {
  return useMemo(() => {
    return (automations ?? [])
      .map((automation) => {
        const triggerSev = triggerSeverityClause(automation.trigger.filter);
        const allowed = triggerSev
          ? severities.filter((s) => triggerSev.includes(s))
          : severities;
        return {
          automation,
          matchedSeverities: new Set<MonitorSeverity>(allowed),
        };
      })
      .filter((m) => m.matchedSeverities.size > 0);
  }, [automations, severities]);
};

/** useGetAutomations fetches monitor-source automations matching the draft's id/name/tags across all severities. */
const useGetAutomations = (
  projectId: string,
  monitorId: string | undefined,
  name: string,
  tags: string[],
) => {
  return api.automations.getAutomations.useQuery(
    {
      projectId,
      eventSource: TriggerEventSource.Monitor,
      matches: {
        ...(monitorId ? { monitorId } : {}),
        ...(name.trim().length > 0 ? { monitorName: name } : {}),
        tags,
      },
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnWindowFocus: false,
    },
  );
};

/** __test exposes private helpers to co-located tests without widening the module API. */
export const __test = {
  emittableSeverities,
  triggerSeverityClause,
  buildFilterPreset,
  automationCreateHref,
};
