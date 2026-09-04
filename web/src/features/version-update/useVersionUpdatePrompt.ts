import { useEffect } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useAppSettled } from "./useAppSettled";
import { useVersionUpdateAvailable } from "./useVersionUpdateAvailable";
import { versionUpdateStore } from "./versionUpdateStore";

export function useVersionUpdatePrompt() {
  const updateAvailable = useVersionUpdateAvailable();
  const appSettled = useAppSettled();
  const isVisible = updateAvailable && appSettled;
  const capture = usePostHogClientCapture();

  useEffect(() => {
    if (isVisible && versionUpdateStore.markShownReported()) {
      capture("version_update:banner_shown");
    }
  }, [isVisible, capture]);

  return {
    isVisible,
    reload: () => {
      capture("version_update:reload_clicked");
      window.location.reload();
    },
    dismiss: () => {
      capture("version_update:dismissed");
      versionUpdateStore.dismiss();
    },
  };
}
