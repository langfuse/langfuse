import { useContext } from "react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { SessionContext } from "next-auth/react";

import {
  UI_EXPORTS_DISABLED_BY_INSTANCE_REASON,
  UI_EXPORTS_DISABLED_BY_ORG_REASON,
} from "@/src/ee/features/ui-exports/constants";
import { UiExportsPolicyContext } from "@/src/ee/features/ui-exports/uiExportsPolicyContext";
import { asSingleQueryParam } from "@/src/hooks/useReadyRouteParams";

/**
 * Why UI-based data exports and downloads are disabled for this project or
 * organization, or null when they are allowed.
 *
 * Accepts `{ projectId }` or `{ orgId }`; falls back to the current route's
 * `projectId` when omitted so shared leaf viewers can enforce the flag without
 * prop drilling. Also honors `fallbackReason` and `UiExportsPolicyContext`
 * populated from authorized trace/session read queries so public viewers and
 * members whose session has not refreshed yet see the server policy immediately.
 */
export function useUiExportsDisabledReason(scope?: {
  projectId?: string | null;
  orgId?: string | null;
  fallbackReason?: string | null;
}): string | null {
  // Read SessionContext and RouterContext directly so leaf viewers mounted
  // outside those providers (e.g. unit tests or stories) do not throw.
  const session = useContext(SessionContext)?.data;
  const router = useContext(RouterContext);
  const policyContextReason = useContext(UiExportsPolicyContext);

  if (session?.environment.uiExportsDisabledByInstance) {
    return UI_EXPORTS_DISABLED_BY_INSTANCE_REASON;
  }

  const organizations = session?.user?.organizations;

  if (scope?.orgId) {
    const org = organizations?.find(
      (candidate) => candidate.id === scope.orgId,
    );
    if (org?.uiExportsDisabled) {
      return UI_EXPORTS_DISABLED_BY_ORG_REASON;
    }
    return scope.fallbackReason ?? policyContextReason;
  }

  const projectId =
    scope?.projectId ?? asSingleQueryParam(router?.query?.projectId);
  if (projectId && organizations) {
    const org = organizations.find((candidate) =>
      candidate.projects.some((project) => project.id === projectId),
    );
    if (org?.uiExportsDisabled) {
      return UI_EXPORTS_DISABLED_BY_ORG_REASON;
    }
  }

  return scope?.fallbackReason ?? policyContextReason;
}
