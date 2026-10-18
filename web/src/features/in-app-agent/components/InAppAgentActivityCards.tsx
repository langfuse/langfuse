import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import type { InAppAgentActivityState } from "@/src/features/in-app-agent/lib/inAppAgentActivity";
import { HaloIcon } from "@/src/features/in-app-agent/components/HaloIcon";

export type InAppAgentActivityCard = {
  conversationId: string;
  activityKey: string;
  runId: string;
  title: string | null;
  state: Exclude<InAppAgentActivityState, "running">;
};

function getCardCopy(state: InAppAgentActivityCard["state"]) {
  // Lead with "Halo" so the toast reads as the same product as the
  // launcher icon, not a generic system alert.
  if (state === "approval") {
    return {
      label: "Halo needs your approval",
      tone: "accent" as const,
    };
  }

  if (state === "failed-unread") {
    return { label: "Halo run failed", tone: "destructive" as const };
  }

  return { label: "Halo finished", tone: "accent" as const };
}

/** Pure floating stack: ordering/cap live here; callers own delivery lifecycle. */
export function InAppAgentActivityCards({
  cards,
  onOpen,
  onDismiss,
}: {
  cards: readonly [InAppAgentActivityCard, ...InAppAgentActivityCard[]];
  onOpen: (card: InAppAgentActivityCard) => void;
  onDismiss: (card: InAppAgentActivityCard) => void;
}) {
  return (
    <div className="top-banner-offset pointer-events-none fixed right-4 flex w-80 flex-col gap-2 pt-4">
      {cards.map((card) => {
        const { label, tone } = getCardCopy(card.state);
        const conversationTitle = card.title?.trim() || "Untitled conversation";

        return (
          <div
            key={card.activityKey}
            role="status"
            className="bg-background pointer-events-auto flex items-start gap-2 rounded-md border p-3 shadow-lg"
          >
            <HaloIcon
              variant={
                tone === "destructive"
                  ? "activityDestructive"
                  : "activityAccent"
              }
            />
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                onOpen(card);
              }}
            >
              <p className="truncate text-sm font-bold" title={label}>
                {label}
              </p>
              <p
                className="text-muted-foreground truncate text-xs"
                title={conversationTitle}
              >
                {conversationTitle}
              </p>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground -mt-1 -mr-1 shrink-0"
              aria-label="Dismiss"
              onClick={() => {
                onDismiss(card);
              }}
            >
              <X className="icon-sm text-icon-foreground" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
