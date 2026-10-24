import { type ReactNode } from "react";
import { History, Play, RefreshCw } from "@langfuse/icons";
import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";

export function TopicsActionsMenu({
  children,
  triggerAction,
  closeMenu,
  onOpenHistory,
  onRefresh,
}: TopicsActionsMenuProps) {
  function processTraces() {
    closeMenu();
    triggerAction?.onSelect();
  }
  function openHistory() {
    closeMenu({ handoffFocus: true });
    onOpenHistory();
  }
  function refreshResults() {
    closeMenu();
    onRefresh();
  }
  return (
    <>
      {children}
      {triggerAction && (
        <HeaderActionMenuRow
          label={triggerAction.label}
          icon={<Play size="base" color="default" />}
          disabled={triggerAction.disabled}
          onClick={processTraces}
        />
      )}
      <HeaderActionMenuRow
        label="History"
        icon={<History size="base" color="default" />}
        onClick={openHistory}
      />
      <HeaderActionMenuRow
        label="Refresh results"
        icon={<RefreshCw size="base" color="default" />}
        onClick={refreshResults}
      />
    </>
  );
}

type TopicsActionsMenuProps = {
  children?: ReactNode;
  triggerAction: {
    label: string;
    disabled: boolean;
    onSelect: () => void;
  } | null;
  closeMenu: (options?: { handoffFocus?: boolean }) => void;
  onOpenHistory: () => void;
  onRefresh: () => void;
};
