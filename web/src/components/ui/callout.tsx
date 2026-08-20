/* eslint-disable @repo/no-style-props */
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import useLocalStorage from "@/src/components/useLocalStorage";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

const DEFAULT_STORAGE_KEY = "dismissed-callouts";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface Callout {
  id: string;
  dismissedAt: number;
}

export interface CalloutProps {
  id: string;
  ttlMs?: number;
  variant?: "info" | "warning";
  align?: "top" | "middle";
  children: React.ReactNode;
  onDismiss?: () => void;
  actions?: () => React.ReactNode;
  className?: string;
}

export function Callout({
  id: id,
  ttlMs = DEFAULT_TTL_MS,
  variant = "info",
  align = "middle",
  children,
  onDismiss,
  actions,
  className,
}: CalloutProps) {
  const [dismissedCallouts, setDismissedCallouts] = useLocalStorage<Callout[]>(
    id + "-" + DEFAULT_STORAGE_KEY,
    [],
  );
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if this callout is dismissed and not expired
    const dismissedCallout = dismissedCallouts.find((c) => c.id === id);

    if (!dismissedCallout) {
      setIsVisible(true);
      return;
    }

    const now = Date.now();
    const isExpired = now - dismissedCallout.dismissedAt > ttlMs;

    if (isExpired) {
      // Remove expired dismissal
      setDismissedCallouts(dismissedCallouts.filter((c) => c.id !== id));
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [id, dismissedCallouts, ttlMs, setDismissedCallouts]);

  const handleDismiss = () => {
    // Add this callout to dismissed list
    const now = Date.now();
    const updatedDismissedCallouts = dismissedCallouts.filter(
      (c) => c.id !== id,
    );
    updatedDismissedCallouts.push({ id: id, dismissedAt: now });
    setDismissedCallouts(updatedDismissedCallouts);

    // Call optional callback
    onDismiss?.();

    setIsVisible(false);
  };

  if (!isVisible) return null;

  const variantClass =
    variant === "warning"
      ? "border-light-yellow bg-light-yellow dark:border-light-yellow dark:bg-light-yellow"
      : "border-light-blue bg-light-blue dark:border-light-blue dark:bg-light-blue";
  // Vertical alignment only applies once text and actions share a row (sm+);
  // below that the column stacks them and the cross axis is horizontal.
  const alignmentClass =
    align === "middle" ? "sm:items-center" : "sm:items-start";

  const alignmentOverrides =
    align === "middle"
      ? "[&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg+div]:translate-y-0"
      : "";

  return (
    <Alert
      className={`${variantClass} ${alignmentOverrides} ${className ?? ""}`}
    >
      {/* Dismiss stays outside the stacking wrapper so it keeps its corner
          position; only the actions drop below the message on narrow widths. */}
      <AlertDescription
        className={`ml-1 flex items-start gap-2 ${align === "middle" ? "sm:items-center" : ""}`}
      >
        <div
          className={`flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:justify-between ${alignmentClass}`}
        >
          <div className="text-foreground min-w-0 text-sm">{children}</div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2 self-end sm:ml-4 sm:self-auto">
              {actions()}
            </div>
          )}
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
    </Alert>
  );
}
