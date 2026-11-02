/* eslint-disable @repo/no-style-props, @typescript-eslint/no-use-before-define -- Legacy UI usage retained during migration to design-system components. */
import { useMemo, useCallback, useRef } from "react";
import {
  Check,
  Github,
  Plus,
  Slack,
  Webhook as WebhookIcon,
} from "@langfuse/icons";
import { SiPagerduty } from "@langfuse/icons/si";

import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import {
  actionTypeLabel,
  useAvailableActionTypes,
} from "@/src/features/automations";
import { NewMonitorAutomationDialogController } from "@/src/features/monitors/automations/NewMonitorAutomationDialogController";
import { cn } from "@/src/utils/tailwind";
import {
  ActionTypeSchema,
  type ActionTypes,
  type AutomationDomain,
  TriggerEventSource,
} from "@langfuse/shared";

const actionIcon = {
  WEBHOOK: WebhookIcon,
  SLACK: Slack,
  GITHUB_DISPATCH: Github,
  PAGERDUTY: SiPagerduty,
} satisfies Record<ActionTypes, typeof WebhookIcon>;

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
  const utils = api.useUtils();
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

  // The user can keep toggling rows while the refetch below is in flight, so the
  // write must not be based on a render-time snapshot of the selection.
  const latestTriggerIds = useRef(triggerIds);
  latestTriggerIds.current = triggerIds;

  /** selectCreatedAutomation ticks a just-created automation, resolving its trigger id (the panel's key) from the refreshed list. */
  const selectCreatedAutomation = useCallback(
    async (automationId: string) => {
      const automations = await utils.automations.getAutomations.fetch({
        projectId,
        eventSource: TriggerEventSource.Monitor,
      });
      const triggerId = automations?.find((a) => a.id === automationId)?.trigger
        .id;
      const selected = latestTriggerIds.current;
      if (!triggerId || selected.includes(triggerId)) return;
      onTriggerIdsChange([...selected, triggerId]);
    },
    [utils, projectId, onTriggerIdsChange],
  );

  const automations = data ?? [];
  const isEmpty = isPending || automations.length === 0;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 pt-4">
          {isEmpty ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-base">
              Set up Slack, Webhook, and Github Action Automations to Receive
              Alerts
            </p>
          ) : (
            <MonitorAutomationsSelectableList
              isDisabled={!hasAccess}
              automations={automations}
              selectedTriggerIds={triggerIds}
              onSelectedTriggerIdsChange={onTriggerIdsChange}
            />
          )}
          {/* One CTA for both states: it owns the create dialog, so it must stay
              mounted when the first automation turns the empty state into a list. */}
          <AddAutomationDropdown
            projectId={projectId}
            fullWidth
            isDisabled={!hasAccess}
            onAutomationCreated={selectCreatedAutomation}
          />
        </CardContent>
      </Card>
    </div>
  );
};

/** MonitorAutomationsSelectableList renders the selectable automations and reports the selected trigger IDs. */
const MonitorAutomationsSelectableList = ({
  isDisabled,
  automations,
  selectedTriggerIds,
  onSelectedTriggerIdsChange,
}: {
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
    <MonitorAutomationsList
      automations={automations}
      isDisabled={isDisabled}
      selectedTriggerIds={activeSelectedTriggerIds}
      onClick={toggleSelectedTriggerId}
    />
  );
};

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
      className="icon-base shrink-0"
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
    {checked && <Check size="base" />}
  </span>
);

/**
 * AddAutomationDropdown renders the "+ Automation" CTA for the empty state and
 * the list footer. Creation happens in a dialog on this page: navigating to the
 * automations page unmounted the monitor form and lost the draft (LFE-10982).
 */
const AddAutomationDropdown = ({
  projectId,
  fullWidth,
  isDisabled,
  onAutomationCreated,
}: {
  projectId: string;
  fullWidth?: boolean;
  isDisabled?: boolean;
  onAutomationCreated: (automationId: string) => void;
}) => {
  const actionTypes = useAvailableActionTypes(ActionTypeSchema.options);

  return (
    <NewMonitorAutomationDialogController
      projectId={projectId}
      onCreated={onAutomationCreated}
    >
      {({ openDialog }) => (
        <DropdownMenu
          disabled={isDisabled}
          placement="bottom-end"
          items={[
            {
              type: "item",
              id: "new",
              title: "New automation",
              icon: Plus,
              onClick: () => openDialog(),
            },
            ...actionTypes.map((actionType) => ({
              type: "item" as const,
              id: actionType,
              title: actionTypeLabel[actionType],
              icon: actionIcon[actionType],
              onClick: () => openDialog({ actionType }),
            })),
          ]}
        >
          {({ getTriggerProps }) => (
            <Button
              variant="outline"
              size="lg"
              disabled={isDisabled}
              className={fullWidth ? "w-full" : undefined}
              {...getTriggerProps()}
            >
              <Plus size="base" color="default" __rawClassName="mr-2" />
              Automation
            </Button>
          )}
        </DropdownMenu>
      )}
    </NewMonitorAutomationDialogController>
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
      return <WebhookIcon __rawClassName={className} />;
    case "SLACK":
      return <Slack __rawClassName={className} />;
    case "GITHUB_DISPATCH":
      return <Github __rawClassName={className} />;
    case "PAGERDUTY":
      return <SiPagerduty __rawClassName={className} />;
  }
};
