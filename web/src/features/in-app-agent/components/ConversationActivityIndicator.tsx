import { CircleAlert, Loader2 } from "lucide-react";

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
      <CircleAlert
        className="text-primary-accent size-3 shrink-0"
        aria-label="Needs your approval"
      />
    );
  }

  if (state === "running") {
    return (
      <Loader2
        className="text-muted-foreground size-3 shrink-0 animate-spin"
        aria-label="Working"
      />
    );
  }

  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        state === "failed-unread" ? "bg-destructive" : "bg-primary-accent",
      )}
      aria-label={state === "failed-unread" ? "Failed" : "Finished"}
    />
  );
}
