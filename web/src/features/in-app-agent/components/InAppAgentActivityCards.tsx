import { BotMessageSquare, X } from "lucide-react";
import { useSharedUiTranslations } from "@/src/utils/shared-ui-translations";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import type { InAppAgentActivityState } from "@/src/features/in-app-agent/lib/inAppAgentActivity";

export type InAppAgentActivityCard = {
  conversationId: string;
  activityKey: string;
  runId: string;
  title: string | null;
  state: Exclude<InAppAgentActivityState, "running">;
};

function getCardCopy(
  state: InAppAgentActivityCard["state"],
  labels: { approval: string; failed: string; finished: string },
) {
  // Lead with "Assistant" so the toast reads as the same product as the
  // launcher (BotMessageSquare), not a generic system alert.
  if (state === "approval") {
    return {
      label: labels.approval,
      tone: "accent" as const,
    };
  }

  if (state === "failed-unread") {
    return { label: labels.failed, tone: "destructive" as const };
  }

  return { label: labels.finished, tone: "accent" as const };
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
  const t = useSharedUiTranslations("agent");

  return (
    <div className="top-banner-offset pointer-events-none fixed right-4 flex w-80 flex-col gap-2 pt-4">
      {cards.map((card) => {
        const { label, tone } = getCardCopy(card.state, {
          approval: t("activityApproval"),
          failed: t("activityFailed"),
          finished: t("activityFinished"),
        });
        const conversationTitle =
          card.title?.trim() || t("untitledConversation");

        return (
          <div
            key={card.activityKey}
            role="status"
            className="bg-background pointer-events-auto flex items-start gap-2 rounded-md border p-3 shadow-lg"
          >
            <BotMessageSquare
              className={cn(
                "mt-0.5 size-4 shrink-0",
                tone === "destructive"
                  ? "text-destructive"
                  : "text-primary-accent",
              )}
              aria-hidden
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
              aria-label={t("dismiss")}
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
