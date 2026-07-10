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
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
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

const SDK_UPGRADE_MODAL_COPY = {
  generic: {
    variant: "generic",
    title: "Upgrade your Langfuse SDK",
    description:
      "This project is receiving data from an older Langfuse SDK version.",
    body: "Upgrade to the latest Langfuse SDK so new observations use the current ingestion path and SDK behavior.",
  },
  javascriptBeforeV5: {
    variant: "javascript_before_v5",
    title: "Upgrade your Langfuse JS/TS SDK to v5",
    description:
      "This project is receiving data from a pre-v5 Langfuse JS/TS SDK.",
    body: "Upgrade to JS/TS SDK v5 and review the migration guide for the OpenTelemetry-based tracing model, attribute propagation, and API namespace changes.",
  },
  javascriptV5: {
    variant: "javascript_v5",
    title: "Update your Langfuse JS/TS SDK",
    description:
      "This project is receiving data from an early Langfuse JS/TS v5 SDK.",
    body: "Update to the latest JS/TS SDK release to pick up the current SDK fixes, defaults, and tracing behavior.",
  },
  python: {
    variant: "python",
    title: "Upgrade your Langfuse Python SDK",
    description:
      "This project is receiving data from an older Langfuse Python SDK.",
    body: "Upgrade to the latest Python SDK and review the migration guide for the current observation APIs, attribute propagation, and metadata requirements.",
  },
} as const;

type SdkVersionSummary = {
  sdkName: string;
  sdkVersion: string;
  canonicalSdkName: "python" | "javascript";
  latestMajor: number;
  major: number;
  upgradeStatus: "outdated_major";
  count: number;
};

