"use client";

import { useSyncExternalStore } from "react";

import useLocalStorage from "@/src/components/useLocalStorage";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type DismissedItem = {
  id: string;
  dismissedAt: number;
};

type DismissControllerRenderProps = {
  onDismiss: () => void;
};

export type DismissControllerProps = {
  id: string;
  family: "callouts";
  ttlMs?: number;
  onDismiss?: () => void;
  children: (props: DismissControllerRenderProps) => React.ReactElement;
};

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function DismissController({
  id,
  family,
  ttlMs = DEFAULT_TTL_MS,
  onDismiss,
  children,
}: DismissControllerProps) {
  const [dismissedItems, setDismissedItems] = useLocalStorage<DismissedItem[]>(
    `${id}-dismissed-${family}`,
    [],
  );
  const isHydrated = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const dismissedItem = dismissedItems.find((item) => item.id === id);
  const isVisible =
    isHydrated &&
    (!dismissedItem || Date.now() - dismissedItem.dismissedAt > ttlMs);

  if (!isVisible) return null;

  return children({
    onDismiss: () => {
      setDismissedItems((currentItems) => [
        ...currentItems.filter((item) => item.id !== id),
        { id, dismissedAt: Date.now() },
      ]);
      onDismiss?.();
    },
  });
}
