import { useMemo } from "react";
import Link from "next/link";
import {
  Check,
  Webhook as WebhookIcon,
  Github,
  Plus,
  Slack,
} from "lucide-react";

import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  ActionTypeSchema,
  type ActionTypes,
  type AutomationDomain,
  type FilterState,
  TriggerEventSource,
} from "@langfuse/shared";
import { serializeCreateAutomationPrefill } from "@/src/features/automations/components/automationForm";
import TagList from "@/src/features/tag/components/TagList";
import TagManager from "@/src/features/tag/components/TagManager";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { cn } from "@/src/utils/tailwind";

/** actionLabel maps each automation action type to its display name. */
const actionLabel: Record<ActionTypes, string> = {
  WEBHOOK: "Webhook",
  SLACK: "Slack",
  GITHUB_DISPATCH: "GitHub Dispatch",
};

/** MonitorAutomationsPanel lets the user select automations for a monitor by adding matching tags to the monitor. */
export const MonitorAutomationsPanel = ({
  projectId,
  tags,
  onTagsChange,
}: {
  projectId: string;
  tags: string[];
  onTagsChange: (next: string[]) => void;
}) => {
  /** hasAccess gates write controls behind the monitors:CUD RBAC scope. */
  const hasAccess = useHasProjectAccess({ projectId, scope: "monitors:CUD" });

  /** availableTags is the flat list of tag values used for TagManager autocomplete. */
  const availableTags = useAvailableMonitorTags(projectId);

  /** automations holds every monitor-source automation in the project, unfiltered by tags. */
  const automations = useGetAutomations(projectId);

  /** rows is the display list: every monitor-source automation, annotated with `isHighlighted` when the row's trigger filter accepts the picked tags. */
  const rows = useAutomationRows(automations.data, tags);

  /** preset is the FilterState seeded into the create-automation deep link for this draft. */
  const preset = useMemo(() => buildFilterPreset(tags), [tags]);

  /** showEmptyState fires when the project has no monitor-source automations at all (not just when the tag filter narrows to zero). */
  const showEmptyState = (automations.data ?? []).length === 0;

  return (
    <div className="space-y-3">
      <TagManager
        itemName="monitor"
        tags={tags}
        allTags={availableTags}
        hasAccess={hasAccess}
        isLoading={false}
        mutateTags={onTagsChange}
        alignPopover="start"
        triggerButton={
          <Button type="button" variant="default" size="sm" className="gap-1">
            <Plus className="h-3 w-3" />
            Add Tags
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-3 pt-4">
          {showEmptyState ? (
            <>
              <p className="text-muted-foreground px-4 py-6 text-center text-base">
                Set up Slack, Webhook, and Github Action Automations to Receive
                Alerts
              </p>
              <AddAutomationDropdown
                projectId={projectId}
                preset={preset}
                fullWidth
              />
            </>
          ) : (
            <>
              <ul className="space-y-1">
                {rows.map(
                  ({
                    automation,
                    triggerTags,
                    triggerOperator,
                    isHighlighted,
                  }) => {
                    const inert =
                      triggerTags.length === 0 || triggerOperator === "none of";
                    const toggle = () => {
                      if (inert) return;
                      onTagsChange(
                        toggleAutomationTags(tags, triggerTags, isHighlighted),
                      );
                    };
                    return (
                      <li key={automation.id}>
                        <div
                          role="button"
                          tabIndex={inert ? -1 : 0}
                          aria-disabled={inert}
                          aria-pressed={isHighlighted}
                          onClick={toggle}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggle();
                            }
                          }}
                          className={cn(
                            "hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-2 rounded-md border px-2 py-1 text-xs outline-hidden transition-colors focus-visible:ring-2",
                            inert ? "cursor-not-allowed" : "cursor-pointer",
                            tags.length > 0 && !isHighlighted && "opacity-50",
                          )}
                        >
                          <RowCheckbox checked={isHighlighted} />
                          <ActionIcon
                            type={automation.action.type as ActionTypes}
                            className="h-3.5 w-3.5 shrink-0"
                          />
                          <span className="truncate">{automation.name}</span>
                          <span className="ml-auto flex flex-wrap justify-end gap-1">
                            <TagList
                              selectedTags={triggerTags}
                              isLoading={false}
                              viewOnly
                            />
                          </span>
                        </div>
                      </li>
                    );
                  },
                )}
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
    </div>
  );
};

/** RowCheckbox is a non-interactive visual stand-in for a checkbox */
const RowCheckbox = ({ checked }: { checked: boolean }) => (
  <span
    aria-hidden
    className={cn(
      "border-primary flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
      checked && "bg-primary text-primary-foreground",
    )}
  >
    {checked && <Check className="h-3.5 w-3.5" />}
  </span>
);

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

