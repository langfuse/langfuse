import { type ReactNode } from "react";
import { ErrorPage } from "@/src/components/error-page";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

export function SkillsFeatureGate({ children }: { children: ReactNode }) {
  const projectId = useProjectIdFromURL();
  const enabled = useIsFeatureEnabled("skills", { projectId });

  return enabled ? (
    children
  ) : (
    <ErrorPage title="Page not found" message="This page is not available." />
  );
}
