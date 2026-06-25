import { Button } from "@/src/components/ui/button";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { Maximize2, Minimize2, X } from "lucide-react";

type PeekHeaderProps = {
  itemType: LangfuseItemType;
  title: React.ReactNode;
  itemId: string;
  detailNavigationKey?: string;
  resolveDetailNavigationPath?: (entry: ListEntry) => string;
  /** Item-specific actions (star / publish / delete …), shared with the page. */
  actions?: React.ReactNode;
  /** Expand-to-max-width toggle. Desktop only; hidden on mobile. */
  expand?: { isExpanded: boolean; onToggle: () => void };
  onClose: () => void;
};

/**
 * Visible peek chrome shared by the desktop sheet and the mobile drawer. The
 * accessible dialog title is provided (visually hidden) by each shell, so this
 * stays a plain view component that works inside either primitive.
 */
export function PeekHeader({
  itemType,
  title,
  itemId,
  detailNavigationKey,
  resolveDetailNavigationPath,
  actions,
  expand,
  onClose,
}: PeekHeaderProps) {
  return (
    <div className="bg-header flex min-h-11 shrink-0 flex-row flex-nowrap items-center justify-between gap-2 px-2 py-1">
      <div className="flex min-w-0 flex-row items-center gap-2">
        <ItemBadge type={itemType} showLabel />
        <span
          className="truncate text-sm font-medium focus:outline-hidden"
          tabIndex={0}
          title={typeof title === "string" ? title : undefined}
        >
          {title}
        </span>
      </div>
      <div className="flex shrink-0 flex-row items-center gap-1">
        {actions ? (
          <div className="flex flex-row items-center gap-1">{actions}</div>
        ) : null}
        {detailNavigationKey && resolveDetailNavigationPath && (
          <DetailPageNav
            currentId={itemId}
            path={resolveDetailNavigationPath}
            listKey={detailNavigationKey}
          />
        )}
        <div className="flex h-full flex-row items-center gap-1 border-l pl-1">
          {expand && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={expand.isExpanded ? "Collapse peek" : "Expand peek"}
              title={expand.isExpanded ? "Collapse" : "Expand"}
              onClick={expand.onToggle}
            >
              {expand.isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
