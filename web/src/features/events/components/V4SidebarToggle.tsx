import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Label } from "@/src/components/ui/label";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { setReadPath } from "@/src/features/events/actions/setReadPath";
import { usePendingReadPath } from "@/src/features/events/stores/readPathToggleStore";
import { V4IntroDialog } from "@/src/features/events/components/V4IntroDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  getV4PreviewDisabledRedirect,
  getV4PreviewEnabledRedirect,
} from "@/src/features/events/lib/v4PreviewRedirect";
import { api } from "@/src/utils/api";
import { ZapIcon } from "lucide-react";
import { useId, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
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

const INTRO_DIALOG_SEEN_KEY = "v4-beta-intro-dialog-seen";

// Shared behavior for every V4 Preview toggle surface: session-backed state,
// intro dialog on first enable, and the datasets/experiments URL translation
// that keeps the current page valid after switching. `source` distinguishes
// the surfaces in the shared v4_beta_toggled event. The commit itself is the
// shared `setReadPath` workflow; only the intro dialog lives here.
function useV4PreviewToggle(source: "sidebar" | "migration_panel") {
  const router = useRouter();
  const { isV4 } = useReadPath();
  const pendingReadPath = usePendingReadPath();
  const { update: updateSession } = useSession();
  const mutation = api.userAccount.setV4BetaEnabled.useMutation();
  const capture = usePostHogClientCapture();

  const [showIntroDialog, setShowIntroDialog] = useState(false);
  const [pendingAfterToggle, setPendingAfterToggle] = useState<
    (() => Promise<unknown> | void) | undefined
  >();

  // The pending intent wins while a toggle is committing, so the switch shows
  // the value the user just chose — and snaps back if the commit fails.
  const isChecked = pendingReadPath ? pendingReadPath === "v4" : isV4;
  const isLoading = pendingReadPath !== null;

  // Returns the navigation promise so the pending intent (disabled switch)
  // holds until the redirect lands.
  const redirectAfterToggle = (enabled: boolean): Promise<unknown> | void => {
    const projectId = asSingleValue(router.query.projectId);
    if (!projectId) return;

    if (!enabled) {
      const redirect = getV4PreviewDisabledRedirect(router.pathname, projectId);
      if (redirect) return router.push(redirect);
      return;
    }

    const evaluatorRedirect = getV4PreviewEnabledRedirect(
      router.pathname,
      projectId,
    );
    if (evaluatorRedirect) {
      return router.push(evaluatorRedirect);
    }

    if (
      router.pathname ===
      "/project/[projectId]/datasets/[datasetId]/runs/[runId]"
    ) {
      const runId = asSingleValue(router.query.runId);
      if (runId) {
        return router.push(singleRunToExperimentsUrl(projectId, runId));
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
        return router.push(toExperimentsResultsUrl(projectId, runIds));
      }
    }
  };

  const commitToggle = (
    enabled: boolean,
    afterToggle?: () => Promise<unknown> | void,
  ) => {
    setReadPath(enabled ? "v4" : "v3", {
      setV4BetaEnabled: (input) => mutation.mutateAsync(input),
      updateSession,
      onSuccess: () => {
        capture("sidebar:v4_beta_toggled", { enabled, source });
        return afterToggle ? afterToggle() : redirectAfterToggle(enabled);
      },
    });
  };

  // afterToggle, when given, replaces the default same-page URL translation
  // and runs only after the toggle actually committed (mutation + session
  // update done, intro dialog confirmed rather than dismissed).
  const handleToggle = (
    enabled: boolean,
    afterToggle?: () => Promise<unknown> | void,
  ) => {
    if (
      enabled &&
      typeof window !== "undefined" &&
      !localStorage.getItem(INTRO_DIALOG_SEEN_KEY)
    ) {
      setPendingAfterToggle(() => afterToggle);
      setShowIntroDialog(true);
      return;
    }
    commitToggle(enabled, afterToggle);
  };

  const confirmIntroDialog = () => {
    localStorage.setItem(INTRO_DIALOG_SEEN_KEY, "true");
    setShowIntroDialog(false);
    commitToggle(true, pendingAfterToggle);
    setPendingAfterToggle(undefined);
  };

  const dismissIntroDialog = () => {
    setShowIntroDialog(false);
    setPendingAfterToggle(undefined);
  };

  return {
    isChecked,
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  };
}

export function V4SidebarToggle() {
  const {
    isChecked,
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  } = useV4PreviewToggle("sidebar");

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
                  checked={isChecked}
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
    isChecked,
    isLoading,
    handleToggle,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
  } = useV4PreviewToggle("migration_panel");

  const handlePanelToggle = (enabled: boolean) => {
    handleToggle(
      enabled,
      projectId ? () => router.push(`/project/${projectId}/traces`) : undefined,
    );
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground shrink-0 text-sm">V3</span>
        <Switch
          id={toggleId}
          size="sm"
          checked={isChecked}
          onCheckedChange={handlePanelToggle}
          disabled={isLoading}
          aria-label="Toggle V4 Preview"
          aria-describedby={descriptionId}
        />
        <Label
          htmlFor={toggleId}
          className="text-muted-foreground block min-w-0 cursor-pointer truncate text-sm font-normal"
          title="V4"
        >
          V4
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
