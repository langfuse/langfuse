import { useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

import { setReadPath } from "@/src/features/events/actions/setReadPath";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import {
  getV4PreviewDisabledRedirect,
  getV4PreviewEnabledRedirect,
} from "@/src/features/events/lib/v4PreviewRedirect";
import { usePendingReadPath } from "@/src/features/events/stores/readPathToggleStore";
import {
  singleRunToExperimentsUrl,
  toExperimentsResultsUrl,
} from "@/src/features/experiments/utils/experimentUrlTranslation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asArrayValue(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const INTRO_DIALOG_SEEN_KEY = "v4-beta-intro-dialog-seen";

export type V4PreviewToggleSource =
  | "sidebar"
  | "migration_panel"
  | "legacy_ui_banner";

/**
 * Shared behavior for every V4 preview toggle surface: session-backed state,
 * intro dialog on first enable, and the datasets/experiments URL translation
 * that keeps the current page valid after switching. `source` distinguishes
 * the surfaces in the shared v4_beta_toggled event. The commit itself is the
 * shared `setReadPath` workflow; only the intro dialog lives with each
 * surface.
 */
export function useV4PreviewToggle(source: V4PreviewToggleSource) {
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
