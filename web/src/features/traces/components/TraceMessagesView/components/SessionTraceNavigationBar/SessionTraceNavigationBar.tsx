import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Clock } from "@langfuse/icons";
import { HeaderActionButton } from "@/src/components/HeaderActionButton";
import { Progress } from "@/src/components/design-system/Progress/Progress";
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
  onPrevious,
  onNext,
}: {
  position: number;
  total: number;
  sessionHref: string;
  currentTraceId: string;
  timeline: readonly SessionTraceSpan[];
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useSessionTraceNavigationKeys({ rootRef, onPrevious, onNext });
  const progress = buildSessionTraceProgress(timeline, currentTraceId);

  return (
    <div
      ref={rootRef}
      className="bg-muted/40 sticky top-0 z-1 flex shrink-0 items-center gap-3 border-b px-2 py-1"
    >
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
        <div className="ph-no-capture min-w-0 flex-1">
          <Progress
            size="sm"
            value={progress.value}
            label={progress.label}
            valueText={progress.valueText}
            labelTitle={`${progress.label} · ${progress.valueText}`}
            segments={progress.segments}
          />
        </div>
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
