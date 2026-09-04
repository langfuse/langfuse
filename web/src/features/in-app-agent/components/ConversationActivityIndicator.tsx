import { CircleAlert, Loader2 } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";
import type { InAppAgentActivityState } from "@/src/features/in-app-agent/lib/inAppAgentActivity";

/**
 * Trailing state for one recent-conversation row. Exactly one can show, so the
 * caller's priority order is the design: needs you, then doing, then did.
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
 * Fixed-size box: the dot is half the width of the icons, so without it the
 * column zig-zags. Named here because a bare span cannot carry a label.
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
