import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Sheet, SheetPortal } from "@/src/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTitle } from "@/src/components/ui/drawer";
import { Separator } from "@/src/components/ui/separator";
import { type LangfuseItemType } from "@/src/components/ItemBadge";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { cn } from "@/src/utils/tailwind";
import { memo, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { getPathnameWithoutBasePath } from "@/src/utils/api";
import { urlSearchParamsToQuery } from "@/src/utils/navigation";
import { PeekTableStateProvider } from "@/src/components/table/peek/contexts/PeekTableStateContext";
import { PeekHeader } from "@/src/components/table/peek/PeekHeader";
import { usePeekPanelState } from "@/src/components/table/peek/usePeekPanelState";
import { shouldIgnoreOutsideInteraction } from "@/src/utils/outside-interaction";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

// Peek view-mode URL param (also cleared by usePeekNavigation on close). When
// `expanded`, the desktop peek widens to viewport − sidebar — shareable + back-able.
const PEEK_VIEW_PARAM = "peekView";
const PEEK_VIEW_EXPANDED = "expanded";

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
  // Drives the header's "Open in new tab" button (wired via expandConfig). The
  // in-place "Expand" is a separate control; this opens the standalone page in
  // a new tab. The old "open in current tab" variant (expandPeek(false)) is no
  // longer rendered.
  | "expandPeek"
  | "peekEventOptions"
> & {
  title?: string;
  /**
   * Item-specific header actions (star / publish / delete …), shared with the
   * full detail page so the peek and the page expose the same controls.
   */
  actions?: React.ReactNode;
  /**
   * The same actions rendered as labeled menu rows — shown in the header's
   * overflow "…" menu when the peek is too narrow for the inline icon row.
   */
  actionsMenu?: React.ReactNode;
  // Content
  /**
   * The content to display in the peek view.
   */
  children: React.ReactNode;
  /**
   * Optional footer content to display at the bottom of the peek view.
   * Useful for navigation controls or contextual actions.
   */
  footer?: React.ReactNode;
};

// Shared DataTable selection controls live outside the peek but must never
// dismiss it — clicking a selection checkbox is a selection action, not a
// dismiss. Row checkboxes are already covered by the `[data-row-index]` check
// below; this also covers the header "select all". Applied to every peek so
// tables don't each have to redeclare it (which is easy to forget).
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
export const shouldKeepPeekOpenOnOutsideInteraction = (
  target: EventTarget | null,
  ignoredSelectors: string[],
): boolean => {
  if (!(target instanceof Element)) return false;
  // Never dismiss for a target actually inside the peek. Radix usually detects
  // this, but primitives that capture the pointer natively (e.g. the inner
  // react-resizable-panels split handle) can bypass its inside-detection and be
  // misreported as outside — which would close the peek mid-drag and unmount
  // the panel group. This guard keeps interactions within the peek safe.
  if (target.closest("[data-peek-content]")) return true;
  if (shouldIgnoreOutsideInteraction(target)) return true;
  if (target.closest("[data-row-index]")) return true;
  return [...ALWAYS_KEEP_PEEK_OPEN_SELECTORS, ...ignoredSelectors].some(
    (selector) => target.closest(selector),
  );
};

/**
 * After an in-flight delete resolves, only close the peek if it STILL shows the
 * trace that was deleted. Deleting trace A then K/J-navigating to trace B before
 * the mutation settles must leave B's peek open — A's stale `closePeek` callback
 * would otherwise clear the (now-B) peek param and dismiss it (LFE-10535).
 */
export const shouldClosePeekAfterDelete = (
  currentPeekTraceId: string | undefined,
  deletedTraceId: string,
): boolean => currentPeekTraceId === deletedTraceId;

function TablePeekViewComponent(props: TablePeekViewProps) {
  const { title, children, footer } = props;
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const { isBetaEnabled: isV4 } = useV4Beta();
  const itemId = router.query.peek as string | undefined;
  const isExpanded = router.query[PEEK_VIEW_PARAM] === PEEK_VIEW_EXPANDED;
  const isMobile = useIsMobile();

  // Expanded is view state, owned by the peek and reflected in the URL so it is
  // shareable + survives reload. Managed here (not threaded through every table
  // consumer); usePeekNavigation clears the param when the peek closes. Uses
  // replace (not push) so toggling expand/collapse doesn't spam history.
  const setExpanded = useCallback(
    (expanded: boolean) => {
      const params = new URLSearchParams(window.location.search);
      const currentlyExpanded =
        params.get(PEEK_VIEW_PARAM) === PEEK_VIEW_EXPANDED;
      // No-op when the flag already matches: skip the redundant shallow
      // router.replace (and the re-render it would otherwise trigger).
      if (expanded === currentlyExpanded) return;
      // Header button, drag-past-threshold, and keyboard all commit through
      // here, so this (post no-op guard) fires once per real toggle.
      capture("peek:expand_toggle", {
        isExpanded: expanded,
        routePattern: router.pathname,
        isV4,
      });
      if (expanded) params.set(PEEK_VIEW_PARAM, PEEK_VIEW_EXPANDED);
      else params.delete(PEEK_VIEW_PARAM);
      router.replace(
        {
          pathname: getPathnameWithoutBasePath(),
          query: urlSearchParamsToQuery(params),
        },
        undefined,
        { shallow: true },
      );
    },
    [router, capture, isV4],
  );

  const panel = usePeekPanelState({
    isOpen: !!itemId,
    isExpanded,
    onExpandedChange: setExpanded,
    onResized: useCallback(
      (widthFraction: number, trigger: "drag" | "keyboard") => {
        capture("peek:resized", {
          // Bucketed viewport percentage — coarse metadata, not px.
          widthPercent: Math.round((widthFraction * 100) / 5) * 5,
          trigger,
          routePattern: router.pathname,
          isV4,
        });
      },
      [capture, router.pathname, isV4],
    ),
  });
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

  // Distinct from Expand (which widens in place via the URL): this opens the
  // standalone detail page in a NEW tab, leaving the peek untouched — handy for
  // comparing against the full-page view. Only when the consumer wired
  // expandConfig (so expandPeek exists).
  const expandPeek = props.expandPeek;
  const openInNewTab = expandPeek ? () => expandPeek(true) : undefined;

  const header = (
    <PeekHeader
      itemType={props.itemType}
      title={resolvedTitle}
      itemId={itemId}
      detailNavigationKey={props.detailNavigationKey}
      resolveDetailNavigationPath={props.resolveDetailNavigationPath}
      actions={props.actions}
      actionsMenu={props.actionsMenu}
      expand={
        isMobile
          ? undefined
          : {
              isExpanded: panel.isExpanded,
              onToggle: panel.toggleExpanded,
            }
      }
      openInNewTab={openInNewTab}
      onClose={props.closePeek}
    />
  );

  const content = (
    <div className="flex max-h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto" key={itemId}>
        {children}
      </div>
      {footer && (
        <>
          <Separator />
          <div className="shrink-0 px-3 py-2.5">{footer}</div>
        </>
      )}
    </div>
  );

  // One PeekTableStateProvider wraps BOTH shells, above the mobile/desktop
  // branch, so the nested-table state it holds (filters, sort, pagination,
  // search) survives a breakpoint cross — without this, resizing across the
  // mobile/desktop boundary swaps Drawer↔Sheet and would otherwise remount a
  // fresh provider, dropping that state. It unmounts only on close (the early
  // `return null` above), which is what resets the state (see README).
  return (
    <PeekTableStateProvider>
      {isMobile ? (
        // Mobile: a vaul bottom drawer with native swipe-down dismissal.
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
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        // Desktop: a docked-right, resizable panel that stays on top of the
        // table (non-modal, no overlay) so the table behind stays interactive.
        <Sheet open={!!itemId} onOpenChange={handleOpenChange} modal={false}>
          <SheetPortal>
            <SheetPrimitive.Content
              aria-describedby={undefined}
              data-peek-content=""
              style={panel.panelStyle}
              onPointerDownOutside={(e) => {
                if (
                  shouldKeepPeekOpenOnOutsideInteraction(
                    e.target,
                    ignoredSelectors,
                  )
                ) {
                  e.preventDefault();
                }
              }}
              onInteractOutside={(e) => {
                if (
                  shouldKeepPeekOpenOnOutsideInteraction(
                    e.target,
                    ignoredSelectors,
                  )
                ) {
                  e.preventDefault();
                }
              }}
              // Never close because focus moved out (e.g. into a portaled
              // popover or another input); only pointer/Escape/close-button
              // drive dismissal.
              onFocusOutside={(e) => e.preventDefault()}
              className={cn(
                // No overflow-hidden here: the resize handle straddles the left
                // edge (overhangs onto the table) so it's grabbable from either
                // side. The body clips its own content instead.
                "bg-modal top-banner-offset h-screen-with-banner fixed right-0 bottom-0 flex max-h-full min-h-0 max-w-none flex-col gap-0 border-l",
                // Soft shadow cast leftward (toward the table) to lift the peek
                // off the content behind it. Token-backed so it stays a DARK
                // cast in both modes: foreground is near-black in light mode,
                // and background is near-black in dark mode (where foreground
                // would flip to a white glow).
                "shadow-[-12px_0_32px_-16px_hsl(var(--foreground)/0.3)] dark:shadow-[-12px_0_32px_-16px_hsl(var(--background)/0.3)]",
                "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-100 data-[state=open]:duration-100",
                panel.isResizing && "select-none",
              )}
            >
              <SheetPrimitive.Title className="sr-only">
                {resolvedTitle}
              </SheetPrimitive.Title>
              {header}
              {content}
              {/* Rendered last so it is not the dialog's initial focus target.
                  It STRADDLES the left edge (−4px onto the table … +8px inside)
                  so it's an easy, grabbable target from either side; absolutely
                  positioned, so DOM order doesn't affect its placement. */}
              <div
                {...panel.resizeHandleProps}
                className="group/resize absolute inset-y-0 -left-1 z-20 flex w-3 cursor-ew-resize touch-none justify-center focus-visible:outline-hidden"
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    // Sits on the panel's left edge; subtle at rest, clearer on
                    // hover/drag (neutral, no brand accent — cursor signals it).
                    "h-full w-1 rounded-full transition-colors",
                    "group-hover/resize:bg-muted-foreground/40 group-focus-visible/resize:bg-muted-foreground/50",
                    panel.isResizing
                      ? "bg-muted-foreground/60"
                      : "bg-transparent",
                  )}
                />
              </div>
            </SheetPrimitive.Content>
          </SheetPortal>
        </Sheet>
      )}
    </PeekTableStateProvider>
  );
}

export const TablePeekView = memo(TablePeekViewComponent);
