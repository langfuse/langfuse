import { type ReactNode } from "react";

import { ErrorPage } from "@/src/components/error-page";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { useMonitorsAvailable } from "@/src/features/monitors/helpers/useMonitorsAvailable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

/** MonitorScope is the RBAC scope a monitor page can require for entry. */
type MonitorScope = "monitors:read" | "monitors:CUD";

/** MonitorPagePermissions gates a monitor page on deployment-level monitors availability and a project RBAC scope. */
export function MonitorPagePermissions({
  scope,
  children,
}: {
  scope: MonitorScope;
  children: ReactNode;
}) {
  const projectId = useProjectIdFromURL();
  const { available, isPending } = useMonitorsAvailable();
  const hasAccess = useHasProjectAccess({ projectId, scope });

  if (!available) {
    if (isPending) return null;
    return <ErrorPage title="Not found" message="This page does not exist." />;
  }

  if (!hasAccess) {
    return <SupportOrUpgradePage />;
  }

  return <>{children}</>;
}
