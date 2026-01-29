import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import useLocalStorage from "@/src/components/useLocalStorage";
import { Info, AlertTriangle, X } from "lucide-react";
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
}

export function Callout({
  id: id,
  ttlMs = DEFAULT_TTL_MS,
  variant = "info",
  align = "middle",
  children,
  onDismiss,
  actions,
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

  const Icon = variant === "warning" ? AlertTriangle : Info;
  const variantClass =
    variant === "warning"
      ? "border-light-yellow bg-light-yellow dark:border-light-yellow dark:bg-light-yellow"
      : "border-light-blue bg-light-blue dark:border-light-blue dark:bg-light-blue";
  const alignmentClass = align === "middle" ? "items-center" : "items-start";

  const alignmentOverrides =
    align === "middle"
      ? "[&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg+div]:translate-y-0"
      : "";

  return (
    <Alert className={`${variantClass} ${alignmentOverrides}`}>
      <Icon
        className={`h-4 w-4 ${
          variant === "warning"
            ? "text-dark-yellow dark:text-dark-yellow"
            : "text-dark-blue dark:text-dark-blue"
        }`}
      />
      <AlertDescription
        className={`flex ${alignmentClass} ml-1 justify-between`}
      >
        <div className="flex-1 text-sm text-foreground">{children}</div>
        <div className="ml-4 flex items-center gap-2">
          {actions && actions()}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
