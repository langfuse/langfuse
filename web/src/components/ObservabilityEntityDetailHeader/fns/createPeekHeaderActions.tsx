import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import type { ListEntry } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { ExternalLink, Maximize2, Minimize2, X } from "@langfuse/icons";
import type {
  EntityDetailHeaderAction,
  EntityDetailHeaderConfiguration,
} from "../ObservabilityEntityDetailHeader";

export function createPeekHeaderActions({
  navigation,
  expand,
  openInNewTab,
  onClose,
}: {
  navigation?: {
    itemId: string;
    listKey: string;
    resolvePath: (entry: ListEntry) => string;
  };
  expand?: { isExpanded: boolean; onToggle: () => void };
  openInNewTab?: () => void;
  onClose: () => void;
}): Extract<
  EntityDetailHeaderConfiguration,
  { variant: "peek" }
>["headerProps"]["actions"] {
  const actions: EntityDetailHeaderAction[] = [];
  if (openInNewTab) {
    actions.push({
      id: "open-in-new-tab",
      type: "button",
      label: "Open in new tab",
      icon: ExternalLink,
      iconOnly: true,
      onClick: openInNewTab,
    });
  }
  if (expand) {
    actions.push({
      id: "expand",
      type: "button",
      label: expand.isExpanded ? "Collapse" : "Expand",
      icon: expand.isExpanded ? Minimize2 : Maximize2,
      iconOnly: true,
      pinned: true,
      onClick: expand.onToggle,
    });
  }
  if (navigation) {
    actions.push({
      id: "navigation",
      type: "custom",
      pinned: true,
      render: () => (
        <DetailPageNav
          currentId={navigation.itemId}
          path={navigation.resolvePath}
          listKey={navigation.listKey}
          compact
        />
      ),
    });
  }
  return [
    ...actions,
    {
      id: "close",
      type: "button",
      label: "Close",
      icon: X,
      iconOnly: true,
      pinned: true,
      onClick: onClose,
    },
  ];
}
