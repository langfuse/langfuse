import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  planDetailViewHeaderActions,
  type DetailViewHeaderActionsPlacement,
} from "@/src/features/traces/components/detailViewHeaderLayout";

/** Padded container shared by the trace and observation detail headers. */
export function DetailViewHeaderShell({ children }: { children: ReactNode }) {
  return <div className="shrink-0 space-y-1.5 px-4 pt-3 pb-2">{children}</div>;
}

// Tuned by eye: the width the title keeps before the actions move off its row,
// and the `gap-2` between the two while they share one.
const MIN_TITLE_PX = 160;
const TITLE_ACTIONS_GAP_PX = 8;

/**
 * Title row shared by the trace and observation detail headers: the entity
 * title, and the action cluster placed from the header's own measured width —
 * beside the title, below it, or folded into the title row's overflow menu.
 *
 * See {@link planDetailViewHeaderActions}. The cluster never wraps, so a
 * trailing button can never end up on a row of its own.
 */
export function DetailViewHeaderTitleRow({
  renderTitle,
  actions,
  actionsKey,
  alwaysFold,
}: {
  /** Title slot; told whether the actions folded, so it can host the menu. */
  renderTitle: (layout: { actionsFolded: boolean }) => ReactNode;
  /** The inline action cluster. Mounted only while it is not folded. */
  actions: ReactNode;
  /**
   * Changes whenever the cluster's content changes width — a comment count, a
   * hidden Annotate, a different entity. A folded cluster is unmounted and so
   * cannot be measured, so this is the only way the row learns that a narrower
   * cluster now deserves a second look.
   */
  actionsKey: string;
  /** Fold whatever the width — the handheld presentation. */
  alwaysFold: boolean;
}) {
  // The row's width is the pane's, so a resize of either re-renders and replans.
  const [rowRef, rowSize] = useElementSize<HTMLDivElement>();
  const actionsRef = useRef<HTMLDivElement>(null);
  // A folded cluster has no element to measure, so its last natural width is
  // kept here and goes on feeding the planner until it is back on screen.
  const actionsWidthRef = useRef<number | undefined>(undefined);
  const [placement, setPlacement] =
    useState<DetailViewHeaderActionsPlacement>("beside");

  // New content, so the cached width is about the old content: show the cluster
  // again, which both re-mounts it for measurement and settles on the right
  // placement in the same pre-paint pass.
  const [measuredKey, setMeasuredKey] = useState(actionsKey);
  if (measuredKey !== actionsKey) {
    setMeasuredKey(actionsKey);
    actionsWidthRef.current = undefined;
    setPlacement("beside");
  }

  // Measure and plan before paint: `useElementSize`'s state lands after it,
  // which would show the un-adapted header for a frame. `actions` is a
  // dependency because the cluster's width is its content — a comment count
  // arriving or annotation mode hiding Annotate changes it with no resize.
  useLayoutEffect(() => {
    if (alwaysFold) return;
    if (placement !== "folded" && actionsRef.current) {
      actionsWidthRef.current = actionsRef.current.offsetWidth;
    }
    const headerWidth =
      rowRef.current?.getBoundingClientRect().width ?? rowSize?.width;
    const actionsWidth = actionsWidthRef.current;
    if (!headerWidth || !actionsWidth) return;

    const next = planDetailViewHeaderActions({
      headerWidth,
      actionsWidth,
      minTitleWidth: MIN_TITLE_PX,
      gap: TITLE_ACTIONS_GAP_PX,
    });
    setPlacement((previous) => (previous === next ? previous : next));
  }, [actions, alwaysFold, placement, rowRef, rowSize?.width]);

  const actionsFolded = alwaysFold || placement === "folded";
  const actionsBeside = !actionsFolded && placement === "beside";

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
        {renderTitle({ actionsFolded })}
      </div>
      {actionsFolded ? null : (
        <div
          className={cn(
            "flex items-center",
            actionsBeside ? "justify-end" : "justify-start",
          )}
        >
          {/* Shrink-to-fit and never wrapping, so `offsetWidth` above is the
              cluster's natural width whichever row it is on. */}
          <div
            ref={actionsRef}
            className="flex shrink-0 flex-nowrap items-center gap-1"
          >
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}
