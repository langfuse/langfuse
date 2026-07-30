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
import { useId } from "react";
import { useRouter } from "next/router";
import {
  singleRunToExperimentsUrl,
  toExperimentsResultsUrl,
} from "@/src/features/experiments/utils/experimentUrlTranslation";

import {
  V4_PREVIEW_LABEL,
  V4_PREVIEW_DESCRIPTION,
} from "@/src/features/events/lib/v4PreviewLabel";

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asArrayValue(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// Shared behavior for every V4 Preview toggle surface: session-backed state,
// intro dialog on first enable, and the datasets/experiments URL translation
// that keeps the current page valid after switching. `source` distinguishes
// the surfaces in the shared v4_beta_toggled event.
function useV4PreviewToggle(source: "sidebar" | "migration_panel") {
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

  // afterToggle, when given, replaces the default same-page URL translation
  // and runs only after the toggle actually committed (mutation + session
  // update done, intro dialog confirmed rather than dismissed).
  const handleToggle = (enabled: boolean, afterToggle?: () => void) => {
    const onSuccess = () => {
      capture("sidebar:v4_beta_toggled", { enabled, source });
      if (afterToggle) {
        afterToggle();
      } else {
        redirectAfterToggle(enabled);
      }
    };
    if (enabled) {
      enableWithIntro({ onSuccess });
    } else {
      setBetaEnabled(false, { onSuccess });
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
  } = useV4PreviewToggle("sidebar");
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
// "Want to review first?" section. Toggling in either direction jumps to the
// project's traces page (the panel stays open across the navigation) so users
// see the switched experience immediately.
export function V4PreviewToggleRow({ projectId }: { projectId?: string }) {
  const router = useRouter();
  // Panel and modal can render this row at the same time, so ids must be
  // instance-scoped for the label/description associations to hold.
  const toggleId = useId();
  const descriptionId = useId();
  const {
    isBetaEnabled,
    canToggleV4,
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  } = useV4PreviewToggle("migration_panel");

  if (!canToggleV4) {
    return null;
  }

  const handlePanelToggle = (enabled: boolean) => {
    handleToggle(
      enabled,
      projectId ? () => router.push(`/project/${projectId}/traces`) : undefined,
    );
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm">V3</span>
        <Switch
          id={toggleId}
          size="sm"
          checked={isBetaEnabled}
          onCheckedChange={handlePanelToggle}
          disabled={isLoading}
          aria-label="Toggle V4 Preview"
          aria-describedby={descriptionId}
        />
        <Label
          htmlFor={toggleId}
          className="block min-w-0 cursor-pointer truncate text-sm font-normal"
          title={V4_PREVIEW_LABEL}
        >
          {V4_PREVIEW_LABEL}
        </Label>
        <span id={descriptionId} className="sr-only">
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
