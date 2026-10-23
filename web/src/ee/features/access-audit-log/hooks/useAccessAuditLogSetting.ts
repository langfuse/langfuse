import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";

/** The org's access-logging switch state, combining the instance mode with the org's opt-in and an in-flight change. */
export function useAccessAuditLogSetting(orgId: string) {
  const { data: session, update: updateSession } = useSession();
  const utils = api.useUtils();
  const organization = useQueryOrganization();
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organization:update",
  });
  const mode = session?.environment.accessAuditLogMode ?? "org";

  const mutation = api.accessAuditLog.setEnabled.useMutation({
    onSuccess: async () => {
      await updateSession();
      // Admins resolve org context from this query, not the session
      await utils.organizations.byId.invalidate();
    },
  });

  const enabled = mutation.isPending
    ? mutation.variables.enabled
    : (organization?.accessAuditLogEnabled ?? false);

  return {
    mode,
    checked: mode === "enforced" || (mode === "org" && enabled),
    disabled: mode !== "org" || !hasAccess || mutation.isPending,
    setEnabled: (value: boolean) => mutation.mutate({ orgId, enabled: value }),
  };
}
