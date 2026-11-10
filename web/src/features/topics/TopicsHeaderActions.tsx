import { EllipsisVertical, Pencil } from "@langfuse/icons";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { type TopicsActions } from "./prepare-topics-actions";

export function TopicsHeaderActions({ actions }: { actions: TopicsActions }) {
  return (
    <div className="ph-no-capture flex shrink-0 items-center justify-end gap-1">
      {actions.editRun && (
        <Button
          text="Edit run"
          icon={Pencil}
          size="default"
          variant="ghost"
          onClick={actions.editRun.onSelect}
        />
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
        ]}
      >
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={EllipsisVertical}
            label="Topics actions"
            size="md"
          />
        )}
      </DropdownMenu>
    </div>
  );
}
