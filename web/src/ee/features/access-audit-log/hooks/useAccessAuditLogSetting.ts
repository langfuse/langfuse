import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";

/** The org's access-logging opt-in, including a change still in flight. */
export function useAccessAuditLogSetting(orgId: string) {
  const { update: updateSession } = useSession();
  const utils = api.useUtils();
  const organization = useQueryOrganization();
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organization:update",
  });

  const mutation = api.accessAuditLog.setEnabled.useMutation({
    onSuccess: async () => {
      await updateSession();
      // Admins resolve org context from this query, not the session
      await utils.organizations.byId.invalidate();
    },
  });

  return {
    enabled: mutation.isPending
      ? mutation.variables.enabled
      : (organization?.accessAuditLogEnabled ?? false),
    disabled: !hasAccess || mutation.isPending,
    setEnabled: (value: boolean) => mutation.mutate({ orgId, enabled: value }),
  };
}
