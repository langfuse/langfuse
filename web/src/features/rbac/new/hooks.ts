import { useSession } from "next-auth/react";

import { type ProjectScope } from "@langfuse/shared";
import { type OrganizationScope } from "@langfuse/shared/rbac";

import { hasOrganizationAccess } from "./checkOrganizationAccess";
import { hasProjectAccess } from "./checkProjectAccess";

/** useHasProjectAccess reports whether the signed-in user holds scope on projectId, false while the session loads. */
export function useHasProjectAccess({
  projectId,
  scope,
}: {
  projectId: string | undefined;
  scope: ProjectScope;
}): boolean {
  const session = useSession();
  if (!projectId) return false;
  return hasProjectAccess({ session: session.data, scope, projectId });
}

/** useHasOrganizationAccess reports whether the signed-in user holds scope on organizationId, false while the session loads. */
export function useHasOrganizationAccess({
  organizationId,
  scope,
}: {
  organizationId: string | undefined;
  scope: OrganizationScope;
}): boolean {
  const session = useSession();
  if (!organizationId) return false;
  return hasOrganizationAccess({
    session: session.data,
    scope,
    organizationId,
  });
}
