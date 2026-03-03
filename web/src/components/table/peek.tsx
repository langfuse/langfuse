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
import { memo } from "react";
import { useRouter } from "next/router";
import { PeekTableStateProvider } from "@/src/components/table/peek/contexts/PeekTableStateContext";

type PeekViewItemType = Extract<
  LangfuseItemType,
  "TRACE" | "DATASET_ITEM" | "RUNNING_EVALUATOR" | "EVALUATOR"
>;

/**
 * Options to control peek event behavior.
 * Ignore close events from certain clickable elements to ensure integrity of table row actions.
 */
export type PeekEventControlOptions = {
  ignoredSelectors?: string[];
};

/**
 * Configuration for a data table peek view.
 */
export type DataTablePeekViewProps = {
  // Core identification
  /** The type of item being peeked at */
  itemType: PeekViewItemType;
  /** Key used for detail page navigation */
  detailNavigationKey?: string;
  /** Custom prefix for the peek view title */
  customTitlePrefix?: string;

  // Navigation and URL handling
  /** Function to resolve the navigation path for a list entry */
  resolveDetailNavigationPath?: (entry: ListEntry) => string;

  // Event handlers
  /** Called to open the peek view. If undefined, row clicks won't trigger peek view opening */
  openPeek?: (id?: string, row?: any) => void;
  /** Called to close the peek view*/
  closePeek: () => void;
  /** Called when the peek view is expanded to full view */
  expandPeek?: (openInNewTab: boolean) => void;
  /** Additional peek event options */
  peekEventOptions?: PeekEventControlOptions;

  // Content
  /**
   * The content to display in the peek view.
   */
  children: React.ReactNode;
};

export const createPeekEventHandler = (options?: PeekEventControlOptions) => {
  if (!options) return () => false;
  const { ignoredSelectors = [] } = options;

  return (): boolean => {
    for (const selector of ignoredSelectors) {
      if (document.activeElement?.closest(selector)) {
        return true;
      }
    }

    return false;
  };
};

type TablePeekViewProps = {
  peekView: DataTablePeekViewProps;
};

function TablePeekViewComponent(props: TablePeekViewProps) {
  const { peekView } = props;
  const router = useRouter();
  const eventHandler = createPeekEventHandler(peekView.peekEventOptions);
  const itemId = router.query.peek as string | undefined;

  if (!itemId) return null;

  const handleOpenChange = (open: boolean) => {
    // Note: Only handles close events as open events are handled by user clicking on a row in the table or navigating via detail page navigation
    if (open || eventHandler()) return;
    peekView.closePeek();
  };

  const canExpand = typeof peekView.expandPeek === "function";

  return (
    <Sheet open={!!itemId} onOpenChange={handleOpenChange} modal={false}>
      <SheetContent
        onPointerDownOutside={(e) => {
          // Prevent the default behavior of closing when clicking outside when we set modal={false}
          e.preventDefault();
        }}
        side="right"
        className="flex max-h-full min-h-0 min-w-[60vw] flex-col gap-0 overflow-hidden p-0"
      >
        <SheetHeader className="flex min-h-11 flex-row flex-nowrap items-center justify-between bg-header px-2 py-1">
          <SheetTitle className="!mt-0 ml-2 flex min-w-0 flex-row items-center gap-2">
            <ItemBadge type={peekView.itemType} showLabel />
            <span
              className="truncate text-sm font-medium focus:outline-none"
              tabIndex={0}
            >
              {peekView.customTitlePrefix
                ? `${peekView.customTitlePrefix} ${itemId}`
                : itemId}
            </span>
          </SheetTitle>
          <div
            className={cn(
              "!mt-0 flex flex-shrink-0 flex-row items-center gap-2",
              !canExpand && "mr-8",
            )}
          >
            {itemId &&
              peekView.detailNavigationKey &&
              peekView.resolveDetailNavigationPath && (
                <DetailPageNav
                  currentId={itemId}
                  path={peekView.resolveDetailNavigationPath}
                  listKey={peekView.detailNavigationKey}
                />
              )}
            {canExpand && (
              <div className="!mt-0 mr-8 flex h-full flex-row items-center gap-1 border-l">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Open in current tab"
                  className="ml-2"
                  onClick={() => peekView.expandPeek?.(false)}
                >
                  <Expand className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Open in new tab"
                  onClick={() => peekView.expandPeek?.(true)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>
        <Separator />
        <PeekTableStateProvider>
          <div className="flex max-h-full min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-auto" key={itemId}>
              {peekView.children}
            </div>
          </div>
        </PeekTableStateProvider>
      </SheetContent>
    </Sheet>
  );
}

export const TablePeekView = memo(TablePeekViewComponent);
