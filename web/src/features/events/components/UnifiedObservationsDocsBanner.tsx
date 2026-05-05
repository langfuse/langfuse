"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { BookOpenText, X } from "lucide-react";

const OBSERVATIONS_V4_GUIDE_URL =
  "https://langfuse.com/faq/all/explore-observations-in-v4";
const DISMISSED_STORAGE_KEY = "unified-observations-docs-banner:v1:dismissed";
const LEGACY_DISMISSED_STORAGE_KEY =
  "unified-observations-docs-banner:v1-dismissed-callouts";
const LEGACY_CALLOUT_ID = "unified-observations-docs-banner:v1";

type LegacyDismissedCallout = {
  id: string;
  dismissedAt: number;
};

function getInitialDismissedState() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const storedDismissedState = localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (storedDismissedState) {
      return JSON.parse(storedDismissedState) as boolean;
    }

    const legacyDismissedState = localStorage.getItem(
      LEGACY_DISMISSED_STORAGE_KEY,
    );
    if (!legacyDismissedState) {
      return false;
    }

    const dismissedCallouts = JSON.parse(
      legacyDismissedState,
    ) as LegacyDismissedCallout[];

    return dismissedCallouts.some(
      (callout) => callout.id === LEGACY_CALLOUT_ID,
    );
  } catch (error) {
    console.error("Error reading unified observations banner state", error);
    return false;
  }
}

export function UnifiedObservationsDocsBanner() {
  const [isDismissed, setIsDismissed] = useState(getInitialDismissedState);

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(isDismissed));
    } catch (error) {
      console.error(
        "Error persisting unified observations banner state",
        error,
      );
    }
  }, [isDismissed]);

  if (isDismissed) {
    return null;
  }

  return (
    <div
      data-testid="unified-observations-docs-banner"
      className="bg-light-blue text-foreground flex items-center gap-2 border-b px-3 py-1.5"
    >
      <Link
        href={OBSERVATIONS_V4_GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium underline underline-offset-2"
      >
        <BookOpenText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">How to filter</span>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 shrink-0 p-0"
        onClick={() => setIsDismissed(true)}
        aria-label="Dismiss unified table guide"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
