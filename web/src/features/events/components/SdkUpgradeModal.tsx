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
const UNKNOWN_SDK_VALUE = "unknown";
const DIRECT_EVENTS_TABLE_SOURCE_VALUES = ["otel"] as const;
const BACKFILL_EVENTS_TABLE_SOURCE_VALUES = [
  "ingestion-api-backfill",
  "otel-backfill",
] as const;

const SDK_UPGRADE_MINIMUM_VERSIONS = [
  {
    sdkNames: ["python"],
    minimumVersion: "4.0.0",
  },
  {
    sdkNames: ["javascript", "js", "langfuse-js"],
    minimumVersion: "5.0.0",
  },
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

  const sdkVersionsToUpgrade =
    sdkUpgradeStatus.data?.sdkVersions?.filter(shouldUpgradeSdkVersion) ?? [];
  const shouldShowUpgradeModal = sdkVersionsToUpgrade.length > 0;

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
          {sdkVersionsToUpgrade.length > 0 ? (
            <div className="bg-muted/40 rounded-md border px-3 py-2 text-sm">
              <div className="text-muted-foreground mb-1">
                Detected SDK versions in traces from the last 24 hours:
              </div>
              <div className="space-y-1">
                {sdkVersionsToUpgrade.slice(0, 5).map((sdkVersion) => (
                  <SdkVersionRow
                    key={`${sdkVersion.sdkName}:${sdkVersion.sdkVersion}`}
                    sdkVersion={sdkVersion}
                  />
                ))}
              </div>
            </div>
          ) : null}
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

function SdkVersionRow(sdkVersion: {
  sdkName: string;
  sdkVersion: string;
  count: number;
}) {
  const formattedSdkVersion = formatSdkVersion(sdkVersion);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate font-mono text-xs" title={formattedSdkVersion}>
        {formattedSdkVersion}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs">
        {sdkVersion.count.toLocaleString()}
      </span>
    </div>
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

function shouldUpgradeSdkVersion(sdk: {
  sdkName: string;
  sdkVersion: string;
  source: string;
}) {
  if (isBackfillEventsTableSource(sdk.source)) {
    return false;
  }

  const sdkName = sdk.sdkName.trim().toLowerCase();
  const sdkVersion = sdk.sdkVersion.trim().toLowerCase();

  if (
    !sdkName ||
    !sdkVersion ||
    sdkName === UNKNOWN_SDK_VALUE ||
    sdkVersion === UNKNOWN_SDK_VALUE
  ) {
    return shouldUpgradeForEventsTableSource(sdk.source);
  }

  const baseVersion = extractBaseSdkVersion(sdkVersion);
  const sdkThreshold = SDK_UPGRADE_MINIMUM_VERSIONS.find((threshold) =>
    threshold.sdkNames.includes(sdkName as (typeof threshold.sdkNames)[number]),
  );

  if (sdkThreshold) {
    return (
      isVersionLessThan(baseVersion, sdkThreshold.minimumVersion) ??
      shouldUpgradeForEventsTableSource(sdk.source)
    );
  }

  return shouldUpgradeForEventsTableSource(sdk.source);
}

function extractBaseSdkVersion(sdkVersion: string) {
  const version = sdkVersion.trim();

  if (/^v?\d+\.\d+\.\d+(?:[-+].+)?$/i.test(version)) {
    return version.split(/[-+]/)[0] ?? version;
  }

  const pep440Match = version.match(/^(v?\d+\.\d+\.\d+)(?:a|b|rc)\d+$/i);
  if (pep440Match?.[1]) {
    return pep440Match[1];
  }

  return version;
}

function isVersionLessThan(version: string, minimumVersion: string) {
  const parsedVersion = parseVersion(version);
  const parsedMinimum = parseVersion(minimumVersion);

  if (!parsedVersion || !parsedMinimum) return null;

  const [major, minor, patch] = parsedVersion;
  const [minimumMajor, minimumMinor, minimumPatch] = parsedMinimum;

  if (major !== minimumMajor) return major < minimumMajor;
  if (minor !== minimumMinor) return minor < minimumMinor;
  if (patch !== minimumPatch) return patch < minimumPatch;

  return false;
}

function parseVersion(version: string): [number, number, number] | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (![major, minor, patch].every(Number.isSafeInteger)) return null;

  return [major, minor, patch];
}

function shouldUpgradeForEventsTableSource(source: string) {
  const normalizedSource = source.trim().toLowerCase();

  if (isBackfillEventsTableSource(normalizedSource)) {
    return false;
  }

  return !DIRECT_EVENTS_TABLE_SOURCE_VALUES.includes(
    normalizedSource as (typeof DIRECT_EVENTS_TABLE_SOURCE_VALUES)[number],
  );
}

function isBackfillEventsTableSource(source: string) {
  const normalizedSource = source.trim().toLowerCase();

  return BACKFILL_EVENTS_TABLE_SOURCE_VALUES.includes(
    normalizedSource as (typeof BACKFILL_EVENTS_TABLE_SOURCE_VALUES)[number],
  );
}

function formatSdkVersion(sdk: { sdkName: string; sdkVersion: string }) {
  const sdkName = sdk.sdkName.trim() || UNKNOWN_SDK_VALUE;
  const sdkVersion = sdk.sdkVersion.trim() || UNKNOWN_SDK_VALUE;

  return `${sdkName}@${sdkVersion}`;
}
