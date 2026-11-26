import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Clock } from "@langfuse/icons";
import { HeaderActionButton } from "@/src/components/HeaderActionButton";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";

export function SessionTraceNavigationBar({
  position,
  total,
  sessionHref,
  traceName,
  timestamp,
  onPrevious,
  onNext,
}: {
  position: number;
  total: number;
  sessionHref: string;
  traceName?: string | null;
  timestamp?: Date | null;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useSessionTraceNavigationKeys({ rootRef, onPrevious, onNext });
  const name = traceName?.trim() ? traceName : null;
  const time = timestamp
    ? buildLocalIsoDatePresentation({ date: timestamp })
    : null;

  return (
    <div
      ref={rootRef}
      className="bg-muted/40 sticky top-0 z-1 flex h-8 shrink-0 items-center gap-2 border-b px-2"
    >
      <Link
        href={sessionHref}
        className="text-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-sm"
      >
        <Clock size="sm" color="muted" aria-hidden />
        <span className="shrink-0">Session</span>
        <span className="text-muted-foreground shrink-0" aria-hidden>
          ›
        </span>
        <span className="shrink-0 tabular-nums">
          Trace {position} of {total}
        </span>
        {name ? (
          <span
            className="text-muted-foreground ph-no-capture min-w-0 truncate"
            title={name}
          >
            {name}
          </span>
        ) : null}
        {time ? (
          <span
            className="text-muted-foreground ph-no-capture shrink-0"
            title={time.title}
          >
            {time.display}
          </span>
        ) : null}
      </Link>
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
