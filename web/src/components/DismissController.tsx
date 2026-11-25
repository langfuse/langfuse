"use client";

import { useSyncExternalStore } from "react";

import { useDismissState } from "@/src/hooks/useDismissState";

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
  ttlMs,
  onDismiss,
  children,
}: DismissControllerProps) {
  const { isDismissed, dismiss } = useDismissState({ id, family, ttlMs });
  const isHydrated = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (!isHydrated || isDismissed) return null;

  return children({
    onDismiss: () => {
      dismiss();
      onDismiss?.();
    },
  });
}
