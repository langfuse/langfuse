import { type ReactNode } from "react";
import { ErrorPage } from "@/src/components/error-page";
import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";

export function SkillsFeatureGate({ children }: { children: ReactNode }) {
  const projectId = useProjectIdFromURL();
  const { isV4 } = useReadPath();
  const enabled = useIsFeatureEnabled("skillManagement", {
    projectId,
    enableForAdmins: false,
  });

  return isV4 && enabled ? (
    children
  ) : (
    <ErrorPage title="Page not found" message="This page is not available." />
  );
}
