import { type ReactNode } from "react";

export function TopicsWorkspaceGate({
  isLoading,
  fallback,
  children,
}: TopicsWorkspaceGateProps) {
  if (isLoading) return fallback;
  return children;
}

type TopicsWorkspaceGateProps = {
  isLoading: boolean;
  fallback: ReactNode;
  children: ReactNode;
};
