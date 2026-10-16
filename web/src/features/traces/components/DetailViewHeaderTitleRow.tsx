import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  planDetailViewHeaderActions,
  type DetailViewHeaderActionsPlacement,
} from "@/src/features/traces/components/detailViewHeaderLayout";

// Tuned by eye: the width the title keeps before the actions move off its row,
// and the `gap-2` between the two while they share one.
const MIN_TITLE_PX = 160;
const TITLE_ACTIONS_GAP_PX = 8;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export type DetailViewHeaderTitleRowProps = {
  /** The entity title. */
  title: ReactNode;
  /** Sits beside the title while the actions have a place of their own. */
  options: ReactNode;
  /** Takes the place of `options` once the actions fold, and holds them. */
  foldedActions: ReactNode;
  /** The inline action cluster (full labels). Mounted only while it is not folded. */
  actions: ReactNode;
  /**
   * Icon-only variant of the action cluster (icons with tooltips, no labels).
   * When provided the planner inserts an intermediate `"icon-only"` step
   * between `"below"` and `"folded"`, so the header degrades progressively:
   * full labels → icon-only → ellipsis menu.
   */
  iconOnlyActions?: ReactNode;
  /**
   * Changes whenever the cluster's content changes width — a comment count, a
   * hidden Annotate, a different entity. A folded cluster is unmounted and so
   * cannot be measured, so this is the only way the row learns that a narrower
   * cluster now deserves a second look.
   */
  actionsKey: string;
  /** Fold whatever the width — the handheld presentation. */
  alwaysFold: boolean;
};

/**
 * Title row shared by the trace and observation detail headers: the entity
 * title, and the action cluster placed from the header's own measured width —
 * beside the title, below it, icon-only, or folded into the title row's
 * overflow menu.
 *
 * See {@link planDetailViewHeaderActions}. The cluster never wraps, so a
 * trailing button can never end up on a row of its own.
 */
export function DetailViewHeaderTitleRow({
  title,
  options,
  foldedActions,
  actions,
  iconOnlyActions,
  actionsKey,
  alwaysFold,
}: DetailViewHeaderTitleRowProps) {
  // The row's width is the pane's, so a resize of either re-renders and replans.
  const [rowRef, rowSize] = useElementSize<HTMLDivElement>();
  const actionsRef = useRef<HTMLDivElement>(null);
  const iconOnlyActionsRef = useRef<HTMLDivElement>(null);
  // A folded cluster has no element to measure, so its last natural width is
  // kept here and goes on feeding the planner until it is back on screen.
  const actionsWidthRef = useRef<number | undefined>(undefined);
  const iconOnlyActionsWidthRef = useRef<number | undefined>(undefined);
  const followFocusRef = useRef(false);
  const [placement, setPlacement] =
    useState<DetailViewHeaderActionsPlacement>("beside");

  // New content, so the cached width is about the old content: show the cluster
  // again, which both re-mounts it for measurement and settles on the right
  // placement in the same pre-paint pass.
  const [measuredKey, setMeasuredKey] = useState(actionsKey);
  if (measuredKey !== actionsKey) {
    setMeasuredKey(actionsKey);
    actionsWidthRef.current = undefined;
    iconOnlyActionsWidthRef.current = undefined;
    setPlacement("beside");
  }

  // Measure and plan before paint: `useElementSize`'s state lands after it,
  // which would show the un-adapted header for a frame. `actions` is a
  // dependency because the cluster's width is its content — a comment count
  // arriving or annotation mode hiding Annotate changes it with no resize.
  useLayoutEffect(() => {
    if (alwaysFold) return;
    if (placement !== "folded") {
      if (actionsRef.current) {
        actionsWidthRef.current = actionsRef.current.offsetWidth;
      }
      if (iconOnlyActionsRef.current) {
        iconOnlyActionsWidthRef.current =
          iconOnlyActionsRef.current.offsetWidth;
      }
    }
    const headerWidth =
      rowRef.current?.getBoundingClientRect().width ?? rowSize?.width;
    const actionsWidth = actionsWidthRef.current;
    if (!headerWidth || !actionsWidth) return;

    const next = planDetailViewHeaderActions({
      headerWidth,
      actionsWidth,
      iconOnlyActionsWidth: iconOnlyActionsWidthRef.current,
      minTitleWidth: MIN_TITLE_PX,
      gap: TITLE_ACTIONS_GAP_PX,
    });
    // Folding unmounts both clusters. If the keyboard was in either, follow it
    // to the menu that now holds the same actions rather than dropping to <body>.
    if (
      next === "folded" &&
      placement !== "folded" &&
      (actionsRef.current?.contains(document.activeElement) ||
        iconOnlyActionsRef.current?.contains(document.activeElement))
    ) {
      followFocusRef.current = true;
    }
    setPlacement((previous) => (previous === next ? previous : next));
  }, [actions, iconOnlyActions, alwaysFold, placement, rowRef, rowSize?.width]);

  useLayoutEffect(() => {
    if (!followFocusRef.current) return;
    followFocusRef.current = false;
    // The folded presentation ends in the overflow-menu trigger, so the row's
    // last focusable element is it.
    const focusable =
      rowRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.[focusable.length - 1]?.focus({ preventScroll: true });
  }, [placement, rowRef]);

  const actionsFolded = alwaysFold || placement === "folded";
  const actionsBeside = !actionsFolded && placement === "beside";
  const actionsIconOnly = !actionsFolded && placement === "icon-only";

  return (
    <div
      ref={rowRef}
      className={cn(
        "grid w-full items-center gap-2",
        actionsBeside ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1",
      )}
    >
      {/* `min-h-7` is the height of the icon buttons that sit in this row, so a
          header keeps its height while it is still loading skeletons. */}
      <div className="flex min-h-7 w-full min-w-0 flex-row items-center gap-2">
        {title}
        {actionsFolded ? foldedActions : options}
      </div>
      {actionsFolded ? null : (
        <div
          className={cn(
            "relative flex items-center",
            actionsBeside ? "justify-end" : "justify-start",
          )}
        >
          {/* Full-label cluster — shrink-to-fit and never wrapping, so
              `offsetWidth` above is the cluster's natural width whichever row
              it is on. Hidden (but still in the DOM for measurement) while the
              icon-only cluster is active. */}
          <div
            ref={actionsRef}
            className={cn(
              "flex shrink-0 flex-nowrap items-center gap-1",
              actionsIconOnly && "invisible absolute",
            )}
            aria-hidden={actionsIconOnly || undefined}
          >
            {actions}
          </div>
          {/* Icon-only cluster — shown instead of the full cluster once the
              header is too narrow for labeled buttons but wide enough for icons.
              Hidden (but still in the DOM for measurement) while the full
              cluster is active. */}
          {iconOnlyActions != null && (
            <div
              ref={iconOnlyActionsRef}
              className={cn(
                "flex shrink-0 flex-nowrap items-center gap-1",
                !actionsIconOnly && "invisible absolute",
              )}
              aria-hidden={!actionsIconOnly || undefined}
            >
              {iconOnlyActions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
