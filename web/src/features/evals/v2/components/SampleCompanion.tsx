import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { cn } from "@/src/utils/tailwind";

/** Matches Tailwind's xl breakpoint; null until known (first client render). */
export function useIsWideScreen(): boolean | null {
  const [isWide, setIsWide] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isWide;
}

/**
 * The sample-data + test companion. Testing is a feedback loop, not a step:
 * on wide screens this is a docked, collapsible right rail next to the
 * stepper; on smaller screens the same content opens as a slide-over sheet
 * (triggered from the fixed action bar, owned by the parent).
 */
export function SampleCompanion({
  title,
  headerControls,
  headerActions,
  footer,
  isWide,
  sheetOpen,
  onSheetOpenChange,
  railOpen,
  onRailOpenChange,
  children,
}: {
  title: string;
  /** Rendered in the header next to the title (e.g. observation controls). */
  headerControls?: ReactNode;
  /** Rendered on the header's right side (e.g. the test button). */
  headerActions?: ReactNode;
  /** Pinned below the scrolling body (e.g. the test output). */
  footer?: ReactNode;
  isWide: boolean | null;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  /** Wide-screen rail visibility, controlled by the parent so flows (e.g.
      pick-from-sample) can reopen a collapsed rail. */
  railOpen: boolean;
  onRailOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  // Rail width: a third of the layout by default, adjustable by dragging the
  // resize bar on the rail's edge (px once dragged).
  const asideRef = useRef<HTMLElement | null>(null);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const [railWidth, setRailWidth] = useState<number | null>(null);

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = asideRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = { startX: event.clientX, startWidth: rect.width };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    // The rail sits on the right, so dragging left grows it.
    setRailWidth(
      Math.min(
        Math.max(drag.startWidth + (drag.startX - event.clientX), 320),
        Math.max(360, window.innerWidth * 0.55),
      ),
    );
  };

  const handleResizeEnd = () => {
    dragState.current = null;
  };

  if (isWide === null) return null;

  if (isWide) {
    if (!railOpen) {
      return (
        <div className="bg-background flex h-full shrink-0 flex-col items-center border-l p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={`Show ${title.toLowerCase()} panel`}
            aria-label={`Show ${title.toLowerCase()} panel`}
            onClick={() => onRailOpenChange(true)}
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      );
    }
    return (
      <aside
        ref={asideRef}
        className={cn(
          "bg-background relative flex h-full min-h-0 shrink-0 flex-col border-l",
          railWidth === null && "w-1/3",
        )}
        style={railWidth !== null ? { width: railWidth } : undefined}
      >
        {/* Resize bar: drag horizontally to adjust the sidebar width. */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          className="hover:bg-border active:bg-border absolute top-0 left-0 h-full w-1 cursor-col-resize transition-colors"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
        <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
          <span className="shrink-0 text-sm font-medium">{title}</span>
          {headerControls}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {headerActions}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title="Collapse panel"
              aria-label="Collapse panel"
              onClick={() => onRailOpenChange(false)}
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {children}
        </div>
        {footer && (
          <div className="bg-muted/30 flex shrink-0 flex-col border-t p-3">
            {footer}
          </div>
        )}
      </aside>
    );
  }

  return (
    <Sheet open={sheetOpen} onOpenChange={onSheetOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            {title}
            {headerControls}
            <span className="mr-4 ml-auto flex items-center gap-1.5">
              {headerActions}
            </span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="bg-muted/30 -mx-6 -mb-6 flex shrink-0 flex-col border-t p-6 pt-3">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
