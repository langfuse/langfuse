import { CircleAlert, Loader2 } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";
import type { InAppAgentActivityState } from "@/src/features/in-app-agent/lib/inAppAgentActivity";

/**
 * Trailing state for one recent-conversation row.
 *
 * Exactly one indicator can show, so the caller's priority order is the whole
 * design: what the assistant needs from you beats what it is doing, which beats
 * what it already did.
 */
export function ConversationActivityIndicator({
  state,
}: {
  state: InAppAgentActivityState;
}) {
  if (state === "approval") {
    return (
      <ConversationActivityIndicatorSlot label="Needs your approval">
        <CircleAlert className="text-primary-accent size-3" />
      </ConversationActivityIndicatorSlot>
    );
  }

  if (state === "running") {
    return (
      <ConversationActivityIndicatorSlot label="Working">
        <Loader2 className="text-muted-foreground size-3 animate-spin" />
      </ConversationActivityIndicatorSlot>
    );
  }

  return (
    <ConversationActivityIndicatorSlot
      label={state === "failed-unread" ? "Failed" : "Finished"}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "failed-unread" ? "bg-destructive" : "bg-primary-accent",
        )}
      />
    </ConversationActivityIndicatorSlot>
  );
}

/**
 * Fixed-size centered box so every variant occupies the same slot: the dot is
 * half the width of the icons, so without it the indicator column zig-zags from
 * row to row.
 *
 * Also the one named element: naming is prohibited on the generic role a bare
 * span gets, and the indicator is the only thing conveying run state in the
 * conversation list.
 */
function ConversationActivityIndicatorSlot({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className="flex size-3 shrink-0 items-center justify-center"
    >
      {children}
    </span>
  );
}
