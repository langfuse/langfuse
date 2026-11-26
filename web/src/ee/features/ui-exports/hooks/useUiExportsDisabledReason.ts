import { useContext } from "react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { SessionContext } from "next-auth/react";

import { asSingleQueryParam } from "@/src/hooks/useReadyRouteParams";

/**
 * Why UI-based data exports and downloads are disabled for this project or
 * organization, or null when they are allowed.
 *
 * Accepts `{ projectId }` or `{ orgId }`; falls back to the current route's
 * `projectId` when omitted so shared leaf viewers can enforce the flag without
 * prop drilling.
 */
export function useUiExportsDisabledReason(scope?: {
  projectId?: string | null;
  orgId?: string | null;
}): string | null {
  // Read SessionContext and RouterContext directly so leaf viewers mounted
  // outside those providers (e.g. unit tests or stories) do not throw.
  const session = useContext(SessionContext)?.data;
  const router = useContext(RouterContext);

  if (session?.environment.uiExportsDisabledByInstance) {
    return "UI exports are disabled on this instance by your administrator.";
  }

  const organizations = session?.user?.organizations;
  if (!organizations) return null;

  if (scope?.orgId) {
    const org = organizations.find((candidate) => candidate.id === scope.orgId);
    if (org?.uiExportsDisabled) {
      return "UI exports are disabled for this organization.";
    }
    return null;
  }

  const projectId =
    scope?.projectId ?? asSingleQueryParam(router?.query?.projectId);
  if (!projectId) return null;

  const org = organizations.find((candidate) =>
    candidate.projects.some((project) => project.id === projectId),
  );
  if (org?.uiExportsDisabled) {
    return "UI exports are disabled for this organization.";
  }
  return null;
}
