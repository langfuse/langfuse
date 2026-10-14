import { type ReactNode } from "react";

import { ErrorPage } from "@/src/app/components/error-page";
import { SupportOrUpgradePage } from "@/src/ee/billing";
import { useLangfuseV4WriteMode } from "@/src/identity/organizations";
import { useHasProjectAccess } from "@/src/identity/access-control";
import useProjectIdFromURL from "@/src/app/hooks/useProjectIdFromURL";

/** MonitorScope is the RBAC scope a monitor page can require for entry. */
type MonitorScope = "alerts:read" | "alerts:CUD";

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
