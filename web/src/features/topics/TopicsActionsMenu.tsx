import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { type TopicsActions } from "./prepare-topics-actions";

export function TopicsActionsMenu({
  actions,
  closeMenu,
}: {
  actions: TopicsActions;
  closeMenu: (options?: { handoffFocus?: boolean }) => void;
}) {
  const { display } = actions;
  const DisplayIcon = display.icon;
  return (
    <>
      {actions.menu.map((action) => {
        const Icon = action.icon;
        function select() {
          closeMenu({ handoffFocus: action.id === "history" });
          action.onSelect();
        }
        return (
          <HeaderActionMenuRow
            key={action.id}
            label={action.label}
            icon={<Icon size="base" color="default" />}
            badge={
              action.badge ? <Badge text={action.badge} size="sm" /> : undefined
            }
            disabled={Boolean(action.disabledReason)}
            disabledReason={action.disabledReason}
            onClick={select}
          />
        );
      })}
      <HeaderActionMenuRow
        label={display.label}
        icon={<DisplayIcon size="base" color="default" />}
        badge={<Badge text={display.checked ? "On" : "Off"} size="sm" />}
        aria-pressed={display.checked}
        onClick={() => display.onCheckedChange(!display.checked)}
      />
    </>
  );
}
