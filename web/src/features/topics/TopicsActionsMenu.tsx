import { type ReactNode } from "react";
import { History, Play, RefreshCw, Settings2 } from "lucide-react";
import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";

export function TopicsActionsMenu({
  children,
  hasFacets,
  triggerAction,
  closeMenu,
  onOpenConfiguration,
  onOpenHistory,
  onRefresh,
}: TopicsActionsMenuProps) {
  function processTraces() {
    closeMenu();
    triggerAction?.onSelect();
  }
  function configureTopics() {
    closeMenu({ handoffFocus: true });
    onOpenConfiguration();
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
      {hasFacets && (
        <HeaderActionMenuRow
          label="Configure topics"
          icon={<Settings2 className="icon-base text-icon-foreground" />}
          onClick={configureTopics}
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
  children?: ReactNode;
  hasFacets: boolean;
  triggerAction: {
    label: string;
    disabled: boolean;
    onSelect: () => void;
  } | null;
  closeMenu: (options?: { handoffFocus?: boolean }) => void;
  onOpenConfiguration: () => void;
  onOpenHistory: () => void;
  onRefresh: () => void;
};
