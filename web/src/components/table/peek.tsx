import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { Expand, ExternalLink } from "lucide-react";
import { Separator } from "@/src/components/ui/separator";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { cn } from "@/src/utils/tailwind";

type PeekViewItemType = Extract<LangfuseItemType, "TRACE" | "DATASET_ITEM">;

/**
 * Options to control peek event behavior.
 * Ignore close events from certain clickable elements to ensure integrity of table row actions.
 */
export type PeekEventControlOptions = {
  ignoredSelectors?: string[];
  customCheck?: (event?: Event) => boolean;
};

/**
 * Configuration for a data table peek view.
 */
export type DataTablePeekViewProps<TData> = {
  // Core identification
  /** The type of item being peeked at */
  itemType: PeekViewItemType;
  /** Key used for detail page navigation */
  listKey?: string;

  // Data
  /** The currently selected row ID */
  selectedRowId?: string | null;
  /** The row data for the selected item */
  row?: TData;

  // Navigation and URL handling
  /** The base pathname for constructing URLs */
  urlPathname: string;
  /** Function to get navigation path for a list entry */
  getNavigationPath?: (entry: ListEntry) => string;
  /** Whether to update the row when the peekViewId changes on detail page navigation. Defaults to false. */
  shouldUpdateRowOnDetailPageNavigation?: boolean;

  // Event handlers
  /** Called when the peek view is opened or closed */
  onOpenChange: (open: boolean, id?: string, timestamp?: string) => void;
  /** Called when the peek view is expanded to full view */
  onExpand?: (openInNewTab: boolean) => void;
  /** Additional peek event options */
  peekEventOptions?: PeekEventControlOptions;

  // Content
  /**
   * The content to display in the peek view.
   * Can be either a React node or a function that receives the row data and returns a React node.
   */
  children: React.ReactNode | ((row?: TData) => React.ReactNode);
};

export const createPeekEventHandler = (options?: PeekEventControlOptions) => {
  if (!options) return () => false;
  const { ignoredSelectors = [], customCheck } = options;

  return (): boolean => {
    if (customCheck?.()) {
      return true;
    }

    for (const selector of ignoredSelectors) {
      if (document.activeElement?.closest(selector)) {
        return true;
      }
    }

    return false;
  };
};

export function TablePeekView<TData>({
  itemType,
  selectedRowId,
  onOpenChange,
  onExpand,
  getNavigationPath,
  children,
  listKey,
  peekEventOptions,
  row,
}: DataTablePeekViewProps<TData>) {
  const eventHandler = createPeekEventHandler(peekEventOptions);

  if (!selectedRowId) return null;

  const handleOpenChange = (open: boolean) => {
    if (!open && eventHandler()) {
      return;
    }
    onOpenChange(open, selectedRowId);
  };

  const canExpand = typeof onExpand === "function";

  return (
    <Sheet open={!!selectedRowId} onOpenChange={handleOpenChange} modal={false}>
      <SheetContent
        onPointerDownOutside={(e) => {
          // Prevent the default behavior of closing when clicking outside when we set modal={false}
          e.preventDefault();
        }}
        side="right"
        className="flex max-h-full min-h-0 min-w-[60vw] flex-col gap-0 overflow-hidden rounded-l-xl p-0"
      >
        <SheetHeader className="flex min-h-12 flex-row justify-between rounded-t-xl bg-header px-2">
          <SheetTitle className="!mt-0 ml-2 flex flex-row items-center gap-2">
            <ItemBadge type={itemType} showLabel />
            <span
              className="text-sm font-medium focus:outline-none"
              tabIndex={0}
            >
              {selectedRowId}
            </span>
          </SheetTitle>
          <div
            className={cn(
              "!mt-0 flex flex-row items-center gap-2",
              !canExpand && "mr-8",
            )}
          >
            {selectedRowId && listKey && getNavigationPath && (
              <DetailPageNav
                currentId={selectedRowId}
                path={getNavigationPath}
                listKey={listKey}
              />
            )}
            {canExpand && (
              <div className="!mt-0 mr-8 flex h-full flex-row items-center gap-1 border-l">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Open in current tab"
                  className="ml-2"
                  onClick={() => onExpand(false)}
                >
                  <Expand className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Open in new tab"
                  onClick={() => onExpand(true)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>
        <Separator />
        <div className="flex max-h-full min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto">
            {typeof children === "function" ? children(row) : children}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
