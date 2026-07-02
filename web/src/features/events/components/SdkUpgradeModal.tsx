import { useEffect, useMemo, useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";

const SDK_UPGRADE_DISMISSED_STORAGE_PREFIX =
  "langfuse-sdk-upgrade-modal-dismissed";
const SDK_UPGRADE_DOCS_URL =
  "https://langfuse.com/docs/observability/sdk/upgrade-path";
const SDK_UPGRADE_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DIRECT_EVENTS_TABLE_SOURCE_VALUES = ["otel"] as const;
const BACKFILL_EVENTS_TABLE_SOURCE_VALUES = [
  "ingestion-api-backfill",
  "otel-backfill",
] as const;

export function SdkUpgradeModal({ userId }: { userId: string }) {
  const projectId = useProjectIdFromURL();
  const [open, setOpen] = useState(false);

  const storageKey = useMemo(() => {
    if (!projectId) return null;
    return `${SDK_UPGRADE_DISMISSED_STORAGE_PREFIX}:${projectId}:${userId}`;
  }, [projectId, userId]);

  const sdkUpgradeStatus = api.events.getSdkUpgradeStatus.useQuery(
    { projectId: projectId ?? "" },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );

  const shouldShowUpgradeModal =
    sdkUpgradeStatus.data?.sources.some((source) =>
      shouldUpgradeSdkForEventsTableSource(source.source),
    ) === true;

  useEffect(() => {
    if (!storageKey || !shouldShowUpgradeModal) {
      setOpen(false);
      return;
    }

    if (isDismissed(storageKey)) {
      setOpen(false);
      return;
    }

    setOpen(true);
  }, [shouldShowUpgradeModal, storageKey]);

  const dismiss = () => {
    if (storageKey) {
      markDismissed(storageKey);
    }
    setOpen(false);
  };

  if (!projectId) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss();
      }}
    >
      <DialogContent
        closeOnInteractionOutside
        overlayMode="blocking"
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Upgrade your Langfuse SDK</DialogTitle>
          <DialogDescription>
            This project is still receiving data through a legacy ingestion
            path.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-muted-foreground text-sm leading-6">
            Upgrade to the latest Langfuse SDK so new observations are ingested
            directly and appear in Langfuse without legacy ingestion delays.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={dismiss}>
            Remind me later
          </Button>
          <Button asChild onClick={dismiss}>
            <a
              href={SDK_UPGRADE_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              View upgrade guide
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isDismissed(storageKey: string) {
  try {
    const dismissedAt = window.localStorage.getItem(storageKey);
    if (!dismissedAt) return false;

    const dismissedAtMs = Date.parse(dismissedAt);
    if (Number.isNaN(dismissedAtMs)) return false;

    const isStillDismissed =
      Date.now() - dismissedAtMs < SDK_UPGRADE_DISMISS_TTL_MS;
    if (!isStillDismissed) {
      window.localStorage.removeItem(storageKey);
    }

    return isStillDismissed;
  } catch {
    return false;
  }
}

function markDismissed(storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, new Date().toISOString());
  } catch {
    // Keep the modal dismissible even if localStorage is unavailable.
  }
}

function shouldUpgradeSdkForEventsTableSource(source: string) {
  const isDirect = DIRECT_EVENTS_TABLE_SOURCE_VALUES.includes(
    source as (typeof DIRECT_EVENTS_TABLE_SOURCE_VALUES)[number],
  );
  const isBackfill = BACKFILL_EVENTS_TABLE_SOURCE_VALUES.includes(
    source as (typeof BACKFILL_EVENTS_TABLE_SOURCE_VALUES)[number],
  );

  return !isDirect && !isBackfill;
}
