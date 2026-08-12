"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Layer } from "@/src/components/ui/layer";
import {
  InAppAgentActivityCards,
  selectInAppAgentActivityCards,
  type InAppAgentActivityCard,
} from "@/src/features/in-app-agent/components/InAppAgentActivityCards";

/** Results expire; approvals wait until answered. */
const RESULT_CARD_TTL_MS = 8_000;

export type InAppAgentActivityNotification = InAppAgentActivityCard;

/**
 * Lifecycle for the floating stack. Cap before timers so hidden cards stay undelivered.
 * Assistant-owned (not Sonner) so long-lived approvals do not mute other toasts.
 */
export function InAppAgentActivityNotifications({
  notifications,
  onOpenConversation,
  onDelivered,
}: {
  notifications: readonly InAppAgentActivityNotification[];
  onOpenConversation: (conversationId: string) => void;
  onDelivered: (
    entries: ReadonlyArray<{ conversationId: string; activityKey: string }>,
  ) => void;
}) {
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const resultTimersRef = useRef(new Map<string, number>());

  const selected = useMemo(
    () =>
      selectInAppAgentActivityCards(
        notifications.filter(
          (notification) => !dismissedKeys.has(notification.activityKey),
        ),
      ),
    [dismissedKeys, notifications],
  );

  const retire = (cards: readonly InAppAgentActivityCard[]) => {
    if (cards.length === 0) {
      return;
    }

    for (const card of cards) {
      const timer = resultTimersRef.current.get(card.activityKey);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        resultTimersRef.current.delete(card.activityKey);
      }
    }

    setDismissedKeys(
      (current) =>
        new Set([...current, ...cards.map((card) => card.activityKey)]),
    );
    onDelivered(
      cards.map((card) => ({
        conversationId: card.conversationId,
        activityKey: card.activityKey,
      })),
    );
  };

  useEffect(() => {
    const selectedByKey = new Map(
      selected.map((card) => [card.activityKey, card]),
    );

    for (const card of selected) {
      if (card.state === "approval") {
        continue;
      }
      // Keep existing timers so a new sibling card does not reset older ones.
      if (resultTimersRef.current.has(card.activityKey)) {
        continue;
      }

      const timeout = window.setTimeout(() => {
        resultTimersRef.current.delete(card.activityKey);
        setDismissedKeys((current) => new Set([...current, card.activityKey]));
        onDelivered([
          {
            conversationId: card.conversationId,
            activityKey: card.activityKey,
          },
        ]);
      }, RESULT_CARD_TTL_MS);

      resultTimersRef.current.set(card.activityKey, timeout);
    }

    for (const [activityKey, timer] of resultTimersRef.current) {
      if (selectedByKey.has(activityKey)) {
        continue;
      }

      window.clearTimeout(timer);
      resultTimersRef.current.delete(activityKey);
    }
  }, [onDelivered, selected]);

  useEffect(() => {
    const timers = resultTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <Layer name="toast">
      <InAppAgentActivityCards
        cards={selected}
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
