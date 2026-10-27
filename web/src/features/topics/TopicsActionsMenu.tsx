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
  return actions.menu.map((action) => {
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
  });
}
