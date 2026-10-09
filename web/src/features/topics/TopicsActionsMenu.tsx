import { type ReactNode } from "react";
import { History, Play, RefreshCw } from "lucide-react";
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
          icon={<Play className="icon-base text-icon-foreground" />}
          disabled={triggerAction.disabled}
          onClick={processTraces}
        />
      )}
      <HeaderActionMenuRow
        label="History"
        icon={<History className="icon-base text-icon-foreground" />}
        onClick={openHistory}
      />
      <HeaderActionMenuRow
        label="Refresh results"
        icon={<RefreshCw className="icon-base text-icon-foreground" />}
        onClick={refreshResults}
      />
    </>
  );
}

type TopicsActionsMenuProps = {
  children: ReactNode;
  triggerAction: {
    label: string;
    disabled: boolean;
    onSelect: () => void;
  } | null;
  closeMenu: (options?: { handoffFocus?: boolean }) => void;
  onOpenHistory: () => void;
  onRefresh: () => void;
};
