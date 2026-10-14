import { type ReactNode } from "react";
import { DatabaseBackup, History, Play, RefreshCw } from "lucide-react";
import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";

export function TopicsActionsMenu({
  children,
  triggerAction,
  backfillAction,
  closeMenu,
  onOpenHistory,
  onRefresh,
}: TopicsActionsMenuProps) {
  function processTraces() {
    closeMenu();
    triggerAction?.onSelect();
  }
  function runBackfill() {
    closeMenu({ handoffFocus: true });
    backfillAction.onSelect();
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
        label="Run backfill"
        icon={<DatabaseBackup className="icon-base text-icon-foreground" />}
        disabled={backfillAction.disabled}
        onClick={runBackfill}
      />
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
  children?: ReactNode;
  triggerAction: {
    label: string;
    disabled: boolean;
    onSelect: () => void;
  } | null;
  backfillAction: { disabled: boolean; onSelect: () => void };
  closeMenu: (options?: { handoffFocus?: boolean }) => void;
  onOpenHistory: () => void;
  onRefresh: () => void;
};
