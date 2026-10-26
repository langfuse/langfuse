import { MoreHorizontal } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { AutomaticProcessingControl } from "./AutomaticProcessingControl";
import { type TopicsActions } from "./prepare-topics-actions";

export function TopicsHeaderActions({ actions }: { actions: TopicsActions }) {
  return (
    <div className="ph-no-capture flex shrink-0 items-center justify-end gap-1">
      <div className="hidden items-center gap-1 @5xl/topics-header:flex">
        {actions.automatic && (
          <AutomaticProcessingControl action={actions.automatic} />
        )}
        {actions.inline.map((action) => (
          <Button
            key={action.id}
            text={action.label}
            variant={action.variant}
            size="sm"
            disabled={Boolean(action.disabledReason)}
            onClick={action.onSelect}
          />
        ))}
      </div>
      <DropdownMenu
        ariaLabel="Topics actions"
        placement="bottom-end"
        items={actions.menu.map((action) => ({
          id: action.id,
          type: "item",
          title: action.label,
          icon: action.icon,
          badge: action.badge ? (
            <Badge text={action.badge} size="sm" />
          ) : undefined,
          disabled: action.disabledReason
            ? { reason: action.disabledReason }
            : undefined,
          onClick: action.onSelect,
        }))}
      >
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={MoreHorizontal}
            label="Topics actions"
            size="sm"
          />
        )}
      </DropdownMenu>
    </div>
  );
}
