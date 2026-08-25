"use client";

import { useSyncExternalStore } from "react";

import { Callout } from "@/src/components/design-system/Callout/Callout";
import useLocalStorage from "@/src/components/useLocalStorage";

const DEFAULT_STORAGE_KEY = "dismissed-callouts";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type DismissedCallout = {
  id: string;
  dismissedAt: number;
};

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export type DismissibleCalloutProps = {
  id: string;
  children: React.ReactElement;
  variant: "info" | "warning";
  align: "top" | "middle";
  actions: React.ReactElement | null;
  ttlMs?: number;
  onDismiss?: () => void;
};

export function DismissibleCallout({
  id,
  children,
  variant,
  align,
  actions,
  ttlMs = DEFAULT_TTL_MS,
  onDismiss,
}: DismissibleCalloutProps) {
  const [dismissedCallouts, setDismissedCallouts] = useLocalStorage<
    DismissedCallout[]
  >(`${id}-${DEFAULT_STORAGE_KEY}`, []);
  const isHydrated = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  const dismissedCallout = dismissedCallouts.find(
    (callout) => callout.id === id,
  );
  const isVisible =
    isHydrated &&
    (!dismissedCallout || Date.now() - dismissedCallout.dismissedAt > ttlMs);

  const handleDismiss = () => {
    setDismissedCallouts((currentCallouts) => [
      ...currentCallouts.filter((callout) => callout.id !== id),
      { id, dismissedAt: Date.now() },
    ]);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <Callout
      variant={variant}
      align={align}
      actions={actions}
      onDismiss={handleDismiss}
    >
      {children}
    </Callout>
  );
}
