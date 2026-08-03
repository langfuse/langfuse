import { type ReactNode } from "react";

import { ErrorPage } from "@/src/components/error-page";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { useLangfuseV4WriteMode } from "@/src/features/organizations/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

/** MonitorScope is the RBAC scope a monitor page can require for entry. */
type MonitorScope = "monitors:read" | "monitors:CUD";

/** MonitorPagePermissions gates a monitor page on Langfuse Cloud and a project RBAC scope. */
export function MonitorPagePermissions({
  scope,
  children,
}: {
  scope: MonitorScope;
  children: ReactNode;
}) {
  const projectId = useProjectIdFromURL();
  const v4WriteMode = useLangfuseV4WriteMode();
  const hasAccess = useHasProjectAccess({ projectId, scope });

  if (!v4WriteMode || v4WriteMode === "legacy") {
    return <ErrorPage title="Not found" message="This page does not exist." />;
  }

  if (!hasAccess) {
    return <SupportOrUpgradePage />;
  }

  return <>{children}</>;
}
