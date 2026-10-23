import { type ReactNode } from "react";
import { History, RefreshCw } from "@langfuse/icons";
import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";

type TopicsActionsMenuProps = {
  /** Settings row, when the project has saved settings. */
  children?: ReactNode;
  regenerate: { disabled: boolean; onSelect: () => void };
  closeMenu: (options?: { handoffFocus?: boolean }) => void;
  onOpenHistory: () => void;
};

export function TopicsActionsMenu({
  children,
  regenerate,
  closeMenu,
  onOpenHistory,
}: TopicsActionsMenuProps) {
  function regenerateTopics() {
    closeMenu();
    regenerate.onSelect();
  }
  function openHistory() {
    closeMenu({ handoffFocus: true });
    onOpenHistory();
  }
  return (
    <>
      <HeaderActionMenuRow
        label="Regenerate topics"
        icon={<RefreshCw size="base" color="default" />}
        disabled={regenerate.disabled}
        onClick={regenerateTopics}
      />
      <HeaderActionMenuRow
        label="History"
        icon={<History size="base" color="default" />}
        onClick={openHistory}
      />
      {children}
    </>
  );
}
