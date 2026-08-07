import { CircleAlert, CircleCheck, CircleX, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import type { InAppAgentActivityState } from "@/src/features/in-app-agent/lib/inAppAgentActivity";

/** Approvals first: a question outranks a result the user can read later. */
const CARD_PRIORITY: Record<string, number> = {
  approval: 0,
  "failed-unread": 1,
  "done-unread": 2,
};

const MAX_VISIBLE_CARDS = 3;

export type InAppAgentActivityCard = {
  conversationId: string;
  /** Card identity. A later run in the same conversation is a new card. */
  runId: string;
  title: string | null;
  state: InAppAgentActivityState;
};

function getCardCopy(state: InAppAgentActivityState) {
  if (state === "approval") {
    return {
      label: "Needs your approval",
      Icon: CircleAlert,
      tone: "accent" as const,
    };
  }

  if (state === "failed-unread") {
    return { label: "Run failed", Icon: CircleX, tone: "destructive" as const };
  }

  return { label: "Finished", Icon: CircleCheck, tone: "accent" as const };
}

/**
 * The assistant's floating activity stack, as pure presentation.
 *
 * Owns which cards win and in what order; owns none of the lifecycle. The
 * caller decides when a card arrives, expires, or is retired, which keeps the
 * ordering rules visible in one place and testable without timers.
 */
export function InAppAgentActivityCards({
  cards,
  onOpen,
  onDismiss,
}: {
  cards: readonly InAppAgentActivityCard[];
  onOpen: (card: InAppAgentActivityCard) => void;
  onDismiss: (card: InAppAgentActivityCard) => void;
}) {
  const visible = [...cards]
    .sort(
      (a, b) => (CARD_PRIORITY[a.state] ?? 9) - (CARD_PRIORITY[b.state] ?? 9),
    )
    .slice(0, MAX_VISIBLE_CARDS);

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="top-banner-offset pointer-events-none fixed right-4 flex w-80 flex-col gap-2 pt-4">
      {visible.map((card) => {
        const { label, Icon, tone } = getCardCopy(card.state);
        const conversationTitle = card.title?.trim() || "Untitled conversation";

        return (
          <div
            key={card.runId}
            role="status"
            className="bg-background pointer-events-auto flex items-start gap-2 rounded-md border p-3 shadow-lg"
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                tone === "destructive"
                  ? "text-destructive"
                  : "text-primary-accent",
              )}
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
              <X className="size-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
