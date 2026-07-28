import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Label } from "@/src/components/ui/label";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { V4IntroDialog } from "@/src/features/events/components/V4IntroDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { ZapIcon } from "lucide-react";
import { useRouter } from "next/router";
import {
  singleRunToExperimentsUrl,
  toExperimentsResultsUrl,
} from "@/src/features/experiments/utils/experimentUrlTranslation";

const V4_PREVIEW_LABEL = "V4 Preview";
const V4_PREVIEW_DESCRIPTION =
  "Get a more performant Langfuse experience. Upgrade SDKs to the latest major for real-time data. This is a personal setting.";

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asArrayValue(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// Shared behavior for every V4 Preview toggle surface: session-backed state,
// intro dialog on first enable, and the datasets/experiments URL translation
// that keeps the current page valid after switching.
function useV4PreviewToggle() {
  const router = useRouter();
  const {
    isBetaEnabled,
    canToggleV4,
    setBetaEnabled,
    enableWithIntro,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
    isLoading,
  } = useV4Beta();
  const capture = usePostHogClientCapture();

  const redirectAfterToggle = (enabled: boolean) => {
    const projectId = asSingleValue(router.query.projectId);
    if (!projectId) return;

    if (
      !enabled &&
      router.pathname.startsWith("/project/[projectId]/experiments")
    ) {
      router.push(`/project/${projectId}/datasets`);
      return;
    }

    if (!enabled) return;

    if (
      router.pathname ===
      "/project/[projectId]/datasets/[datasetId]/runs/[runId]"
    ) {
      const runId = asSingleValue(router.query.runId);
      if (runId) {
        router.push(singleRunToExperimentsUrl(projectId, runId));
      }
      return;
    }

    if (
      router.pathname === "/project/[projectId]/datasets/[datasetId]/compare" ||
      router.pathname ===
        "/project/[projectId]/datasets/[datasetId]/compare/charts"
    ) {
      const runIds = asArrayValue(router.query.runs);
      if (runIds.length > 0) {
        router.push(toExperimentsResultsUrl(projectId, runIds));
      }
    }
  };

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      enableWithIntro({
        onSuccess: () => {
          capture("sidebar:v4_beta_toggled", { enabled: true });
          redirectAfterToggle(true);
        },
      });
    } else {
      setBetaEnabled(false, {
        onSuccess: () => {
          capture("sidebar:v4_beta_toggled", { enabled: false });
          redirectAfterToggle(false);
        },
      });
    }
  };

  return {
    isBetaEnabled,
    canToggleV4,
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  };
}

export function V4SidebarToggle() {
  const {
    isBetaEnabled,
    canToggleV4,
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  } = useV4PreviewToggle();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();

  // v4-upgrade users get this toggle inside the migration panel instead.
  if (!canToggleV4 || v4UpgradeUiEnabled) {
    return null;
  }

  return (
    <>
      <SidebarMenuButton
        asChild
        className="justify-between gap-1.5 group-data-[collapsible=icon]:justify-center"
      >
        <div>
          <div className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsible=icon]:hidden">
            <ZapIcon className="h-4 w-4 shrink-0" />
            <Label
              htmlFor="v4-beta-toggle"
              className="block min-w-0 flex-1 cursor-pointer truncate text-sm font-normal"
              title={V4_PREVIEW_LABEL}
            >
              {V4_PREVIEW_LABEL}
            </Label>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex shrink-0">
                <Switch
                  id="v4-beta-toggle"
                  size="sm"
                  checked={isBetaEnabled}
                  onCheckedChange={handleToggle}
                  disabled={isLoading}
                  aria-label="Toggle V4 Preview"
                  aria-describedby="v4-preview-sidebar-description"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs text-xs">
              {V4_PREVIEW_DESCRIPTION}
            </TooltipContent>
          </Tooltip>
          <span id="v4-preview-sidebar-description" className="sr-only">
            {V4_PREVIEW_DESCRIPTION}
          </span>
        </div>
      </SidebarMenuButton>
      <V4IntroDialog
        open={showIntroDialog}
        onConfirm={confirmIntroDialog}
        onDismiss={dismissIntroDialog}
      />
    </>
  );
}

// Panel-row variant of the toggle, rendered inside the v4-migration panel's
// "Want to review first?" section. Enabling jumps straight to the project's
// traces page (the panel stays open across the navigation) so users see the
// v4 experience immediately.
export function V4PreviewToggleRow({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const {
    isBetaEnabled,
    canToggleV4,
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  } = useV4PreviewToggle();

  if (!canToggleV4) {
    return null;
  }

  const handlePanelToggle = (enabled: boolean) => {
    handleToggle(enabled);
    if (enabled && projectId) {
      router.push(`/project/${projectId}/traces`);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm">V3</span>
        <Switch
          id="v4-preview-panel-toggle"
          size="sm"
          checked={isBetaEnabled}
          onCheckedChange={handlePanelToggle}
          disabled={isLoading}
          aria-label="Toggle V4 Preview"
          aria-describedby="v4-preview-panel-description"
        />
        <Label
          htmlFor="v4-preview-panel-toggle"
          className="block min-w-0 cursor-pointer truncate text-sm font-normal"
          title={V4_PREVIEW_LABEL}
        >
          {V4_PREVIEW_LABEL}
        </Label>
        <span id="v4-preview-panel-description" className="sr-only">
          {V4_PREVIEW_DESCRIPTION}
        </span>
      </div>
      <V4IntroDialog
        open={showIntroDialog}
        onConfirm={confirmIntroDialog}
        onDismiss={dismissIntroDialog}
      />
    </>
  );
}
