import { type ReactNode } from "react";
import { ErrorPage } from "@/src/components/error-page";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";

export function AgentsFeatureGate({ children }: { children: ReactNode }) {
  const enabled = useInternalFeaturesEnabled();
  return enabled ? (
    children
  ) : (
    <ErrorPage title="Page not found" message="This page is not available." />
  );
}
