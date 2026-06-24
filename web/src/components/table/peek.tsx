import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Sheet, SheetPortal } from "@/src/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTitle } from "@/src/components/ui/drawer";
import { type LangfuseItemType } from "@/src/components/ItemBadge";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { cn } from "@/src/utils/tailwind";
import { memo } from "react";
import { useRouter } from "next/router";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { PeekTableStateProvider } from "@/src/components/table/peek/contexts/PeekTableStateContext";
import { PeekHeader } from "@/src/components/table/peek/PeekHeader";
import { usePeekPanelState } from "@/src/components/table/peek/usePeekPanelState";
import { shouldIgnoreOutsideInteraction } from "@/src/utils/outside-interaction";

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

type TablePeekViewProps = Pick<
  DataTablePeekViewProps,
  | "itemType"
  | "detailNavigationKey"
  | "resolveDetailNavigationPath"
  | "closePeek"
  | "expandPeek"
  | "peekEventOptions"
> & {
  title?: string;
  // Content
  /**
   * The content to display in the peek view.
   */
  children: React.ReactNode;
};

/**
 * Decide whether an outside interaction should keep the peek open instead of
 * closing it. The peek closes on a genuine click-outside, with two exceptions
 * that preserve power-user behavior:
 * - clicking another table row (`[data-row-index]`) switches the peeked item in
 *   place rather than closing (handled by the row's own click handler), and
 * - regions that opt out via `data-ignore-outside-interaction` (e.g. the in-app
 *   assistant) or the table's configured `ignoredSelectors` (row checkboxes,
 *   bookmark toggles) never trigger a close.
 */
const shouldKeepPeekOpenOnOutsideInteraction = (
  target: EventTarget | null,
  matchesIgnoredSelector: () => boolean,
): boolean => {
  if (matchesIgnoredSelector()) return true;
  if (shouldIgnoreOutsideInteraction(target)) return true;
  if (target instanceof Element && target.closest("[data-row-index]")) {
    return true;
  }
  return false;
};

function TablePeekViewComponent(props: TablePeekViewProps) {
  const { title, children } = props;
  const router = useRouter();
  const isMobile = useIsMobile();
  const panel = usePeekPanelState();
  const eventHandler = createPeekEventHandler(props.peekEventOptions);
  const itemId = router.query.peek as string | undefined;

  // Hooks run unconditionally above this early return so ordering stays stable
  // across open/close. Returning null on close unmounts PeekTableStateProvider,
  // which is what resets nested-table state when the peek closes (see README).
  if (!itemId) return null;

  const handleOpenChange = (open: boolean) => {
    // Open is driven by row clicks / detail-page navigation; we only react to
    // close requests (Escape, swipe-down, click-outside, the close button).
    if (open) return;
    props.closePeek();
  };

  const resolvedTitle = title ?? itemId;

  const header = (
    <PeekHeader
      itemType={props.itemType}
      title={resolvedTitle}
      itemId={itemId}
      detailNavigationKey={props.detailNavigationKey}
      resolveDetailNavigationPath={props.resolveDetailNavigationPath}
      onExpand={props.expandPeek}
      fullscreen={
        isMobile
          ? undefined
          : {
              isFullscreen: panel.isFullscreen,
              onToggle: panel.toggleFullscreen,
            }
      }
      onClose={props.closePeek}
    />
  );

  const body = (
    <PeekTableStateProvider>
      <div className="flex max-h-full min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-auto" key={itemId}>
          {children}
        </div>
      </div>
    </PeekTableStateProvider>
  );

  // Mobile: a vaul bottom drawer with native swipe-down dismissal.
  if (isMobile) {
    return (
      <Drawer
        open={!!itemId}
        onOpenChange={handleOpenChange}
        forceDirection="bottom"
      >
        <DrawerContent
          size="full"
          className="min-h-screen-with-banner top-[calc(var(--banner-offset)+10px)] bottom-0 gap-0 p-0"
        >
          <DrawerTitle className="sr-only">{resolvedTitle}</DrawerTitle>
          <div className="flex w-full shrink-0 items-center justify-center pt-2 pb-1">
            <div className="bg-muted h-1.5 w-12 rounded-full" />
          </div>
          {header}
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: a docked-right, resizable panel that stays on top of the table
  // (non-modal, no overlay) so the table behind remains interactive.
  return (
    <Sheet open={!!itemId} onOpenChange={handleOpenChange} modal={false}>
      <SheetPortal>
        <SheetPrimitive.Content
          aria-describedby={undefined}
          style={panel.panelStyle}
          onPointerDownOutside={(e) => {
            if (
              shouldKeepPeekOpenOnOutsideInteraction(e.target, eventHandler)
            ) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (
              shouldKeepPeekOpenOnOutsideInteraction(e.target, eventHandler)
            ) {
              e.preventDefault();
            }
          }}
          // Never close because focus moved out (e.g. into a portaled popover or
          // another input); only pointer/Escape/close-button drive dismissal.
          onFocusOutside={(e) => e.preventDefault()}
          className={cn(
            "bg-background top-banner-offset h-screen-with-banner fixed right-0 bottom-0 flex max-h-full min-h-0 max-w-none flex-col gap-0 overflow-hidden border-l shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-100 data-[state=open]:duration-100",
            panel.isResizing && "select-none",
          )}
        >
          <SheetPrimitive.Title className="sr-only">
            {resolvedTitle}
          </SheetPrimitive.Title>
          {header}
          {body}
          {/* Rendered last so it is not the dialog's initial focus target; it
              is absolutely positioned on the left edge regardless of DOM order. */}
          <div
            {...panel.resizeHandleProps}
            className="group/resize absolute inset-y-0 left-0 z-10 flex w-2 cursor-ew-resize touch-none items-center justify-center focus-visible:outline-hidden"
          >
            <div
              aria-hidden="true"
              className={cn(
                // Neutral, low-contrast affordance — the left border is the real
                // edge; this only gently emphasizes it on hover/drag (no brand
                // accent, in line with the cursor doing most of the signalling).
                "h-full w-0.5 bg-transparent transition-colors",
                "group-hover/resize:bg-muted-foreground/30 group-focus-visible/resize:bg-muted-foreground/40",
                panel.isResizing && "bg-muted-foreground/50",
              )}
            />
          </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}

export const TablePeekView = memo(TablePeekViewComponent);
