import { type ReactNode } from "react";
import { ErrorPage } from "@/src/components/error-page";
import { useReadPath } from "@/src/features/events";

export function SkillsFeatureGate({ children }: { children: ReactNode }) {
  const { isV4 } = useReadPath();

  return isV4 ? (
    children
  ) : (
    <ErrorPage title="Page not found" message="This page is not available." />
  );
}
