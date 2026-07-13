import { type ReactNode, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Check,
  Github,
  Plus,
  Slack,
  Webhook as WebhookIcon,
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
import { automationCreateHref } from "@/src/features/automations/components/automationForm";
import { cn } from "@/src/utils/tailwind";
import {
  ActionTypeSchema,
  type ActionTypes,
  type AutomationDomain,
  TriggerEventSource,
} from "@langfuse/shared";

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
  hasAccess = true,
}: {
  projectId: string;
  triggerIds: string[];
  onTriggerIdsChange: (next: string[]) => void;
  hasAccess?: boolean;
}) => {
  const { data, isPending } = api.automations.getAutomations.useQuery(
    {
      projectId,
      eventSource: TriggerEventSource.Monitor,
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnWindowFocus: false,
    },
  );

  if (isPending || !data || data?.length == 0)
    return (
      <SetupMonitorAutomationsCard
        projectId={projectId}
        isDisabled={!hasAccess}
      />
    );

  return (
    <MonitorAutomationsListCard
      projectId={projectId}
      isDisabled={!hasAccess}
      automations={data}
      selectedTriggerIds={triggerIds}
      onSelectedTriggerIdsChange={onTriggerIdsChange}
    />
  );
};

/** SetupMonitorAutomationsCard is the empty state prompting creation of the first automation. */
const SetupMonitorAutomationsCard = ({
  isDisabled,
  projectId,
}: {
  isDisabled: boolean;
  projectId: string;
}) => (
  <MonitorAutomationsCard>
    <p className="text-muted-foreground px-4 py-6 text-center text-base">
      Set up Slack, Webhook, and Github Action Automations to Receive Alerts
    </p>
    <AddAutomationDropdown
      projectId={projectId}
      fullWidth
      isDisabled={isDisabled}
    />
  </MonitorAutomationsCard>
);

/** MonitorAutomationsListCard renders the selectable automations and reports the selected trigger IDs. */
const MonitorAutomationsListCard = ({
  projectId,
  isDisabled,
  automations,
  selectedTriggerIds,
  onSelectedTriggerIdsChange,
}: {
  projectId: string;
  isDisabled: boolean;
  automations: AutomationDomain[];
  selectedTriggerIds: string[];
  onSelectedTriggerIdsChange: (selectedTriggerIds: string[]) => void;
}) => {
  const activeTriggerIds = useMemo(
    () => new Set(automations.map((a) => a.trigger.id)),
    [automations],
  );

  // drop selected ids whose automation no longer exists on the server
  const activeSelectedTriggerIds = useMemo(
    () => new Set(selectedTriggerIds.filter((id) => activeTriggerIds.has(id))),
    [selectedTriggerIds, activeTriggerIds],
  );

  const toggleSelectedTriggerId = useCallback(
    (triggerId: string) => {
      const next = new Set(activeSelectedTriggerIds);
      if (next.has(triggerId)) {
        next.delete(triggerId);
      } else {
        next.add(triggerId);
      }
      onSelectedTriggerIdsChange(Array.from(next));
    },
    [onSelectedTriggerIdsChange, activeSelectedTriggerIds],
  );

  return (
    <MonitorAutomationsCard>
      <MonitorAutomationsList
        automations={automations}
        isDisabled={isDisabled}
        selectedTriggerIds={activeSelectedTriggerIds}
        onClick={toggleSelectedTriggerId}
      />
      <AddAutomationDropdown
        projectId={projectId}
        fullWidth
        isDisabled={isDisabled}
      />
    </MonitorAutomationsCard>
  );
};

/** MonitorAutomationsCard is the shared card shell for the panel's contents. */
const MonitorAutomationsCard = ({ children }: { children: ReactNode }) => (
  <div className="space-y-3">
    <Card>
      <CardContent className="space-y-3 pt-4">{children}</CardContent>
    </Card>
  </div>
);

/** MonitorAutomationsList renders one selectable row per automation. */
const MonitorAutomationsList = ({
  automations,
  isDisabled,
  selectedTriggerIds,
  onClick,
}: {
  automations: AutomationDomain[];
  isDisabled: boolean;
  selectedTriggerIds: Set<string>;
  onClick: (triggerId: string) => void;
}) => (
  <ul className="space-y-1">
    {automations.map((automation) => (
      <MonitorAutomationsListRow
        key={automation.id}
        automation={automation}
        isSelected={selectedTriggerIds.has(automation.trigger.id)}
        isDisabled={isDisabled}
        onClick={() => onClick(automation.trigger.id)}
      />
    ))}
  </ul>
);

/** MonitorAutomationsListRow is a selectable row toggling one automation's trigger. */
const MonitorAutomationsListRow = ({
  automation,
  isSelected,
  isDisabled,
  onClick,
}: {
  automation: AutomationDomain;
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
}) => (
  <li
    role="button"
    tabIndex={isDisabled ? -1 : 0}
    aria-pressed={isSelected}
    aria-disabled={isDisabled}
    onClick={isDisabled ? undefined : onClick}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!isDisabled) onClick();
      }
    }}
    className={cn(
      "hover:bg-muted/60 focus-visible:ring-ring flex cursor-pointer items-center gap-2 rounded-md border p-2 text-xs outline-hidden transition-colors focus-visible:ring-2",
      isDisabled && "pointer-events-none opacity-50",
    )}
  >
    <RowCheckbox checked={isSelected} />
    <ActionIcon
      type={automation.action.type as ActionTypes}
      className="h-3.5 w-3.5 shrink-0"
    />
    <span className="truncate" title={automation.name}>
      {automation.name}
    </span>
  </li>
);

/** RowCheckbox is a non-interactive visual stand-in for a checkbox. */
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

/** AddAutomationDropdown renders the "+ Automation" CTA for the empty state and the list footer. */
const AddAutomationDropdown = ({
  projectId,
  fullWidth,
  isDisabled,
}: {
  projectId: string;
  fullWidth?: boolean;
  isDisabled?: boolean;
}) => {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          disabled={isDisabled}
          className={fullWidth ? "w-full" : undefined}
        >
          <Plus className="mr-2 h-4 w-4" />
          Automation
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link
            href={automationCreateHref(projectId, undefined, router.asPath)}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            New automation
          </Link>
        </DropdownMenuItem>
        {ActionTypeSchema.options.map((t) => (
          <DropdownMenuItem key={t} asChild>
            <Link href={automationCreateHref(projectId, t, router.asPath)}>
              <ActionIcon type={t} className="mr-2 h-3.5 w-3.5" />
              {actionLabel[t]}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