/** TriggerTagsClause is the tags clause a trigger filter targets, including its operator so the toggle can interpret "none of" inversely. */
type TriggerTagsClause = {
  values: string[];
  operator: "any of" | "all of" | "none of";
};

/** triggerTagsClause returns the trigger filter's tags clause, or null when no tags clause is present. */
const triggerTagsClause = (filter: FilterState): TriggerTagsClause | null => {
  for (const cond of filter) {
    if (cond.column === "tags" && cond.type === "arrayOptions") {
      return { values: cond.value, operator: cond.operator };
    }
  }
  return null;
};

/** tagClauseMatches returns true when the trigger's tags clause (if any) would accept the draft monitor's tags. Non-tags clauses are ignored — they're filtered server-side or irrelevant to the draft preview. */
const tagClauseMatches = (filter: FilterState, tags: string[]): boolean => {
  for (const cond of filter) {
    if (cond.column !== "tags") continue;
    if (cond.type !== "arrayOptions") continue;
    switch (cond.operator) {
      case "all of":
        if (!cond.value.every((v) => tags.includes(v))) return false;
        break;
      case "any of":
        if (!cond.value.some((v) => tags.includes(v))) return false;
        break;
      case "none of":
        if (cond.value.some((v) => tags.includes(v))) return false;
        break;
    }
  }
  return true;
};

/** toggleAutomationTags returns the next monitor tag list after a row click: removes every trigger tag when the row is currently matched, or adds them (deduped) when it isn't. Empty `triggerTags` is a no-op so rows whose trigger filter has no tags clause stay inert. */
const toggleAutomationTags = (
  currentTags: string[],
  triggerTags: string[],
  isCurrentlyMatched: boolean,
): string[] => {
  if (triggerTags.length === 0) return currentTags;
  if (isCurrentlyMatched) {
    const removeSet = new Set(triggerTags);
    return currentTags.filter((t) => !removeSet.has(t));
  }
  return Array.from(new Set([...currentTags, ...triggerTags]));
};

/** buildFilterPreset emits the FilterState a monitor-source trigger needs to match the draft's tags. */
const buildFilterPreset = (tags: string[]): FilterState => {
  if (tags.length === 0) return [];
  return [
    {
      column: "tags",
      type: "arrayOptions",
      operator: "all of",
      value: tags,
    },
  ];
};

/** automationCreateHref builds the deep-link to the automations create form, encoding the prefill as a single base64url JSON blob. */
const automationCreateHref = (
  projectId: string,
  preset: FilterState,
  actionType?: ActionTypes,
): string => {
  const prefill = serializeCreateAutomationPrefill({
    eventSource: TriggerEventSource.Monitor,
    ...(preset.length > 0 ? { filter: preset } : {}),
    ...(actionType ? { actionType } : {}),
  });
  const params = new URLSearchParams({ view: "create", prefill });
  return `/project/${projectId}/automations?${params.toString()}`;
};

/** useAutomationRows annotates every automation with its trigger tags clause and whether the trigger filter accepts the draft monitor's tags. */
const useAutomationRows = (
  automations: AutomationDomain[] | undefined,
  tags: string[],
): {
  automation: AutomationDomain;
  triggerTags: string[];
  triggerOperator: TriggerTagsClause["operator"] | null;
  isHighlighted: boolean;
}[] => {
  return useMemo(() => {
    return (automations ?? []).map((automation) => {
      const clause = triggerTagsClause(automation.trigger.filter);
      return {
        automation,
        triggerTags: clause?.values ?? [],
        triggerOperator: clause?.operator ?? null,
        isHighlighted: tagClauseMatches(automation.trigger.filter, tags),
      };
    });
  }, [automations, tags]);
};

/** useGetAutomations fetches every monitor-source automation in the project. */
const useGetAutomations = (projectId: string) => {
  return api.automations.getAutomations.useQuery(
    {
      projectId,
      eventSource: TriggerEventSource.Monitor,
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnWindowFocus: false,
    },
  );
};

/** useAvailableMonitorTags loads the project's existing monitor tags for TagManager autocomplete. */
const useAvailableMonitorTags = (projectId: string): string[] => {
  const monitorFilterOptions = api.monitors.getFilterOptions.useQuery(
    { projectId },
    {
      trpc: { context: { skipBatch: true } },
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );
  return useMemo(
    () => monitorFilterOptions.data?.tags.map((t) => t.value) ?? [],
    [monitorFilterOptions.data],
  );
};

/** __test exposes private helpers to co-located tests without widening the module API. */
export const __test = {
  triggerTagsClause,
  tagClauseMatches,
  toggleAutomationTags,
  buildFilterPreset,
  automationCreateHref,
};
