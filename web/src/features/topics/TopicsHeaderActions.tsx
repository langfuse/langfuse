import { EllipsisVertical, Pencil } from "@langfuse/icons";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { type TopicsActions } from "./prepare-topics-actions";

export function TopicsHeaderActions({ actions }: { actions: TopicsActions }) {
  return (
    <div className="ph-no-capture flex shrink-0 items-center justify-end gap-1">
      {actions.editRun && <EditMapButton editRun={actions.editRun} />}
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

function EditMapButton({
  editRun,
}: {
  editRun: NonNullable<TopicsActions["editRun"]>;
}) {
  if (!editRun.disabledReason)
    return (
      <Button
        text="Edit map"
        icon={Pencil}
        size="default"
        variant="ghost"
        onClick={editRun.onSelect}
      />
    );
  return (
    // Disabled buttons fire no pointer events, so the tooltip listens on a wrapper.
    <Tooltip label={editRun.disabledReason}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          className="inline-flex cursor-not-allowed [&>button]:pointer-events-none"
        >
          <Button
            text="Edit map"
            icon={Pencil}
            size="default"
            variant="ghost"
            disabled
          />
        </span>
      )}
    </Tooltip>
  );
}
