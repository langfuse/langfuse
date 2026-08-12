import { CircleAlert, Loader2 } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import type { InAppAgentActivityState } from "@/src/features/in-app-agent/lib/inAppAgentActivity";

/**
 * Trailing state for one recent-conversation row.
 *
 * Exactly one indicator can show, so the caller's priority order is the whole
 * design: what the assistant needs from you beats what it is doing, which beats
 * what it already did.
 *
 * The indicator is the only element conveying run state in the conversation
 * list, so each variant needs role="img": naming is prohibited on the generic
 * role a bare span gets, and it keeps the icon variants consistent across
 * screen readers that treat a bare <svg> as unnamed.
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
        role="img"
        aria-label="Needs your approval"
      />
    );
  }

  if (state === "running") {
    return (
      <Loader2
        className="text-muted-foreground size-3 shrink-0 animate-spin"
        role="img"
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
      role="img"
      aria-label={state === "failed-unread" ? "Failed" : "Finished"}
    />
  );
}
