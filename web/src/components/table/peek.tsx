import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Sheet, SheetPortal } from "@/src/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTitle } from "@/src/components/ui/drawer";
import { type LangfuseItemType } from "@/src/components/ItemBadge";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { cn } from "@/src/utils/tailwind";
import { memo, useEffect, useState } from "react";
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

// Shared DataTable selection controls live outside the peek but must never
// dismiss it — clicking a selection checkbox is a selection action, not a
// dismiss. Row checkboxes are already covered by the `[data-row-index]` check
// below; this also covers the header "select all". Applied to every peek so
// tables don't each have to re-declare it (which is easy to forget).
const ALWAYS_KEEP_PEEK_OPEN_SELECTORS = ['[role="checkbox"]'];

/**
 * Decide whether an outside interaction should keep the peek open instead of
 * closing it. The peek closes on a genuine click-outside, with exceptions that
 * preserve power-user behavior:
 * - clicking another table row (`[data-row-index]`) switches the peeked item in
 *   place rather than closing (handled by the row's own click handler),
 * - shared selection controls and any table-specific `ignoredSelectors`
 *   (bookmark toggles, etc.) don't close it, and
 * - regions that opt out via `data-ignore-outside-interaction` (e.g. the in-app
 *   assistant) never trigger a close.
 *
 * All checks run against the pointer event's `target`, not
 * `document.activeElement` — `onPointerDownOutside` fires on pointer-down,
 * before focus has moved to the clicked element.
 */
const shouldKeepPeekOpenOnOutsideInteraction = (
  target: EventTarget | null,
  ignoredSelectors: string[],
): boolean => {
  if (!(target instanceof Element)) return false;
  if (shouldIgnoreOutsideInteraction(target)) return true;
  if (target.closest("[data-row-index]")) return true;
  return [...ALWAYS_KEEP_PEEK_OPEN_SELECTORS, ...ignoredSelectors].some(
    (selector) => target.closest(selector),
  );
};

function TablePeekViewComponent(props: TablePeekViewProps) {
  const { title, children } = props;
  const router = useRouter();
  const itemId = router.query.peek as string | undefined;
  const isMobile = useIsMobile();
  const panel = usePeekPanelState({ isOpen: !!itemId });
  const ignoredSelectors = props.peekEventOptions?.ignoredSelectors ?? [];

  // Gate the first render on mount so we never paint the desktop sheet before
  // `useIsMobile` resolves (which would flash the wrong shell on a mobile
  // deep-link). Click-to-open is already post-mount, so it has no delay.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Hooks run unconditionally above this early return so ordering stays stable
  // across open/close. Returning null on close unmounts PeekTableStateProvider,
  // which is what resets nested-table state when the peek closes (see README).
  if (!itemId || !mounted) return null;

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
              shouldKeepPeekOpenOnOutsideInteraction(e.target, ignoredSelectors)
            ) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (
              shouldKeepPeekOpenOnOutsideInteraction(e.target, ignoredSelectors)
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
