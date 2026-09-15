import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  ItemTypeChip,
  type LangfuseItemType,
} from "@/src/components/ItemBadge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  X,
} from "lucide-react";

type PeekHeaderProps = {
  itemType: LangfuseItemType;
  title: React.ReactNode;
  itemId: string;
  detailNavigationKey?: string;
  resolveDetailNavigationPath?: (entry: ListEntry) => string;
  /** Item actions (delete …) as labeled rows for the "…" menu. */
  actionsMenu?: React.ReactNode;
  /** Expand-to-max-width toggle. Desktop only; hidden on mobile. */
  expand?: { isExpanded: boolean; onToggle: () => void };
  /** Open the standalone detail page in a new browser tab. Optional. */
  openInNewTab?: () => void;
  onClose: () => void;
};

// Header tooltips appear quickly and share one style (Radix Tooltip, not the
// slow/inconsistent native `title`).
const TOOLTIP_DELAY_MS = 300;

function HeaderIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Visible peek chrome shared by the desktop sheet and the mobile drawer. The
 * accessible dialog title is provided (visually hidden) by each shell, so this
 * stays a plain view component that works inside either primitive.
 *
 * The layout is fixed at every peek width: a label-only type badge and the
 * truncating title on the left, and a compact control cluster on the right
 * ("…" menu, open-in-tab, prev/next nav, close). Item actions always live in
 * the "…" menu, so nothing needs to fold as the peek narrows.
 */
export function PeekHeader({
  itemType,
  title,
  itemId,
  detailNavigationKey,
  resolveDetailNavigationPath,
  actionsMenu,
  expand,
  openInNewTab,
  onClose,
}: PeekHeaderProps) {
  // Actions and open-in-tab ALWAYS live in the "…" menu — the header shows
  // only nav / expand / close inline (usage data: nav dwarfs everything else).
  const hasMenu = Boolean(actionsMenu || expand);
  const hasNav = Boolean(detailNavigationKey && resolveDetailNavigationPath);

  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <div className="bg-muted flex min-h-11 shrink-0 flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden px-2 py-1">
        <div className="flex min-w-0 flex-row items-center gap-2">
          {/* Label-only chip, matching the full-page header (the label names
              the type; short enough to keep on any width). */}
          <div className="shrink-0">
            <ItemTypeChip type={itemType} />
          </div>
          <span
            className="truncate text-sm font-bold focus:outline-hidden"
            tabIndex={0}
            title={typeof title === "string" ? title : undefined}
          >
            {title}
          </span>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-1">
          {/* Pinned block, in order: "…" menu (share / delete / expand),
              open in new tab, nav (keeps K/J live), close. */}
          <div className="flex h-full flex-row items-center gap-1">
            {hasMenu && (
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>More</TooltipContent>
                </Tooltip>
                <PopoverContent
                  align="end"
                  // forceMount + hide-when-closed: the menu hosts controls with
                  // their own dialogs/popovers (share URL, delete confirm) that
                  // must survive the trigger closing.
                  forceMount
                  className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
                >
                  {actionsMenu}
                  {expand ? (
                    <button
                      type="button"
                      onClick={expand.onToggle}
                      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm py-1.5 pr-2 pl-1.5 text-sm"
                    >
                      {expand.isExpanded ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                      {expand.isExpanded ? "Collapse panel" : "Expand panel"}
                    </button>
                  ) : null}
                </PopoverContent>
              </Popover>
            )}
            {openInNewTab ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Open in new tab"
                    onClick={openInNewTab}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in new tab</TooltipContent>
              </Tooltip>
            ) : null}
            {hasNav && (
              <div className="flex flex-row items-center">
                {/* Always compact so the arrows match the icon-xs neighbors. */}
                <DetailPageNav
                  currentId={itemId}
                  path={resolveDetailNavigationPath!}
                  listKey={detailNavigationKey!}
                  compact
                />
              </div>
            )}
            <HeaderIconButton label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </HeaderIconButton>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
