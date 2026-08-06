"use client";

import { useEffect, useMemo, useState } from "react";

import { Layer } from "@/src/components/ui/layer";
import {
  InAppAgentActivityCards,
  type InAppAgentActivityCard,
} from "@/src/features/in-app-agent/components/InAppAgentActivityCards";

/** Results are a glance; an approval is a question and waits to be answered. */
const RESULT_CARD_TTL_MS = 8_000;

export type InAppAgentActivityNotification = InAppAgentActivityCard;

/**
 * Lifecycle around the floating activity stack: what is still on screen, when a
 * result expires, and when a run counts as announced.
 *
 * Assistant-owned rather than routed through the app's Sonner toaster, which is
 * mounted with `visibleToasts={1}`: an approval card lives until it is answered,
 * and parking it in that single slot would mute every unrelated app alert for
 * as long as it sits there.
 */
export function InAppAgentActivityNotifications({
  notifications,
  onOpenConversation,
  onDelivered,
}: {
  notifications: readonly InAppAgentActivityNotification[];
  onOpenConversation: (conversationId: string) => void;
  /** Marks these runs as announced; dismissal must not mark them read. */
  onDelivered: (conversationIds: readonly string[]) => void;
}) {
  /**
   * Keyed by run, not by conversation. Dismissing a result must not silence the
   * *next* run in the same conversation, which is a different thing to say.
   */
  const [dismissedRunIds, setDismissedRunIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const visible = useMemo(
    () =>
      notifications.filter(
        (notification) => !dismissedRunIds.has(notification.runId),
      ),
    [dismissedRunIds, notifications],
  );

  /**
   * Delivery is recorded when a card *leaves*, not when it appears.
   *
   * A card the user never actually got — the tab closed inside the result
   * window, an approval still sitting unanswered — is therefore still
   * undelivered on the next load and shows again, which is the whole point of
   * persisting it. Marking on render would consume the announcement for a card
   * nobody saw.
   */
  const retire = (cards: readonly InAppAgentActivityCard[]) => {
    if (cards.length === 0) {
      return;
    }

    setDismissedRunIds(
      (current) => new Set([...current, ...cards.map((card) => card.runId)]),
    );
    onDelivered(cards.map((card) => card.conversationId));
  };

  // Both ids travel in the key so the timer closes over stable strings rather
  // than an array that is rebuilt every render.
  const expiringKey = visible
    .filter((card) => card.state !== "approval")
    .map((card) => `${card.runId} ${card.conversationId}`)
    .join("|");

  useEffect(() => {
    if (expiringKey.length === 0) {
      return;
    }

    const expiring = expiringKey.split("|").map((pair) => pair.split(" "));
    const timeout = window.setTimeout(() => {
      setDismissedRunIds(
        (current) => new Set([...current, ...expiring.map(([runId]) => runId)]),
      );
      onDelivered(expiring.map(([, conversationId]) => conversationId));
    }, RESULT_CARD_TTL_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [expiringKey, onDelivered]);

  return (
    <Layer name="toast">
      <InAppAgentActivityCards
        cards={visible}
        onOpen={(card) => {
          retire([card]);
          onOpenConversation(card.conversationId);
        }}
        onDismiss={(card) => {
          retire([card]);
        }}
      />
    </Layer>
  );
}
