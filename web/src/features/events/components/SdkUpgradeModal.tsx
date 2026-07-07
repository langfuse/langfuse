import { useEffect, useMemo, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

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
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";

const SDK_UPGRADE_DISMISSED_STORAGE_PREFIX =
  "langfuse-sdk-upgrade-modal-dismissed";
const SDK_UPGRADE_DOCS_URL =
  "https://langfuse.com/docs/observability/sdk/upgrade-path";
const LANGFUSE_SKILL_URL =
  "https://github.com/langfuse/skills/tree/main/skills/langfuse";
const SDK_UPGRADE_DOC_URLS = [
  "https://langfuse.com/docs/observability/sdk/upgrade-path/python-v2-to-v3",
  "https://langfuse.com/docs/observability/sdk/upgrade-path/python-v3-to-v4",
  "https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4",
  "https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5",
] as const;
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

type SdkVersionSummary = {
  sdkName: string;
  sdkVersion: string;
  source: string;
  count: number;
};

export function SdkUpgradeModal({ userId }: { userId: string }) {
  const projectId = useProjectIdFromURL();
  const [open, setOpen] = useState(false);
  const { copy: copyAiUpgradePrompt, isCopied: isAiUpgradePromptCopied } =
    useCopyToClipboard({ successDuration: 2_000 });

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
          <Button
            variant="outline"
            onClick={() => {
              copyAiUpgradePrompt(
                buildAiSdkUpgradePrompt(sdkVersionsToUpgrade),
              ).catch(() => undefined);
            }}
          >
            {isAiUpgradePromptCopied ? (
              <CheckIcon className="mr-1 size-4" />
            ) : (
              <CopyIcon className="mr-1 size-4" />
            )}
            {isAiUpgradePromptCopied ? "Copied" : "Copy AI upgrade prompt"}
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

function SdkVersionRow({ sdkVersion }: { sdkVersion: SdkVersionSummary }) {
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

function shouldUpgradeSdkVersion(sdk: SdkVersionSummary) {
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
    threshold.sdkNames.some((thresholdSdkName) => thresholdSdkName === sdkName),
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

function buildAiSdkUpgradePrompt(sdkVersions: SdkVersionSummary[]) {
  const detectedVersions =
    sdkVersions.length > 0
      ? sdkVersions
          .slice(0, 10)
          .map(
            (sdkVersion) =>
              `- ${formatSdkVersion(sdkVersion)} (${sdkVersion.count.toLocaleString()} traces in the last 24 hours)`,
          )
          .join("\n")
      : "- Unknown Langfuse SDK version";

  return `Use the Langfuse skill to upgrade this codebase to the latest Langfuse SDK.

Detected Langfuse SDK usage:
${detectedVersions}

Before editing, fetch the current Langfuse migration docs:
${SDK_UPGRADE_DOC_URLS.map((url) => `- ${url}`).join("\n")}

If the coding agent does not have the Langfuse skill installed, install or reference it first:
- ${LANGFUSE_SKILL_URL}

Upgrade task:
1. Inspect the codebase for Langfuse SDK dependencies, imports, initialization, tracing calls, LangChain/OpenAI wrappers, and dataset/score API usage.
2. Upgrade Python SDK usage to v4+ and JS/TS SDK usage to v5+ where present.
3. Apply the documented migration changes, especially attribute propagation, observation creation APIs, metadata string limits, release/environment configuration, and span export filtering.
4. Preserve existing trace hierarchy, user/session/tags/metadata propagation, input/output capture, scores, and dataset experiment behavior.
5. Enable Langfuse debug logging while validating locally.
6. Run the relevant tests, lint, and type checks, then summarize the exact files changed and any remaining manual steps.`;
}
