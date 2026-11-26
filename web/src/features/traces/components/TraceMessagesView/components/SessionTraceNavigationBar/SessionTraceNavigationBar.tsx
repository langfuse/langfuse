import { useEffect, useRef, type ReactNode } from "react";
import Link, { type LinkProps } from "next/link";
import { ArrowLeft, ArrowRight, Clock } from "@langfuse/icons";
import { HeaderActionButton } from "@/src/components/HeaderActionButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { Button } from "@/src/components/ui/button";
import { SessionTraceTrack } from "../SessionTraceTrack/SessionTraceTrack";
import {
  sessionContainsTrace,
  type SessionTraceSpan,
} from "./sessionTraceProgress";

export function SessionTraceNavigationBar({
  position,
  total,
  sessionHref,
  currentTraceId,
  timeline,
  onSelectTrace,
  onPrevious,
  onNext,
  previousHref,
  nextHref,
  previousShallow,
  nextShallow,
}: {
  position: number;
  total: number;
  sessionHref: string;
  currentTraceId: string;
  timeline: readonly SessionTraceSpan[];
  onSelectTrace?: (traceId: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  previousHref?: LinkProps["href"];
  nextHref?: LinkProps["href"];
  previousShallow?: boolean;
  nextShallow?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useSessionTraceNavigationKeys({ rootRef, onPrevious, onNext });
  const showTrack = sessionContainsTrace(timeline, currentTraceId);

  return (
    <div ref={rootRef} className="@container/sessionnav sticky top-0 z-1">
      <div className="bg-muted/40 flex h-8 shrink-0 items-center gap-2 border-b px-2 @min-[520px]/sessionnav:gap-6">
        <Link
          href={sessionHref}
          className="text-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-sm"
        >
          <Clock size="sm" color="muted" aria-hidden />
          <span className="shrink-0">Session</span>
          <span className="text-muted-foreground shrink-0" aria-hidden>
            ›
          </span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            Trace {position} of {total}
          </span>
        </Link>
        {showTrack ? (
          <SessionTraceTrack
            traces={timeline.map((span) => ({
              id: span.id,
              name: span.name,
              start: span.startMs,
              end: span.endMs,
            }))}
            activeIndex={timeline.findIndex(
              (span) => span.id === currentTraceId,
            )}
            onSelect={
              onSelectTrace
                ? (index) => {
                    const trace = timeline[index];
                    if (trace) onSelectTrace(trace.id);
                  }
                : undefined
            }
          />
        ) : null}
        <div className="flex shrink-0 items-center gap-0.5">
          <SessionArrow
            label="Previous trace in session"
            shortcut={["Shift", "K"]}
            icon={<ArrowLeft size="base" />}
            href={previousHref}
            shallow={previousShallow}
            onClick={onPrevious}
          />
          <SessionArrow
            label="Next trace in session"
            shortcut={["Shift", "J"]}
            icon={<ArrowRight size="base" />}
            href={nextHref}
            shallow={nextShallow}
            onClick={onNext}
          />
        </div>
      </div>
    </div>
  );
}

function SessionArrow({
  label,
  shortcut,
  icon,
  href,
  shallow,
  onClick,
}: {
  label: string;
  shortcut: readonly ["Shift", "K" | "J"];
  icon: ReactNode;
  href?: LinkProps["href"];
  shallow?: boolean;
  onClick?: () => void;
}) {
  if (!href) {
    return (
      <HeaderActionButton
        label={label}
        shortcut={shortcut}
        icon={icon}
        disabled={!onClick}
        onClick={onClick}
      />
    );
  }
  return (
    <Tooltip label={label} shortcut={{ keys: [...shortcut] }}>
      {({ getTriggerProps }) => (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="text-foreground-secondary hover:text-foreground-secondary h-7 w-7"
        >
          <Link
            href={href}
            shallow={shallow}
            aria-label={label}
            {...getTriggerProps()}
          >
            {icon}
          </Link>
        </Button>
      )}
    </Tooltip>
  );
}

function useSessionTraceNavigationKeys({
  rootRef,
  onPrevious,
  onNext,
}: {
  rootRef: { current: HTMLElement | null };
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isTypingTarget(event.target) || foreignDialogOpen(rootRef.current)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "k" && onPrevious) {
        event.preventDefault();
        onPrevious();
      } else if (key === "j" && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNext, onPrevious, rootRef]);
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement &&
      (target.isContentEditable || target.getAttribute("role") === "textbox"))
  );
}

function foreignDialogOpen(root: HTMLElement | null) {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  for (const dialog of dialogs) {
    if (dialog.getAttribute("aria-hidden") === "true") continue;
    if (dialog.getAttribute("data-state") === "closed") continue;
    if (root && dialog.contains(root)) continue;
    return true;
  }
  return false;
}
