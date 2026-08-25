"use client";

import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { useSyncExternalStore } from "react";

import useLocalStorage from "@/src/components/useLocalStorage";
import { AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";

const DEFAULT_STORAGE_KEY = "dismissed-callouts";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type DismissedCallout = {
  id: string;
  dismissedAt: number;
};

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const calloutVariants = cva("relative w-full rounded-lg border p-3", {
  variants: {
    variant: {
      info: "border-light-blue bg-light-blue dark:border-light-blue dark:bg-light-blue",
      warning:
        "border-light-yellow bg-light-yellow dark:border-light-yellow dark:bg-light-yellow",
    },
  },
});

const contentVariants = cva("flex min-w-0 flex-1 flex-col gap-2", {
  variants: {
    align: {
      top: "sm:items-start",
      middle: "sm:items-center",
    },
  },
});

export type CalloutProps = {
  id: string;
  variant: "info" | "warning";
  align: "top" | "middle";
  children: React.ReactElement;
  actions: React.ReactElement | null;
  ttlMs?: number;
  onDismiss?: () => void;
};

export function Callout({
  id,
  variant,
  align,
  children,
  actions,
  ttlMs = DEFAULT_TTL_MS,
  onDismiss,
}: CalloutProps) {
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
    <div role="alert" className={calloutVariants({ variant })}>
      <AlertDescription className="ml-1 flex items-start gap-2">
        <div
          className={`${contentVariants({ align })} sm:flex-row sm:justify-between`}
        >
          <div className="text-foreground min-w-0 text-sm">{children}</div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2 self-end sm:ml-4 sm:self-auto">
              {actions}
            </div>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 p-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </div>
  );
}
