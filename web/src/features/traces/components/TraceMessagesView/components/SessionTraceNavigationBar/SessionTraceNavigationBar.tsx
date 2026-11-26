import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Clock } from "@langfuse/icons";
import { HeaderActionButton } from "@/src/components/HeaderActionButton";
import { SessionTraceTrack } from "../SessionTraceTrack/SessionTraceTrack";
import {
  buildSessionTraceProgress,
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
}: {
  position: number;
  total: number;
  sessionHref: string;
  currentTraceId: string;
  timeline: readonly SessionTraceSpan[];
  onSelectTrace?: (traceId: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useSessionTraceNavigationKeys({ rootRef, onPrevious, onNext });
  const progress = buildSessionTraceProgress(timeline, currentTraceId);

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
        {progress ? (
          <SessionTraceProgress
            progress={progress}
            traces={timeline.map((span) => ({
              id: span.id,
              name: span.name,
              start: span.startMs,
              end: span.endMs,
            }))}
            activeIndex={timeline.findIndex(
              (span) => span.id === currentTraceId,
            )}
            onSelectTrace={onSelectTrace}
          />
        ) : null}
        <div className="flex shrink-0 items-center gap-0.5">
          <HeaderActionButton
            label="Previous trace in session"
            shortcut={["Shift", "K"]}
            icon={<ArrowUp size="base" />}
            disabled={!onPrevious}
            onClick={onPrevious}
          />
          <HeaderActionButton
            label="Next trace in session"
            shortcut={["Shift", "J"]}
            icon={<ArrowDown size="base" />}
            disabled={!onNext}
            onClick={onNext}
          />
        </div>
      </div>
    </div>
  );
}

function SessionTraceProgress({
  progress,
  traces,
  activeIndex,
  onSelectTrace,
}: {
  progress: NonNullable<ReturnType<typeof buildSessionTraceProgress>>;
  traces: readonly {
    id: string;
    name?: string | null;
    start: number;
    end: number;
  }[];
  activeIndex: number;
  onSelectTrace?: (traceId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 @min-[520px]/sessionnav:gap-4">
      <span className="text-accent-dark-blue ph-no-capture hidden shrink-0 text-xs tabular-nums @min-[520px]/sessionnav:inline">
        {progress.label}
      </span>
      <SessionTraceTrack
        traces={traces}
        activeIndex={activeIndex}
        onSelect={
          onSelectTrace
            ? (index) => {
                const trace = traces[index];
                if (trace) onSelectTrace(trace.id);
              }
            : undefined
        }
      />
      <span className="text-muted-foreground ph-no-capture hidden shrink-0 text-xs tabular-nums @min-[520px]/sessionnav:inline">
        {progress.valueText}
      </span>
    </div>
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
