import { useMemo } from "react";
import Link from "next/link";
import { Webhook as WebhookIcon, Github, Plus, Slack } from "lucide-react";

import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  ActionTypeSchema,
  type ActionTypes,
  TriggerEventSource,
} from "@langfuse/shared";
import { serializeCreateAutomationPrefill } from "@/src/features/automations/components/automationForm";

/** actionLabel maps each automation action type to its display name. */
const actionLabel: Record<ActionTypes, string> = {
  WEBHOOK: "Webhook",
  SLACK: "Slack",
  GITHUB_DISPATCH: "GitHub Dispatch",
};

/** MonitorAutomationsPanel lets the user select which automations fire for a monitor via explicit trigger IDs. */
export const MonitorAutomationsPanel = ({
  projectId,
  triggerIds,
  onTriggerIdsChange,
}: {
  projectId: string;
  triggerIds: string[];
  onTriggerIdsChange: (next: string[]) => void;
}) => {
  const automations = api.automations.getAutomations.useQuery(
    {
      projectId,
      eventSource: TriggerEventSource.Monitor,
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnWindowFocus: false,
    },
  );

  /** liveTriggerIds is the set of trigger IDs that exist in the current project. */
  const liveTriggerIds = useMemo(
    () => (automations.data ?? []).map((a) => a.trigger.id),
    [automations.data],
  );

  /** selectedSet is the intersection of triggerIds with liveTriggerIds — stale IDs fall out automatically. */
  const selectedSet = useMemo(
    () => computeSelectedSet(triggerIds, liveTriggerIds),
    [triggerIds, liveTriggerIds],
  );

  /** handleToggle flips membership for a trigger ID and calls onTriggerIdsChange with the new array. */
  const handleToggle = (triggerId: string) => {
    onTriggerIdsChange(toggle(triggerId, triggerIds, liveTriggerIds));
  };

  const showEmptyState = (automations.data ?? []).length === 0;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 pt-4">
          {showEmptyState ? (
            <>
              <p className="text-muted-foreground px-4 py-6 text-center text-base">
                Set up Slack, Webhook, and Github Action Automations to Receive
                Alerts
              </p>
              <AddAutomationDropdown projectId={projectId} fullWidth />
            </>
          ) : (
            <>
              <ul className="space-y-1">
                {(automations.data ?? []).map((automation) => {
                  const checked = selectedSet.has(automation.trigger.id);
                  return (
                    <li key={automation.id} className="flex items-center gap-2">
                      <Checkbox
                        id={automation.trigger.id}
                        checked={checked}
                        onCheckedChange={() =>
                          handleToggle(automation.trigger.id)
                        }
                        aria-label={automation.name}
                      />
                      <label
                        htmlFor={automation.trigger.id}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <ActionIcon
                          type={automation.action.type as ActionTypes}
                          className="h-3.5 w-3.5 shrink-0"
                        />
                        {automation.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <AddAutomationDropdown projectId={projectId} fullWidth />
            </>
          )}
        </CardContent>
      </Card>
    </div>
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
  fullWidth,
}: {
  projectId: string;
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
        <Link href={automationCreateHref(projectId)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          New automation
        </Link>
      </DropdownMenuItem>
      {ActionTypeSchema.options.map((t) => (
        <DropdownMenuItem key={t} asChild>
          <Link href={automationCreateHref(projectId, t)}>
            <ActionIcon type={t} className="mr-2 h-3.5 w-3.5" />
            {actionLabel[t]}
          </Link>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

/** automationCreateHref builds the deep-link to the automations create form. */
const automationCreateHref = (
  projectId: string,
  actionType?: ActionTypes,
): string => {
  const prefill = serializeCreateAutomationPrefill({
    eventSource: TriggerEventSource.Monitor,
    ...(actionType ? { actionType } : {}),
  });
  const params = new URLSearchParams({ view: "create", prefill });
  return `/project/${projectId}/automations?${params.toString()}`;
};

/** computeSelectedSet returns the intersection of triggerIds with liveTriggerIds, dropping stale IDs. */
const computeSelectedSet = (
  triggerIds: string[],
  liveTriggerIds: string[],
): Set<string> => {
  const liveSet = new Set(liveTriggerIds);
  return new Set(triggerIds.filter((id) => liveSet.has(id)));
};

/** toggle flips membership of triggerId in the current selection (after dropping stale IDs) and returns the new array. */
const toggle = (
  triggerId: string,
  currentTriggerIds: string[],
  liveTriggerIds: string[],
): string[] => {
  const next = computeSelectedSet(currentTriggerIds, liveTriggerIds);
  if (next.has(triggerId)) {
    next.delete(triggerId);
  } else {
    next.add(triggerId);
  }
  return Array.from(next);
};

/** __test exposes private helpers to co-located tests without widening the module API. */
export const __test = {
  computeSelectedSet,
  toggle,
};
