import { EllipsisVertical } from "@langfuse/icons";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { AnalyzeControl } from "./AnalyzeControl";
import { type TopicsActions } from "./prepare-topics-actions";

export function TopicsHeaderActions({ actions }: { actions: TopicsActions }) {
  return (
    <div className="ph-no-capture flex shrink-0 items-center justify-end gap-1">
      {actions.automatic && (
        <div className="hidden items-center gap-1 @5xl/topics-header:flex">
          <AnalyzeControl
            state={actions.automatic.state}
            disabledReason={actions.automatic.disabledReason}
            onClick={actions.automatic.onSelect}
          />
        </div>
      )}
      <DropdownMenu
        ariaLabel="Topics actions"
        placement="bottom-end"
        items={[
          ...actions.menu.map((action) => ({
            id: action.id,
            type: "item" as const,
            title: action.label,
            icon: action.icon,
            badge: action.badge ? (
              <Badge text={action.badge} size="sm" />
            ) : undefined,
            disabled: action.disabledReason
              ? { reason: action.disabledReason }
              : undefined,
            onClick: action.onSelect,
          })),
          { id: "display-separator", type: "separator" },
          {
            id: actions.display.id,
            type: "checkbox",
            title: actions.display.label,
            icon: actions.display.icon,
            checked: actions.display.checked,
            onCheckedChange: actions.display.onCheckedChange,
          },
        ]}
      >
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={EllipsisVertical}
            label="Topics actions"
            size="sm"
          />
        )}
      </DropdownMenu>
    </div>
  );
}
