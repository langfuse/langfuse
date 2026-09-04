"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Layer } from "@/src/components/ui/layer";
import {
  InAppAgentActivityCards,
  type InAppAgentActivityCard,
} from "@/src/features/in-app-agent/components/InAppAgentActivityCards";

/** Same TTL for results and approvals: toast is heads-up, not a sticky prompt. */
const CARD_TTL_MS = 8_000;
/** Approvals first: a question outranks a result the user can read later. */
const CARD_PRIORITY: Record<string, number> = {
  approval: 0,
  "failed-unread": 1,
  "done-unread": 2,
};
const MAX_VISIBLE_CARDS = 3;

export type InAppAgentActivityNotification = InAppAgentActivityCard;

function selectInAppAgentActivityCards(
  cards: readonly InAppAgentActivityCard[],
) {
  return [...cards]
    .sort(
      (a, b) => (CARD_PRIORITY[a.state] ?? 9) - (CARD_PRIORITY[b.state] ?? 9),
    )
    .slice(0, MAX_VISIBLE_CARDS);
}

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
  /** Activity keys that have entered the visible stack (got a timer). */
  const shownActivityKeysRef = useRef(new Set<string>());
  const pendingEvictionDeliveriesRef = useRef<
    Array<{ conversationId: string; activityKey: string }>
  >([]);
  const onDeliveredRef = useRef(onDelivered);
  onDeliveredRef.current = onDelivered;

  const selected = useMemo(
    () =>
      selectInAppAgentActivityCards(
        notifications.filter(
          (notification) => !dismissedKeys.has(notification.activityKey),
        ),
      ),
    [dismissedKeys, notifications],
  );
  const [firstSelectedCard, ...remainingSelectedCards] = selected;

  // Deliver previously-shown cards that leave the top-3 window (eviction).
  // setState-during-render so we do not sync dismissedKeys from props in an
  // effect (https://react.dev/learn/you-might-not-need-an-effect). Parent
  // delivery is flushed after commit via the timer effect below.
  {
    const selectedKeys = new Set(selected.map((card) => card.activityKey));
    const evicted = notifications.filter(
      (card) =>
        shownActivityKeysRef.current.has(card.activityKey) &&
        !selectedKeys.has(card.activityKey) &&
        !dismissedKeys.has(card.activityKey),
    );

    if (evicted.length > 0) {
      setDismissedKeys(
        (current) =>
          new Set([...current, ...evicted.map((card) => card.activityKey)]),
      );
      pendingEvictionDeliveriesRef.current.push(
        ...evicted.map((card) => ({
          conversationId: card.conversationId,
          activityKey: card.activityKey,
        })),
      );
      for (const card of evicted) {
        shownActivityKeysRef.current.delete(card.activityKey);
      }
    }
  }

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
      shownActivityKeysRef.current.delete(card.activityKey);
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

  // Timers are an external system. Keep this separate from unmount cleanup:
  // a dependency-change cleanup that cleared every timer would reset TTLs
  // whenever the visible stack changes.
  useEffect(() => {
    const pending = pendingEvictionDeliveriesRef.current;
    if (pending.length > 0) {
      pendingEvictionDeliveriesRef.current = [];
      onDeliveredRef.current(pending);
    }

    const selectedByKey = new Map(
      selected.map((card) => [card.activityKey, card]),
    );

    for (const card of selected) {
      shownActivityKeysRef.current.add(card.activityKey);

      // Keep existing timers so a new sibling card does not reset older ones.
      if (resultTimersRef.current.has(card.activityKey)) {
        continue;
      }

      const timeout = window.setTimeout(() => {
        resultTimersRef.current.delete(card.activityKey);
        shownActivityKeysRef.current.delete(card.activityKey);
        setDismissedKeys((current) => new Set([...current, card.activityKey]));
        onDeliveredRef.current([
          {
            conversationId: card.conversationId,
            activityKey: card.activityKey,
          },
        ]);
      }, CARD_TTL_MS);

      resultTimersRef.current.set(card.activityKey, timeout);
    }

    for (const [activityKey, timer] of resultTimersRef.current) {
      if (selectedByKey.has(activityKey)) {
        continue;
      }

      window.clearTimeout(timer);
      resultTimersRef.current.delete(activityKey);
    }
  }, [selected]);

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
      {firstSelectedCard && (
        <InAppAgentActivityCards
          cards={[firstSelectedCard, ...remainingSelectedCards]}
          onOpen={(card) => {
            retire([card]);
            onOpenConversation(card.conversationId);
          }}
          onDismiss={(card) => {
            retire([card]);
          }}
        />
      )}
    </Layer>
  );
}
