import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { Expand, ExternalLink, GripVertical } from "lucide-react";
import { Separator } from "@/src/components/ui/separator";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { cn } from "@/src/utils/tailwind";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type PeekViewProps } from "@/src/components/table/peek/hooks/usePeekView";

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
  /** Custom prefix for the peek view title */
  customTitlePrefix?: string;

  // Navigation and URL handling
  /** Function to get navigation path for a list entry */
  getNavigationPath?: (entry: ListEntry) => string;
  /** Whether to update the row when the peekViewId changes on detail page navigation. Defaults to false. */
  shouldUpdateRowOnDetailPageNavigation?: boolean;

  // Event handlers
  /** Called when the peek view is opened or closed */
  onOpenChange: (open: boolean, id?: string, timestamp?: string) => void;
  /** Called when the peek view is expanded to full view */
  onExpand?: (openInNewTab: boolean, row?: TData) => void;
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

// Custom hook for resize functionality
const useResizable = () => {
  const [width, setWidth] = useState(60); // Default 60vw
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(60);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    
    // Prevent text selection during resize
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, [width]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const deltaX = startXRef.current - e.clientX; // Inverted because we're resizing from the left
    const viewportWidth = window.innerWidth;
    const deltaPercent = (deltaX / viewportWidth) * 100;
    const newWidth = Math.max(30, Math.min(90, startWidthRef.current + deltaPercent));
    
    setWidth(newWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const handleDoubleClick = useCallback(() => {
    setWidth(60); // Reset to default
  }, []);

  // Touch events for mobile support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    
    setIsResizing(true);
    startXRef.current = touch.clientX;
    startWidthRef.current = width;
  }, [width]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isResizing) return;
    
    const touch = e.touches[0];
    if (!touch) return;
    
    const deltaX = startXRef.current - touch.clientX;
    const viewportWidth = window.innerWidth;
    const deltaPercent = (deltaX / viewportWidth) * 100;
    const newWidth = Math.max(30, Math.min(90, startWidthRef.current + deltaPercent));
    
    setWidth(newWidth);
  }, [isResizing]);

  const handleTouchEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Global event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isResizing, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  return {
    width,
    isResizing,
    handleMouseDown,
    handleTouchStart,
    handleDoubleClick,
  };
};

// Resize handle component
const ResizeHandle = ({ 
  onMouseDown, 
  onTouchStart, 
  onDoubleClick, 
  isResizing 
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onDoubleClick: () => void;
  isResizing: boolean;
}) => {
  return (
    <div
      className={cn(
        "absolute left-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center bg-transparent hover:bg-border/50 transition-colors",
        isResizing && "bg-primary/20"
      )}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-label="Resize peek view"
      aria-orientation="vertical"
      tabIndex={0}
      onKeyDown={(e) => {
        // Keyboard accessibility
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDoubleClick();
        }
      }}
    >
      <div 
        className={cn(
          "h-8 w-1 rounded-sm bg-border opacity-0 transition-opacity group-hover:opacity-100",
          isResizing && "opacity-100 bg-primary"
        )}
      />
    </div>
  );
};

type TablePeekViewProps<T> = {
  peekView: PeekViewProps<T>;
  row?: T;
  selectedRowId?: string | null;
};

function TablePeekViewComponent<TData>(props: TablePeekViewProps<TData>) {
  const { peekView, row, selectedRowId } = props;
  const eventHandler = createPeekEventHandler(peekView.peekEventOptions);
  const { width, isResizing, handleMouseDown, handleTouchStart, handleDoubleClick } = useResizable();

  if (!selectedRowId) return null;

  const handleOpenChange = (open: boolean) => {
    if (!open && eventHandler()) {
      return;
    }
    if (!!row && typeof row === "object" && "timestamp" in row) {
      peekView.onOpenChange(
        open,
        selectedRowId,
        (row as any).timestamp.toISOString(),
      );
    } else {
      peekView.onOpenChange(open, selectedRowId);
    }
  };

  const canExpand = typeof peekView.onExpand === "function";

  return (
    <Sheet open={!!selectedRowId} onOpenChange={handleOpenChange} modal={false}>
      <SheetContent
        onPointerDownOutside={(e) => {
          // Prevent the default behavior of closing when clicking outside when we set modal={false}
          e.preventDefault();
        }}
        side="right"
        className="group flex max-h-full min-h-0 flex-col gap-0 overflow-hidden rounded-l-xl p-0 relative"
        style={{
          minWidth: `${width}vw`,
          width: `${width}vw`,
        }}
      >
        <ResizeHandle
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onDoubleClick={handleDoubleClick}
          isResizing={isResizing}
        />
        <SheetHeader className="flex min-h-12 flex-row flex-nowrap items-center justify-between rounded-t-xl bg-header px-2">
          <SheetTitle className="!mt-0 ml-2 flex min-w-0 flex-row items-center gap-2">
            <ItemBadge type={peekView.itemType} showLabel />
            <span
              className="truncate text-sm font-medium focus:outline-none"
              tabIndex={0}
            >
              {peekView.customTitlePrefix
                ? `${peekView.customTitlePrefix} ${selectedRowId}`
                : selectedRowId}
            </span>
          </SheetTitle>
          <div
            className={cn(
              "!mt-0 flex flex-shrink-0 flex-row items-center gap-2",
              !canExpand && "mr-8",
            )}
          >
            {selectedRowId &&
              peekView.listKey &&
              peekView.getNavigationPath && (
                <DetailPageNav
                  currentId={selectedRowId}
                  path={peekView.getNavigationPath}
                  listKey={peekView.listKey}
                />
              )}
            {canExpand && (
              <div className="!mt-0 mr-8 flex h-full flex-row items-center gap-1 border-l">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Open in current tab"
                  className="ml-2"
                  onClick={() => peekView.onExpand?.(false, row)}
                >
                  <Expand className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Open in new tab"
                  onClick={() => peekView.onExpand?.(true, row)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>
        <Separator />
        <div className="flex max-h-full min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto" key={selectedRowId}>
            {typeof peekView.children === "function"
              ? peekView.children(row)
              : peekView.children}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const TablePeekView = memo(TablePeekViewComponent, (prev, next) => {
  return prev.selectedRowId === next.selectedRowId;
}) as typeof TablePeekViewComponent;