export function SdkUpgradeModal({ userId }: { userId: string }) {
  const projectId = useProjectIdFromURL();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const [open, setOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const { copy: copyAiUpgradePrompt, isCopied: isAiUpgradePromptCopied } =
    useCopyToClipboard({ successDuration: 2_000 });

  const storageKey = useMemo(() => {
    if (!projectId) return null;
    return `${SDK_UPGRADE_DISMISSED_STORAGE_PREFIX}:${projectId}:${userId}`;
  }, [projectId, userId]);

  const sdkUpgradeStatus = api.events.getSdkUpgradeStatus.useQuery(
    { projectId: projectId ?? "" },
    {
      enabled: isLangfuseCloud && Boolean(projectId),
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );

  const sdkVersionsToUpgrade = mergeSdkVersionGroups(
    sdkUpgradeStatus.data?.sdkVersions ?? [],
  );
  const shouldShowUpgradeModal = sdkVersionsToUpgrade.length > 0;
  const modalCopy = getSdkUpgradeModalCopy(sdkVersionsToUpgrade);

  useEffect(() => {
    if (!isLangfuseCloud || !storageKey || !shouldShowUpgradeModal) {
      setOpen(false);
      return;
    }

    if (isDismissed(storageKey)) {
      setOpen(false);
      return;
    }

    setOpen(true);
  }, [isLangfuseCloud, shouldShowUpgradeModal, storageKey]);

  const dismiss = () => {
    if (storageKey) {
      markDismissed(storageKey);
    }
    setOpen(false);
  };

  const getAnalyticsProps = () =>
    getSdkUpgradeModalAnalyticsProps({
      projectId,
      variant: modalCopy.variant,
      sdkVersions: sdkVersionsToUpgrade,
    });

  const handleRemindMeLaterClick = () => {
    capture(
      "sdk_upgrade_modal:remind_me_later_button_click",
      getAnalyticsProps(),
    );
    dismiss();
  };

  const handleCopyAiUpgradePromptClick = () => {
    capture(
      "sdk_upgrade_modal:copy_ai_prompt_button_click",
      getAnalyticsProps(),
    );
    copyAiUpgradePrompt(buildAiSdkUpgradePrompt(sdkVersionsToUpgrade)).catch(
      () => undefined,
    );
  };

  const handleViewUpgradeGuideClick = () => {
    capture("sdk_upgrade_modal:view_upgrade_guide_button_click", {
      ...getAnalyticsProps(),
      href: SDK_UPGRADE_DOCS_URL,
    });
    dismiss();
  };

  if (!isLangfuseCloud || !projectId) return null;

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
          <DialogTitle>{modalCopy.title}</DialogTitle>
          <DialogDescription>{modalCopy.description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-muted-foreground text-sm leading-6">
            {modalCopy.body}
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
          <Button variant="outline" onClick={handleRemindMeLaterClick}>
            Remind me later
          </Button>
          <Button variant="outline" onClick={handleCopyAiUpgradePromptClick}>
            {isAiUpgradePromptCopied ? (
              <CheckIcon className="mr-1 size-4" />
            ) : (
              <CopyIcon className="mr-1 size-4" />
            )}
            {isAiUpgradePromptCopied ? "Copied" : "Copy AI upgrade prompt"}
          </Button>
          <Button asChild>
            <a
              href={SDK_UPGRADE_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleViewUpgradeGuideClick}
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

function getSdkUpgradeModalCopy(sdkVersions: SdkVersionSummary[]) {
  if (sdkVersions.some(isPreV5JavaScriptSdkVersion)) {
    return SDK_UPGRADE_MODAL_COPY.javascriptBeforeV5;
  }

  if (sdkVersions.some(isV5OrNewerJavaScriptSdkVersion)) {
    return SDK_UPGRADE_MODAL_COPY.javascriptV5;
  }

  if (
    sdkVersions.some((sdkVersion) => sdkVersion.canonicalSdkName === "python")
  ) {
    return SDK_UPGRADE_MODAL_COPY.python;
  }

  return SDK_UPGRADE_MODAL_COPY.generic;
}

function mergeSdkVersionGroups(sdkVersions: SdkVersionSummary[]) {
  const groupedSdkVersions = new Map<string, SdkVersionSummary>();

  for (const sdkVersion of sdkVersions) {
    const sdkName = sdkVersion.sdkName.trim();
    const sdkVersionValue = sdkVersion.sdkVersion.trim();
    const key = `${sdkName.toLowerCase()}:${sdkVersionValue.toLowerCase()}`;
    const existingSdkVersion = groupedSdkVersions.get(key);

    if (existingSdkVersion) {
      existingSdkVersion.count += sdkVersion.count;
      continue;
    }

    groupedSdkVersions.set(key, {
      ...sdkVersion,
      sdkName,
      sdkVersion: sdkVersionValue,
    });
  }

  return Array.from(groupedSdkVersions.values()).sort(
    (left, right) => right.count - left.count,
  );
}

function getSdkUpgradeModalAnalyticsProps({
  projectId,
  variant,
  sdkVersions,
}: {
  projectId: string | undefined;
  variant: string;
  sdkVersions: SdkVersionSummary[];
}) {
  return {
    projectId,
    variant,
    sdkVersionCount: sdkVersions.length,
    totalTraceCount: sdkVersions.reduce(
      (total, sdkVersion) => total + sdkVersion.count,
      0,
    ),
    sdkVersions: sdkVersions.map(formatSdkVersion),
  };
}

function isPreV5JavaScriptSdkVersion(sdk: SdkVersionSummary) {
  return sdk.canonicalSdkName === "javascript" && sdk.major < 5;
}

function isV5OrNewerJavaScriptSdkVersion(sdk: SdkVersionSummary) {
  return sdk.canonicalSdkName === "javascript" && sdk.major >= 5;
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
2. Upgrade Python SDK usage to v4+ and JS/TS SDK usage to the latest version where present.
3. Apply the documented migration changes, especially attribute propagation, observation creation APIs, metadata string limits, release/environment configuration, and span export filtering.
4. For JS/TS v4 or older, follow the v4 to v5 migration guide. For JS/TS v5.x, treat this as an update to the latest JS/TS SDK unless the current docs say otherwise.
5. Preserve existing trace hierarchy, user/session/tags/metadata propagation, input/output capture, scores, and dataset experiment behavior.
6. Enable Langfuse debug logging while validating locally.
7. Run the relevant tests, lint, and type checks, then summarize the exact files changed and any remaining manual steps.`;
}
